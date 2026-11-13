import { Logger } from '@nestjs/common';

const logger = new Logger('DB');

// Ninguna consulta puede quedarse colgada para siempre: si tarda más de `ms`
// falla con un error claro (y se ve en los logs). Además avisa si es lenta.
export function withTimeout<T>(
  promise: Promise<T>,
  label: string,
  ms = 8000,
): Promise<T> {
  const t0 = Date.now();
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      logger.error(`[db] ${label} sin respuesta tras ${ms}ms (timeout)`);
      reject(new Error(`Timeout de base de datos: ${label}`));
    }, ms);
  });
  return Promise.race([promise, timeout]).finally(() => {
    clearTimeout(timer);
    const took = Date.now() - t0;
    if (took > 1000 && took < ms) logger.warn(`[db] ${label} lenta: ${took}ms`);
  });
}
