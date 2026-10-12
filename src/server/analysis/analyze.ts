// Document analysis: tokens, signature, declared variables and editor diagnostics. The grammar rules
// follow the game's single-pass script compiler. This is a tolerant approximation for the editor,
// not the exact parser: it never stops at the first error.
import { INT_CONSTANTS, TYPE_BY_NAME } from './builtins';
import { LexDiagnostic, Token, tokenize } from './lexer';
import { PrimitiveTable } from './primitives';
import { Signature, parseSignature } from './signature';

export type Severity = 'error' | 'warning' | 'information' | 'hint';

export interface Diagnostic {
  message: string;
  start: number;
  end: number;
  severity: Severity;
  unnecessary?: boolean; // rendered faded: the engine ignores this code
}

export interface Variable {
  name: string;
  type: string;
  kind: 'param' | 'local';
  start: number;
  end: number;
}

export interface Analysis {
  source: string;
  tokens: Token[];
  signature?: Signature;
  variables: Map<string, Variable>;
  diagnostics: Diagnostic[];
}

export interface AnalysisContext {
  primitives: PrimitiveTable;
  constants: Map<string, number>; // AI symbols and other per-game constants (builtins are added here)
}

// Binary operators of precedence levels 2..6 (* / % + - comparisons & |). A prefix `!` (level 7)
// cannot follow them, and an operand after `!` that continues with one of them is parsed as
// `!(a <op> b)`.
const TIGHTER_THAN_NOT = new Set(['*', '/', '%', '+', '-', '==', '!=', '<', '>', '<=', '>=', '&', '|']);
const LITERAL_KINDS = new Set(['int', 'float', 'string']);
const HEADER_KEYWORDS = new Set(['if', 'while', 'for']);
const STATEMENT_LEAD_KEYWORDS = new Set(['then', 'else', 'do']);

interface Frame {
  opener: '{' | '[' | '(' | 'file';
  block: boolean;          // a statement block (`{}` or an atomic `[]`), not a paren or an index
  header: boolean;         // the `( ... )` of an if / while / for
  seenStatement: boolean;  // declarations are only allowed before the first statement
  names: Set<string>;      // variables declared in this block
}

export function analyze(source: string, ctx: AnalysisContext): Analysis {
  const lex = tokenize(source);
  const tokens = lex.tokens;
  const diagnostics: Diagnostic[] = lex.diagnostics.map((d: LexDiagnostic) => ({ ...d }));
  const { signature, diagnostics: sigDiagnostics } = parseSignature(source);
  diagnostics.push(...sigDiagnostics);

  const variables = new Map<string, Variable>();
  for (const p of signature?.params ?? []) {
    variables.set(p.name, { name: p.name, type: p.type, kind: 'param', start: p.start, end: p.end });
  }

  const ignored = (from: number, to: number) => {
    if (to > from) {
      diagnostics.push({
        message: 'Ignored by the engine: the compiler skips everything after a block-level `return` (or after the outer `{ ... }` body) up to the end of the block',
        start: from,
        end: to,
        severity: 'hint',
        unnecessary: true,
      });
    }
  };

  // Index of the token that closes the frame opened before `from` (or the end token).
  const findCloser = (from: number): number => {
    let depth = 0;
    for (let i = from; i < tokens.length; i++) {
      const t = tokens[i];
      if (t.kind === 'end') return i;
      if (t.kind !== 'symbol') continue;
      if (t.text === '{' || t.text === '[' || t.text === '(') depth++;
      else if (t.text === '}' || t.text === ']' || t.text === ')') {
        if (depth === 0) return i;
        depth--;
      }
    }
    return tokens.length - 1;
  };

  // Index of the `;` that ends the statement starting at `from`, at the same nesting.
  const findStatementEnd = (from: number): number => {
    let depth = 0;
    for (let i = from; i < tokens.length; i++) {
      const t = tokens[i];
      if (t.kind === 'end') return i;
      if (t.kind !== 'symbol') continue;
      if (t.text === '{' || t.text === '[' || t.text === '(') depth++;
      else if (t.text === '}' || t.text === ']' || t.text === ')') {
        if (depth === 0) return i - 1;
        depth--;
      } else if (t.text === ';' && depth === 0) return i;
    }
    return tokens.length - 1;
  };

  const stack: Frame[] = [{ opener: 'file', block: true, header: false, seenStatement: false, names: new Set(signature?.params.map((p) => p.name)) }];
  let i = 0;

  // A body given as `{ ... }`: the rest of the file is ignored.
  if (tokens[0]?.kind === 'symbol' && tokens[0].text === '{') {
    const close = findCloser(1);
    if (tokens[close].kind !== 'end' && close + 1 < tokens.length - 1) {
      ignored(tokens[close + 1].start, tokens[tokens.length - 1].start);
    }
  }

  let statementStart: boolean = true; // the next token starts a statement
  // ... that is the body of an if / else / while / for / do, not a statement of the enclosing block
  let subStatement = false;
  while (i < tokens.length && tokens[i].kind !== 'end') {
    const t = tokens[i];
    const frame = stack[stack.length - 1];
    const prev = i > 0 ? tokens[i - 1] : undefined;
    const atBlockStatement = statementStart && frame.block && !subStatement;

    if (atBlockStatement && t.kind === 'identifier' && TYPE_BY_NAME.has(t.text) && tokens[i + 1]?.kind === 'identifier') {
      // Declaration: `Type a [= literal], b;`
      if (frame.seenStatement) {
        diagnostics.push({ message: 'Declarations must precede the statements of a block', start: t.start, end: t.end, severity: 'warning' });
      }
      let j = i + 1;
      while (tokens[j]?.kind === 'identifier') {
        const name = tokens[j];
        if (frame.names.has(name.text)) { // an inner block may shadow an outer variable
          diagnostics.push({ message: `Variable already declared: ${name.text}`, start: name.start, end: name.end, severity: 'error' });
        }
        frame.names.add(name.text);
        if (!variables.has(name.text)) {
          variables.set(name.text, { name: name.text, type: t.text, kind: 'local', start: name.start, end: name.end });
        }
        j++;
        if (tokens[j]?.text === '=') {
          const init = tokens[j + 1];
          const literal = init && (LITERAL_KINDS.has(init.kind) || (init.kind === 'keyword' && (init.text === 'true' || init.text === 'false')));
          if (!literal) {
            diagnostics.push({ message: 'A declaration initialiser must be a single literal token', start: init?.start ?? tokens[j].start, end: init?.end ?? tokens[j].end, severity: 'error' });
          }
          j += 2;
        }
        if (tokens[j]?.text !== ',') break;
        j++;
      }
      if (tokens[j]?.text !== ';') {
        diagnostics.push({ message: "Expected ';' after the declaration", start: tokens[j]?.start ?? t.start, end: tokens[j]?.end ?? t.end, severity: 'error' });
      }
      i = j + 1;
      statementStart = true;
      subStatement = false;
      continue;
    }

    if (atBlockStatement && !(t.kind === 'symbol' && (t.text === '}' || t.text === ']'))) frame.seenStatement = true;

    if (atBlockStatement && t.kind === 'keyword' && t.text === 'return') {
      const end = findStatementEnd(i + 1);
      const close = findCloser(end + 1);
      if (close > end + 1) ignored(tokens[end + 1].start, tokens[close].start);
      i = close;
      statementStart = false;
      continue;
    }

    if (t.kind === 'symbol') {
      switch (t.text) {
        case '{':
          stack.push({ opener: '{', block: true, header: false, seenStatement: false, names: new Set() });
          statementStart = true;
          subStatement = false;
          i++;
          continue;
        case '[': {
          const block: boolean = statementStart;
          stack.push({ opener: '[', block, header: false, seenStatement: false, names: new Set() });
          statementStart = block;
          if (block) subStatement = false;
          i++;
          continue;
        }
        case '(': {
          const header = prev?.kind === 'keyword' && HEADER_KEYWORDS.has(prev.text);
          stack.push({ opener: '(', block: false, header, seenStatement: false, names: new Set() });
          statementStart = false;
          i++;
          continue;
        }
        case '}':
        case ']':
        case ')': {
          const closed = stack.length > 1 ? stack.pop()! : frame;
          statementStart = closed.block || closed.header;
          subStatement = closed.header;
          i++;
          continue;
        }
        case ';':
          statementStart = frame.block;
          subStatement = false;
          i++;
          continue;
        case '!':
          checkPrefixNot(i);
          break;
      }
    }

    if (t.kind === 'identifier' && prev?.text !== '.') checkIdentifier(t);
    statementStart = t.kind === 'keyword' && STATEMENT_LEAD_KEYWORDS.has(t.text);
    if (statementStart) subStatement = true;
    i++;
  }

  function checkPrefixNot(at: number) {
    const t = tokens[at];
    const prev = at > 0 ? tokens[at - 1] : undefined;
    if (prev?.kind === 'symbol' && (TIGHTER_THAN_NOT.has(prev.text) || prev.text === '!')) {
      diagnostics.push({
        message: `The engine's parser rejects a prefix '!' after '${prev.text}': a prefix operator only applies at its own precedence level. Write (!x)`,
        start: t.start,
        end: t.end,
        severity: 'error',
      });
      return;
    }
    // Skip one postfix operand: name / literal / ( ... ), then calls, members and indexes.
    let j = at + 1;
    const skipGroup = () => {
      const close = findCloser(j + 1);
      j = close + 1;
    };
    if (tokens[j]?.text === '(') skipGroup();
    else if (tokens[j] && tokens[j].kind !== 'symbol' && tokens[j].kind !== 'end') j++;
    else return;
    for (;;) {
      const n = tokens[j];
      if (n?.text === '(' || n?.text === '[') skipGroup();
      else if (n?.text === '.' && tokens[j + 1]?.kind === 'identifier') j += 2;
      else break;
    }
    const op = tokens[j];
    if (op?.kind === 'symbol' && TIGHTER_THAN_NOT.has(op.text)) {
      diagnostics.push({
        message: `The engine parses this as !( ... ${op.text} ... ): prefix '!' binds looser than '${op.text}'. Add parentheses to make the intent explicit`,
        start: t.start,
        end: op.end,
        severity: 'information',
      });
    }
  }

  function checkIdentifier(t: Token) {
    const name = t.text;
    if (name === 'this' || variables.has(name) || INT_CONSTANTS.has(name) || ctx.constants.has(name)) return;
    if (TYPE_BY_NAME.has(name) || ctx.primitives.overloads(name).length > 0) return;
    diagnostics.push({ message: `Unknown identifier '${name}'`, start: t.start, end: t.end, severity: 'error' });
  }

  return { source, tokens, signature, variables, diagnostics };
}

// Index of the token that contains or ends right before `offset`.
export function tokenAt(tokens: Token[], offset: number): number {
  let lo = 0;
  let hi = tokens.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (tokens[mid].start <= offset) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

// Static type of the expression that ends at token `index` when it is a plain variable.
export function variableTypeBefore(analysis: Analysis, index: number): string | undefined {
  const t = analysis.tokens[index];
  if (t?.kind !== 'identifier') return undefined;
  return analysis.variables.get(t.text)?.type;
}
