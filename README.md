# Superación Juvenil — sitio web

Sitio institucional de Superación Juvenil, A.B.P. (superacionjuvenil.org),
migrado de HTML/CSS/jQuery estático a [Astro](https://astro.build) sin
cambiar el diseño. 5 páginas: `index`, `nosotros`, `proyectos`, `unete`, `aviso`.

## Desarrollo y build

```bash
npm install
npm run dev      # dev server de Astro
npm run build    # genera dist/client (HTML estático, /pagina.html — no /pagina/)
                 # y dist/server (función serverless de /api/contacto, Task 9)
```

**Para probar localmente:**
- `/api/contacto`: necesita servidor. Usá `npm run dev` (Astro) o `npx vercel dev` (Vercel).
- El comando `astro preview` no funciona (adapter de Vercel no lo soporta en modo servidor).

## Verificación visual

El arnés (`visual/compare.mjs`) compara píxel a píxel las 5 páginas × 28
anchos contra el sitio original (140 comparaciones). No corre solo con
`npm install`: hace falta recrear el baseline y el navegador de Playwright.

```bash
# Baseline inmutable: worktree separado (ignorado por git) con el commit
# del clon exacto del sitio previo a la migración. Es 8bf78e9 (no el 15bff6bf
# original) porque ese commit trae nosotros.html restaurado sin la corrupción
# del navegador (PR #1): el clon congelado en 15bff6bf tenía ese archivo
# guardado desde el DOM, sin sus <script>, lo que dejaba sus 16 bloques con
# data-aos en opacity:0 — comparar contra eso mediría fidelidad a una página
# rota, no al sitio original.
git worktree add .baseline 8bf78e9

npx playwright install chromium   # una sola vez

npm run build
node visual/servidores.mjs .baseline 4001 &
node visual/servidores.mjs dist/client 4002 &
npm run visual
kill %1 %2   # al terminar
```

Nota (desde Task 9): con la función de `/api/contacto`, `astro build` ya no
genera `dist/` como carpeta plana — separa `dist/client` (los 5 `.html` +
assets estáticos, lo único que el arnés compara) de `dist/server` (el código
de la función). Por eso el candidato se sirve desde `dist/client`, no `dist`.

Salida esperada: `comparadas: 140/140`, `fallas: 0`.

**Falla (`!`) vs. aviso (`~`)**: una falla es una diferencia real de más del
0,5% de píxeles, o un recurso roto que el candidato tiene y el original no —
hace fallar el arnés (exit 1) y bloquea el merge. Un aviso es ruido menor
(0,05%–0,5%, reencode de imágenes, antialiasing) que no bloquea nada.

## Otros scripts

- `npm run verificar-fixes`: chequeo rápido y puntual (no las 140
  comparaciones) de tres fixes de Task 8. Necesita `.baseline` en `:4001` y
  `dist/client` en `:4002`, igual que el arnés.
- `npm run verificar-animaciones`: compara el estado final de cada
  `[data-aos]` (animado o no) entre original y candidato scrolleando de
  verdad, sin la guarda de opacidad congelada del arnés — la única forma de
  detectar una divergencia en `src/scripts/animaciones.js`. Mismos puertos.
