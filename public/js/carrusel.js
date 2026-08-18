// Carrusel propio con scroll-snap (reemplaza a Owl Carousel, Task 5).
// Por cada [data-carrusel]:
//   1. envuelve cada hijo de .carrusel-pista en un .carrusel-item (así el
//      tamaño de cada item se controla sin tocar el CSS propio del hijo:
//      .tarjeta / .tar siguen definiendo su tamaño e imagen tal cual);
//   2. clona ese set de items una vez y lo agrega al final de la pista, para
//      poder "loopear": al llegar al final se resetea el scroll al set
//      original de forma instantánea (sin animación), y como el clon es
//      idéntico al original, no se nota el salto;
//   3. calcula cuántos items entran según el ancho de ventana
//      (itemsPorAncho, igual que el `responsive` de owl) y expone esa
//      cantidad como --items para que carrusel.css calcule el ancho de cada
//      item;
//   4. arranca el autoplay (cada 4s) y lo pausa con el mouse encima.

function inicializarCarrusel(carrusel) {
    const pista = carrusel.querySelector('.carrusel-pista');
    if (!pista) return;

    const config = JSON.parse(carrusel.dataset.config || '{}');
    const itemsPorAncho = config.itemsPorAncho || { 0: 1 };
    const anchosOrdenados = Object.keys(itemsPorAncho)
        .map(Number)
        .sort((a, b) => a - b);
    const margen = config.margen || 0;

    // Envolver cada hijo original en .carrusel-item.
    const originales = Array.from(pista.children);
    originales.forEach((hijo) => {
        const item = document.createElement('div');
        item.className = 'carrusel-item';
        hijo.parentNode.insertBefore(item, hijo);
        item.appendChild(hijo);
    });

    // Clonar el set completo una vez y agregarlo al final, para el loop.
    const items = Array.from(pista.children);
    items.forEach((item) => {
        pista.appendChild(item.cloneNode(true));
    });

    let anchoOriginal = 0;

    function itemsVisiblesSegunAncho() {
        let valor = itemsPorAncho[anchosOrdenados[0]];
        for (const ancho of anchosOrdenados) {
            if (window.innerWidth >= ancho) valor = itemsPorAncho[ancho];
        }
        return valor;
    }

    function actualizarVariables() {
        carrusel.style.setProperty('--items', itemsVisiblesSegunAncho());
        carrusel.style.setProperty('--margen', margen + 'px');
        // La mitad de la pista es el contenido original (la otra mitad es
        // el clon agregado arriba).
        anchoOriginal = pista.scrollWidth / 2;
    }

    function anchoDeUnItem() {
        const primero = pista.children[0];
        return primero ? primero.getBoundingClientRect().width + margen : 0;
    }

    let intervalo = null;

    function avanzar() {
        // Si ya cruzamos hacia el set clonado, volvemos instantáneamente al
        // punto equivalente del set original antes de animar: como el clon
        // es idéntico, no se ve ningún salto.
        //
        // Ojo con `pista.scrollLeft = x`: con scroll-snap-type:mandatory el
        // navegador NO aplica esa asignación al toque, la trata como punto
        // de partida para un ajuste de snap propio que se resuelve en varios
        // frames (comprobado leyendo scrollLeft justo después de asignarlo:
        // seguía mostrando el valor viejo). Si justo después se dispara un
        // scrollBy suave, ese scroll termina animando desde la posición
        // vieja y el salto se pierde. `scrollTo({..., behavior:'instant'})`
        // sí se aplica de forma síncrona, así que el scrollBy que sigue
        // arranca ya desde la posición correcta.
        if (pista.scrollLeft >= anchoOriginal) {
            pista.scrollTo({ left: pista.scrollLeft - anchoOriginal, behavior: 'instant' });
        }
        pista.scrollBy({ left: anchoDeUnItem(), behavior: 'smooth' });
    }

    function iniciarAutoplay() {
        detenerAutoplay();
        intervalo = setInterval(avanzar, 4000);
    }

    function detenerAutoplay() {
        if (intervalo) clearInterval(intervalo);
        intervalo = null;
    }

    actualizarVariables();
    window.addEventListener('resize', actualizarVariables);

    carrusel.addEventListener('mouseenter', detenerAutoplay);
    carrusel.addEventListener('mouseleave', iniciarAutoplay);

    iniciarAutoplay();
}

document.querySelectorAll('[data-carrusel]').forEach(inicializarCarrusel);
