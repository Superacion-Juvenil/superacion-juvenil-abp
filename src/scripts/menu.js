// Bloquea el scroll del body mientras el menú hamburguesa está abierto.
//
// El original (js/menu.js) reescribía el atributo onclick del propio .menu-icon
// para alternar entre overFlowH() (bloquea) y overFlowV() (desbloquea), y el label
// #dim-menu-close (la franja oscura al lado del menú) llamaba siempre a overFlowV().
// Como overFlowV() también reescribía el onclick del ícono de vuelta a overFlowH(),
// cerrar por cualquiera de los dos caminos (ícono o franja) deja todo sincronizado
// para el próximo click. Acá se replica lo mismo con un flag en vez de reescribir
// atributos: el ícono togglea `abierto`, y cerrar (desde cualquier lado) siempre lo
// deja en `false`.
//
// La apertura/cierre visual del menú (mostrar el panel) la hace el CSS del propio
// checkbox #menu-chk vía :checked — este script solo se encarga del overflow.
//
// El original NO carga este script en unete.html ni en aviso.html (tampoco en
// nosotros.html, que no carga ningún script propio), así que en esas páginas el
// menú se abre igual mostrando el panel (es puro CSS del checkbox) pero nunca
// bloquea el scroll. Se replica ese estado a propósito: iniciarMenu() solo se
// invoca desde index.astro y proyectos.astro, que son las páginas que hoy cargan
// menu.js. Cambiar eso es una decisión aparte, no de esta tarea.
export function iniciarMenu() {
  const icono = document.querySelector('.menu-icon');
  const cierre = document.getElementById('dim-menu-close');
  if (!icono) return;

  let abierto = false;

  function abrir() {
    document.body.style.overflow = 'hidden';
    abierto = true;
  }

  function cerrar() {
    document.body.style.overflow = '';
    abierto = false;
  }

  icono.addEventListener('click', () => {
    if (abierto) {
      cerrar();
    } else {
      abrir();
    }
  });

  cierre?.addEventListener('click', cerrar);
}
