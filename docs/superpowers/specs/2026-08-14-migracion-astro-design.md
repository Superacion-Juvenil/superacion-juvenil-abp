# Migración del sitio de Superación Juvenil a Astro

Fecha: 2026-08-14
Estado: aprobado (diseño), pendiente de plan de implementación

## Contexto

El repo contiene hoy un clon exacto de `https://superacionjuvenil.org/` (commit `15bff6bf`),
verificado archivo por archivo contra el sitio en vivo. Es HTML/CSS/JS estático:

| Pieza | Estado actual |
|---|---|
| Páginas | 5 (`index`, `nosotros`, `proyectos`, `unete`, `aviso`), ~1.050 líneas de HTML |
| CSS | `styles/style.css`, 3.413 líneas, 28 breakpoints distintos, sin variables |
| JS propio | 4 archivos (`menu`, `header-scroll`, `aportar-images`, `copy`) + 8 bloques inline |
| Dependencias | jQuery (CDN), Owl Carousel, AOS (CDN) |
| Formulario | 3 campos → `mail/message.php`, que no existe en el repo |
| Assets | 132 MB; 15 archivos suman ~55 MB |

Header duplicado en las 5 páginas; la única diferencia real entre versiones es
`style="position: fixed"`, presente en todas menos `index`.

## Objetivos

Los dos que definió el dueño del proyecto:

1. **Mantenibilidad** — dejar de repetir el header en 5 páginas, sacar los scripts inline,
   eliminar jQuery.
2. **Performance** — bajar el peso de las imágenes.

Fuera de alcance, explícitamente: CMS, blog, donaciones en línea, panel interno.

## Restricción rectora

**El diseño no cambia.** Ni layout, ni tipografías, ni colores, ni textos, ni el
comportamiento visible. Toda decisión que enfrente "más moderno" contra "idéntico"
se resuelve a favor de idéntico. Donde el sitio actual tiene un defecto, se replica
el defecto (ver "Comportamientos que se preservan a propósito").

## Stack

**Astro**, con salida estática y adapter de Vercel.

Se eligió sobre Next.js y Eleventy porque manda cero JavaScript por defecto —solo se
envía el que se escribe explícitamente—, permite componentizar sin traer runtime de
React, y trae pipeline de imágenes integrado. Next.js quedó descartado por
sobredimensionado para 5 páginas sin interactividad: agregaría React y su modelo de
Server Components/hydration, es decir más complejidad justo donde se busca menos.
Eleventy cumple, pero deja la optimización de imágenes a plugins externos.

## Arquitectura

```
src/
  layouts/Base.astro          <head>, meta/OG, header, footer
  components/Header.astro     prop `fixed` (index=false, resto=true)
  components/Footer.astro
  components/Carrusel.astro   usado por index y proyectos
  pages/                      index, nosotros, proyectos, unete, aviso
  pages/api/contacto.ts       función del formulario
  styles/                     CSS repartido por sección
  assets/                     imágenes que pasan por el pipeline
public/                       PDFs, mp4, favicon (copiados tal cual)
```

### URLs

Astro genera `/nosotros/` por defecto, lo que rompería los links entrantes y el
`<link rel="canonical">` del sitio. Se configura `build.format: 'file'` para que las
rutas queden exactamente como hoy: `/nosotros.html`.

### Estrategia de CSS

`style.css` se parte en archivos por sección (`base.css`, `header.css`, `home.css`, …)
**manteniendo los selectores globales y el mismo orden de import**.

No se usan los scoped styles de Astro: reescriben los selectores, y este CSS depende de
cascada global con 41 media queries entrecruzadas. El riesgo de romper el diseño en
detalles difíciles de detectar no compensa. Partido en archivos, el CSS computa
exactamente lo mismo y se vuelve navegable, que es el beneficio buscado.

## Imágenes

El peso está donde el pipeline de Astro no llega: los 15 archivos más pesados son
backgrounds de CSS, y `astro:assets` no procesa las `url()` del CSS, solo las hashea.
De ahí que haya dos vías:

| Origen | Tratamiento |
|---|---|
| Backgrounds CSS (`FC*`, `FV*`, `SJ-*`, `Nina/Nino/Brecha`, `FotoContigo`) | Reencode único con sharp, con tope de dimensiones |
| `<img>` del HTML (`programa-*`, logos, iconos) | `astro:assets` → AVIF/WebP + `srcset` responsive en el build |

Están desproporcionadas respecto de su uso: `FotoContigo.webp` es de 6016×4000 para
usarse de fondo; las `SJ-*.webp` son de 4200×3300. Topes: ~2400px de ancho para los
full-bleed, ~1600px para los verticales.

Además:

- `fondo-universitarios.jpg` y `fondo-adolescentes.jpg` son el mismo archivo byte a byte
  → se deduplica.
- Las variantes manuales `programa-*_256/_900/_1560.png` dejan de tener sentido cuando el
  build genera el `srcset` → se borran.
- El PDF de 26 MB (`Informe Anual SJ 2022.pdf`) queda en `public/` sin tocar.

Los originales se reemplazan por las versiones optimizadas y se commitean. El clon exacto
queda preservado en el historial de git (commit `15bff6bf`) y en el sitio en vivo, así que
la operación es reversible.

Meta: de 132 MB a ~12 MB.

## JavaScript

jQuery no lo usa solo Owl Carousel: también `aportar-images.js`, `header-scroll.js` y
`copy.js`. Sacarlo implica reescribir esos tres en vanilla (~190 líneas en total).

- **Carruseles** → un componente con CSS scroll-snap más ~40 líneas de JS que replican lo
  que hace Owl hoy: autoplay cada 4s, loop infinito, pausa al pasar el mouse, y 4/3/4/5
  ítems por breakpoint en el carrusel de logos, 1/2/3 en el de proyectos.
- **AOS** → IntersectionObserver más transiciones CSS. 53 elementos: `fade-up` (19),
  `fade-right` (14), `fade-left` (7), `flip-left` (6), `fade-down` (3), `fade-in` (1),
  más `zoom-in-down` y los dos `zoom-up`/`zoom-down` (ver corrección abajo).
- **Los 4 scripts propios** se reescriben en vanilla y pasan a ser módulos del componente
  que los usa, en lugar de 8 bloques `<script>` inline.

## Formulario

La función `pages/api/contacto.ts` replica el contrato actual: recibe el POST normal del
`<form>`, envía el correo con Resend, setea la cookie `notificacion` y redirige a
`/unete.html`. El script de flash que ya existe sigue funcionando sin tocarlo.

Se eligió esto sobre un `fetch()` sin recarga porque el comportamiento queda idéntico al
de hoy y **el formulario sigue funcionando sin JavaScript**, como funciona actualmente.

Dos agregados sin efecto visual, necesarios al exponer un endpoint público:

- **Honeypot**: campo oculto que los bots llenan y los humanos no.
- **Validación en el servidor**: el campo de email es hoy `type="text"` sin validar. El
  markup no se toca (cambiaría el diseño); la validación vive en la función.

Variables de entorno: `RESEND_API_KEY` y el correo destino.

## Deploy

Proyecto de Vercel atado al repo: push a `main` → producción, cada PR genera su preview.

**El cambio de DNS es un paso aparte y explícito.** Orden: publicar en la URL de Vercel,
comparar contra el sitio en vivo, y recién con aprobación mover el DNS de
`superacionjuvenil.org`. Es el único paso irreversible de la migración y no se ejecuta
sin confirmación.

## Verificación de fidelidad

Comparación automática por screenshots, porque con 28 breakpoints revisar a ojo en tres
anchos dejaría la mayoría sin mirar.

Un script de Playwright levanta dos servidores —el clon actual (commit `15bff6bf`) y el
build de Astro— y para cada página en cada breakpoint captura ambas y las compara con
pixelmatch. Son 5 páginas × 28 anchos = **140 pares por corrida**, con reporte de las que
difieren.

Breakpoints: 320, 360, 375, 400, 420, 430, 480, 481, 500, 600, 657, 700, 767, 800, 820,
840, 850, 900, 912, 913, 950, 1000, 1024, 1200, 1280, 1290, 1455, 1590.

Tres fuentes de ruido hay que neutralizar para que la comparación signifique algo:

- **Los carruseles rotan solos** → se congelan en el primer ítem antes de capturar.
- **Las animaciones de scroll** dejan elementos a medio aparecer → se fuerza el estado final.
- **Las imágenes reencodadas no dan pixeles idénticos** aunque se vean igual → el criterio
  no es "0 diferencias" sino un umbral: falla si difiere más del 0,5% de los pixeles, que
  detecta cualquier corrimiento de layout pero tolera el ruido de recompresión.

## Criterios de aceptación

1. Las 140 comparaciones de screenshots pasan el umbral de 0,5%.
2. Las URLs siguen siendo `/nosotros.html`, no `/nosotros/`.
3. El peso total transferido baja de ~132 MB a menos de 15 MB.
4. Cero jQuery y cero `<script>` inline en el HTML final.
5. El formulario envía un correo real de punta a punta.

## Comportamientos que se preservan a propósito

El sitio actual carga scripts distintos en cada página, y eso produce rarezas que **son
parte del comportamiento observable**. Se replican tal cual; arreglarlas sería cambiar el
sitio, no migrarlo.

| Quirk | Efecto hoy |
|---|---|
| `nosotros.html` no carga ningún script | Sus 16 elementos con `data-aos` nunca animan |
| `unete.html` y `aviso.html` no cargan `menu.js` | El `onclick="overFlowH()"` del menú hamburguesa tira ReferenceError |
| ~~`zoom-up` y `zoom-down` no existen en AOS~~ | **Corregido 2026-08-18: era falso.** AOS aplica una regla de prefijo `[data-aos^="zoom"]` y agrega la clase a todo `[data-aos]` sin filtrar por nombre, así que esos 2 elementos SÍ animan. Se replica la animación. |
| `header-scroll.js` solo se carga en `index` | El contador `.count-up2` (4 elementos) solo corre ahí |
| El grueso de `header-scroll.js` está comentado | De ese archivo solo vive el disparador del contador |

Cada quirk queda documentado en el código con un comentario que explica que es
intencional, para que nadie lo "arregle" sin querer en el futuro.

Si en algún momento se quieren corregir, es una decisión aparte y posterior a la
migración, con su propia validación visual.

## Preguntas abiertas

1. **Correo destino del formulario**: ¿a qué dirección llegan hoy los mensajes? Hace falta
   para configurar Resend.
2. **Dominio de envío para Resend**: hay que validar un dominio (idealmente
   `superacionjuvenil.org`) agregando registros DNS. ¿Quién tiene acceso al DNS?
3. **PDF de 26 MB**: ¿se intenta recomprimir o queda tal cual?
