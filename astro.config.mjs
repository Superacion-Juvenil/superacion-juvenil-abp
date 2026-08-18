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
  // adapter y vuelve a fijar 'file', que es lo único que necesitamos del adapter de
  // Vercel por ahora (no usamos SSR ni funciones todavía).
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
