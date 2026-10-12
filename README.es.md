# CKS para VS Code

*[Read in English](README.md)*

Soporte no oficial, hecho por la comunidad, para el lenguaje de scripts CKS de **Imperivm**
(archivos `.vs`): coloreado de sintaxis, detección de errores, autocompletado, documentación al
pasar el ratón y ayuda con las firmas de las funciones. No está afiliado ni respaldado por los
desarrolladores ni los editores del juego.

## Funciones

- **Coloreado** de palabras clave, tipos, constantes, textos y la línea de firma del principio
  (`// void, int nSetIdx, str UnitType`).
- **Detección de errores** que el compilador del juego rechaza: identificadores desconocidos,
  variables declaradas dos veces en el mismo bloque, operadores que el parser no acepta
  (`a == !b`), caracteres no válidos, textos o comentarios sin cerrar, escapes incorrectos y
  tipos desconocidos.
- **Avisos** sobre trampas: dígitos hex en mayúscula (el juego lee mal `0xFF`), `!a == b` que
  significa `!(a == b)`, y código que el juego ignora sin avisar tras un `return`.
- **Autocompletado**: variables, parámetros, constantes, funciones y, tras un `.`, los métodos del
  tipo de la variable y de sus tipos padre (un `Barrack` ofrece también los de `Building` y `Obj`).
- **Hover y ayuda de firmas** con todas las variantes de cada función y su documentación.
- **Constantes de IA** leídas del `DATA/AI/AI.INI` del juego, igual que las define el juego.
- Los archivos se guardan en **Windows-1252 con saltos CRLF**, como los scripts del juego.
- Interfaz y documentación en español e inglés (`cks.docsLanguage`).

Probado con todos los scripts que trae el juego: los que el juego compila no dan ningún error.
Todavía no comprueba los tipos de los argumentos, así que una llamada con argumentos de tipo
equivocado no se marca (el juego dice `No matching function with name ...`).

## Instalación

Descarga el `.vsix` de la página de versiones y usa **Extensiones → … → Instalar desde VSIX…**.
Abre la carpeta del juego (o su carpeta `DATA`) y cualquier script `.vs`.

## Compilar desde el código

```bash
npm install
npm run compile
```

Abre esta carpeta en VS Code y pulsa **F5** para lanzar una ventana de desarrollo con la
extensión. `npm run package` genera el `.vsix`. En PowerShell de Windows, usa `npm.cmd` si la
ejecución de scripts está deshabilitada.

Para comprobar el analizador con tu instalación del juego:

```bash
node out/tools/checkCorpus.js "C:/Juegos/Imperivm"
```

## Contribuir

Lo más útil es la **documentación**: qué hace cada función, sus parámetros y unidades, trampas y
ejemplos cortos, en español o en inglés. Consulta [CONTRIBUTING.md](CONTRIBUTING.md).

## Licencia

[GPL-3.0 o posterior](LICENSE). Puedes usar, estudiar, compartir y modificar esta extensión; si
distribuyes una versión modificada, debes publicar su código con la misma licencia.
Este repositorio no contiene archivos del juego.
