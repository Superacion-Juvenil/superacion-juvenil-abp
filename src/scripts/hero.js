// Rota el fondo del hero (#aportar-images, en la portada) cada 5000ms, ciclando
// entre las clases aportar-image1..4. Antes de arrancar precarga las 8 imágenes
// de fondo, igual que el original (js/aportar-images.js), para evitar destellos
// al cambiar de clase.
//
// numImages/cont del original son vestigiales: llevan una cuenta que nunca se usa
// para decidir a qué clase pasar (el ciclo lo define únicamente la cadena de
// if/else sobre la clase actual), así que no se portan acá.
const IMAGENES = [
  '../assets/FC4-01.png',
  '../assets/FC1-01.png',
  '../assets/FC2-01.png',
  '../assets/FC3-01.png',
  '../assets/FV1-01.png',
  '../assets/FV3-01.png',
  '../assets/FV2-01.png',
  '../assets/FV4-01.png',
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
          img.onload = resolve;
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
