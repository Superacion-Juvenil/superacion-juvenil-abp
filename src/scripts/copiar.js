// Copia al portapapeles la cuenta bancaria o la CLABE y muestra la nubecita de
// confirmación ("¡Copiado!") durante 5000ms.
//
// El original (js/copy.js) colgaba copyContent(tipo) de window y cada botón lo
// invocaba con onclick="copyContent('cuenta'|'clabe')". Acá se reemplaza el
// onclick inline por un atributo data-tipo en cada .copyBtn (ver unete.astro) y
// un listener por botón.
const CUENTA = '0568282243';
const CLABE = '072580005682822434';

const DATOS_POR_TIPO = {
  cuenta: { valor: CUENTA, idNube: 'copy-cloud-cuenta', idNumeros: 'cuentaNumbers' },
  clabe: { valor: CLABE, idNube: 'copy-cloud-clabe', idNumeros: 'clabeNumbers' },
};

async function copiar(tipo) {
  const datos = DATOS_POR_TIPO[tipo];
  if (!datos) return;

  try {
    await navigator.clipboard.writeText(datos.valor);

    document.getElementById(datos.idNube)?.classList.add('copy-cloud-visible');
    document.getElementById(datos.idNumeros)?.classList.add('cuentaNumbersBold');

    setTimeout(() => {
      document.getElementById(datos.idNube)?.classList.remove('copy-cloud-visible');
      document.getElementById(datos.idNumeros)?.classList.remove('cuentaNumbersBold');
    }, 5000);
  } catch (err) {
    console.error('Failed to copy: ', err);
  }
}

export function iniciarCopiar() {
  document.querySelectorAll('.copyBtn[data-tipo]').forEach((boton) => {
    boton.addEventListener('click', () => copiar(boton.dataset.tipo));
  });
}
