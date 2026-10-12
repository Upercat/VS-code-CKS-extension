// VS Code side: starts the CKS language server for `.vs` documents and opens the CKS reference page.
import * as fs from 'fs';
import * as path from 'path';
import { ExtensionContext, Uri, ViewColumn, WebviewPanel, commands, env, window, workspace } from 'vscode';
import { LanguageClient, LanguageClientOptions, ServerOptions, TransportKind } from 'vscode-languageclient/node';

let client: LanguageClient | undefined;
let referencePanel: WebviewPanel | undefined;
let referencePath: string | undefined;

export function activate(context: ExtensionContext) {
  const module = context.asAbsolutePath(path.join('out', 'server', 'server.js'));
  const serverOptions: ServerOptions = {
    run: { module, transport: TransportKind.ipc },
    debug: { module, transport: TransportKind.ipc, options: { execArgv: ['--nolazy', '--inspect=6010'] } },
  };
  const clientOptions: LanguageClientOptions = {
    documentSelector: [{ scheme: 'file', language: 'cks' }, { scheme: 'untitled', language: 'cks' }],
    synchronize: { configurationSection: 'cks', fileEvents: workspace.createFileSystemWatcher('**/{AI,ai}.{INI,ini}') },
    markdown: { isTrusted: { enabledCommands: ['cks.openReference'] } },
  };
  client = new LanguageClient('cks', 'CKS Language Server', serverOptions, clientOptions);
  void client.start();

  context.subscriptions.push(commands.registerCommand('cks.openReference', openReference));
}

export function deactivate(): Thenable<void> | undefined {
  return client?.stop();
}

// `anchor` is `ordinal-020c`, the hash the reference page opens on.
async function openReference(anchor?: string) {
  if (anchor !== undefined && !/^ordinal-[0-9a-f]+$/i.test(anchor)) return;
  const target = workspace.getConfiguration('cks').get<string>('referenceWeb', '').trim();
  if (!target) {
    const choice = await window.showInformationMessage(
      'Set "cks.referenceWeb" to a CKS reference page (a local .html file or a URL) to open it.',
      'Open settings',
    );
    if (choice) await commands.executeCommand('workbench.action.openSettings', 'cks.referenceWeb');
    return;
  }
  if (/^https?:\/\//i.test(target)) {
    await env.openExternal(Uri.parse(anchor ? `${target}#${anchor}` : target));
    return;
  }

  if (referencePanel && referencePath === target) {
    referencePanel.reveal(ViewColumn.Beside, true);
    if (anchor) void referencePanel.webview.postMessage({ anchor });
    return;
  }
  let html: string;
  try {
    html = fs.readFileSync(target, 'utf8');
  } catch (e) {
    void window.showErrorMessage(`CKS: cannot read the reference page ${target}: ${e}`);
    return;
  }
  referencePanel?.dispose();
  referencePanel = window.createWebviewPanel(
    'cksReference',
    'CKS reference',
    { viewColumn: ViewColumn.Beside, preserveFocus: true },
    { enableScripts: true, retainContextWhenHidden: true },
  );
  referencePath = target;
  referencePanel.onDidDispose(() => {
    referencePanel = undefined;
    referencePath = undefined;
  });
  // The page opens the entry named by its hash on load and on every hash change.
  const boot =
    '<script>' +
    (anchor ? `history.replaceState(null, '', '#${anchor}');` : '') +
    "window.addEventListener('message', (e) => { if (e.data && e.data.anchor) location.hash = e.data.anchor; });" +
    '</script>';
  referencePanel.webview.html = html.replace(/<head>/i, (head) => head + boot);
}
