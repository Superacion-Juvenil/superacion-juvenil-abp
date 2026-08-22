// Endpoint del formulario de contacto de /unete.html.
//
// Reemplaza al viejo mail/message.php del servidor original (no está en este
// repo). Mismo contrato que el PHP: POST normal (sin fetch), responde 303 a
// /unete.html y setea la cookie `notificacion` que lee el script de flash en
// unete.astro (la regex /correctamente|enviado/i decide el color: los textos
// de error de acá NUNCA deben contener esas dos palabras).
//
// prerender = false: esta es la única ruta que Astro debe renderizar on
// demand (función serverless de Vercel). Las 5 páginas del sitio se siguen
// generando estáticas.
export const prerender = false;

import type { APIContext, APIRoute } from 'astro';
import { Resend } from 'resend';

// Dato provisto por el dueño del proyecto (ver task-9-brief.md): los mensajes
// del formulario tienen que llegar acá. CONTACTO_DESTINO permite
// sobreescribirlo desde Vercel sin tocar código, pero no hace falta
// configurarlo para que esto funcione.
const DESTINATARIO_POR_DEFECTO = 'bortiz@superacionjuvenil.org';

// Validación simple de correo (el campo es type="text" en el HTML, no
// type="email", así que no hay validación nativa del navegador).
const REGEX_CORREO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const MENSAJE_EXITO = 'Tu mensaje fue enviado correctamente. Te contactaremos pronto.';
const MENSAJE_ERROR_DATOS = 'No pudimos enviar tu mensaje: revisa los datos e intenta de nuevo.';
const MENSAJE_ERROR_SERVIDOR = 'No pudimos enviar tu mensaje. Intenta de nuevo más tarde.';

function conFlash({ cookies, redirect }: Pick<APIContext, 'cookies' | 'redirect'>, mensaje: string) {
  cookies.set('notificacion', mensaje, {
    path: '/',
    maxAge: 300,
    sameSite: 'lax',
  });
  return redirect('/unete.html', 303);
}

export const POST: APIRoute = async (context) => {
  const { request } = context;

  let datos: FormData;
  try {
    datos = await request.formData();
  } catch {
    return conFlash(context, MENSAJE_ERROR_DATOS);
  }

  // Honeypot: campo "sitio", oculto por CSS (no type="hidden") para que los
  // bots lo rellenen y los humanos no lo vean. Si viene lleno, respondemos
  // como si todo hubiera salido bien -sin mandar nada- para que el bot no
  // reintente.
  const honeypot = String(datos.get('sitio') ?? '').trim();
  if (honeypot !== '') {
    return conFlash(context, MENSAJE_EXITO);
  }

  const correo = String(datos.get('correo') ?? '').trim();
  const nombre = String(datos.get('nombre') ?? '').trim();
  const mensaje = String(datos.get('mensaje') ?? '').trim();

  if (!nombre || !mensaje || !correo || !REGEX_CORREO.test(correo)) {
    return conFlash(context, MENSAJE_ERROR_DATOS);
  }

  // Sin RESEND_API_KEY no hay forma de mandar el correo. Fallamos elegante
  // (flash rojo) en vez de un 500 críptico. Esto es esperado hasta que el
  // dueño del proyecto cargue la clave en Vercel (ver task-9-report.md).
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.error('[api/contacto] Falta RESEND_API_KEY: no se puede enviar el correo.');
    return conFlash(context, MENSAJE_ERROR_SERVIDOR);
  }

  const destinatario = process.env.CONTACTO_DESTINO || DESTINATARIO_POR_DEFECTO;

  try {
    const resend = new Resend(apiKey);
    const { error } = await resend.emails.send({
      // TODO(dueño del proyecto): una vez verificado el subdominio en Resend
      // (ver sección DNS del reporte), cambiar este remitente a algo como
      // formulario@send.superacionjuvenil.org.
      from: 'Formulario Superación Juvenil <onboarding@resend.dev>',
      to: destinatario,
      replyTo: correo,
      subject: `Nuevo mensaje de contacto de ${nombre}`,
      text: `Nombre: ${nombre}\nCorreo: ${correo}\n\n${mensaje}`,
    });

    if (error) {
      console.error('[api/contacto] Resend devolvió un error:', error);
      return conFlash(context, MENSAJE_ERROR_SERVIDOR);
    }
  } catch (err) {
    console.error('[api/contacto] Error inesperado al enviar el correo:', err);
    return conFlash(context, MENSAJE_ERROR_SERVIDOR);
  }

  return conFlash(context, MENSAJE_EXITO);
};
