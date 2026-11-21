# Licencias de dependencias y titularidad del código (DOC-12)

Generado el 21 de noviembre de 2026 a partir de `package-lock.json` y de `node_modules/*/package.json` (campo `license`). Las dependencias directas aparecen en **negrita**. Vuelve a generarlo cuando cambien las dependencias.

> Esto es un inventario técnico, no una opinión legal. Si vas a vender o ceder el software, pídele al abogado que lo revise (US-23, US-24).

## Resumen

| Grupo | Paquetes | Licencias |
|---|---|---|
| Producción (`dependencies`) | 199 | MIT: 177 · ISC: 12 · Apache-2.0: 2 · BSD-3-Clause: 2 · Unlicense: 1 · Sin licencia declarada: 1 · MIT/X11: 1 · BlueOak-1.0.0: 1 · (MIT OR GPL-3.0-or-later): 1 · (MIT AND Zlib): 1 |
| Desarrollo (`devDependencies`) | 44 | MIT: 25 · MPL-2.0: 12 · Apache-2.0: 5 · ISC: 1 · BSD-3-Clause: 1 |

## Licencias que no son permisivas o requieren atención

| Paquete | Uso | Licencia | Riesgo y acción |
|---|---|---|---|
| `buffers` 0.1.1 | Producción, indirecta (`exceljs` › `unzipper` › `binary` › `buffers`) | **Sin licencia declarada** en su `package.json` ni archivo de licencia | Sin licencia expresa, en rigor no hay permiso de uso. Es un paquete antiguo del mismo autor de `binary` (MIT). **Acción:** consultarlo con el abogado o pedir a BE que evalúe reemplazar la ruta de `exceljs` que lo trae (lectura de ZIP con `unzipper`). Riesgo práctico bajo. |
| `lightningcss` 1.33.0 (y sus binarios por plataforma) | Solo desarrollo (lo usa `vite` al compilar) | **MPL-2.0** (copyleft débil, por archivo) | No se incluye en lo que se entrega al navegador ni en el servidor. Solo obligaría a publicar cambios hechos **a sus propios archivos**, y no los modificamos. Sin acción. |
| `jszip` 3.10.2 | Producción, indirecta (`exceljs`) | MIT **o** GPL-3.0-or-later (a elección) | Se elige MIT. Sin acción. |
| `pako` 1.0.11 | Producción, indirecta | MIT y Zlib | Ambas permisivas. Sin acción. |
| `big-integer` 1.6.52 | Producción, indirecta | Unlicense (dominio público) | Permisiva. Sin acción. |

Todas las demás son permisivas (MIT, ISC, Apache-2.0, BSD, BlueOak). Estas licencias permiten uso comercial; la obligación habitual es **conservar el aviso de copyright y la licencia** al distribuir el código. Como SCORTA se ofrece como servicio por internet y el código del servidor no se entrega al cliente, la obligación aplica sobre todo al código que llega al navegador (`dist/`): antes del lanzamiento, comprueba que la compilación conserve los avisos de licencia o publica una página de «Licencias de terceros» con esta lista (React, ExcelJS, PapaParse, fflate y sus dependencias).

## Titularidad del código

| Elemento | Situación | Acción |
|---|---|---|
| Código de SCORTA (`SCORTA/`) | Escrito por el dueño con ayuda de herramientas de IA y agentes. No hay contribuciones de terceros registradas. | Confirmar con el abogado que el dueño (o su SAS, US-24) es el titular y cómo documentarlo. |
| Logo FRAGOLA SCORTA | Procedencia documentada en `src/assets/LEEME-LOGO.md`. | Registrar la marca (US-23). |
| Logo y datos de JE en la demo | Pertenecen a JE Accesorios y Repuestos. | Consentimiento escrito de JE (US-26). |
| PRENOTA (raíz del repositorio) | Otro producto, mezclado en el mismo repositorio. | Separarlo (DOC-13). |
| Licencia propia de SCORTA | `package.json` tiene `"private": true` y no declara licencia: el código **no es de código abierto**. | Mantenerlo privado. Si algún día se publica, elegir licencia con el abogado. |

## Dependencias de producción

| Paquete | Versión | Licencia |
|---|---|---|
| **exceljs** | 4.4.0 | MIT |
| **fflate** | 0.8.3 | MIT |
| **papaparse** | 5.5.3 | MIT |
| **react** | 19.3.1 | MIT |
| **react-dom** | 19.3.1 | MIT |
| @fast-csv/format | 4.3.5 | MIT |
| @fast-csv/format › @types/node | 14.18.63 | MIT |
| @fast-csv/parse | 4.3.6 | MIT |
| @fast-csv/parse › @types/node | 14.18.63 | MIT |
| archiver | 5.3.2 | MIT |
| archiver-utils | 2.1.0 | MIT |
| archiver-utils › isarray | 1.0.0 | MIT |
| archiver-utils › readable-stream | 2.3.8 | MIT |
| archiver-utils › safe-buffer | 5.1.2 | MIT |
| archiver-utils › string_decoder | 1.1.1 | MIT |
| array-buffer-byte-length | 1.0.2 | MIT |
| arraybuffer.prototype.slice | 1.0.4 | MIT |
| async | 3.2.6 | MIT |
| async-function | 1.0.0 | MIT |
| available-typed-arrays | 1.0.7 | MIT |
| balanced-match | 1.0.2 | MIT |
| base64-js | 1.5.1 | MIT |
| big-integer | 1.6.52 | Unlicense |
| binary | 0.3.0 | MIT |
| bl | 4.1.0 | MIT |
| bluebird | 3.4.7 | MIT |
| brace-expansion | 1.1.22 | MIT |
| buffer | 5.7.1 | MIT |
| buffer-crc32 | 0.2.13 | MIT |
| buffer-indexof-polyfill | 1.0.2 | MIT |
| buffers | 0.1.1 | Sin licencia declarada |
| call-bind | 1.0.9 | MIT |
| call-bind-apply-helpers | 1.0.2 | MIT |
| call-bound | 1.0.4 | MIT |
| chainsaw | 0.1.0 | MIT/X11 |
| compress-commons | 4.1.2 | MIT |
| concat-map | 0.0.1 | MIT |
| core-util-is | 1.0.3 | MIT |
| crc-32 | 1.2.2 | Apache-2.0 |
| crc32-stream | 4.0.3 | MIT |
| data-view-buffer | 1.0.2 | MIT |
| data-view-byte-length | 1.0.2 | MIT |
| data-view-byte-offset | 1.0.1 | MIT |
| dayjs | 1.11.23 | MIT |
| define-data-property | 1.1.4 | MIT |
| define-properties | 1.2.1 | MIT |
| dunder-proto | 1.0.1 | MIT |
| duplexer2 | 0.1.4 | BSD-3-Clause |
| duplexer2 › isarray | 1.0.0 | MIT |
| duplexer2 › readable-stream | 2.3.8 | MIT |
| duplexer2 › safe-buffer | 5.1.2 | MIT |
| duplexer2 › string_decoder | 1.1.1 | MIT |
| end-of-stream | 1.4.5 | MIT |
| es-abstract | 1.24.2 | MIT |
| es-abstract-get | 1.0.0 | MIT |
| es-define-property | 1.0.1 | MIT |
| es-errors | 1.3.0 | MIT |
| es-object-atoms | 1.1.2 | MIT |
| es-set-tostringtag | 2.1.0 | MIT |
| es-to-primitive | 1.3.4 | MIT |
| fast-csv | 4.3.6 | MIT |
| for-each | 0.3.5 | MIT |
| fs-constants | 1.0.0 | MIT |
| fs.realpath | 1.0.0 | ISC |
| fstream | 1.0.12 | ISC |
| function-bind | 1.1.2 | MIT |
| function.prototype.name | 1.2.0 | MIT |
| functions-have-names | 1.2.3 | MIT |
| generator-function | 2.0.1 | MIT |
| get-intrinsic | 1.3.0 | MIT |
| get-proto | 1.0.1 | MIT |
| get-symbol-description | 1.1.0 | MIT |
| glob | 7.2.3 | ISC |
| globalthis | 1.0.4 | MIT |
| gopd | 1.2.0 | MIT |
| graceful-fs | 4.2.12 | BlueOak-1.0.0 |
| has-bigints | 1.1.0 | MIT |
| has-property-descriptors | 1.0.2 | MIT |
| has-proto | 1.2.0 | MIT |
| has-symbols | 1.1.0 | MIT |
| has-tostringtag | 1.0.2 | MIT |
| hasown | 2.0.4 | MIT |
| ieee754 | 1.2.1 | BSD-3-Clause |
| immediate | 3.0.6 | MIT |
| inflight | 1.0.6 | ISC |
| inherits | 2.0.4 | ISC |
| internal-slot | 1.1.0 | MIT |
| is-array-buffer | 3.0.5 | MIT |
| is-async-function | 2.1.1 | MIT |
| is-bigint | 1.1.0 | MIT |
| is-boolean-object | 1.2.2 | MIT |
| is-callable | 1.2.7 | MIT |
| is-data-view | 1.0.2 | MIT |
| is-date-object | 1.1.0 | MIT |
| is-document.all | 1.0.0 | MIT |
| is-finalizationregistry | 1.1.1 | MIT |
| is-generator-function | 1.1.2 | MIT |
| is-map | 2.0.3 | MIT |
| is-negative-zero | 2.0.3 | MIT |
| is-number-object | 1.1.1 | MIT |
| is-regex | 1.2.1 | MIT |
| is-set | 2.0.3 | MIT |
| is-shared-array-buffer | 1.0.4 | MIT |
| is-string | 1.1.1 | MIT |
| is-symbol | 1.1.1 | MIT |
| is-typed-array | 1.1.15 | MIT |
| is-weakmap | 2.0.2 | MIT |
| is-weakref | 1.1.1 | MIT |
| is-weakset | 2.0.4 | MIT |
| isarray | 2.0.5 | MIT |
| jszip | 3.10.2 | (MIT OR GPL-3.0-or-later) |
| jszip › isarray | 1.0.0 | MIT |
| jszip › readable-stream | 2.3.8 | MIT |
| jszip › safe-buffer | 5.1.2 | MIT |
| jszip › string_decoder | 1.1.1 | MIT |
| lazystream | 1.0.1 | MIT |
| lazystream › isarray | 1.0.0 | MIT |
| lazystream › readable-stream | 2.3.8 | MIT |
| lazystream › safe-buffer | 5.1.2 | MIT |
| lazystream › string_decoder | 1.1.1 | MIT |
| lie | 3.3.0 | MIT |
| listenercount | 1.0.1 | ISC |
| lodash.defaults | 4.2.0 | MIT |
| lodash.difference | 4.5.0 | MIT |
| lodash.escaperegexp | 4.1.2 | MIT |
| lodash.flatten | 4.4.0 | MIT |
| lodash.groupby | 4.6.0 | MIT |
| lodash.isboolean | 3.0.3 | MIT |
| lodash.isequal | 4.5.0 | MIT |
| lodash.isfunction | 3.0.9 | MIT |
| lodash.isnil | 4.0.0 | MIT |
| lodash.isplainobject | 4.0.6 | MIT |
| lodash.isundefined | 3.0.1 | MIT |
| lodash.union | 4.6.0 | MIT |
| lodash.uniq | 4.5.0 | MIT |
| math-intrinsics | 1.1.0 | MIT |
| minimatch | 3.1.5 | ISC |
| minimist | 1.2.8 | MIT |
| mkdirp | 0.5.6 | MIT |
| normalize-path | 3.0.0 | MIT |
| object-inspect | 1.14.0 | MIT |
| object-keys | 1.1.1 | MIT |
| object.assign | 4.1.7 | MIT |
| once | 1.4.0 | ISC |
| own-keys | 1.0.2 | MIT |
| pako | 1.0.11 | (MIT AND Zlib) |
| path-is-absolute | 1.0.1 | MIT |
| possible-typed-array-names | 1.1.0 | MIT |
| process-nextick-args | 2.0.1 | MIT |
| readable-stream | 3.6.2 | MIT |
| readdir-glob | 1.1.3 | Apache-2.0 |
| readdir-glob › brace-expansion | 2.1.8 | MIT |
| readdir-glob › minimatch | 5.1.9 | ISC |
| reflect.getprototypeof | 1.0.10 | MIT |
| regexp.prototype.flags | 1.5.4 | MIT |
| rimraf | 2.7.1 | ISC |
| safe-array-concat | 1.1.4 | MIT |
| safe-buffer | 5.2.1 | MIT |
| safe-push-apply | 1.0.0 | MIT |
| safe-regex-test | 1.1.0 | MIT |
| saxes | 5.0.1 | ISC |
| scheduler | 0.28.0 | MIT |
| set-function-length | 1.2.2 | MIT |
| set-function-name | 2.0.2 | MIT |
| set-proto | 1.0.0 | MIT |
| setimmediate | 1.0.5 | MIT |
| side-channel | 1.1.1 | MIT |
| side-channel-list | 1.0.1 | MIT |
| side-channel-map | 1.0.1 | MIT |
| side-channel-weakmap | 1.0.2 | MIT |
| stop-iteration-iterator | 1.1.0 | MIT |
| string_decoder | 1.3.0 | MIT |
| string.prototype.trim | 1.2.11 | MIT |
| string.prototype.trimend | 1.0.10 | MIT |
| string.prototype.trimstart | 1.0.8 | MIT |
| tar-stream | 2.2.0 | MIT |
| tmp | 0.2.7 | MIT |
| traverse | 0.3.10 | MIT |
| typed-array-buffer | 1.0.3 | MIT |
| typed-array-byte-length | 1.0.3 | MIT |
| typed-array-byte-offset | 1.0.5 | MIT |
| typed-array-length | 1.0.8 | MIT |
| typedarray.prototype.slice | 1.0.6 | MIT |
| unbox-primitive | 1.1.0 | MIT |
| unzipper | 0.10.14 | MIT |
| unzipper › isarray | 1.0.0 | MIT |
| unzipper › readable-stream | 2.3.8 | MIT |
| unzipper › safe-buffer | 5.1.2 | MIT |
| unzipper › string_decoder | 1.1.1 | MIT |
| util-deprecate | 1.0.2 | MIT |
| uuid | 11.1.1 | MIT |
| which-boxed-primitive | 1.1.1 | MIT |
| which-builtin-type | 1.2.1 | MIT |
| which-collection | 1.0.2 | MIT |
| which-typed-array | 1.1.24 | MIT |
| wrappy | 1.0.2 | ISC |
| xmlchars | 2.2.0 | MIT |
| zip-stream | 4.1.1 | MIT |
| zip-stream › archiver-utils | 3.0.4 | MIT |

## Dependencias de desarrollo (instaladas en este equipo)

| Paquete | Versión | Licencia |
|---|---|---|
| **@playwright/test** | 1.65.0 | Apache-2.0 |
| **fake-indexeddb** | 6.2.8 | Apache-2.0 |
| **vite** | 8.3.7 | MIT |
| @oxc-project/types | 0.156.0 | MIT |
| @rolldown/binding-win32-x64-msvc | 1.2.18 | MIT |
| @rolldown/pluginutils | 1.1.0 | MIT |
| detect-libc | 2.1.2 | Apache-2.0 |
| fdir | 6.5.0 | MIT |
| lightningcss | 1.33.0 | MPL-2.0 |
| lightningcss-win32-x64-msvc | 1.33.0 | MPL-2.0 |
| nanoid | 3.3.20 | MIT |
| picocolors | 1.1.1 | ISC |
| picomatch | 4.0.7 | MIT |
| playwright | 1.65.0 | Apache-2.0 |
| playwright-core | 1.65.0 | Apache-2.0 |
| postcss | 8.5.32 | MIT |
| rolldown | 1.2.18 | MIT |
| source-map-js | 1.2.2 | BSD-3-Clause |
| tinyglobby | 0.2.17 | MIT |

Binarios opcionales para otros sistemas operativos (no instalados aquí; misma licencia que su paquete principal): @rolldown/binding-android-arm-eabi(MIT), @rolldown/binding-android-arm64(MIT), @rolldown/binding-darwin-arm64(MIT), @rolldown/binding-darwin-x64(MIT), @rolldown/binding-freebsd-x64(MIT), @rolldown/binding-linux-arm-gnueabihf(MIT), @rolldown/binding-linux-arm64-gnu(MIT), @rolldown/binding-linux-arm64-musl(MIT), @rolldown/binding-linux-ppc64-gnu(MIT), @rolldown/binding-linux-s390x-gnu(MIT), @rolldown/binding-linux-x64-gnu(MIT), @rolldown/binding-linux-x64-musl(MIT), @rolldown/binding-openharmony-arm64(MIT), @rolldown/binding-win32-arm64-msvc(MIT), fsevents(MIT), lightningcss-android-arm64(MPL-2.0), lightningcss-darwin-arm64(MPL-2.0), lightningcss-darwin-x64(MPL-2.0), lightningcss-freebsd-x64(MPL-2.0), lightningcss-linux-arm-gnueabihf(MPL-2.0), lightningcss-linux-arm64-gnu(MPL-2.0), lightningcss-linux-arm64-musl(MPL-2.0), lightningcss-linux-x64-gnu(MPL-2.0), lightningcss-linux-x64-musl(MPL-2.0), lightningcss-win32-arm64-msvc(MPL-2.0).
