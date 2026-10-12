# Contributing

Contributions are welcome in English or Spanish. By contributing you agree that your work is
published under the [GPL-3.0-or-later](LICENSE).

## Documenting functions

Documentation lives in `data/docs/primitives.en.json` (English) and
`data/docs/primitives.es.json` (Spanish). The English file starts with technical descriptions taken
from reverse engineering of the game: they say what the native code does (stack, return status,
fields) and often what is still unknown (*Limitations*). Rewriting them in plain language is the
best way to help: keep the facts, explain what a scripter needs, and keep a limitation until someone
has actually checked it. VS Code validates both files against
`data/docs/primitives.schema.json` while you edit them.

```json
{
  "$schema": "./primitives.schema.json",
  "language": "en",
  "entries": {
    "void Sleep(int)": {
      "summary": "Pauses the script.",
      "notes": "Describe the parameter, its unit and any pitfall here.",
      "examples": ["Sleep( 1000 );"]
    }
  }
}
```

- **Key:** the signature exactly as the hover shows it, without parameter names and without the
  receiver: `void Obj::ExecCmd(str,point,Obj,bool)`. A bare name such as `Sleep` documents every
  variant of that function that has no entry of its own.
- **Write what you have checked.** Say how you know when it is not obvious ("tested in a
  skirmish", "used this way by the game's AI scripts"). Mark guesses as guesses.
- **Do not paste the game's own scripts.** Write your own short examples.
- A Spanish entry may stay missing: the English one is shown instead.

## Improving the analyzer

The analyzer (`src/server/analysis`) has no VS Code dependency. Before sending a change to it,
run it over the scripts of your game installation:

```bash
npm run compile
node out/tools/checkCorpus.js "C:/Games/Imperivm"
```

A script the game compiles must never get an error. If you have a list of the scripts the game
compiles (first column: path relative to the game folder, lower case, `/`), pass it with
`--reference` to separate false positives from correctly detected failures.

## Rules

- Never commit game files: scripts, executables, archives or extracted assets.
- Keep code comments and identifiers in English.
