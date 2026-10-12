// CKS lexer. Follows the token rules of the game's script compiler, but never stops: every error
// the game would report is recorded and the lexer recovers so that the editor still gets tokens.
//
//   whitespace       space, tab, CR, LF; a CR/LF or LF/CR pair is one line break
//   comments         `/* ... */` (unterminated = error) and `//` to end of line
//   identifiers      [A-Za-z_][A-Za-z0-9_:]*   (':' is an identifier character)
//   numbers          decimal int, `digits.digits` float (no exponent), `0x` + hex
//   strings          "..." or '...', no line break, escapes \0xHHHH \<decimal> \" \' \? \\ \a \b \f \n \r \t \v
// A NUL byte ends the source. Engine error positions are 1-based and count a tab as 2 columns.

export type TokenKind = 'identifier' | 'keyword' | 'int' | 'float' | 'string' | 'symbol' | 'end';

export interface Token {
  kind: TokenKind;
  text: string;      // spelling for identifiers, keywords and symbols; decoded bytes for strings
  start: number;     // source offset
  end: number;       // source offset after the token
}

export interface LexDiagnostic {
  message: string;
  start: number;
  end: number;
  severity: 'error' | 'warning';
}

export interface LexResult {
  tokens: Token[];   // always ends with an 'end' token
  diagnostics: LexDiagnostic[];
  comments: Array<{ start: number; end: number }>;
}

export const KEYWORDS = new Set([
  'if', 'then', 'else', 'while', 'do', 'for', 'break', 'continue', 'return', 'true', 'false',
]);

// Longest first, as the engine's MatchSymbol tries them.
export const SYMBOLS = [
  '==', '!=', '<=', '>=', '&&', '||', '+=', '-=',
  '(', ')', '{', '}', '[', ']', ';', ',', '.', '*', '/', '%', '-', '+', '<', '>', '&', '|', '!', '^', '=',
];

export const ENGINE_TAB_WIDTH = 2;

const isDigit = (c: string) => c >= '0' && c <= '9';
const isHex = (c: string) => isDigit(c) || (c >= 'A' && c <= 'F') || (c >= 'a' && c <= 'f');
const isUpperHexLetter = (c: string) => c >= 'A' && c <= 'F';
const isIdentStart = (c: string) => (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || c === '_';
const isIdentChar = (c: string) => isIdentStart(c) || isDigit(c) || c === ':';

const UPPER_HEX_WARNING =
  'The game misreads upper-case hex digits (A-F are not 10-15); write them in lower case';

export function tokenize(source: string): LexResult {
  const nul = source.indexOf('\0');
  const src = nul >= 0 ? source.slice(0, nul) : source;
  const tokens: Token[] = [];
  const diagnostics: LexDiagnostic[] = [];
  const comments: Array<{ start: number; end: number }> = [];
  let at = 0;

  const error = (message: string, start: number, end: number, severity: 'error' | 'warning' = 'error') =>
    diagnostics.push({ message, start, end: Math.max(end, start + 1), severity });

  const skipBlanksAndComments = () => {
    for (;;) {
      while (at < src.length && (src[at] === ' ' || src[at] === '\t' || src[at] === '\r' || src[at] === '\n')) at++;
      if (src.startsWith('/*', at)) {
        const start = at;
        const close = src.indexOf('*/', at + 2);
        if (close < 0) {
          error('Expected end of comment', start, start + 2);
          at = src.length;
        } else {
          at = close + 2;
        }
        comments.push({ start, end: at });
        continue;
      }
      if (src.startsWith('//', at)) {
        const start = at;
        while (at < src.length && src[at] !== '\r' && src[at] !== '\n') at++;
        comments.push({ start, end: at });
        continue;
      }
      return;
    }
  };

  const readHexDigits = (limit: number): number => {
    const begin = at;
    let upper = false;
    while (at < src.length && isHex(src[at]) && at - begin < limit) {
      upper ||= isUpperHexLetter(src[at]);
      at++;
    }
    if (upper) error(UPPER_HEX_WARNING, begin, at, 'warning');
    return at - begin;
  };

  // Entered after the backslash. Returns false for an escape the engine rejects.
  const readEscape = (): boolean => {
    if (at >= src.length) return false;
    if (src[at] === '0' && src[at + 1] === 'x') {
      at += 2;
      if (at >= src.length || !isHex(src[at])) return false;
      readHexDigits(4);
      return !(at < src.length && isHex(src[at]));
    }
    if (isDigit(src[at])) {
      const begin = at;
      while (at < src.length && isDigit(src[at])) at++;
      return Number(src.slice(begin, at)) <= 0xff;
    }
    if ('"\'?\\abfnrtv'.includes(src[at])) {
      at++;
      return true;
    }
    return false;
  };

  for (;;) {
    skipBlanksAndComments();
    const start = at;
    if (at >= src.length) {
      tokens.push({ kind: 'end', text: '', start, end: start });
      break;
    }
    const c = src[at];
    if (isIdentStart(c)) {
      at++;
      while (at < src.length && isIdentChar(src[at])) at++;
      const text = src.slice(start, at);
      tokens.push({ kind: KEYWORDS.has(text) ? 'keyword' : 'identifier', text, start, end: at });
      continue;
    }
    const symbol = SYMBOLS.find((s) => src.startsWith(s, at));
    if (symbol) {
      at += symbol.length;
      tokens.push({ kind: 'symbol', text: symbol, start, end: at });
      continue;
    }
    if (c === '0' && src[at + 1] === 'x' && at + 2 < src.length && isHex(src[at + 2])) {
      at += 2;
      readHexDigits(Number.MAX_SAFE_INTEGER);
      tokens.push({ kind: 'int', text: src.slice(start, at), start, end: at });
      continue;
    }
    if (isDigit(c)) {
      while (at < src.length && isDigit(src[at])) at++;
      let kind: TokenKind = 'int';
      if (src[at] === '.') {
        kind = 'float';
        at++;
        while (at < src.length && isDigit(src[at])) at++;
      }
      tokens.push({ kind, text: src.slice(start, at), start, end: at });
      continue;
    }
    if (c === '"' || c === "'") {
      at++;
      let text = '';
      let closed = false;
      while (at < src.length && src[at] !== '\r' && src[at] !== '\n') {
        if (src[at] === c) {
          at++;
          closed = true;
          break;
        }
        if (src[at] === '\\') {
          const escapeStart = at;
          at++;
          if (!readEscape()) {
            error('Not a valid constant', escapeStart, Math.max(at, escapeStart + 2));
            if (at === escapeStart + 1) at++;
          }
          text += src.slice(escapeStart, at);
          continue;
        }
        text += src[at++];
      }
      if (!closed) error('Expected inverted commas', start, at);
      tokens.push({ kind: 'string', text, start, end: at });
      continue;
    }
    error('Unknown character found', start, start + 1);
    at++;
  }
  return { tokens, diagnostics, comments };
}

// 1-based line and column of `offset` as the engine reports them (tab = 2 columns, CR/LF pairs).
export function enginePosition(source: string, offset: number): { line: number; column: number } {
  let line = 1;
  let column = 1;
  for (let i = 0; i < offset && i < source.length; i++) {
    const c = source[i];
    if (c === '\r' || c === '\n') {
      const pair = c === '\r' ? '\n' : '\r';
      if (source[i + 1] === pair && i + 1 < offset) i++;
      line++;
      column = 1;
    } else {
      column += c === '\t' ? ENGINE_TAB_WIDTH : 1;
    }
  }
  return { line, column };
}
