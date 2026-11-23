# Logo oficial FRAGOLA SCORTA

PNG RGBA original de 1122 × 1402 píxeles recibido en el ZIP `a3a590aa-c570-4080-ad97-6f8de90e4959.zip` el 19 de noviembre de 2026. Sustituye el archivo anterior con fondo. Incluye transparencia; es un PNG, no un archivo vectorial SVG.

Se conserva íntegro: mismo diseño, tipografía, colores y canal alfa. CSS ajusta únicamente tamaño proporcional y ubicación en login, propietario, administrador y vendedor. No se elimina fondo ni se redibuja la imagen.

SHA-256: `92ae7c9e238bc03528506dd2225c8af75b66ae10022afe0c4790d5d60bb46c2d`.

## Variantes de entrega verificadas

El original anterior se conserva intacto. `Brand.jsx` ofrece derivados proporcionales de 160, 320 y 480 px mediante `<picture>`, `srcset` y `sizes`, con WebP sin pérdida y PNG de respaldo. No se redibuja ni cuantiza el color; las dimensiones físicas siguen siendo las del CSS existente.

Referencia de conversión: RGBA, redimensionado LANCZOS desde el original a la altura proporcional redondeada. Cada PNG/WebP se decodificó y comparó byte por byte con esa referencia; el alfa también coincide. WebP usa `lossless=True`, `exact=True`, `method=6`.

| Variante | PNG | WebP sin pérdida |
| --- | ---: | ---: |
| 160 × 200 | 49.813 bytes | 42.424 bytes |
| 320 × 400 | 161.535 bytes | 130.078 bytes |
| 480 × 600 | 321.586 bytes | 261.776 bytes |

Frente a los 1.489.083 bytes originales, el WebP de 320 px reduce 91,26 % del recurso servido. El navegador elige una sola variante según tamaño y densidad; no se afirma que todos los dispositivos descarguen la de 320 px. Las variantes aparecen en los artefactos junto al original conservado, pero las pantallas utilizan los derivados. Hashes, dimensiones y procedencia quedan en `brand-variants.json`; las pruebas Node comprueban su integridad. No se ejecutó comparación en navegador en el entorno actual.

## Variantes web con pérdida (FE-16, 2026-11-21)

`fragola-scorta-logo-160-web.webp` (≈ 22 KB, calidad 0,9) y `fragola-scorta-logo-320-web.webp` (≈ 45 KB, calidad 0,6) se generaron con el codificador WebP de Chromium (Playwright local) a partir de los PNG de 160 y 320 px, sin redibujar ni recortar. `Brand.jsx` las ofrece primero en el `srcset` WebP; el de 480 px sin pérdida queda para pantallas 3x y los PNG como respaldo. No forman parte de `brand-variants.json` (que documenta solo las variantes sin pérdida verificadas).
