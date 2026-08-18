// Reemplazo de AOS. Observa todos los [data-aos] del documento y les agrega
// o quita la clase .aos-animate según entran o salen del viewport (el estado
// visual lo define public/styles/animaciones.css).
//
// Replica el comportamiento por defecto de AOS (aos@next, ver AOS.init() en
// las páginas que lo cargaban):
//   - offset: 120  → el observer dispara cuando el elemento entra 120px
//     dentro del viewport, no ante el primer píxel visible. Se logra
//     encogiendo el "root" del IntersectionObserver 120px desde abajo
//     (rootMargin), en vez de un threshold por porcentaje: un threshold no
//     replica un offset en píxeles para elementos de distinto tamaño.
//   - once: false  → AOS vuelve a animar si se sale del viewport y se
//     vuelve a entrar (verificado contra el sitio original: al scrollear
//     hasta arriba del todo, el elemento pierde su estado animado, y al
//     volver a bajar se reanima). Por eso acá NUNCA se hace unobserve(): se
//     agrega .aos-animate al entrar y se quita al salir.
//   - data-aos-delay: AOS lo aplica como transition-delay en su CSS; acá se
//     aplica como setTimeout antes de agregar la clase, que da el mismo
//     resultado visual sin necesitar reglas CSS por cada valor de delay. Si
//     el elemento sale del viewport antes de que venza el timeout, se
//     cancela (si no, el elemento animaría estando fuera de pantalla).
//
// Red de seguridad (revisarManualmente): se detectó en Chromium headless que
// el IntersectionObserver deja de volver a notificar cambios de visibilidad
// para un elemento cuyo transform combina translate + scale en ese orden
// (es el caso de [data-aos="zoom-in-down"], único elemento con esa
// combinación) — el primer chequeo (al hacer observe()) es correcto, pero
// nunca llega un segundo callback aunque el elemento sí entre o salga del
// viewport después. getBoundingClientRect() sobre el mismo elemento, en
// cambio, siempre da la posición real. Por las dudas de que ese bug (o uno
// parecido) aparezca en algún navegador real, se vuelve a chequear a mano en
// cada scroll la posición de los elementos que el observer todavía no marcó
// como animados, usando el mismo criterio de offset (120px) que el
// IntersectionObserver.
export function iniciarAnimaciones() {
  const elementos = [...document.querySelectorAll('[data-aos]')];
  const entradasPendientes = new WeakMap();
  const OFFSET = 120;

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

  const observador = new IntersectionObserver(
    (entradas) => {
      for (const entrada of entradas) {
        if (entrada.isIntersecting) activar(entrada.target);
        else desactivar(entrada.target);
      }
    },
    {
      rootMargin: `0px 0px -${OFFSET}px 0px`,
      threshold: 0,
    }
  );

  for (const el of elementos) observador.observe(el);

  const revisarManualmente = () => {
    const alto = window.innerHeight;
    for (const el of elementos) {
      if (el.classList.contains('aos-animate') || entradasPendientes.has(el)) continue;
      const rect = el.getBoundingClientRect();
      const visible = rect.top < alto - OFFSET && rect.bottom > 0;
      if (visible) activar(el);
    }
  };
  window.addEventListener('scroll', revisarManualmente, { passive: true });
}
