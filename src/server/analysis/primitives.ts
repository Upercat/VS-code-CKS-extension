// Native primitive table: one overload per line, `ordinal<TAB>name<TAB>ret<TAB>args`. Args are comma
// separated `Type`, `Type&` (by reference) or `Type name`. Member functions are named `Type::name`
// and take the receiver as their first argument. The ordinal identifies each overload; table order
// is the order in which the game tries overloads.
import * as fs from 'fs';

export interface PrimitiveArg {
  type: string;
  name?: string;
  byRef: boolean;
}

export interface Primitive {
  ordinal: number;
  name: string;          // full name, e.g. `Obj::ExecCmd` or `Sleep`
  owner?: string;        // `Obj` for `Obj::ExecCmd`
  member: string;        // `ExecCmd`
  ret: string;
  args: PrimitiveArg[];  // includes the receiver for member functions
}

export class PrimitiveTable {
  readonly all: Primitive[];
  private readonly byName = new Map<string, Primitive[]>();
  private readonly byOwner = new Map<string, Primitive[]>();

  constructor(primitives: Primitive[]) {
    this.all = primitives.filter((p) => /^[A-Za-z_]/.test(p.name)); // operators are not callable by name
    for (const p of this.all) {
      push(this.byName, p.name, p);
      if (p.owner) push(this.byOwner, p.owner, p);
    }
  }

  static load(file: string): PrimitiveTable {
    return new PrimitiveTable(parsePrimitiveTable(fs.readFileSync(file, 'utf8')));
  }

  overloads(name: string): Primitive[] {
    return this.byName.get(name) ?? [];
  }

  methodsOf(owner: string): Primitive[] {
    return this.byOwner.get(owner) ?? [];
  }

  globals(): Primitive[] {
    return this.all.filter((p) => !p.owner);
  }
}

export function parsePrimitiveTable(text: string): Primitive[] {
  const out: Primitive[] = [];
  for (const raw of text.split(/\r?\n/)) {
    if (!raw.trim() || raw.startsWith('#')) continue;
    const [ordinal, name, ret, args = ''] = raw.split('\t');
    if (!name) continue;
    const sep = name.indexOf('::');
    out.push({
      ordinal: Number(ordinal),
      name,
      owner: sep > 0 ? name.slice(0, sep) : undefined,
      member: sep > 0 ? name.slice(sep + 2) : name,
      ret,
      args: args.trim() ? args.split(',').map(parseArg) : [],
    });
  }
  return out;
}

function parseArg(spec: string): PrimitiveArg {
  const words = spec.trim().split(/\s+/);
  const byRef = words[0].endsWith('&');
  return { type: words[0].replace(/&$/, ''), name: words[1], byRef };
}

function push<K, V>(map: Map<K, V[]>, key: K, value: V) {
  const list = map.get(key);
  if (list) list.push(value);
  else map.set(key, [value]);
}

// `void Obj::ExecCmd(str, point, Obj, bool)`; the receiver is dropped for member functions.
export function formatPrimitive(p: Primitive): string {
  const args = (p.owner ? p.args.slice(1) : p.args).map(formatArg);
  return `${p.ret} ${p.name}(${args.join(', ')})`;
}

export function formatArg(a: PrimitiveArg): string {
  return `${a.type}${a.byRef ? '&' : ''}${a.name ? ' ' + a.name : ''}`;
}
