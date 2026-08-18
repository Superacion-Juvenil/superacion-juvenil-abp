// Utilidades para levantar los servidores estáticos de comparación (baseline y
// candidato), esperar a que respondan antes de lanzar Playwright y apagarlos al
// terminar. `npx serve` puede tardar unos segundos en aceptar conexiones, así que
// nunca alcanza con lanzarlo en background y asumir que ya está listo.

import { spawn } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const INTENTOS_POR_DEFECTO = 40;
const ESPERA_MS_POR_DEFECTO = 500;

/** Levanta `npx serve <carpeta> -l <puerto>` como proceso hijo. */
export function iniciarServidor(carpeta, puerto) {
  return spawn('npx', ['serve', carpeta, '-l', String(puerto)], {
    stdio: 'ignore',
  });
}

/**
 * Espera a que el servidor responda en `url`, reintentando cada `esperaMs`.
 * Lanza un error si se agotan los `intentos` sin obtener respuesta.
 */
export async function esperarServidor(url, intentos = INTENTOS_POR_DEFECTO, esperaMs = ESPERA_MS_POR_DEFECTO) {
  for (let i = 0; i < intentos; i++) {
    try {
      const resp = await fetch(url);
      // Cualquier respuesta HTTP (incluso 404) confirma que el servidor ya escucha.
      if (resp) return;
    } catch {
      // Todavía no levantó el puerto: reintentar.
    }
    await new Promise((resolver) => setTimeout(resolver, esperaMs));
  }
  throw new Error(`El servidor en ${url} no respondió tras ${intentos * esperaMs}ms`);
}

/** Mata un proceso de servidor iniciado con iniciarServidor. */
export function detenerServidor(proceso) {
  if (proceso && !proceso.killed) {
    proceso.kill('SIGTERM');
  }
}

// Modo CLI: node visual/servidores.mjs <carpeta> <puerto>
// Levanta un único servidor, espera a que responda y queda corriendo hasta Ctrl+C.
// Útil para preparar manualmente BASE_URL o CAND_URL antes de `npm run visual`.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [, , carpeta, puerto] = process.argv;
  if (!carpeta || !puerto) {
    console.error('Uso: node visual/servidores.mjs <carpeta> <puerto>');
    process.exit(1);
  }

  const proceso = iniciarServidor(carpeta, Number(puerto));
  await esperarServidor(`http://localhost:${puerto}`);
  console.log(`Servidor listo en http://localhost:${puerto} (pid ${proceso.pid})`);

  const apagar = () => {
    detenerServidor(proceso);
    process.exit(0);
  };
  process.on('SIGINT', apagar);
  process.on('SIGTERM', apagar);
}
