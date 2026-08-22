// scripts/optimizar-imagenes.mjs
//
// Reencodea a WebP calidad 82 las imágenes que se usan como `background-image`
// en CSS (astro:assets no toca url() en CSS, solo las hashea), topando su
// ancho para que no sean más grandes de lo que su uso en pantalla justifica.
//
// Idempotente: antes de procesar cada imagen se lee su ancho y formato
// actuales. Si ya está en WebP y su ancho ya es <= al tope de su categoría,
// se salta por completo — no se vuelve a decodificar/codificar. Sin este
// chequeo, correr el script dos veces reencodearía un WebP ya lossy sobre sí
// mismo (pérdida generacional, como recomprimir un JPEG). Con el chequeo, la
// segunda corrida no reescribe ningún byte.
//
// Uso: node scripts/optimizar-imagenes.mjs

import sharp from 'sharp';
import { readdirSync, statSync, unlinkSync, renameSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ASSETS_DIR = join(__dirname, '..', 'public', 'assets');

const CALIDAD = 82;
const TOPE_FULL = 2400; // full-bleed
const TOPE_VERTICAL = 1600; // verticales

// Cada entrada es el nombre base (sin extensión) del archivo dentro de
// public/assets. El script busca la extensión real que tenga hoy (puede ser
// .png/.jpg/.jpeg/.webp según de dónde viene, o ya .webp si el script corrió
// antes) y la reemplaza siempre por .webp.
const FULL_BLEED = [
  'FC1-01', 'FC2-01', 'FC3-01', 'FC4-01',
  'SJ-1', 'SJ-2', 'SJ-3',
  'FotoContigo',
  'slider-proyectos1', 'slider-proyectos2', 'slider-proyectos3', 'slider-proyectos4',
  'slider-proyectos5', 'slider-proyectos6', 'slider-proyectos7', 'slider-proyectos8',
  'slider-proyectos10', 'slider-proyectos11', 'slider-proyectos12', 'slider-proyectos13',
  'slider-proyectos14', 'slider-proyectos15', 'slider-proyectos16', 'slider-proyectos17',
  'slider-proyectos18', 'slider-proyectos19',
];

const VERTICALES = [
  'FV1-01', 'FV2-01', 'FV3-01', 'FV4-01',
  'Nina-SJv', 'Nino-SJv', 'Brecha-SJv',
];

/** Busca en ASSETS_DIR el archivo `${base}.*` que exista, devuelve su ruta y extensión. */
function encontrarArchivo(base) {
  const candidatos = readdirSync(ASSETS_DIR).filter((nombre) => {
    const punto = nombre.lastIndexOf('.');
    return punto !== -1 && nombre.slice(0, punto) === base;
  });
  if (candidatos.length === 0) {
    throw new Error(`No se encontró ningún archivo para "${base}" en ${ASSETS_DIR}`);
  }
  if (candidatos.length > 1) {
    // Caso real: "SJ-2" matchea tanto SJ-2.webp (el fondo CSS que procesa
    // este script) como SJ-2.jpg (un archivo sin relación, usado aparte como
    // og:image en Base.astro, fuera del alcance de Task 8). Preferir .webp
    // cuando conviven varias extensiones: es la salida esperada de este
    // script, así que si ya existe es la candidata correcta.
    const webp = candidatos.find((c) => c.endsWith('.webp'));
    if (!webp) {
      throw new Error(`Más de un archivo para "${base}" y ninguno es .webp: ${candidatos.join(', ')}`);
    }
    return join(ASSETS_DIR, webp);
  }
  return join(ASSETS_DIR, candidatos[0]);
}

async function procesar(base, tope) {
  const rutaOrigen = encontrarArchivo(base);
  const rutaDestino = join(ASSETS_DIR, `${base}.webp`);

  const metadata = await sharp(rutaOrigen).metadata();
  const yaOptimizada = metadata.format === 'webp' && metadata.width <= tope;

  if (yaOptimizada) {
    console.log(`= ${base}: ya está en WebP a ${metadata.width}px (tope ${tope}px), sin cambios`);
    return { base, accion: 'sin-cambios', antes: statSync(rutaOrigen).size, despues: statSync(rutaOrigen).size };
  }

  const antes = statSync(rutaOrigen).size;

  // Cuando el origen ya es .webp (p. ej. SJ-1), origen y destino son la misma
  // ruta: sharp no permite leer y escribir el mismo archivo, así que se
  // escribe a un temporal y se reemplaza al final.
  const mismaRuta = rutaOrigen === rutaDestino;
  const rutaEscritura = mismaRuta ? `${rutaDestino}.tmp` : rutaDestino;

  // withoutEnlargement: nunca agranda una imagen ya más chica que el tope
  // (p. ej. FV1-01 a 1150px con tope de 1600px queda igual de ancha).
  await sharp(rutaOrigen)
    .resize({ width: tope, withoutEnlargement: true })
    .webp({ quality: CALIDAD })
    .toFile(rutaEscritura);

  if (mismaRuta) {
    renameSync(rutaEscritura, rutaDestino);
  } else {
    // Si la extensión de origen no era .webp, el archivo viejo queda huérfano:
    // borrarlo evita que quede sirviéndose (o pesando en dist) sin usarse, y
    // es lo que permite que la próxima corrida encuentre un único candidato .webp.
    unlinkSync(rutaOrigen);
  }

  const despues = statSync(rutaDestino).size;
  console.log(
    `✓ ${base}: ${(antes / 1024).toFixed(0)}KB → ${(despues / 1024).toFixed(0)}KB ` +
    `(${metadata.width}px → ${Math.min(metadata.width, tope)}px)`
  );
  return { base, accion: 'procesada', antes, despues };
}

async function main() {
  const resultados = [];
  for (const base of FULL_BLEED) {
    resultados.push(await procesar(base, TOPE_FULL));
  }
  for (const base of VERTICALES) {
    resultados.push(await procesar(base, TOPE_VERTICAL));
  }

  const totalAntes = resultados.reduce((suma, r) => suma + r.antes, 0);
  const totalDespues = resultados.reduce((suma, r) => suma + r.despues, 0);
  console.log('');
  console.log(`Total: ${(totalAntes / 1024 / 1024).toFixed(1)}MB → ${(totalDespues / 1024 / 1024).toFixed(1)}MB`);
}

main();
