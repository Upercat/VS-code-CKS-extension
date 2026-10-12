// AI symbolic constants that the game defines before its scripts compile:
//   SS_IDLE = 0, then every key of the sections SquadStates, GAIKAStrat, EconomyScripts and
//   TacticScripts, numbered from 1 in byte order (one set shared by the four sections);
//   every key of Vars.All, Vars.Easy, Vars.Normal and Vars.Hard, numbered from 0 in byte order.
// Keys come from DATA/AI/AI.INI and the AI.INI of every subdirectory of DATA/AI (loose files only).
import * as fs from 'fs';
import * as path from 'path';

function childNoCase(dir: string, name: string): string | undefined {
  try {
    const hit = fs.readdirSync(dir).find((e) => e.toUpperCase() === name.toUpperCase());
    return hit ? path.join(dir, hit) : undefined;
  } catch {
    return undefined;
  }
}

function readAiIni(file: string, states: Set<string>, vars: Set<string>) {
  let text: string;
  try {
    text = fs.readFileSync(file, 'latin1');
  } catch {
    return;
  }
  let section = '';
  for (let line of text.split(/\r?\n/)) {
    const semi = line.indexOf(';');
    if (semi >= 0) line = line.slice(0, semi);
    line = line.trim();
    if (!line) continue;
    if (line.startsWith('[')) {
      const close = line.indexOf(']');
      section = line.slice(1, close < 0 ? undefined : close).trim();
      continue;
    }
    const key = line.split('=')[0].trim();
    if (!key) continue;
    if (['SquadStates', 'GAIKAStrat', 'EconomyScripts', 'TacticScripts'].includes(section)) states.add(key);
    else if (['Vars.All', 'Vars.Easy', 'Vars.Normal', 'Vars.Hard'].includes(section)) vars.add(key);
  }
}

// Byte-order sort, as std::set<std::string> orders the names.
const byteOrder = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

export function loadAiSymbols(gameRoot: string): Map<string, number> {
  const out = new Map<string, number>();
  const data = childNoCase(gameRoot, 'DATA');
  const ai = data && childNoCase(data, 'AI');
  if (!ai) return out;
  const states = new Set<string>();
  const vars = new Set<string>();
  const ini = childNoCase(ai, 'AI.INI');
  if (ini) readAiIni(ini, states, vars);
  for (const entry of fs.readdirSync(ai, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name.startsWith('.')) continue;
    const sub = childNoCase(path.join(ai, entry.name), 'AI.INI');
    if (sub) readAiIni(sub, states, vars);
  }
  out.set('SS_IDLE', 0);
  [...states].sort(byteOrder).forEach((name, i) => out.set(name, i + 1));
  [...vars].sort(byteOrder).forEach((name, i) => out.set(name, i));
  return out;
}

// The game root that holds `file`: the parent of its nearest ancestor directory named DATA.
export function findGameRoot(file: string): string | undefined {
  for (let dir = path.dirname(file); ; dir = path.dirname(dir)) {
    if (path.basename(dir).toUpperCase() === 'DATA') return path.dirname(dir);
    if (path.dirname(dir) === dir) return undefined;
  }
}
