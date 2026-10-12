// Primitive documentation written by the community: data/docs/primitives.<language>.json.
//   { "language": "en", "entries": { "<key>": { "summary": "...", "notes": "...", "examples": ["..."] } } }
// A key is either the full signature without the receiver, e.g. `void Obj::ExecCmd(str,point,Obj,bool)`,
// or a bare name, e.g. `Sleep`, which documents every overload that has no signature entry.
import * as fs from 'fs';
import { Primitive } from './primitives';

export interface DocEntry {
  summary?: string;
  notes?: string;
  examples?: string[];
}

export interface DocFile {
  language: string;
  entries: Record<string, DocEntry>;
}

export function loadDocs(file: string): Map<string, DocEntry> {
  const data = JSON.parse(fs.readFileSync(file, 'utf8')) as DocFile;
  return new Map(Object.entries(data.entries ?? {}));
}

// `void Obj::ExecCmd(str,point,Obj,bool)`: return type, name, argument types without the receiver.
export function docKey(p: Primitive): string {
  const args = (p.owner ? p.args.slice(1) : p.args).map((a) => a.type + (a.byRef ? '&' : ''));
  return `${p.ret} ${p.name}(${args.join(',')})`;
}

// First match wins: each source by exact signature, then by name.
export function findDoc(p: Primitive, sources: Array<Map<string, DocEntry>>): DocEntry | undefined {
  const key = docKey(p);
  for (const docs of sources) {
    const hit = docs.get(key) ?? docs.get(p.name);
    if (hit && (hit.summary || hit.notes || hit.examples?.length)) return hit;
  }
  return undefined;
}

// `#ordinal-020c`, the anchor a reference page can use to open an overload.
export function ordinalAnchor(ordinal: number): string {
  return 'ordinal-' + ordinal.toString(16).padStart(4, '0');
}
