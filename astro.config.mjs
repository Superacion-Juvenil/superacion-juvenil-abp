import { defineConfig } from 'astro/config';
import vercel from '@astrojs/vercel';

export default defineConfig({
  site: 'https://superacionjuvenil.org',
  adapter: vercel(),
  output: 'static',
  // 'file' mantiene /nosotros.html en vez de /nosotros/. No tocar: cambiarlo rompe
  // los links entrantes y el <link rel="canonical"> del sitio.
  build: { format: 'file' },
});
