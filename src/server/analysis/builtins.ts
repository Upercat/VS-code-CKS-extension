// What the game's CKS compiler knows before it compiles a script: script types with their parent
// chain, implicit conversions and named integer constants (Imperivm GBR HD).

export interface TypeInfo {
  name: string;
  parent?: string;   // member calls try `Type::name` up this chain
  condition: boolean; // the type has an extractor and can be used as a condition
}

export const TYPES: TypeInfo[] = [
  { name: 'void', condition: false },
  { name: 'int', condition: true },
  { name: 'float', condition: false },
  { name: 'point', condition: false },
  { name: 'bool', condition: true },
  { name: 'rect', condition: false },
  { name: 'pstr', condition: false },
  { name: 'str', condition: false },
  { name: 'IntArray', condition: false },
  { name: 'StrArray', condition: false },
  { name: 'StrMap', condition: false },
  { name: 'Obj', condition: true },
  { name: 'Unit', parent: 'Obj', condition: true },
  { name: 'Building', parent: 'Obj', condition: true },
  { name: 'ObjList', condition: true },
  { name: 'Hero', parent: 'Unit', condition: true },
  { name: 'Tower', parent: 'Building', condition: true },
  { name: 'Wagon', parent: 'Unit', condition: true },
  { name: 'Settlement', condition: true },
  { name: 'ItemHolder', parent: 'Obj', condition: true },
  { name: 'Conversation', condition: false },
  { name: 'Item', condition: true },
  { name: 'Query', condition: false },
  { name: 'Barrack', parent: 'Building', condition: true },
  { name: 'NamedObj', parent: 'Query', condition: false },
  { name: 'Druid', parent: 'Unit', condition: true },
  { name: 'Ghost', parent: 'Unit', condition: true },
  { name: 'Catapult', parent: 'Building', condition: true },
  { name: 'Sacrifice', parent: 'Obj', condition: true },
  { name: 'SquadList', condition: false },
  { name: 'Squad', parent: 'int', condition: true },
  { name: 'GAIKA', parent: 'int', condition: true },
  { name: 'Gate', parent: 'Building', condition: true },
  { name: 'Teleport', parent: 'Building', condition: true },
  { name: 'Ship', parent: 'Unit', condition: true },
  { name: 'Flying', parent: 'Unit', condition: true },
];

export const TYPE_BY_NAME = new Map(TYPES.map((t) => [t.name, t]));

// The type itself, then each parent, nearest first.
export function typeChain(name: string): string[] {
  const chain: string[] = [];
  for (let t = TYPE_BY_NAME.get(name); t && !chain.includes(t.name); t = t.parent ? TYPE_BY_NAME.get(t.parent) : undefined) {
    chain.push(t.name);
  }
  return chain;
}

// from, to, cost (lower is preferred by overload resolution).
export const CONVERSIONS: Array<[string, string, number]> = [
  ['int', 'float', 30], ['bool', 'pstr', 50], ['bool', 'int', 15], ['int', 'str', 50],
  ['pstr', 'str', 15], ['Obj', 'bool', 10], ['Obj', 'Query', 5], ['NamedObj', 'Obj', 10],
];

const HERO_SKILLS = [
  'hsAdministration', 'hsTeamAttack', 'hsTeamDefense', 'hsQuickMarch', 'hsEpicEndurance', 'hsDiscipline',
  'hsLeadership', 'hsEpicAttack', 'hsBattleCry', 'hsHealing', 'hsCeasefire', 'hsVigor', 'hsFrenzy', 'hsRush',
  'hsEgoism', 'hsWisdom', 'hsRecovery', 'hsSurvival', 'hsCharge', 'hsScout', 'hsAssault', 'hsEpicArmor',
  'hsConcealment', 'hsDefensiveCry', 'hsEuphoria',
];

const UNIT_SPECIALS = [
  'parry', 'drain', 'ferocity', 'triple_strike', 'deflection', 'active', 'life_steal', 'determination',
  'combat_skill', 'toughness', 'offensive_tactics', 'defensive_tactics', 'penetration', 'spike_armor',
  'bleeding_attack', 'attack_skill', 'defense_skill', 'death_blow', 'power_strike', 'expertise', 'charge',
  'regeneration', 'rage', 'revenge', 'triumph', 'disease_attack', 'sneak', 'invisibility', 'learning',
  'teaching', 'freedom', 'cripple', 'healing', 'keen_sight', 'trample', 'curse',
];

export const INT_CONSTANTS = new Map<string, number>([
  ['AI_NONE', 0], ['AI_ALL', 0xffff], ['AI_COMING', 1], ['AI_LEAVING', 2], ['AI_STAYING', 4], ['AI_OWN', 1],
  ['AI_ALLY', 2], ['AI_ENEMY', 4], ['AI_FRIENDLY', 3], ['SF_NOAI', 1], ['SF_ADVCHOOSER', 2], ['SF_PEACEFUL', 4],
  ['SF_SENTRIES', 0x20], ['GS_NONE', 0], ['ES_NONE', 0], ['TS_NONE', 0], ['SF_WANTDRUIDS', 0x10],
  ['MaxGAIKAPriority', 100], ['cEasy', 0], ['cNormal', 1], ['cHard', 2], ['gsWindOfWisdom', 0],
  ['gsStarvation', 1], ['gsSoothingRain', 2], ['gsDivineSacrifice', 3], ['gsBloodlust', 4], ['gsTribute', 5],
  ['GlobalSpellsCount', 6], ['tsOwned', 1], ['tsEnemy', 0], ['tsDisabled', 2], ['HeroSkillsCount', 25],
  ['Gaul', 0], ['Rome', 1], ['RepublicanRome', 1], ['Carthage', 2], ['Iberia', 3], ['ImperialRome', 4],
  ['Britain', 5], ['Egypt', 6], ['Germany', 7], ['dtSlash', 0], ['dtPierce', 1], ['dtSiege', 2], ['dtNone', 3],
  ['UnitSpecialsCount', 36], ['UNITFLAG_NOAI', 0x40000],
  ...HERO_SKILLS.map((name, i): [string, number] => [name, i]),
  ...UNIT_SPECIALS.map((name, i): [string, number] => [name, i]),
]);
