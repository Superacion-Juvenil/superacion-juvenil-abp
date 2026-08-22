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

async function capturar(page, url, ancho, urlsRotas) {
  await page.setViewportSize({ width: ancho, height: 900 });

  // Junta las URLs de subrecursos (imágenes, CSS, JS — cualquier cosa que el
  // documento pida) que respondan >=400. Se registra ANTES del goto y se saca
  // recién después de forzar la carga de las <img loading="lazy"> más abajo
  // (no justo después del goto): esas imágenes lazy todavía no dispararon su
  // request en ese punto, así que sacar el listener ahí las deja afuera —
  // se midieron entre 4 y 7 requests de imagen por carga que quedaban sin
  // registrar, y los dos 404 de imagen Critical que esta guarda existe para
  // atrapar (Task 8: .tarj8 y los thumbnails de .historia) eran justamente
  // de ese tipo. Se acumula en un Set por (página, lado) que pasa el caller,
  // así una misma URL rota vista en varios anchos (p. ej. una entrada de
  // srcset) cuenta una sola vez.
  const alRecibirRespuesta = (respuesta) => {
    if (respuesta.status() >= 400) urlsRotas.add(respuesta.url());
  };
  page.on('response', alRecibirRespuesta);

  const respuesta = await page.goto(url, { waitUntil: 'networkidle' });

  // page.goto no lanza ante un 4xx/5xx (solo ante errores de red), así que hay que
  // revisar el status a mano. Si no, una página rota que responde igual en ambos
  // lados (p. ej. un 404 idéntico) pasa la comparación de píxeles sin que nadie
  // note que en realidad no se está comparando el sitio real.
  const status = respuesta ? respuesta.status() : 0;
  if (status < 200 || status >= 300) {
    // Se saca el listener también en este camino de salida temprana: si no,
    // queda pegado a `page` (se reusa entre llamadas) y las respuestas de la
    // próxima navegación se cuentan para esta página en vez de la suya.
    page.off('response', alRecibirRespuesta);
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
  // Fuerza a que TODAS las <img loading="lazy"> terminen de cargar antes de
  // la captura, en vez de confiar en que el navegador las dispare solo.
  // Chrome decide cuándo pedir una imagen lazy según una distancia al
  // viewport que depende de su estimación de velocidad de conexión — un
  // heurístico global del proceso del navegador, no por origen. Al alternar
  // BASE y CAND (un sitio con PNGs pesados, el otro con WebP livianos) en la
  // misma page, esa estimación fluctúa de una navegación a la otra, así que
  // a veces una imagen lazy que está cerca del borde de esa distancia carga
  // a tiempo para la captura y a veces no — un mismo par de páginas daba
  // 0,46% o 0,68% de diferencia según la corrida, sin que cambiara una sola
  // línea de código (encontrado con 6 corridas seguidas sobre el mismo
  // build). Cambiar el atributo `loading` a "eager" en tiempo de ejecución
  // dispara la carga inmediatamente sin depender de esa heurística — no es
  // lo mismo que sacar loading="lazy" del sitio real (eso lo dejamos como
  // está), es solo asegurar que la captura vea el estado final ya asentado.
  // No alcanza con esperar a `complete`: eso se pone en true apenas termina
  // la descarga, no cuando el bitmap ya está decodificado y listo para
  // pintar. Con solo `complete`, en la práctica algunas de las <Image> de
  // Task 8 (los tres thumbnails de .historia) llegaban "cargadas" pero
  // pintaban en blanco en la captura — el decode todavía no había corrido.
  // `img.decode()` espera exactamente a eso.
  await page.evaluate(async () => {
    const lazies = [...document.querySelectorAll('img[loading="lazy"]')];
    lazies.forEach((img) => { img.loading = 'eager'; });
    await Promise.all(
      lazies.map(async (img) => {
        if (!img.complete) {
          await new Promise((resolve) => {
            img.addEventListener('load', resolve, { once: true });
            img.addEventListener('error', resolve, { once: true });
          });
        }
        try {
          await img.decode();
        } catch {
          // Imagen rota (404, etc.): no hay nada que decodificar. El chequeo
          // de recursos >=400 más abajo es el que tiene que agarrar esto.
        }
      })
    );
  });
  // Recién acá se saca el listener: las imágenes lazy ya dispararon su
  // request (forzadas arriba) y ya decodificaron, así que sus respuestas
  // >=400 (si las hay) ya quedaron registradas en urlsRotas.
  page.off('response', alRecibirRespuesta);
  const mascaras = await page.locator(SELECTOR_CARRUSELES).locator('xpath=..').all();
  const buffer = await page.screenshot({ fullPage: true, animations: 'disabled', mask: mascaras });
  return { buffer };
}

const navegador = await chromium.launch();
const page = await navegador.newPage();

// Anula IntersectionObserver y setInterval ANTES de que corra cualquier
// script de la página (se necesita addInitScript, no page.evaluate: tiene
// que existir antes de que animaciones.js/contador.js/header-scroll.js lo
// usen). Esto arregla una falla intermitente real que costó bastante
// diagnosticar: la animación de los contadores (.count-up2, "A lo largo de
// nuestra historia...") puede volver a dispararse DESPUÉS del forzado a
// data-val de más abajo, pisándolo con un valor a mitad de cuenta —
// mismo build, mismas dos páginas, 0,46% o 0,68% de diferencia según en
// qué momento exacto cayera la carrera (reproducido con 6 corridas
// seguidas sobre el mismo build, sin tocar una sola línea de código).
//
// Los dos lados lo disparan por vías DISTINTAS, así que hace falta anular
// las dos:
//   - CAND (contador.js) usa IntersectionObserver sobre .historia.
//   - BASE (el original, .baseline/js/header-scroll.js) usa un poller
//     jQuery: setInterval cada 50ms que revisa scrollTop contra la
//     posición de .historia y llama startCounter() la primera vez que la
//     cruza. Un screenshot fullPage puede scrollear la página lo suficiente
//     como para cruzar ese umbral en medio de la captura.
// anular setInterval de paso también insensibiliza cualquier otro timer
// periódico de la página (la rotación del hero, el autoplay del carrusel)
// ante timing de captura — no hace falta que seau efectivos: compare.mjs ya
// fuerza a mano el estado que le importa a cada uno (aportar-image1 acá
// abajo; los carruseles se enmascaran en vez de compararse).
await page.addInitScript(() => {
  window.IntersectionObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  window.setInterval = () => 0;
});
await mkdir('visual/diffs', { recursive: true });

const fallas = [];
const avisos = [];
let comparadas = 0;

// Un Set de URLs rotas (status >=400) por página y por lado, acumulado a
// través de todos los anchos probados. Al final se compara CAND contra BASE
// como conjuntos (no por cantidad — ver más abajo): si CAND tiene URLs rotas
// que BASE no tenía, es una regresión real (imagen movida/renombrada sin
// actualizar todas sus referencias, script pidiendo una ruta vieja, etc.) y
// el arnés falla, aunque el diff de píxeles no la vea (p. ej. un
// background-image que quedó vacío puede no mover ni un píxel del layout).
// Se compara CAND contra BASE, no contra cero, para que el arnés falle solo
// ante recursos rotos que introdujo la migración: BASE se navega en la misma
// corrida que CAND, así que cualquier ruido ajeno al candidato (un recurso
// externo caído en ese momento, una condición de carrera puntual del propio
// entorno de prueba) queda absorbido para los dos lados por igual, en vez de
// hacer fallar el arnés por algo que no tiene que ver con la migración.
const urlsRotasPorPagina = new Map(PAGINAS.map((p) => [p, { base: new Set(), cand: new Set() }]));

for (const pagina of PAGINAS) {
  const rotas = urlsRotasPorPagina.get(pagina);
  for (const ancho of ANCHOS) {
    const capturaA = await capturar(page, `${BASE}/${pagina}`, ancho, rotas.base);
    if (capturaA.error) {
      fallas.push(`${pagina} @${ancho}px: BASE — ${capturaA.error}`);
      continue;
    }
    const capturaB = await capturar(page, `${CAND}/${pagina}`, ancho, rotas.cand);
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

for (const [pagina, { base, cand }] of urlsRotasPorPagina) {
  // Comparación por conjunto, no por tamaño: si BASE y CAND tienen la misma
  // cantidad de recursos rotos pero son URLs distintas, igual es una
  // regresión (CAND rompió una URL que BASE no tenía, aunque también haya
  // arreglado otra que BASE sí tenía) — comparar solo `cand.size > base.size`
  // no lo detecta.
  const nuevas = [...cand].filter((u) => !base.has(u));
  if (nuevas.length > 0) {
    fallas.push(
      `${pagina}: CAND tiene ${nuevas.length} recurso(s) con status >=400 que BASE no tenía — ` +
      `${nuevas.join(', ')}`
    );
  }
}

await navegador.close();

console.log(`recursos rotos (status >=400) por página — BASE / CAND:`);
for (const [pagina, { base, cand }] of urlsRotasPorPagina) {
  console.log(`  ${pagina}: ${base.size} / ${cand.size}`);
}
console.log(`comparadas: ${comparadas}/${PAGINAS.length * ANCHOS.length}`);
console.log(`fallas: ${fallas.length}`);
for (const f of fallas) console.log('  !', f);
console.log(`avisos: ${avisos.length}  (superan 0,05% pero no llegan al umbral de falla)`);
for (const a of avisos) console.log('  ~', a);

// El código de salida depende solo de las fallas duras: los avisos nunca hacen
// fallar el arnés (si lo hicieran, Task 8 — reencode de imágenes, que sube el
// ruido de píxeles por debajo del umbral de falla — se volvería imposible de pasar).
process.exit(fallas.length ? 1 : 0);
