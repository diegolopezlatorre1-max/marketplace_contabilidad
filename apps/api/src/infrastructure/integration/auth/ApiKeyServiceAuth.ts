import { createHash, timingSafeEqual } from 'node:crypto';
import type { Actor } from '../../../application/security';

/**
 * Autenticación de los módulos del marketplace que envían eventos (Órdenes, Pagos).
 * Cada módulo recibe su propia clave y la envía en la cabecera `x-api-key`.
 * Configuración: SERVICE_API_KEYS="ordenes:clave1,pagos:clave2".
 */
export class ApiKeyServiceAuth {
  private readonly claves: Array<{ modulo: string; hash: Buffer }>;

  constructor(clavesPorModulo: Record<string, string>) {
    this.claves = Object.entries(clavesPorModulo).map(([modulo, clave]) => ({
      modulo,
      hash: sha256(clave),
    }));
  }

  get habilitado(): boolean {
    return this.claves.length > 0;
  }

  /** Devuelve el actor de servicio o null si la clave no corresponde a ningún módulo. */
  autenticar(apiKey: string): Actor | null {
    const recibida = sha256(apiKey);
    // Se comparan todos los hashes en tiempo constante para no revelar qué clave coincide.
    let modulo: string | undefined;
    for (const c of this.claves) {
      if (timingSafeEqual(c.hash, recibida)) modulo = c.modulo;
    }
    if (!modulo) return null;
    return { id: `servicio:${modulo}`, nombre: `Módulo ${modulo}`, roles: [], servicio: modulo };
  }
}

function sha256(valor: string): Buffer {
  return createHash('sha256').update(valor, 'utf8').digest();
}

/** "ordenes:abc,pagos:xyz" → { ordenes: 'abc', pagos: 'xyz' }. Lanza si el formato es inválido. */
export function parseServiceApiKeys(valor: string | undefined): Record<string, string> {
  const resultado: Record<string, string> = {};
  for (const parte of (valor ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)) {
    const i = parte.indexOf(':');
    const modulo = i > 0 ? parte.slice(0, i).trim() : '';
    const clave = i > 0 ? parte.slice(i + 1).trim() : '';
    if (!/^[a-z0-9_-]+$/i.test(modulo) || clave.length < 16) {
      throw new Error(
        'SERVICE_API_KEYS inválido: use "modulo:clave" separados por coma (clave de 16+ caracteres)',
      );
    }
    if (resultado[modulo]) throw new Error(`SERVICE_API_KEYS repite el módulo "${modulo}"`);
    resultado[modulo] = clave;
  }
  return resultado;
}
