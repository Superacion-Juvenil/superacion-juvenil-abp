// Reemplazo de AOS. Calcula para cada [data-aos] un umbral de scroll fijo y
// le agrega o quita la clase .aos-animate según ese umbral (el estado visual
// lo define public/styles/animaciones.css).
//
// Este archivo tuvo antes una implementación basada en IntersectionObserver
// (agregar .aos-animate al entrar en viewport, quitarla al salir por
// cualquier lado). Se reemplazó por completo tras comparar contra el aos.js
// real (https://unpkg.com/aos@next/dist/aos.js, deshecho con js-beautify
// para leerlo) porque esa implementación NO replica lo que hace AOS: se
// verificó `once: false` scrolleando hasta arriba del todo y viendo que el
// elemento pierde su estado animado, pero no se verificó qué pasa al
// scrollear hacia ABAJO más allá del elemento (sin volver a subir) — ahí es
// donde la implementación por IntersectionObserver diverge del original: un
// elemento sale del viewport por arriba tan pronto lo pasás de largo
// bajando, y el observer lo desactivaba ahí mismo. Medido con
// Playwright (scroll en pasos de 300px hasta el fondo, sin volver arriba,
// esperando 1.5s): 43 de 51 [data-aos] del sitio terminaban con un estado de
// animación distinto al original (ver scripts/verificar-animaciones.mjs).
//
// Cómo funciona realmente AOS (leyendo su función interna, minificada como
// `X`, que corre en cada scroll):
//   - Para cada elemento calcula UNA VEZ (al iniciar/resize) su
//     `position.in`: un scrollY absoluto de página (no una posición relativa
//     al viewport) igual a `offsetTopAbsoluto(el) - innerHeight + offset`
//     (offset default 120, "top-bottom" default de anchor-placement, sin
//     ajuste). `offsetTopAbsoluto` es la suma de `el.offsetTop` subiendo por
//     la cadena de `offsetParent` (su función interna `Z`) — NO
//     getBoundingClientRect(), así que no lo afecta el transform que el
//     propio [data-aos] tiene aplicado antes de animar.
//   - En cada scroll compara `window.pageYOffset` (creciente mientras
//     bajás, sin importar qué haya en el viewport) contra ese umbral fijo:
//     si pageYOffset >= position.in, agrega .aos-animate (si no la tenía);
//     si NO, y el elemento ya estaba animado y `once` es false (default),
//     se la quita. Con `mirror: false` (default, y no se usa
//     data-aos-mirror en este sitio) no hay ninguna otra condición de salida.
//   - Consecuencia: una vez que pageYOffset cruza el umbral de un elemento,
//     seguir bajando nunca lo desactiva (pageYOffset no puede bajar
//     scrolleando hacia abajo). Solo se desactiva si volvés a subir por
//     ENCIMA del punto donde se activó. Es exactamente lo opuesto de "sale
//     del viewport en cualquier dirección" que tenía la versión anterior.
//
// Esta versión porta ese mismo modelo (umbral de scrollY absoluto) en vez de
// aproximarlo con visibilidad de viewport, así que también resuelve gratis
// el caso de .modelo-numdesc (nosotros.astro): con `display: none` en su
// breakpoint, offsetTop es 0 (offsetParent es null) igual que en AOS, dando
// un umbral muy negativo que lo activa desde el primer scroll — un
// IntersectionObserver nunca dispara para un elemento sin área, y el
// getBoundingClientRect() de una red de seguridad tampoco (rect.bottom es 0),
// pero comparar contra un scrollY absoluto no depende del área del elemento.
//
//   - data-aos-delay: AOS lo aplica como transition-delay en su CSS; acá se
//     aplica como setTimeout antes de agregar la clase, que da el mismo
//     resultado visual sin necesitar reglas CSS por cada valor de delay. Si
//     el umbral deja de cumplirse antes de que venza el timeout (volviste a
//     subir), se cancela (si no, el elemento animaría sin cumplir su propio
//     umbral).
export function iniciarAnimaciones() {
  const elementos = [...document.querySelectorAll('[data-aos]')];
  const entradasPendientes = new WeakMap();
  const umbrales = new WeakMap();
  const OFFSET = 120;

  // Replica Z() de aos.js: posición absoluta (documento) del borde superior,
  // sumando offsetTop a lo largo de la cadena de offsetParent. A diferencia
  // de getBoundingClientRect(), offsetTop no se ve afectado por el propio
  // transform inicial de [data-aos] (translate3d/scale antes de animar), así
  // que el umbral no se corre por el estado inicial de la animación. Para un
  // elemento con "display: none" offsetParent es null y el bucle no suma
  // nada, dando top = 0 — igual que en aos.js.
  const posicionAbsoluta = (el) => {
    let top = 0;
    let nodo = el;
    while (nodo && !Number.isNaN(nodo.offsetLeft) && !Number.isNaN(nodo.offsetTop)) {
      top += nodo.offsetTop - (nodo.tagName !== 'BODY' ? nodo.scrollTop : 0);
      nodo = nodo.offsetParent;
    }
    return top;
  };

  const calcularUmbrales = () => {
    for (const el of elementos) {
      umbrales.set(el, posicionAbsoluta(el) - window.innerHeight + OFFSET);
    }
  };

  const activar = (el) => {
    if (el.classList.contains('aos-animate') || entradasPendientes.has(el)) return;
    const retraso = Number(el.getAttribute('data-aos-delay') ?? 0);
    const id = setTimeout(() => {
      entradasPendientes.delete(el);
      el.classList.add('aos-animate');
    }, retraso);
    entradasPendientes.set(el, id);
  };

  const desactivar = (el) => {
    const pendiente = entradasPendientes.get(el);
    if (pendiente) {
      clearTimeout(pendiente);
      entradasPendientes.delete(el);
    }
    el.classList.remove('aos-animate');
  };

  // Único punto que decide el estado de cada elemento: compara el scrollY
  // actual contra su umbral fijo, igual que la función X() de aos.js.
  const evaluar = () => {
    const scrollY = window.scrollY;
    for (const el of elementos) {
      const activo = el.classList.contains('aos-animate') || entradasPendientes.has(el);
      const debeEstarActivo = scrollY >= umbrales.get(el);
      if (debeEstarActivo && !activo) activar(el);
      else if (!debeEstarActivo && activo) desactivar(el);
    }
  };

  calcularUmbrales();
  evaluar();
  window.addEventListener('scroll', evaluar, { passive: true });
  window.addEventListener('resize', () => {
    calcularUmbrales();
    evaluar();
  });
}
