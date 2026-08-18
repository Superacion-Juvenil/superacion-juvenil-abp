// Rota el fondo del hero (#aportar-images, en la portada) cada 5000ms, ciclando
// entre las clases aportar-image1..4. Antes de arrancar precarga las 8 imágenes
// de fondo, igual que el original (js/aportar-images.js), para evitar destellos
// al cambiar de clase.
//
// numImages/cont del original son vestigiales: llevan una cuenta que nunca se usa
// para decidir a qué clase pasar (el ciclo lo define únicamente la cadena de
// if/else sobre la clase actual), así que no se portan acá.
// Task 8 reencodeó estos backgrounds de PNG a WebP (scripts/optimizar-imagenes.mjs):
// las rutas acá tienen que seguir esa extensión o las 8 precargas dan 404.
const IMAGENES = [
  '../assets/FC4-01.webp',
  '../assets/FC1-01.webp',
  '../assets/FC2-01.webp',
  '../assets/FC3-01.webp',
  '../assets/FV1-01.webp',
  '../assets/FV3-01.webp',
  '../assets/FV2-01.webp',
  '../assets/FV4-01.webp',
];

const SIGUIENTE_CLASE = {
  'aportar-image1': 'aportar-image2',
  'aportar-image2': 'aportar-image3',
  'aportar-image3': 'aportar-image4',
  'aportar-image4': 'aportar-image1',
};

function precargar(urls) {
  return Promise.all(
    urls.map(
      (url) =>
        new Promise((resolve) => {
          const img = new Image();
          // onerror también resuelve (no rechaza): si a alguna imagen le
          // pasa algo (404, red, lo que sea) no hay que dejar la rotación
          // del hero muerta para siempre. Promise.all esperaba solo onload;
          // un solo 404 dejaba esa promesa colgada y setInterval nunca se
          // instalaba (bug real de Task 8: las rutas quedaron en .png
          // después de reencodear a .webp, y esto lo dejó pasar en silencio).
          img.onload = resolve;
          img.onerror = resolve;
          img.src = url;
        })
    )
  );
}

export function iniciarHero() {
  const aportar = document.getElementById('aportar-images');
  if (!aportar) return;

  precargar(IMAGENES).then(() => {
    setInterval(() => {
      for (const [actual, siguiente] of Object.entries(SIGUIENTE_CLASE)) {
        if (aportar.classList.contains(actual)) {
          aportar.classList.remove(actual);
          aportar.classList.add(siguiente);
          break;
        }
      }
    }, 5000);
  });
}
