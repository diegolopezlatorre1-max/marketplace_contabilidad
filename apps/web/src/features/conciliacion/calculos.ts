import { aCentavos, deCentavos } from '../contabilidad/lib/formato';

const PATRON_MONTO = /^\d{1,16}(\.\d{1,2})?$/;

/** Normaliza lo que escribe el usuario ("100.000,50" no; "100000,50" -> "100000.50"). */
export function normalizarMonto(texto: string): string {
  return texto.trim().replace(',', '.');
}

export function esMontoValido(texto: string): boolean {
  const monto = normalizarMonto(texto);
  return PATRON_MONTO.test(monto) && aCentavos(monto) > 0n;
}

/**
 * Vista previa de la conciliación mientras el contador arma el asistente. Solo se
 * puede calcular si todas las órdenes tienen valor: sin valor, la API aplica el
 * saldo pendiente de la orden, que la pantalla no conoce. La API recalcula siempre.
 */
export function vistaPrevia(
  valorPago: string,
  valoresAplicados: readonly string[],
): { aplicado: string; diferencia: string; estado: 'CONCILIADA' | 'PENDIENTE' } | null {
  if (valoresAplicados.length === 0 || !valoresAplicados.every(esMontoValido)) return null;
  const aplicado = valoresAplicados.reduce((t, v) => t + aCentavos(normalizarMonto(v)), 0n);
  const diferencia = aCentavos(valorPago) - aplicado;
  return {
    aplicado: deCentavos(aplicado),
    diferencia: diferencia < 0n ? `-${deCentavos(-diferencia)}` : deCentavos(diferencia),
    estado: diferencia === 0n ? 'CONCILIADA' : 'PENDIENTE',
  };
}
