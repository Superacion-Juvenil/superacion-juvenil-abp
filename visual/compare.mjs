import { chromium } from 'playwright';
import pixelmatch from 'pixelmatch';
import { PNG } from 'pngjs';
import { mkdir, writeFile } from 'node:fs/promises';

const PAGINAS = ['index.html', 'nosotros.html', 'proyectos.html', 'unete.html', 'aviso.html'];
const ANCHOS = [320, 360, 375, 400, 420, 430, 480, 481, 500, 600, 657, 700, 767, 800,
                820, 840, 850, 900, 912, 913, 950, 1000, 1024, 1200, 1280, 1290, 1455, 1590];
const BASE = process.env.BASE_URL ?? 'http://localhost:4001';
const CAND = process.env.CAND_URL ?? 'http://localhost:4002';

// Umbral de falla dura: por encima de esto el arnés falla (exit code 1).
// Es el umbral original del arnés, elegido para tolerar ruido de renderizado
// (antialiasing, subpíxeles) sin dejar pasar regresiones grandes.
const UMBRAL_FALLA = 0.005; // 0,5% de píxeles

// Umbral de aviso: por encima de esto (pero por debajo de UMBRAL_FALLA) el arnés
// reporta la comparación como aviso, sin fallar. Se agregó después de que dos
// regresiones visuales reales (0,29% y 0,37% — entre ellas una franja oscura de
// 18px a todo el ancho de la página) pasaran desapercibidas por quedar debajo del
// 0,5%. Las encontró una persona midiendo geometría a mano, no el arnés.
const UMBRAL_AVISO = 0.0005; // 0,05% de píxeles

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
//
// Se enmascara el PADRE de estos selectores, no el carrusel en sí: el alto del
// elemento owl-carousel original y el del [data-carrusel] del reemplazo no
// coinciden exactamente (difieren ~18px en .colaboradores de index.html), así
// que enmascarar el carrusel deja una franja sin cubrir en el lado con la caja
// más chica — ahí no hay ninguna diferencia visual real (verificado comparando
// las capturas completas sin ninguna máscara: 0 píxeles distintos), pero al
// quedar fuera de la máscara, esa franja se compara igual y el arnés la marca
// como aviso. El contenedor padre (.colaboradores, .slider-proyectos) sí mide
// exactamente igual en ambos lados porque su tamaño lo define el CSS de la
// página, no el carrusel — enmascararlo completo evita el hueco sin agrandar
// el área no verificada más de lo necesario (agrega como mucho el título de la
// sección, que no varía entre ambos lados).
const SELECTOR_CARRUSELES = '.owl-carousel, .owl-carousel2, [data-carrusel]';

async function capturar(page, url, ancho) {
  await page.setViewportSize({ width: ancho, height: 900 });
  const respuesta = await page.goto(url, { waitUntil: 'networkidle' });
  // page.goto no lanza ante un 4xx/5xx (solo ante errores de red), así que hay que
  // revisar el status a mano. Si no, una página rota que responde igual en ambos
  // lados (p. ej. un 404 idéntico) pasa la comparación de píxeles sin que nadie
  // note que en realidad no se está comparando el sitio real.
  const status = respuesta ? respuesta.status() : 0;
  if (status < 200 || status >= 300) {
    return { error: `${url} respondió con status ${status} (se esperaba 2xx)` };
  }
  await page.addStyleTag({ content: CSS_CONGELAR });
  await page.evaluate(() => {
    document.querySelectorAll('video').forEach((v) => { v.pause(); v.currentTime = 0; });
    // El contador .count-up2 anima números: se fija en su valor final.
    document.querySelectorAll('.count-up2').forEach((el) => {
      el.textContent = el.getAttribute('data-val') ?? el.textContent;
    });
    // El hero de "index" (#aportar-images) rota el fondo cada 5s vía setInterval
    // (no vía CSS animation, así que CSS_CONGELAR no lo frena). Se detiene el
    // temporizador y se fuerza siempre la misma imagen (la inicial, aportar-image1).
    if (window.jQuery) {
      window.jQuery.timers = [];
    }
    const aportar = document.getElementById('aportar-images');
    if (aportar) {
      aportar.classList.remove('aportar-image1', 'aportar-image2', 'aportar-image3', 'aportar-image4');
      aportar.classList.add('aportar-image1');
    }
    window.scrollTo(0, 0);
  });
  const mascaras = await page.locator(SELECTOR_CARRUSELES).locator('xpath=..').all();
  const buffer = await page.screenshot({ fullPage: true, animations: 'disabled', mask: mascaras });
  return { buffer };
}

const navegador = await chromium.launch();
const page = await navegador.newPage();
await mkdir('visual/diffs', { recursive: true });

const fallas = [];
const avisos = [];
let comparadas = 0;

for (const pagina of PAGINAS) {
  for (const ancho of ANCHOS) {
    const capturaA = await capturar(page, `${BASE}/${pagina}`, ancho);
    if (capturaA.error) {
      fallas.push(`${pagina} @${ancho}px: BASE — ${capturaA.error}`);
      continue;
    }
    const capturaB = await capturar(page, `${CAND}/${pagina}`, ancho);
    if (capturaB.error) {
      fallas.push(`${pagina} @${ancho}px: CAND — ${capturaB.error}`);
      continue;
    }

    const a = PNG.sync.read(capturaA.buffer);
    const b = PNG.sync.read(capturaB.buffer);

    if (a.width !== b.width || a.height !== b.height) {
      fallas.push(`${pagina} @${ancho}px: alto distinto (${a.height} vs ${b.height}) — cambió el layout`);
      continue;
    }

    const diff = new PNG({ width: a.width, height: a.height });
    const distintos = pixelmatch(a.data, b.data, diff.data, a.width, a.height, { threshold: 0.1 });
    const proporcion = distintos / (a.width * a.height);
    comparadas++;

    if (proporcion > UMBRAL_FALLA) {
      const ruta = `visual/diffs/${pagina.replace('.html', '')}-${ancho}.png`;
      await writeFile(ruta, PNG.sync.write(diff));
      fallas.push(`${pagina} @${ancho}px: ${(proporcion * 100).toFixed(2)}% distinto → ${ruta}`);
    } else if (proporcion > UMBRAL_AVISO) {
      const ruta = `visual/diffs/aviso-${pagina.replace('.html', '')}-${ancho}.png`;
      await writeFile(ruta, PNG.sync.write(diff));
      avisos.push(`${pagina} @${ancho}px: ${(proporcion * 100).toFixed(2)}% → ${ruta}`);
    }
  }
}

await navegador.close();

console.log(`comparadas: ${comparadas}/${PAGINAS.length * ANCHOS.length}`);
console.log(`fallas: ${fallas.length}`);
for (const f of fallas) console.log('  !', f);
console.log(`avisos: ${avisos.length}  (superan 0,05% pero no llegan al umbral de falla)`);
for (const a of avisos) console.log('  ~', a);

// El código de salida depende solo de las fallas duras: los avisos nunca hacen
// fallar el arnés (si lo hicieran, Task 8 — reencode de imágenes, que sube el
// ruido de píxeles por debajo del umbral de falla — se volvería imposible de pasar).
process.exit(fallas.length ? 1 : 0);
