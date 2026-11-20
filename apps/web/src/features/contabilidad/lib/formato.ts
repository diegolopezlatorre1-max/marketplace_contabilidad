function partir(valor: string): { entero: string; decimales: string } {
  const [entero = '0', decimales = ''] = valor.split('.');
  return { entero, decimales };
}

/** "100000.50" -> 10000050n */
export function aCentavos(valor: string): bigint {
  const { entero, decimales } = partir(valor);
  return BigInt(entero + decimales.padEnd(2, '0').slice(0, 2));
}

export function deCentavos(centavos: bigint): string {
  const s = centavos.toString().padStart(3, '0');
  return `${s.slice(0, -2)}.${s.slice(-2)}`;
}

export function sumar(valores: string[]): string {
  return deCentavos(valores.reduce((acc, v) => acc + aCentavos(v), 0n));
}

/** "1234567.5" -> "$ 1.234.567,50" */
export function formatoCOP(valor: string): string {
  const { entero, decimales } = partir(valor);
  const miles = entero.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `$ ${miles},${decimales.padEnd(2, '0')}`;
}

export function formatoPorcentaje(valor: string): string {
  return `${Number(valor)} %`;
}
