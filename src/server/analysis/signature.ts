// Script signature comment: the first source line `// <ret>, <Type> <Name>, ...` declares the result
// and parameters of the script. Accepted spellings: optional space after `//`, optional spaces around commas,
// `int *p`, `IntArray* a`, `str OUT name`.
import { TYPE_BY_NAME } from './builtins';

export interface SignatureParam {
  type: string;
  name: string;
  out: boolean;      // `OUT`: written back to the caller
  pointer: boolean;  // `*`: a reference variable inside the script
  start: number;     // source offset of the parameter text
  end: number;
}

export interface Signature {
  result: string;
  params: SignatureParam[];
  start: number;
  end: number;
}

export interface SignatureDiagnostic {
  message: string;
  start: number;
  end: number;
  severity: 'error' | 'warning';
}

export function parseSignature(source: string): { signature?: Signature; diagnostics: SignatureDiagnostic[] } {
  const diagnostics: SignatureDiagnostic[] = [];
  const eol = source.search(/[\r\n]/);
  const lineEnd = eol < 0 ? source.length : eol;
  const line = source.slice(0, lineEnd);
  const lead = line.length - line.trimStart().length;
  if (!line.trimStart().startsWith('//')) {
    diagnostics.push({
      message: 'The script does not start with a signature comment (`// <ret>, <Type> <Name>, ...`)',
      start: 0,
      end: Math.max(lineEnd, 1),
      severity: 'warning',
    });
    return { diagnostics };
  }

  const body = lead + 2;
  const parts: Array<{ text: string; start: number }> = [];
  let partStart = body;
  for (let i = body; i <= lineEnd; i++) {
    if (i === lineEnd || source[i] === ',') {
      const raw = source.slice(partStart, i);
      const trimmedStart = partStart + (raw.length - raw.trimStart().length);
      parts.push({ text: raw.trim(), start: trimmedStart });
      partStart = i + 1;
    }
  }

  const checkType = (name: string, start: number) => {
    if (!TYPE_BY_NAME.has(name)) {
      diagnostics.push({ message: `Unknown type '${name}' in the script signature`, start, end: start + Math.max(name.length, 1), severity: 'error' });
    }
  };

  const [resultPart, ...paramParts] = parts;
  checkType(resultPart.text, resultPart.start);
  const signature: Signature = { result: resultPart.text, params: [], start: lead, end: lineEnd };

  for (const part of paramParts) {
    const end = part.start + part.text.length;
    const pointer = part.text.includes('*');
    const words = part.text.split(/[\s*]+/).filter(Boolean);
    let out = false;
    if (words.length > 2 && words[1] === 'OUT') {
      out = true;
      words.splice(1, 1);
    }
    if (words.length !== 2) {
      diagnostics.push({ message: `Cannot parse signature parameter '${part.text}'`, start: part.start, end: Math.max(end, part.start + 1), severity: 'error' });
      continue;
    }
    const [type, name] = words;
    checkType(type, part.start);
    if (type === 'void') {
      diagnostics.push({ message: 'void parameter in the script signature', start: part.start, end, severity: 'error' });
    }
    signature.params.push({ type, name, out, pointer, start: part.start, end });
  }
  if (signature.params.length > 16) {
    diagnostics.push({ message: 'The script descriptor holds at most 16 parameter types', start: lead, end: lineEnd, severity: 'warning' });
  }
  return { signature, diagnostics };
}
