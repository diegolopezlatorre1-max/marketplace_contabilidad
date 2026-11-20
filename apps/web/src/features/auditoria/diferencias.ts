/** Una propiedad de un registro auditado con su valor antes y después del cambio. */
export interface Diferencia {
  /** Ruta de la propiedad, p. ej. "pago.aplicaciones[0].saldoNuevo". */
  campo: string;
  antes: string | null;
  despues: string | null;
  cambio: boolean;
}

function texto(valor: unknown): string {
  return typeof valor === 'string' ? valor : JSON.stringify(valor);
}

/** Aplana un JSON a { "a.b[0].c": valor } con valores primitivos. */
function aplanar(valor: unknown, prefijo = '', salida = new Map<string, string>()) {
  if (valor === null || valor === undefined) {
    if (prefijo) salida.set(prefijo, texto(valor ?? null));
    return salida;
  }
  if (Array.isArray(valor)) {
    if (valor.length === 0 && prefijo) salida.set(prefijo, '[]');
    valor.forEach((v, i) => aplanar(v, `${prefijo}[${i}]`, salida));
    return salida;
  }
  if (typeof valor === 'object') {
    const entradas = Object.entries(valor as Record<string, unknown>);
    if (entradas.length === 0 && prefijo) salida.set(prefijo, '{}');
    entradas.forEach(([k, v]) => aplanar(v, prefijo ? `${prefijo}.${k}` : k, salida));
    return salida;
  }
  salida.set(prefijo || '(valor)', texto(valor));
  return salida;
}

/**
 * HU-CON-11: compara los valores antes y después de un cambio, propiedad por propiedad, en el
 * orden en que aparecen (primero las de antes y luego las nuevas).
 */
export function diferencias(antes: unknown, despues: unknown): Diferencia[] {
  const a = aplanar(antes);
  const d = aplanar(despues);
  const campos = [...new Set([...a.keys(), ...d.keys()])];
  return campos.map((campo) => {
    const va = a.get(campo) ?? null;
    const vd = d.get(campo) ?? null;
    return { campo, antes: va, despues: vd, cambio: va !== vd };
  });
}
