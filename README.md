<p align="center"><img src="images/icon.png" alt="CKS" width="128"></p>

# CKS for VS Code

*[Leer en español](README.es.md)*

Unofficial, community-made language support for the CKS scripting language of **Imperivm**
(`.vs` files): syntax highlighting, error checking, completion, hover documentation and
signature help. Not affiliated with or endorsed by the game's developers or publishers.

## Features

- **Highlighting** of keywords, types, constants, strings and the first-line signature
  comment (`// void, int nSetIdx, str UnitType`).
- **Error checking** for mistakes the game's compiler rejects: unknown identifiers, a variable
  declared twice in the same block, prefix operators the parser refuses (`a == !b`), invalid
  characters, unterminated strings or comments, bad escapes and unknown types.
- **Warnings and hints** for traps: upper-case hex digits (the game misreads `0xFF`),
  `!a == b` meaning `!(a == b)`, and code the game silently skips after a block-level `return`.
- **Completion**: variables, parameters, constants, functions, and after `.` the methods of the
  variable's type and its parent types (a `Barrack` also offers `Building` and `Obj` methods).
- **Hover and signature help** with every overload of a function and its documentation.
- **AI constants** read from the game's `DATA/AI/AI.INI`, the same way the game defines them.
- Files are saved as **Windows-1252 with CRLF line endings**, like the game's own scripts.
- English and Spanish interface and documentation (`cks.docsLanguage`).

Tested against every script shipped with the game: scripts the game compiles produce no errors.
The extension does not yet check argument types, so a call with wrong argument types is not
reported (the game reports `No matching function with name ...`).

## Install

Download the `.vsix` from the [releases page](https://github.com/Upercat/VS-code-CKS-extension/releases) and run **Extensions → … → Install from VSIX…**.
Open your game folder (or its `DATA` folder) and any `.vs` script.

## Build from source

```bash
npm install
npm run compile
```

Open this folder in VS Code and press **F5** to start a development window with the extension.
`npm run package` builds a `.vsix`. On Windows PowerShell, use `npm.cmd` if script execution is
disabled.

To check the analyzer against your game installation:

```bash
node out/tools/checkCorpus.js "C:/Games/Imperivm"
```

## Settings

| Setting | Purpose |
| --- | --- |
| `cks.docsLanguage` | `auto`, `en` or `es` |
| `cks.docsFile` | A personal documentation file, shown before the bundled one |
| `cks.gameRoot` | Game folder for AI constants (default: found from the script's `DATA` folder) |
| `cks.primitivesFile` | Replace the bundled function table |
| `cks.referenceWeb` | A reference web page opened from hovers |

## Contributing

The most useful contribution is **documentation**. About 1,400 functions already have an English
description, written from reverse engineering: accurate, but technical (VM stack, return status,
memory offsets) rather than practical. Plain-language rewrites, parameter meanings, units,
examples and Spanish translations are very welcome. See [CONTRIBUTING.md](CONTRIBUTING.md).

## Credits

This project builds on the work of **David Campos Rodríguez**, whose
[CKS reference](https://david-campos.com/cks/) was the starting point of our research into the
language. Many thanks for documenting it and for allowing us to credit it here.

## License

[GPL-3.0-or-later](LICENSE). You may use, study, share and modify this extension; if you
distribute a modified version, you must publish its source under the same license.
This repository contains no game files.
