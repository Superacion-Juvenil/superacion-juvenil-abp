// scripts/verificar-animaciones.mjs
//
// Guarda para una clase de bug que visual/compare.mjs NO PUEDE detectar por
// construcción: el arnés inyecta `[data-aos] { opacity: 1 !important;
// transform: none !important }` antes de capturar (necesario para que las
// capturas sean estables), así que es ciego a cualquier divergencia en el
// estado de animación real de los [data-aos] entre el original y el
// candidato. Este script no congela nada: carga cada página, scrollea hasta
// el fondo en pasos de 300px (sin volver arriba, igual que un usuario que
// lee la página) y compara, elemento por elemento, si terminó animado
// (clase .aos-animate) igual en ambos lados. AOS y animaciones.js usan el
// mismo nombre de clase, así que compararla es más directo que comparar
// opacity (que no aplica a data-aos sin cambio de opacity, como flip-left).
//
// También reporta la opacity computada de cada elemento como diagnóstico
// adicional: sirve para distinguir una discrepancia real (estado final
// distinto) de ruido de timing (un elemento atrapado a mitad de transición,
// p. ej. por CSS aplicado con `prefers-reduced-motion` o por un scroll que
// llegó justo durante los 400ms de transición) — esto último no debería
// pasar dado el waitForTimeout de 1.5s tras el último scroll (>> 400ms de
// duración de la transición en ambos lados), pero se deja como evidencia.
//
// Uso: con BASE (.baseline) sirviendo en :4001 y CAND (dist/client) en :4002
// (ver README, sección "Verificación visual"):
//   npm run verificar-animaciones
import { chromium } from 'playwright';

const BASE = process.env.BASE_URL ?? 'http://localhost:4001';
const CAND = process.env.CAND_URL ?? 'http://localhost:4002';
const PAGINAS = ['index.html', 'nosotros.html', 'proyectos.html', 'unete.html', 'aviso.html'];
const PASO_SCROLL = 300;
const ESPERA_FINAL_MS = 1500;

/**
 * Carga la página, scrollea hacia abajo en pasos de PASO_SCROLL px hasta
 * llegar al fondo (nunca vuelve arriba), espera ESPERA_FINAL_MS y devuelve,
 * para cada [data-aos] en orden de documento: si terminó con .aos-animate,
 * su opacity computada, y una firma (tag + data-aos + índice) para poder
 * identificarlo en el reporte.
 */
async function medirPagina(navegador, base, pagina) {
  const page = await navegador.newPage();
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(`${base}/${pagina}`, { waitUntil: 'networkidle' });

  let previo = -1;
  for (;;) {
    const actual = await page.evaluate((paso) => {
      window.scrollBy(0, paso);
      return window.scrollY;
    }, PASO_SCROLL);
    if (actual === previo) break; // llegó al fondo: el scroll ya no avanza
    previo = actual;
    await page.waitForTimeout(50);
  }
  await page.waitForTimeout(ESPERA_FINAL_MS);

  const resultado = await page.evaluate(() => {
    return [...document.querySelectorAll('[data-aos]')].map((el, i) => ({
      indice: i,
      firma: `${el.tagName.toLowerCase()}[data-aos="${el.getAttribute('data-aos')}"]#${i}`,
      animado: el.classList.contains('aos-animate'),
      opacity: Number(getComputedStyle(el).opacity),
    }));
  });
  await page.close();
  return resultado;
}

async function main() {
  const navegador = await chromium.launch();
  let totalDiferencias = 0;
  const resumen = [];

  for (const pagina of PAGINAS) {
    const [datosBase, datosCand] = await Promise.all([
      medirPagina(navegador, BASE, pagina),
      medirPagina(navegador, CAND, pagina),
    ]);

    if (datosBase.length !== datosCand.length) {
      console.log(`\n=== ${pagina} ===`);
      console.log(
        `! cantidad de [data-aos] distinta: BASE=${datosBase.length} CAND=${datosCand.length} ` +
        `(no se puede comparar elemento a elemento)`
      );
      totalDiferencias += Math.abs(datosBase.length - datosCand.length);
      resumen.push({ pagina, elementos: datosBase.length, diferencias: null });
      continue;
    }

    const diferencias = [];
    for (let i = 0; i < datosBase.length; i++) {
      const b = datosBase[i];
      const c = datosCand[i];
      if (b.animado !== c.animado) {
        diferencias.push(
          `  ${b.firma}: BASE animado=${b.animado} (opacity=${b.opacity}) ` +
          `vs CAND animado=${c.animado} (opacity=${c.opacity})`
        );
      }
    }

    console.log(`\n=== ${pagina} ===`);
    console.log(`[data-aos] encontrados: ${datosBase.length}`);
    if (diferencias.length === 0) {
      console.log('sin diferencias de estado final');
    } else {
      console.log(`${diferencias.length} con estado final distinto:`);
      diferencias.forEach((d) => console.log(d));
    }
    totalDiferencias += diferencias.length;
    resumen.push({ pagina, elementos: datosBase.length, diferencias: diferencias.length });
  }

  await navegador.close();

  console.log('\n=== Resumen ===');
  for (const r of resumen) {
    console.log(`${r.pagina}: ${r.elementos} elementos | ${r.diferencias ?? '?'} con estado distinto`);
  }
  console.log(`TOTAL con estado final distinto: ${totalDiferencias}`);

  if (totalDiferencias > 0) {
    console.log('\nFALLA: hay [data-aos] que terminan animados en un lado y no en el otro.');
    process.exit(1);
  }
  console.log('\nOK: mismo estado final de animación en las 5 páginas.');
}

await main();
