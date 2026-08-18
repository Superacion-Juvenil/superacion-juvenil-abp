// scripts/verificar-fixes.mjs
//
// Chequeo puntual para los 3 fixes de Critical/Important de Task 8
// (revisión de coordinación del 2026-08-18): recursos >=400 al cargar
// index.html, que .tarj8 (colaboradores) tenga su logo, y que el hero de
// #aportar-images siga rotando. No es parte del arnés (visual/compare.mjs
// ya lo tiene): esto es más rápido para reverificar estos tres puntos
// puntuales sin correr las 140 comparaciones completas.
//
// Uso: con BASE (.baseline) sirviendo en :4001 y CAND (dist) en :4002,
//   node scripts/verificar-fixes.mjs
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';

const BASE = 'http://localhost:4001';
const CAND = 'http://localhost:4002';

await mkdir('/tmp/verif-fixes', { recursive: true });

const navegador = await chromium.launch();

// --- 1. Conteo de respuestas >=400 al cargar index.html, ambos lados ---
async function contarRotas(base) {
  const page = await navegador.newPage();
  const rotas = [];
  page.on('response', (r) => { if (r.status() >= 400) rotas.push(`${r.status()} ${r.url()}`); });
  await page.goto(`${base}/index.html`, { waitUntil: 'networkidle' });
  await page.close();
  return rotas;
}
const rotasBase = await contarRotas(BASE);
const rotasCand = await contarRotas(CAND);
console.log('=== 1. Recursos >=400 en index.html ===');
console.log('BASE:', rotasBase.length, rotasBase);
console.log('CAND:', rotasCand.length, rotasCand);

// --- 2. .tarj8 (colaboradores) con su logo, ambos lados ---
async function capturarColaboradores(base, nombre) {
  const page = await navegador.newPage();
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(`${base}/index.html`, { waitUntil: 'networkidle' });
  const el = await page.locator('.colaboradores').first();
  await el.scrollIntoViewIfNeeded();
  await page.waitForTimeout(300);
  await el.screenshot({ path: `/tmp/verif-fixes/${nombre}.png` });
  // chequeo directo: ¿el tarj8 tiene background-image real (no "none")?
  const bgTarj8 = await page.evaluate(() => {
    const el = document.querySelector('.tarj8');
    return el ? getComputedStyle(el).backgroundImage : null;
  });
  await page.close();
  return bgTarj8;
}
const bgBase = await capturarColaboradores(BASE, 'colaboradores-base');
const bgCand = await capturarColaboradores(CAND, 'colaboradores-cand');
console.log('\n=== 2. .tarj8 background-image ===');
console.log('BASE:', bgBase);
console.log('CAND:', bgCand);

// --- 3. Rotación del hero en #aportar-images, t0 y t+6.5s ---
async function medirRotacion(base) {
  const page = await navegador.newPage();
  await page.goto(`${base}/index.html`, { waitUntil: 'networkidle' });
  const clase = async () => page.evaluate(() => {
    const el = document.getElementById('aportar-images');
    return [...el.classList].find((c) => c.startsWith('aportar-image'));
  });
  const t0 = await clase();
  await page.waitForTimeout(6500);
  const t1 = await clase();
  await page.close();
  return { t0, t1, roto: t0 !== t1 };
}
const rotBase = await medirRotacion(BASE);
const rotCand = await medirRotacion(CAND);
console.log('\n=== 3. Rotación del hero (#aportar-images) ===');
console.log('BASE:', rotBase);
console.log('CAND:', rotCand);

await navegador.close();
