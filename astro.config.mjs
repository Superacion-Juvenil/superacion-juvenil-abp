import { defineConfig } from 'astro/config';
import vercel from '@astrojs/vercel';

export default defineConfig({
  site: 'https://superacionjuvenil.org',
  adapter: vercel(),
  output: 'static',
  // 'file' mantiene /nosotros.html en vez de /nosotros/. No tocar: cambiarlo rompe
  // los links entrantes y el <link rel="canonical"> del sitio.
  build: { format: 'file' },
  // @astrojs/vercel@11 pisa build.format a 'directory' incondicionalmente en su
  // propio hook astro:config:setup (dist/index.js, updateConfig({ build: { format:
  // "directory" } })), sin exponer ninguna opción para desactivarlo. Sin esto, Task 3
  // hubiera generado dist/nosotros/index.html en vez de dist/nosotros.html y las 28
  // comparaciones de cada página fallarían con 404 (el arnés pide literalmente
  // /nosotros.html). Esta integración corre su propio config:setup después del
  // adapter y vuelve a fijar 'file'.
  // Task 9 agregó la primera función (src/pages/api/contacto.ts, con
  // export const prerender = false): ahí el adapter pasa a modo servidor de
  // verdad (build genera dist/client + dist/server y .vercel/output/functions/
  // _render.func) por primera vez. Verificado que 'forzar-formato-file' sigue
  // pisando el formato después de eso: las 5 páginas siguen saliendo como
  // dist/client/*.html planos, no dist/client/*/index.html. output: 'static'
  // no hace falta cambiarlo a 'server': desde Astro 4, 'static' ya deja que
  // páginas/endpoints individuales opten por SSR con prerender = false.
  integrations: [
    {
      name: 'forzar-formato-file',
      hooks: {
        'astro:config:setup': ({ updateConfig }) => {
          updateConfig({ build: { format: 'file' } });
        },
      },
    },
  ],
});
