// Runs the analyzer over every .vs script of a game folder and reports the diagnostics. The shipped
// scripts the engine accepts should produce no errors; anything else is a false positive to fix.
//   node out/tools/checkCorpus.js <game root> [--all] [--reference <accepted.tsv>]
// --reference names a list of the scripts the game compiles (first column: path relative to the game
// root, lower case, `/`); the report then separates false positives from detected failures.
import * as fs from 'fs';
import * as path from 'path';
import { loadAiSymbols } from '../server/analysis/aiSymbols';
import { analyze } from '../server/analysis/analyze';
import { enginePosition } from '../server/analysis/lexer';
import { PrimitiveTable } from '../server/analysis/primitives';

function* walk(dir: string): Generator<string> {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) yield* walk(full);
    else if (e.name.toLowerCase().endsWith('.vs')) yield full;
  }
}

const root = process.argv[2] ?? process.env.CKS_GAME_ROOT;
const showAll = process.argv.includes('--all');
const referenceAt = process.argv.indexOf('--reference');
const accepted = referenceAt > 0
  ? new Set(fs.readFileSync(process.argv[referenceAt + 1], 'utf8').split(/\r?\n/)
      .filter((l) => l && !l.startsWith('#')).map((l) => l.split('\t')[0].toLowerCase()))
  : undefined;
let acceptedWithErrors = 0;
let rejected = 0;
let rejectedDetected = 0;
if (!root) {
  console.error('usage: checkCorpus <game root> [--all]');
  process.exit(2);
}

const primitives = PrimitiveTable.load(path.join(__dirname, '..', '..', 'data', 'primitives.tsv'));
const constants = loadAiSymbols(root);
const counts = new Map<string, number>();
const messages = new Map<string, number>();
let files = 0;
let filesWithErrors = 0;

for (const file of walk(path.join(root, 'DATA'))) {
  files++;
  const source = fs.readFileSync(file, 'latin1');
  const { diagnostics } = analyze(source, { primitives, constants });
  const hasError = diagnostics.some((d) => d.severity === 'error');
  if (hasError) filesWithErrors++;
  if (accepted) {
    const key = path.relative(root, file).split(path.sep).join('/').toLowerCase();
    if (accepted.has(key)) {
      if (hasError) acceptedWithErrors++;
    } else {
      rejected++;
      if (hasError) rejectedDetected++;
    }
  }
  for (const d of diagnostics) {
    counts.set(d.severity, (counts.get(d.severity) ?? 0) + 1);
    const key = `${d.severity}: ${d.message.replace(/'[^']*'/g, "'…'")}`;
    messages.set(key, (messages.get(key) ?? 0) + 1);
    if (showAll || d.severity === 'error') {
      const at = enginePosition(source, d.start);
      console.log(`${path.relative(root, file)} (${at.line}, ${at.column}) ${d.severity}: ${d.message}`);
    }
  }
}

console.log(`\n${files} scripts, ${filesWithErrors} with errors`);
for (const [severity, n] of counts) console.log(`  ${severity}: ${n}`);
if (accepted) {
  console.log(`Engine-accepted scripts with errors: ${acceptedWithErrors} (false positives, must be 0)`);
  console.log(`Engine-rejected scripts detected: ${rejectedDetected} of ${rejected}`);
}
console.log('\nBy message:');
for (const [m, n] of [...messages].sort((a, b) => b[1] - a[1])) console.log(`  ${n}\t${m}`);
