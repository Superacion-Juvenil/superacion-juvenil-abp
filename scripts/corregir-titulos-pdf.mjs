// Corrige el título interno (/Title) de los informes anuales.
//
// Varios PDF quedaron con el título que traían de su exportación desde Google
// Docs — "Copia de informe anual 2.0 (Revista)", "Copia de Informe Anual 2024",
// "INFORME ANNUAL 2021" (con typo) — y uno directamente sin título. Ese campo es
// el que muestran los visores de PDF en su barra superior, así que el usuario ve
// ese texto en vez del nombre del informe.
//
// No cambia el nombre del archivo (eso lo define la URL) ni el contenido de las
// páginas: solo reescribe la metadata del documento.
//
// Idempotente: si el título ya es el correcto, no toca el archivo.
import { PDFDocument } from 'pdf-lib';
import { readFile, writeFile } from 'node:fs/promises';
import { readdirSync } from 'node:fs';

const DIR = 'public/files_download';
const archivos = readdirSync(DIR).filter((f) => f.toLowerCase().endsWith('.pdf')).sort();

for (const nombre of archivos) {
  const anio = nombre.match(/(\d{4})/)?.[1];
  if (!anio) {
    console.log(`  saltado (sin año en el nombre): ${nombre}`);
    continue;
  }
  // Mismo texto que usa el sitio para enlazarlos, para que coincida lo que el
  // usuario clickeó con lo que ve el visor.
  const titulo = `Informe anual ${anio}`;
  const ruta = `${DIR}/${nombre}`;
  const bytes = await readFile(ruta);

  const doc = await PDFDocument.load(bytes, { updateMetadata: false });
  if (doc.getTitle() === titulo) {
    console.log(`  ya correcto: ${nombre}`);
    continue;
  }
  const antes = doc.getTitle() ?? '(sin título)';
  doc.setTitle(titulo);

  const salida = await doc.save({ useObjectStreams: true });
  await writeFile(ruta, salida);
  const d = (n) => (n / 1048576).toFixed(1) + ' MB';
  console.log(`  ${nombre}\n     "${antes}" -> "${titulo}"  (${d(bytes.length)} -> ${d(salida.length)})`);
}
