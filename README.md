# Superación Juvenil — sitio web

Sitio institucional de Superación Juvenil, A.B.P. (superacionjuvenil.org),
migrado de HTML/CSS/jQuery estático a [Astro](https://astro.build) sin
cambiar el diseño. 5 páginas: `index`, `nosotros`, `proyectos`, `unete`, `aviso`.

## Desarrollo y build

```bash
npm install
npm run dev      # dev server de Astro
npm run build    # genera dist/ (HTML estático, /pagina.html — no /pagina/)
npm run preview  # sirve dist/ localmente
```

## Verificación visual

El arnés (`visual/compare.mjs`) compara píxel a píxel las 5 páginas × 28
anchos contra el sitio original (140 comparaciones). No corre solo con
`npm install`: hace falta recrear el baseline y el navegador de Playwright.

```bash
# Baseline inmutable: worktree separado (ignorado por git) con el commit
# del clon exacto del sitio previo a la migración.
git worktree add .baseline 15bff6bf

npx playwright install chromium   # una sola vez

npm run build
node visual/servidores.mjs .baseline 4001 &
node visual/servidores.mjs dist 4002 &
npm run visual
kill %1 %2   # al terminar
```

Salida esperada: `comparadas: 140/140`, `fallas: 0`.

**Falla (`!`) vs. aviso (`~`)**: una falla es una diferencia real de más del
0,5% de píxeles, o un recurso roto que el candidato tiene y el original no —
hace fallar el arnés (exit 1) y bloquea el merge. Un aviso es ruido menor
(0,05%–0,5%, reencode de imágenes, antialiasing) que no bloquea nada.

## Otros scripts

- `npm run verificar-fixes`: chequeo rápido y puntual (no las 140
  comparaciones) de tres fixes de Task 8. Necesita `.baseline` en `:4001` y
  `dist` en `:4002`, igual que el arnés.
