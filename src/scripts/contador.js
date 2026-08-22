// Dispara la animación de los contadores .count-up2 (los números de "a lo largo de
// nuestra historia...") cuando se llega a la sección .historia.
//
// El original (js/header-scroll.js) calculaba el punto de disparo a mano
// (offset de .historia menos 2x su alto) y lo comparaba contra scrollTop en un
// setInterval de 50ms alimentado por $(window).scroll — un throttle manual de
// jQuery. Acá se reemplaza todo eso por un IntersectionObserver sobre .historia,
// que dispara una sola vez al entrar en el viewport.
//
// El original (js/header-scroll.js) tenía además lógica para ocultar el header al
// scrollear, pero estaba comentada entera. No se porta: no corría.
export function iniciarContador() {
  const historia = document.querySelector('.historia');
  const contadores = document.querySelectorAll('.count-up2');
  if (!historia || contadores.length === 0) return;

  function contar() {
    const PASOS_TOTALES = 500;
    const INTERVALO_MS = 1;

    contadores.forEach((elemento) => {
      const fin = parseInt(elemento.getAttribute('data-val'), 10);
      const paso = Math.ceil(fin / PASOS_TOTALES);
      let valor = 0;

      const intervalo = setInterval(() => {
        valor += paso;
        elemento.textContent = valor;
        if (valor >= fin) {
          clearInterval(intervalo);
          elemento.textContent = fin;
        }
      }, INTERVALO_MS);
    });
  }

  const observador = new IntersectionObserver((entradas, obs) => {
    for (const entrada of entradas) {
      if (entrada.isIntersecting) {
        contar();
        obs.disconnect();
      }
    }
  });

  observador.observe(historia);
}
