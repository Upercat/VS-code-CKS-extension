// CKS language server: diagnostics, completion, hover and signature help over stdio/IPC.
import * as path from 'path';
import { fileURLToPath } from 'url';
import {
  CompletionItem,
  CompletionItemKind,
  Diagnostic as LspDiagnostic,
  DiagnosticSeverity,
  DiagnosticTag,
  Hover,
  InitializeResult,
  MarkupKind,
  ProposedFeatures,
  SignatureHelp,
  SignatureInformation,
  TextDocumentSyncKind,
  TextDocuments,
  createConnection,
} from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { findGameRoot, loadAiSymbols } from './analysis/aiSymbols';
import { Analysis, Severity, analyze, tokenAt, variableTypeBefore } from './analysis/analyze';
import { INT_CONSTANTS, TYPES, TYPE_BY_NAME, typeChain } from './analysis/builtins';
import { KEYWORDS } from './analysis/lexer';
import { Primitive, PrimitiveTable, formatArg, formatPrimitive } from './analysis/primitives';
import { DocEntry, findDoc, loadDocs, ordinalAnchor } from './analysis/docs';

const connection = createConnection(ProposedFeatures.all);
const documents = new TextDocuments(TextDocument);
const analyses = new Map<string, Analysis>();
const aiSymbolsByRoot = new Map<string, Map<string, number>>();

const bundledPrimitives = path.join(__dirname, '..', '..', 'data', 'primitives.tsv');
let primitives = PrimitiveTable.load(bundledPrimitives);
const docsFolder = path.join(__dirname, '..', '..', 'data', 'docs');
let docSources: Array<Map<string, DocEntry>> = []; // most specific first
let referenceWeb = false;
let clientLocale = 'en';

interface Settings {
  primitivesFile: string;
  docsLanguage: string;  // auto | en | es
  docsFile: string;      // optional personal documentation, same format, checked first
  referenceWeb: string;
  gameRoot: string;
}

function tryLoadDocs(file: string, reportErrors: boolean): Map<string, DocEntry> | undefined {
  try {
    return loadDocs(file);
  } catch (e) {
    if (reportErrors) connection.window.showErrorMessage(`CKS: cannot read the documentation ${file}: ${e}`);
    return undefined;
  }
}

connection.onInitialize((params): InitializeResult => {
  clientLocale = params.locale ?? 'en';
  return {
    capabilities: {
      textDocumentSync: TextDocumentSyncKind.Incremental,
      completionProvider: { triggerCharacters: ['.'] },
      hoverProvider: true,
      signatureHelpProvider: { triggerCharacters: ['(', ','], retriggerCharacters: [','] },
    },
  };
});

connection.onInitialized(() => void reloadSettings());
connection.onDidChangeConfiguration(() => void reloadSettings());

async function reloadSettings() {
  const settings: Partial<Settings> = (await connection.workspace.getConfiguration('cks')) ?? {};
  const file = settings.primitivesFile?.trim() || bundledPrimitives;
  try {
    primitives = PrimitiveTable.load(file);
  } catch (e) {
    connection.window.showErrorMessage(`CKS: cannot read the primitive table ${file}: ${e}`);
    primitives = PrimitiveTable.load(bundledPrimitives);
  }
  const wanted = settings.docsLanguage && settings.docsLanguage !== 'auto' ? settings.docsLanguage : clientLocale;
  const language = wanted.toLowerCase().startsWith('es') ? 'es' : 'en';
  const personal = settings.docsFile?.trim();
  docSources = [
    personal ? tryLoadDocs(personal, true) : undefined,
    tryLoadDocs(path.join(docsFolder, `primitives.${language}.json`), false),
    language !== 'en' ? tryLoadDocs(path.join(docsFolder, 'primitives.en.json'), false) : undefined,
  ].filter((d): d is Map<string, DocEntry> => d !== undefined);
  referenceWeb = !!settings.referenceWeb?.trim();
  configuredGameRoot = settings.gameRoot?.trim() || undefined;
  aiSymbolsByRoot.clear();
  documents.all().forEach(validate);
}

let configuredGameRoot: string | undefined;

function constantsFor(uri: string): Map<string, number> {
  let root = configuredGameRoot;
  if (!root && uri.startsWith('file:')) root = findGameRoot(fileURLToPath(uri));
  if (!root) return new Map();
  let symbols = aiSymbolsByRoot.get(root);
  if (!symbols) {
    symbols = loadAiSymbols(root);
    aiSymbolsByRoot.set(root, symbols);
  }
  return symbols;
}

const SEVERITY: Record<Severity, DiagnosticSeverity> = {
  error: DiagnosticSeverity.Error,
  warning: DiagnosticSeverity.Warning,
  information: DiagnosticSeverity.Information,
  hint: DiagnosticSeverity.Hint,
};

function validate(doc: TextDocument) {
  const analysis = analyze(doc.getText(), { primitives, constants: constantsFor(doc.uri) });
  analyses.set(doc.uri, analysis);
  const diagnostics: LspDiagnostic[] = analysis.diagnostics.map((d) => ({
    range: { start: doc.positionAt(d.start), end: doc.positionAt(d.end) },
    message: d.message,
    severity: SEVERITY[d.severity],
    source: 'cks',
    tags: d.unnecessary ? [DiagnosticTag.Unnecessary] : undefined,
  }));
  connection.sendDiagnostics({ uri: doc.uri, diagnostics });
}

connection.onDidChangeWatchedFiles(() => {
  aiSymbolsByRoot.clear();
  documents.all().forEach(validate);
});

documents.onDidChangeContent((e) => validate(e.document));
documents.onDidClose((e) => {
  analyses.delete(e.document.uri);
  connection.sendDiagnostics({ uri: e.document.uri, diagnostics: [] });
});

function analysisOf(uri: string): { doc: TextDocument; analysis: Analysis } | undefined {
  const doc = documents.get(uri);
  if (!doc) return undefined;
  let analysis = analyses.get(uri);
  if (!analysis) {
    validate(doc);
    analysis = analyses.get(uri)!;
  }
  return { doc, analysis };
}

// Member functions visible on `type`: `Type::name` up the parent chain, nearest first.
function methodsFor(type: string | undefined): Primitive[] {
  if (!type) return primitives.all.filter((p) => p.owner);
  return typeChain(type).flatMap((t) => primitives.methodsOf(t));
}

// Signature, then the documentation of each overload.
function primitiveDoc(overloads: Primitive[]): string {
  return overloads.map((p) => {
    const parts = ['```cks\n' + formatPrimitive(p) + '\n```'];
    const doc = findDoc(p, docSources);
    if (doc?.summary) parts.push(doc.summary);
    if (doc?.notes) parts.push(doc.notes);
    for (const example of doc?.examples ?? []) parts.push('```cks\n' + example + '\n```');
    if (referenceWeb) {
      // The client opens the page (cks.openReference); only that command is trusted in hovers.
      const link = `command:cks.openReference?${encodeURIComponent(JSON.stringify([ordinalAnchor(p.ordinal)]))}`;
      parts.push(`[Open in the CKS reference](${link})`);
    }
    return parts.join('\n\n');
  }).join('\n\n---\n\n');
}

function groupByMember(list: Primitive[]): Map<string, Primitive[]> {
  const groups = new Map<string, Primitive[]>();
  for (const p of list) {
    const g = groups.get(p.member);
    if (g) g.push(p);
    else groups.set(p.member, [p]);
  }
  return groups;
}

connection.onCompletion((params): CompletionItem[] => {
  const found = analysisOf(params.textDocument.uri);
  if (!found) return [];
  const { doc, analysis } = found;
  const offset = doc.offsetAt(params.position);
  const text = analysis.source;

  // Member completion: `receiver.` or `receiver.partial`.
  let dot = offset;
  while (dot > 0 && /[A-Za-z0-9_:]/.test(text[dot - 1])) dot--;
  if (text[dot - 1] === '.') {
    const receiverIndex = tokenAt(analysis.tokens, dot - 2);
    const receiver = analysis.tokens[receiverIndex];
    const type = receiver && receiver.end <= dot - 1 ? variableTypeBefore(analysis, receiverIndex) : undefined;
    return [...groupByMember(methodsFor(type))].map(([member, overloads]) => ({
      label: member,
      kind: CompletionItemKind.Method,
      detail: overloads.length > 1 ? `${formatPrimitive(overloads[0])} (+${overloads.length - 1} overloads)` : formatPrimitive(overloads[0]),
      documentation: { kind: MarkupKind.Markdown, value: primitiveDoc(overloads) },
    }));
  }

  const items: CompletionItem[] = [];
  for (const k of KEYWORDS) items.push({ label: k, kind: CompletionItemKind.Keyword });
  items.push({ label: 'this', kind: CompletionItemKind.Keyword });
  for (const t of TYPES) items.push({ label: t.name, kind: CompletionItemKind.Class, detail: t.parent ? `: ${t.parent}` : undefined });
  for (const v of analysis.variables.values()) {
    items.push({ label: v.name, kind: CompletionItemKind.Variable, detail: `${v.type} (${v.kind})` });
  }
  for (const [name, value] of INT_CONSTANTS) items.push({ label: name, kind: CompletionItemKind.Constant, detail: `int = ${value}` });
  for (const [name, value] of constantsFor(doc.uri)) items.push({ label: name, kind: CompletionItemKind.Constant, detail: `int = ${value} (AI.INI)` });
  for (const [name, overloads] of groupByMember(primitives.globals())) {
    items.push({
      label: name,
      kind: CompletionItemKind.Function,
      detail: formatPrimitive(overloads[0]) + (overloads.length > 1 ? ` (+${overloads.length - 1} overloads)` : ''),
      documentation: { kind: MarkupKind.Markdown, value: primitiveDoc(overloads) },
    });
  }
  return items;
});

connection.onHover((params): Hover | null => {
  const found = analysisOf(params.textDocument.uri);
  if (!found) return null;
  const { doc, analysis } = found;
  const offset = doc.offsetAt(params.position);
  const sig = analysis.signature;
  if (sig && offset >= sig.start && offset <= sig.end) {
    const p = sig.params.find((q) => offset >= q.start && offset <= q.end);
    const value = p
      ? `\`\`\`cks\n${p.type}${p.pointer ? '*' : ''} ${p.name}\n\`\`\`\nScript parameter${p.out ? ' (`OUT`: written back to the caller)' : ''}${p.pointer ? ' (`*`: reference variable)' : ''}`
      : `Script signature: returns **${sig.result}**, ${sig.params.length} parameter(s)`;
    return { contents: { kind: MarkupKind.Markdown, value } };
  }
  const index = tokenAt(analysis.tokens, offset);
  const t = analysis.tokens[index];
  if (!t || t.kind !== 'identifier' || offset < t.start || offset > t.end) return null;
  const range = { start: doc.positionAt(t.start), end: doc.positionAt(t.end) };
  const md = (value: string): Hover => ({ contents: { kind: MarkupKind.Markdown, value }, range });

  const prev = analysis.tokens[index - 1];
  if (prev?.text === '.') {
    const type = variableTypeBefore(analysis, index - 2);
    const overloads = methodsFor(type).filter((p) => p.member === t.text);
    if (overloads.length) return md(primitiveDoc(overloads));
  }
  const variable = analysis.variables.get(t.text);
  if (variable) return md(`\`\`\`cks\n${variable.type} ${variable.name}\n\`\`\`\n${variable.kind === 'param' ? 'Script parameter' : 'Local variable'}`);
  const constant = INT_CONSTANTS.get(t.text) ?? constantsFor(doc.uri).get(t.text);
  if (constant !== undefined) return md(`\`\`\`cks\nint ${t.text} = ${constant}\n\`\`\``);
  if (TYPE_BY_NAME.has(t.text)) {
    const chain = typeChain(t.text);
    return md(`**${t.text}** (script type)${chain.length > 1 ? `\n\nParents: ${chain.slice(1).join(' → ')}` : ''}`);
  }
  const overloads = primitives.overloads(t.text);
  if (overloads.length) return md(primitiveDoc(overloads));
  return null;
});

connection.onSignatureHelp((params): SignatureHelp | null => {
  const found = analysisOf(params.textDocument.uri);
  if (!found) return null;
  const { doc, analysis } = found;
  const offset = doc.offsetAt(params.position);
  const tokens = analysis.tokens;

  // Walk back to the unmatched `(` and count the commas at its depth.
  let depth = 0;
  let commas = 0;
  let open = -1;
  for (let i = tokenAt(tokens, offset - 1); i >= 0; i--) {
    const t = tokens[i];
    if (t.start >= offset || t.kind !== 'symbol') continue;
    if (t.text === ')' || t.text === ']') depth++;
    else if (t.text === '(' || t.text === '[') {
      if (depth === 0) {
        if (t.text === '(') open = i;
        break;
      }
      depth--;
    } else if (t.text === ',' && depth === 0) commas++;
    else if ((t.text === ';' || t.text === '{' || t.text === '}') && depth === 0) break;
  }
  const callee = open > 0 ? tokens[open - 1] : undefined;
  if (!callee || callee.kind !== 'identifier') return null;

  const isMember = tokens[open - 2]?.text === '.';
  const overloads = isMember
    ? methodsFor(variableTypeBefore(analysis, open - 3)).filter((p) => p.member === callee.text)
    : primitives.overloads(callee.text);
  if (!overloads.length) return null;

  const signatures: SignatureInformation[] = overloads.map((p) => {
    const args = p.owner ? p.args.slice(1) : p.args;
    return { label: formatPrimitive(p), parameters: args.map((a) => ({ label: formatArg(a) })) };
  });
  const active = Math.max(0, signatures.findIndex((s) => (s.parameters?.length ?? 0) > commas));
  return { signatures, activeSignature: active, activeParameter: commas };
});

documents.listen(connection);
connection.listen();
