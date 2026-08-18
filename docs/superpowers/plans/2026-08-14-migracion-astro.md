# Migración a Astro — Plan de Implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrar el clon estático de `superacionjuvenil.org` a Astro sin que cambie un pixel del diseño, eliminando jQuery y bajando el peso de 132 MB a menos de 15 MB.

**Architecture:** Se construye primero el arnés de comparación visual, que captura el baseline del clon actual desde un worktree congelado en el commit `15bff6bf`. Recién entonces se porta página por página a Astro, verificando contra ese baseline después de cada cambio. Las dependencias viejas (owl, AOS, jQuery) se reemplazan de a una, no todas juntas, para que cuando algo se rompa se sepa qué lo rompió.

**Tech Stack:** Astro 7.2.2, @astrojs/vercel 11.0.5, Node 22, sharp 0.35.3 (optimización de imágenes), Playwright 1.62.1 + pixelmatch 7.2.0 + pngjs 7.0.0 (verificación visual), Resend 6.20.0 (formulario).

## Global Constraints

- **El diseño no cambia.** Ante cualquier duda entre "más moderno" e "idéntico", gana idéntico.
- **URLs idénticas:** `/nosotros.html`, nunca `/nosotros/`. Se garantiza con `build.format: 'file'`.
- **Umbral de fidelidad:** una comparación falla si difiere más del **0,5%** de los pixeles.
- **Breakpoints obligatorios** (los 28 del CSS): 320, 360, 375, 400, 420, 430, 480, 481, 500, 600, 657, 700, 767, 800, 820, 840, 850, 900, 912, 913, 950, 1000, 1024, 1200, 1280, 1290, 1455, 1590.
- **Páginas:** `index.html`, `nosotros.html`, `proyectos.html`, `unete.html`, `aviso.html`.
- **Quirks que se preservan** (ver spec): `nosotros` no carga scripts y sus `data-aos` no animan; `unete` y `aviso` no cargan `menu.js`; `zoom-up`/`zoom-down` no animan; el contador `.count-up2` solo corre en `index`.
- **Cada quirk replicado lleva un comentario en el código** explicando que es intencional.
- **Ningún paso toca el DNS de `superacionjuvenil.org`.** Eso es una decisión posterior y explícita del dueño.
- **Idioma:** el código y los comentarios se escriben en español, como el resto del repo.

---

### Task 1: Arnés de comparación visual y baseline

Sin esto, ninguna tarea siguiente se puede verificar. Es lo primero.

**Files:**
- Create: `package.json`
- Create: `visual/compare.mjs`
- Create: `visual/servidores.mjs`
- Modify: `.gitignore`

**Interfaces:**
- Produces: `npm run visual` — corre la comparación completa y sale con código 1 si alguna falla. Lee `BASE_URL` (clon original) y `CAND_URL` (candidato) del entorno, con defaults `http://localhost:4001` y `http://localhost:4002`.
- Produces: `visual/diffs/<pagina>-<ancho>.png` por cada comparación fallida.

- [ ] **Step 1: Crear el worktree congelado con el clon original**

```bash
cd "/Users/pablomadrigal/Repos/Superacion Juvenil/web superacion"
git worktree add .baseline 15bff6bf
printf '.baseline\nnode_modules\ndist\nvisual/diffs\n' >> .gitignore
```

- [ ] **Step 2: Inicializar package.json con las dependencias del arnés**

```bash
npm init -y
npm pkg set name="superacion-juvenil"
npm pkg set private=true
npm pkg set type="module"
npm pkg set scripts.visual="node visual/compare.mjs"
npm install -D playwright@1.62.1 pixelmatch@7.2.0 pngjs@7.0.0 serve@14
npx playwright install chromium
```

- [ ] **Step 3: Escribir el arnés de comparación**

Crear `visual/compare.mjs`:

```js
import { chromium } from 'playwright';
import pixelmatch from 'pixelmatch';
import { PNG } from 'pngjs';
import { mkdir, writeFile } from 'node:fs/promises';

const PAGINAS = ['index.html', 'nosotros.html', 'proyectos.html', 'unete.html', 'aviso.html'];
const ANCHOS = [320, 360, 375, 400, 420, 430, 480, 481, 500, 600, 657, 700, 767, 800,
                820, 840, 850, 900, 912, 913, 950, 1000, 1024, 1200, 1280, 1290, 1455, 1590];
const BASE = process.env.BASE_URL ?? 'http://localhost:4001';
const CAND = process.env.CAND_URL ?? 'http://localhost:4002';
const TOLERANCIA = 0.005; // 0,5% de pixeles

// Congela todo lo que se mueve solo: si no, dos capturas del MISMO sitio ya difieren.
const CSS_CONGELAR = `
  *, *::before, *::after {
    animation: none !important;
    transition: none !important;
  }
  [data-aos] { opacity: 1 !important; transform: none !important; }
`;

// Los carruseles se enmascaran en vez de compararse: owl clona los items para el loop,
// así que su DOM nunca va a coincidir con el del reemplazo. Se verifican a mano.
const SELECTOR_CARRUSELES = '.owl-carousel, .owl-carousel2, [data-carrusel]';

async function capturar(page, url, ancho) {
  await page.setViewportSize({ width: ancho, height: 900 });
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.addStyleTag({ content: CSS_CONGELAR });
  await page.evaluate(() => {
    document.querySelectorAll('video').forEach((v) => { v.pause(); v.currentTime = 0; });
    // El contador .count-up2 anima números: se fija en su valor final.
    document.querySelectorAll('.count-up2').forEach((el) => {
      el.textContent = el.getAttribute('data-val') ?? el.textContent;
    });
    window.scrollTo(0, 0);
  });
  const mascaras = await page.locator(SELECTOR_CARRUSELES).all();
  return page.screenshot({ fullPage: true, animations: 'disabled', mask: mascaras });
}

const navegador = await chromium.launch();
const page = await navegador.newPage();
await mkdir('visual/diffs', { recursive: true });

const fallas = [];
let comparadas = 0;

for (const pagina of PAGINAS) {
  for (const ancho of ANCHOS) {
    const a = PNG.sync.read(await capturar(page, `${BASE}/${pagina}`, ancho));
    const b = PNG.sync.read(await capturar(page, `${CAND}/${pagina}`, ancho));

    if (a.width !== b.width || a.height !== b.height) {
      fallas.push(`${pagina} @${ancho}px: alto distinto (${a.height} vs ${b.height}) — cambió el layout`);
      continue;
    }

    const diff = new PNG({ width: a.width, height: a.height });
    const distintos = pixelmatch(a.data, b.data, diff.data, a.width, a.height, { threshold: 0.1 });
    const proporcion = distintos / (a.width * a.height);
    comparadas++;

    if (proporcion > TOLERANCIA) {
      const ruta = `visual/diffs/${pagina.replace('.html', '')}-${ancho}.png`;
      await writeFile(ruta, PNG.sync.write(diff));
      fallas.push(`${pagina} @${ancho}px: ${(proporcion * 100).toFixed(2)}% distinto → ${ruta}`);
    }
  }
}

await navegador.close();

console.log(`comparadas: ${comparadas}/${PAGINAS.length * ANCHOS.length}`);
console.log(`fallas: ${fallas.length}`);
for (const f of fallas) console.log('  !', f);
process.exit(fallas.length ? 1 : 0);
```

- [ ] **Step 4: Verificar que el arnés detecta que NO hay candidato todavía**

```bash
npx serve .baseline -l 4001 &
npm run visual
```

Esperado: FALLA — el servidor de `CAND_URL` (4002) no existe, así que Playwright no puede navegar. Eso confirma que el arnés realmente compara contra algo y no pasa en vacío.

- [ ] **Step 5: Verificar que el arnés pasa comparando el clon consigo mismo**

```bash
npx serve .baseline -l 4002 &
npm run visual
```

Esperado: `fallas: 0` sobre 140 comparaciones. Este es el test de que el arnés no tiene falsos positivos — si acá falla algo, el problema es del arnés (animación no congelada), no del sitio.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json visual/ .gitignore
git commit -m "Agregar arnés de comparación visual contra el clon original"
```

---

### Task 2: Scaffold de Astro con la home portada

**Files:**
- Create: `astro.config.mjs`
- Create: `src/layouts/Base.astro`
- Create: `src/components/Header.astro`
- Create: `src/components/Footer.astro`
- Create: `src/pages/index.astro`
- Move: `assets/`, `fonts/`, `styles/`, `owl/`, `js/`, `files_download/` → `public/`
- Delete: `index.html`

**Interfaces:**
- Produces: `Base.astro` con props `{ titulo: string, descripcion: string, canonica: string, headerFijo?: boolean }`. `headerFijo` default `false`.
- Produces: `Header.astro` con prop `{ fijo?: boolean }`. Con `fijo=true` agrega `style="position: fixed"` al `<header>`.
- Produces: `Footer.astro` sin props.

- [ ] **Step 1: Instalar Astro y mover los estáticos a public/**

Mover en vez de copiar, con `git mv`, para que git conserve el historial de cada archivo:

```bash
npm install astro@7.2.2 @astrojs/vercel@11.0.5
mkdir -p public
git mv assets fonts styles owl js files_download public/
```

Las rutas relativas del HTML (`assets/x.png`, `styles/style.css`) siguen resolviendo igual, porque todas las páginas viven en la raíz del sitio.

- [ ] **Step 2: Escribir la config**

Crear `astro.config.mjs`:

```js
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
```

- [ ] **Step 3: Escribir el layout base**

Crear `src/layouts/Base.astro`. El `<head>` sale textualmente del de `index.html`, con lo variable como props:

```astro
---
import Header from '../components/Header.astro';
import Footer from '../components/Footer.astro';

interface Props {
  titulo: string;
  descripcion: string;
  canonica: string;
  headerFijo?: boolean;
}

const { titulo, descripcion, canonica, headerFijo = false } = Astro.props;
---
<!DOCTYPE html>
<html lang="es">
<head>
    <title>{titulo}</title>
    <meta name="title" content={titulo} />
    <meta name="description" content={descripcion} />

    <meta property="og:type" content="website" />
    <meta property="og:url" content="https://metatags.io/" />
    <meta property="og:title" content={titulo} />
    <meta property="og:description" content={descripcion} />
    <meta property="og:image" content="assets/SJ-2.jpg" />

    <meta property="twitter:card" content="summary_large_image" />
    <meta property="twitter:url" content="https://metatags.io/" />
    <meta property="twitter:title" content={titulo} />
    <meta property="twitter:description" content={descripcion} />
    <meta property="twitter:image" content="assets/SJ-2.jpg" />

    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="theme-color" content="#023b63">

    <link rel="canonical" href={canonica}>
    <link rel="alternate" hreflang="es-MX" href={canonica}>
    <meta name="robots" content="index, follow">
    <meta property="og:site_name" content="Superación Juvenil ABP">
    <meta property="og:locale" content="es_MX">
    <meta property="og:image:width" content="1200">
    <meta property="og:image:height" content="1200">

    <link rel="stylesheet" href="styles/style.css?ver=3.1">
    <link rel="stylesheet" href="https://unpkg.com/aos@next/dist/aos.css" />
    <link rel="stylesheet" href="owl/owl.carousel.min.css">

    <script type="application/ld+json" set:html={JSON.stringify({
      "@context": "https://schema.org",
      "@type": "NonprofitOrganization",
      "name": "Superación Juvenil ABP",
      "url": "https://superacionjuvenil.org/",
      "logo": "https://superacionjuvenil.org/assets/logo-sj.png"
    })} />

    <slot name="head" />
</head>
<body>
    <input type="checkbox" id="menu-chk" style="display: none;">
    <label id="dim-menu-close" for="menu-chk" onclick="overFlowV()"></label>

    <Header fijo={headerFijo} />
    <slot />
    <Footer />
    <slot name="scripts" />
</body>
</html>
```

- [ ] **Step 4: Escribir Header y Footer**

Crear `src/components/Header.astro` copiando el markup exacto de `index.html` (líneas 60-88 del clon original), con el único punto variable como prop:

```astro
---
interface Props { fijo?: boolean }
const { fijo = false } = Astro.props;
---
<header id="header" class="nav-up" style={fijo ? 'position: fixed' : undefined}>
    <label class="menu-icon" for="menu-chk" onclick="overFlowH()">
        <div class="bar-menu-icon"></div>
        <div class="bar-menu-icon"></div>
        <div class="bar-menu-icon"></div>
    </label>

    <a home-link="true" id="img-hover" href="/index.html">
        <img class="header-img" src="assets/LOGO SJ PANTONES-03.png" alt="ABP_LOGO">
    </a>
    <nav>
        <div class="header-option"><a href="index.html">Inicio</a></div>
        <div class="header-option"><a href="nosotros.html">Nosotros</a></div>
        <div class="header-option"><a href="proyectos.html">Proyectos</a></div>
        <div class="header-aportar"><a href="unete.html">Aportar a la causa</a></div>
    </nav>

    <div class="nav-desk">
        <div class="header-option-desk"><a href="index.html">Inicio</a></div>
        <div class="header-option-desk"><a href="nosotros.html">Nosotros</a></div>
        <div class="header-option-desk"><a href="proyectos.html">Proyectos</a></div>
        <div class="header-aportar-desk"><a href="unete.html">Aportar a la causa</a></div>
    </div>
</header>
```

Crear `src/components/Footer.astro` con el bloque de cierre que hoy se repite en las 5 páginas. Sacarlo textualmente de `.baseline/index.html` — el sitio no usa la etiqueta `<footer>`, así que copiar el `<div>` tal como está, sin "mejorarlo".

- [ ] **Step 5: Portar index.astro verbatim**

Rangos exactos de cada página en el clon original, para extraer con `sed -n 'A,Bp' .baseline/<pagina>.html` sin transcribir a mano:

| Página | Cuerpo | Scripts |
|---|---|---|
| `index.html` | 85..294 | 295..342 |
| `nosotros.html` | 83..282 | ninguno |
| `proyectos.html` | 84..213 | 214..266 |
| `unete.html` | 86..187 | 188..241 |
| `aviso.html` | 47..108 | 109..114 |

Crear `src/pages/index.astro`: el `<body>` de `.baseline/index.html` sin el header, con los `<script>` finales en el slot `scripts`. En esta tarea **no se cambia una sola línea del markup ni se toca jQuery/owl/AOS** — solo se mueve de lugar. Los reemplazos vienen después, de a uno.

```astro
---
import Base from '../layouts/Base.astro';
---
<Base
  titulo="Superación Juvenil ABP"
  descripcion="Nuestra misión: Crear ambientes en donde los jóvenes aprendan, vivan y transmitan una cultura de valores humanos y formarlos a través de programas preventivos que los impulsen a transformar su entorno y la sociedad."
  canonica="https://superacionjuvenil.org/"
>
  <!-- Contenido extraído con:  sed -n '85,294p' .baseline/index.html  -->

  <Fragment slot="scripts">
    <script src="//ajax.googleapis.com/ajax/libs/jquery/1.10.2/jquery.min.js" is:inline></script>
    <script src="https://unpkg.com/aos@next/dist/aos.js" is:inline></script>
    <script is:inline>AOS.init();</script>
    <script src="js/aportar-images.js" is:inline></script>
    <script src="owl/owl.carousel.min.js" is:inline></script>
    <!-- Los dos inline de owl, extraídos con: sed -n '306,340p' .baseline/index.html -->
    <script src="./js/menu.js" is:inline></script>
    <script src="./js/header-scroll.js" is:inline></script>
  </Fragment>
</Base>
```

`is:inline` es obligatorio: sin eso Astro procesa y mueve los scripts, y el orden de carga —del que dependen jQuery y owl— se rompe.

- [ ] **Step 6: Borrar el index.html viejo y buildear**

```bash
git rm index.html
npx astro build
ls dist/index.html
```

Esperado: existe `dist/index.html`.

- [ ] **Step 7: Comparar la home contra el baseline**

```bash
npx serve .baseline -l 4001 &
npx serve dist -l 4002 &
npm run visual 2>&1 | grep -E "^(comparadas|fallas)|index"
```

Esperado: cero fallas en las 28 comparaciones de `index.html`. Las otras 4 páginas van a fallar porque todavía no existen en `dist/` — es lo correcto en este punto.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "Portar la home a Astro sin cambios de markup"
```

---

### Task 3: Portar nosotros, proyectos, unete y aviso

Las cuatro se portan igual que la home: markup verbatim, scripts en el slot con `is:inline`, comparación después de cada una. Se agrupan en una sola tarea porque el procedimiento es idéntico y el criterio de aceptación es el mismo; se commitea una por una.

**Files:**
- Create: `src/pages/nosotros.astro`, `src/pages/proyectos.astro`, `src/pages/unete.astro`, `src/pages/aviso.astro`
- Delete: `nosotros.html`, `proyectos.html`, `unete.html`, `aviso.html`

**Interfaces:**
- Consumes: `Base.astro` con props `{ titulo, descripcion, canonica, headerFijo }` de la Task 2.

- [ ] **Step 1: Portar nosotros.astro**

`headerFijo={true}`. **Sin ningún `<script>`**: hoy la página no carga ninguno, y por eso sus 16 `data-aos` no animan. Dejar este comentario arriba del componente:

```astro
---
// NO agregar scripts acá. El sitio original no carga ninguno en esta página, así que
// sus atributos data-aos no animan. Es intencional: replica el comportamiento actual.
import Base from '../layouts/Base.astro';
---
```

Título y descripción: copiarlos del `<head>` de `.baseline/nosotros.html`.

- [ ] **Step 2: Verificar nosotros**

```bash
npx astro build && npm run visual 2>&1 | grep -E "^fallas|nosotros"
```

Esperado: cero fallas en `nosotros.html`.

- [ ] **Step 3: Commit**

```bash
git add -A && git commit -m "Portar nosotros a Astro"
```

- [ ] **Step 4: Portar proyectos.astro**

`headerFijo={true}`. Scripts en este orden exacto: jQuery, AOS + `AOS.init()`, `owl.carousel.min.js`, el inline de configuración de owl2, `./js/menu.js`, y el inline que fija `playbackRate = 0.2` del video. Todos con `is:inline`.

- [ ] **Step 5: Verificar proyectos, commitear**

```bash
npx astro build && npm run visual 2>&1 | grep -E "^fallas|proyectos"
git add -A && git commit -m "Portar proyectos a Astro"
```

- [ ] **Step 6: Portar unete.astro**

`headerFijo={true}`. Scripts: el inline del flash de cookie, AOS + `AOS.init()`, jQuery, `js/copy.js`. **Sin `menu.js`**, con este comentario:

```astro
<!-- El original no carga menu.js acá, así que overFlowH() tira ReferenceError al abrir
     el menú hamburguesa. Se replica a propósito: arreglarlo es cambiar el sitio. -->
```

El `<form>` sigue apuntando a `./mail/message.php` en esta tarea. Se cambia en la Task 8.

- [ ] **Step 7: Verificar unete, commitear**

```bash
npx astro build && npm run visual 2>&1 | grep -E "^fallas|unete"
git add -A && git commit -m "Portar unete a Astro"
```

- [ ] **Step 8: Portar aviso.astro, verificar y commitear**

`headerFijo={true}`. Scripts: AOS + `AOS.init()`, jQuery, `js/copy.js`. Sin `menu.js`, con el mismo comentario que unete.

```bash
git rm nosotros.html proyectos.html unete.html aviso.html
npx astro build && npm run visual
git add -A && git commit -m "Portar aviso a Astro y sacar el HTML suelto"
```

Esperado en esta corrida: **las 140 comparaciones en cero fallas.** Es el hito que cierra el porteo.

---

### Task 4: Partir el CSS en archivos

**Files:**
- Create: `public/styles/base.css`, `header.css`, `home.css`, `nosotros.css`, `proyectos.css`, `unete.css`, `carrusel.css`
- Modify: `public/styles/style.css` → pasa a ser solo `@import` en orden
- Modify: `src/layouts/Base.astro`

**Interfaces:**
- Produces: `styles/style.css` sigue existiendo y sigue siendo el único `<link>` del layout. Nada de lo que lo referencia cambia.

- [ ] **Step 1: Partir el archivo respetando el orden**

Cortar `style.css` en bloques **contiguos**, sin reordenar ni una regla. El orden de la cascada es el que define el resultado: si se reordena, el diseño cambia. Cada archivo nuevo arranca con un comentario que dice qué líneas del original contiene.

- [ ] **Step 2: Convertir style.css en el índice**

```css
/* Los @import van en este orden exacto: la cascada depende de él. No reordenar. */
@import url("base.css");
@import url("header.css");
@import url("home.css");
@import url("nosotros.css");
@import url("proyectos.css");
@import url("unete.css");
@import url("carrusel.css");
```

- [ ] **Step 3: Verificar que no se movió un pixel**

```bash
npx astro build && npm run visual
```

Esperado: `fallas: 0`. Cualquier falla acá significa que un bloque quedó fuera de orden — revisar el corte, no ajustar el CSS.

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "Partir style.css en archivos por sección"
```

---

### Task 5: Reemplazar Owl Carousel

**Files:**
- Create: `src/components/Carrusel.astro`
- Modify: `src/pages/index.astro`, `src/pages/proyectos.astro`
- Modify: `public/styles/carrusel.css`
- Delete: `public/owl/`

**Interfaces:**
- Produces: `Carrusel.astro` con props `{ itemsPorAncho: Record<number, number>, margen?: number }`. Renderiza un `<div data-carrusel>` con los hijos del slot. `itemsPorAncho` mapea ancho mínimo → cantidad de items visibles.
- Consumes: nada de tareas anteriores más allá del layout.

- [ ] **Step 1: Escribir el componente**

El comportamiento a replicar, sacado de la config de owl del sitio actual: `autoplay` cada **4000 ms**, `loop: true`, `autoplayHoverPause: true`, `nav: false`, y los items por breakpoint. Index (logos): `0→4, 600→3, 800→4, 1000→5`, con `margin: 1`. Proyectos: `0→1, 600→2, 800→3`, sin margen.

```astro
---
interface Props {
  itemsPorAncho: Record<number, number>;
  margen?: number;
}
const { itemsPorAncho, margen = 0 } = Astro.props;
const id = 'carrusel-' + Math.random().toString(36).slice(2, 8);
---
<div class="carrusel" data-carrusel id={id} data-config={JSON.stringify({ itemsPorAncho, margen })}>
  <div class="carrusel-pista"><slot /></div>
</div>
```

- [ ] **Step 2: Escribir el CSS con scroll-snap**

En `carrusel.css`: `.carrusel-pista` con `display: flex; overflow-x: auto; scroll-snap-type: x mandatory; scrollbar-width: none`, y cada hijo con `scroll-snap-align: start` y ancho calculado con una variable `--items` que el JS actualiza por breakpoint.

- [ ] **Step 3: Escribir el JS del autoplay**

Un módulo que por cada `[data-carrusel]`: lee la config, calcula items visibles según `window.innerWidth`, arranca un `setInterval` de 4000 ms que avanza un item con `scrollBy`, vuelve a 0 al llegar al final (equivalente al loop), y hace `clearInterval` en `mouseenter` / `setInterval` de nuevo en `mouseleave`. Recalcula en `resize`.

- [ ] **Step 4: Reemplazar en las dos páginas y sacar owl**

```bash
git rm -r public/owl
```

Sacar también el `<link>` de owl del layout y los `<script>` de owl de ambas páginas.

- [ ] **Step 5: Verificar**

```bash
npx astro build && npm run visual
```

Esperado: `fallas: 0`. Los carruseles están enmascarados en la comparación, así que esto verifica que **el resto de la página no se movió** al sacar owl.

- [ ] **Step 6: Verificar los carruseles a mano**

Esto no lo cubre el arnés. Abrir `dist` servido y mirar, en 375px, 800px y 1440px, en `index.html` y `proyectos.html`:

- Cantidad de logos/imágenes visibles a la vez en cada ancho.
- Que avance solo cada 4 segundos.
- Que se frene al pasar el mouse por encima y siga al salir.
- Que al llegar al final vuelva al principio sin saltos visibles.

Comparar contra `.baseline` servido al lado, con las dos ventanas abiertas.

- [ ] **Step 7: Commit**

```bash
git add -A && git commit -m "Reemplazar Owl Carousel por scroll-snap"
```

---

### Task 6: Reemplazar AOS

**Files:**
- Create: `src/scripts/animaciones.js`
- Create: `public/styles/animaciones.css`
- Modify: `src/layouts/Base.astro`, `src/pages/index.astro`, `src/pages/proyectos.astro`, `src/pages/unete.astro`, `src/pages/aviso.astro`

**Interfaces:**
- Produces: `src/scripts/animaciones.js` exporta `iniciarAnimaciones()`, que observa todos los `[data-aos]` del documento y les agrega la clase `.aos-animate` al entrar en viewport.

- [ ] **Step 1: Escribir el CSS de las 6 animaciones en uso**

Solo estas 6, que son las que el sitio usa: `fade-up` (19 elementos), `fade-right` (14), `fade-left` (7), `flip-left` (6), `fade-down` (3), `fade-in` (1). Estado inicial en `[data-aos="..."]` y final en `[data-aos].aos-animate`, con la misma duración y curva que AOS por defecto (400ms, `ease`).

`zoom-up` y `zoom-down` **no llevan reglas**: no existen en AOS, así que hoy no animan. Dejar este comentario en el CSS:

```css
/* zoom-up y zoom-down no existen en AOS: los 2 elementos que los usan nunca animaron.
   No agregar reglas para ellos — replicamos el comportamiento actual. */
```

- [ ] **Step 2: Escribir el IntersectionObserver**

```js
export function iniciarAnimaciones() {
  const elementos = document.querySelectorAll('[data-aos]');
  const observador = new IntersectionObserver((entradas) => {
    for (const entrada of entradas) {
      if (!entrada.isIntersecting) continue;
      const retraso = Number(entrada.target.getAttribute('data-aos-delay') ?? 0);
      setTimeout(() => entrada.target.classList.add('aos-animate'), retraso);
      observador.unobserve(entrada.target);
    }
  }, { threshold: 0.1 });

  for (const el of elementos) observador.observe(el);
}
```

- [ ] **Step 3: Sacar AOS de las 4 páginas que lo cargan**

Sacar el `<link>` de `aos.css` del layout y, de `index`, `proyectos`, `unete` y `aviso`, el `<script>` de `aos.js` y el `AOS.init()`. **No agregarlo a `nosotros`**, que hoy no lo tiene.

- [ ] **Step 4: Verificar**

```bash
npx astro build && npm run visual
```

Esperado: `fallas: 0`. El arnés fuerza el estado final de los `[data-aos]`, así que compara el resultado, no la transición.

- [ ] **Step 5: Verificar las animaciones a mano**

Scrollear `index.html` en el build y en el baseline lado a lado y confirmar que los elementos aparecen con el mismo movimiento y en el mismo momento. Confirmar además que en `nosotros.html` **no** aparece ninguna animación nueva.

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "Reemplazar AOS por IntersectionObserver"
```

---

### Task 7: Reescribir los scripts propios y eliminar jQuery

**Files:**
- Create: `src/scripts/menu.js`, `src/scripts/contador.js`, `src/scripts/hero.js`, `src/scripts/copiar.js`
- Delete: `public/js/`
- Modify: `src/pages/index.astro`, `src/pages/proyectos.astro`, `src/pages/unete.astro`, `src/pages/aviso.astro`, `src/components/Header.astro`

**Interfaces:**
- Produces: `menu.js` exporta `iniciarMenu()`, que reemplaza los `onclick="overFlowH()"` inline por listeners.
- Produces: `contador.js` exporta `iniciarContador()` — el `.count-up2` que hoy vive en `header-scroll.js`.
- Produces: `hero.js` exporta `iniciarHero()` — la rotación de fondos de `aportar-images.js`.
- Produces: `copiar.js` exporta `iniciarCopiar()` — el copiado de cuenta y CLABE de `copy.js`.

- [ ] **Step 1: Reescribir menu.js en vanilla**

Reemplaza `document.getElementsByClassName(...)[0].setAttribute('onclick', ...)` por un listener que togglea `document.body.style.overflow`. Sacar los `onclick` inline del `Header.astro` y del `<label id="dim-menu-close">` del layout.

**Ojo con el quirk:** hoy `unete` y `aviso` no cargan `menu.js` y el menú tira error. Al componentizar, la tentación es cargarlo en todas. **No hacerlo en esta tarea** — se replica el estado actual y se deja el comentario. Cambiarlo es una decisión aparte.

- [ ] **Step 2: Reescribir contador.js**

De `header-scroll.js` solo vive el disparador del contador: el resto del archivo está comentado. Reescribir únicamente eso, con IntersectionObserver sobre `.historia` en vez del `setInterval` de 50 ms + `$(window).scroll`. El contador anima de 0 a `data-val`. Sacar los `console.log`.

Dejar este comentario:

```js
// El original (js/header-scroll.js) tenía además lógica para ocultar el header al
// scrollear, pero estaba comentada entera. No se porta: no corría.
```

- [ ] **Step 3: Reescribir hero.js**

Rota las clases `aportar-image1..4` del `#aportar-images` cada **5000 ms**, precargando las 8 imágenes antes de arrancar. Las variables `numImages`/`cont` del original son vestigiales —no afectan el ciclo de clases— y no se portan.

- [ ] **Step 4: Reescribir copiar.js**

Copia `0568282243` (cuenta) y `072580005682822434` (CLABE) al portapapeles, agrega `copy-cloud-visible` y `cuentaNumbersBold`, y las saca a los 5000 ms. Reemplazar `$(el).addClass()` por `el.classList.add()`.

- [ ] **Step 5: Sacar jQuery de todas las páginas**

```bash
git rm -r public/js
grep -rn "jquery\|ajax.googleapis" src/ && echo "QUEDA JQUERY" || echo "sin jQuery"
```

Esperado: `sin jQuery`.

- [ ] **Step 6: Verificar**

```bash
npx astro build
grep -rn "jquery" dist/ && echo "FALLA: quedó jQuery" || echo "OK: cero jQuery"
grep -c "<script>" dist/*.html
npm run visual
```

Esperado: cero jQuery, cero `<script>` inline sin `src`, y `fallas: 0`.

- [ ] **Step 7: Verificar a mano lo que el arnés no ve**

- El menú hamburguesa abre y bloquea el scroll en `index`, `nosotros` y `proyectos`.
- El contador de `index` cuenta al scrollear hasta `.historia`.
- El hero rota de fondo cada 5 segundos.
- Los botones de copiar en `unete` copian y muestran la nubecita 5 segundos.

- [ ] **Step 8: Commit**

```bash
git add -A && git commit -m "Reescribir los scripts propios en vanilla y eliminar jQuery"
```

---

### Task 8: Optimizar imágenes

**Files:**
- Create: `scripts/optimizar-imagenes.mjs`
- Modify: todos los archivos de `public/assets/`
- Modify: `public/styles/*.css` (paths de los que cambian de extensión)
- Delete: `public/assets/programa-*_256.png`, `_900.png`, `_1560.png`, `public/assets/fondo-universitarios.jpg`

**Interfaces:**
- Produces: `scripts/optimizar-imagenes.mjs`, corrible con `node scripts/optimizar-imagenes.mjs`, idempotente.

- [ ] **Step 1: Escribir el script de optimización**

Con sharp: los full-bleed (`FC*`, `FV*`, `SJ-*`, `FotoContigo`) se topean en 2400px de ancho; los verticales (`Nina`, `Nino`, `Brecha`) en 1600px. Todos a WebP calidad 82. **Nunca agrandar** una imagen que ya sea más chica que el tope.

- [ ] **Step 2: Deduplicar y borrar variantes manuales**

```bash
git rm public/assets/fondo-universitarios.jpg
git rm public/assets/programa-*_256.png public/assets/programa-*_900.png public/assets/programa-*_1560.png
```

`fondo-universitarios.jpg` es byte a byte igual a `fondo-adolescentes.jpg`: apuntar el CSS al que queda. Las variantes `_256/_900/_1560` las reemplaza el `srcset` que genera el build.

- [ ] **Step 3: Migrar los `<img>` a astro:assets**

Mover a `src/assets/` las imágenes referenciadas desde `<img>` (`programa-*`, logos de colaboradores, `iconos web-0*`) e importarlas con el componente `<Image />` de `astro:assets`, que genera AVIF/WebP y `srcset`. **Mantener los mismos `width`/`height` renderizados** para no mover el layout.

- [ ] **Step 4: Correr y medir**

```bash
node scripts/optimizar-imagenes.mjs
npx astro build
du -sh dist
```

Esperado: `dist` por debajo de 15 MB.

- [ ] **Step 5: Verificar que no cambió el diseño**

```bash
npm run visual
```

Esperado: `fallas: 0`. Acá es donde el umbral del 0,5% gana su sueldo: las imágenes reencodadas difieren en pixeles pero no en layout. Si una falla supera el umbral, mirar el PNG del diff — casi seguro es una imagen que quedó con otra relación de aspecto.

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "Optimizar imágenes: de 132 MB a menos de 15 MB"
```

---

### Task 9: Formulario de contacto con Resend

**BLOQUEADA** hasta tener las respuestas a las preguntas abiertas del spec: a qué correo llegan los mensajes y quién valida el dominio en Resend. Las Tasks 1-8 no dependen de esto.

**Files:**
- Create: `src/pages/api/contacto.ts`
- Modify: `src/pages/unete.astro`

**Interfaces:**
- Produces: `POST /api/contacto` con `correo`, `nombre`, `mensaje` y el honeypot `sitio`. Responde 303 a `/unete.html` con la cookie `notificacion`.

- [ ] **Step 1: Instalar Resend y declarar las variables**

```bash
npm install resend@6.20.0
vercel env add RESEND_API_KEY production
vercel env add CONTACTO_DESTINO production
```

- [ ] **Step 2: Escribir la función**

`export const prerender = false;` para que Astro la renderice on-demand y no la intente estatizar. Validar el correo con regex; si el honeypot `sitio` viene lleno, responder 303 con el mensaje de éxito **sin enviar nada** (que el bot crea que funcionó). Setear `notificacion` con el mismo texto que espera el script de flash: la regex `/correctamente|enviado/i` decide si pinta verde o rojo.

- [ ] **Step 3: Agregar el honeypot al form**

Un `<input type="text" name="sitio">` oculto por CSS —no con `type="hidden"`, que los bots detectan— y `tabindex="-1"` con `autocomplete="off"`. Cambiar el `action` a `/api/contacto`.

- [ ] **Step 4: Probar de punta a punta**

```bash
npx astro build && npx vercel dev
```

Enviar el formulario con datos válidos y confirmar que llega el correo y que el flash sale verde. Repetir con un correo inválido (flash rojo) y con el honeypot lleno (flash verde, sin correo).

- [ ] **Step 5: Verificar que el form no cambió visualmente**

```bash
npm run visual 2>&1 | grep -E "^fallas|unete"
```

Esperado: cero fallas en `unete.html`. El honeypot está oculto y no debe ocupar espacio.

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "Agregar función de contacto con Resend"
```

---

### Task 10: Verificación final y PR

**Files:**
- Create: `README.md`

- [ ] **Step 1: Correr la verificación completa desde cero**

```bash
rm -rf dist visual/diffs
npx astro build
npx serve .baseline -l 4001 &
npx serve dist -l 4002 &
npm run visual
```

Esperado: `comparadas: 140/140`, `fallas: 0`.

- [ ] **Step 2: Verificar los 5 criterios de aceptación del spec**

```bash
echo "1. comparaciones:"; npm run visual | tail -2
echo "2. URLs:"; ls dist/*.html
echo "3. peso:"; du -sh dist
echo "4. jQuery e inline:"; grep -rc "jquery" dist/ || echo "cero jQuery"
echo "5. formulario: probado a mano en la Task 9"
```

- [ ] **Step 3: Escribir el README**

Cómo levantar el proyecto (`npm run dev`), cómo buildear, y —lo importante— **cómo correr la verificación visual y qué significa que falle**. Documentar el worktree `.baseline` y por qué existe.

- [ ] **Step 4: Abrir el PR**

```bash
git push -u origin migracion-astro
gh pr create --title "Migrar el sitio a Astro" --body "..."
```

En el cuerpo del PR: los 5 criterios de aceptación con su resultado, el antes/después de peso, y la lista de quirks preservados a propósito con el motivo.

- [ ] **Step 5: Revisar el preview de Vercel**

Vercel comenta la URL del preview en el PR. Abrirla y recorrer las 5 páginas. **El preview pide login de Vercel**: para compartirlo con alguien fuera de la cuenta hay que desactivar la protección de previews o generar un link con token.

---

## Notas de ejecución

- **El orden importa.** Cada tarea de reemplazo (5, 6, 7) saca **una sola** dependencia y verifica. Sacar las tres juntas y después debuggear qué rompió el layout cuesta mucho más que hacerlo de a una.
- **Si una comparación falla, mirar el PNG del diff antes de tocar código.** El diff dice dónde está la diferencia; adivinar no.
- **El worktree `.baseline` no se borra** hasta que la migración esté aprobada y en producción. Es la única referencia de qué era "igual".
