const cop = new Intl.NumberFormat('es-CO', {
  style: 'currency',
  currency: 'COP',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/**
 * Formatea un monto que llega de la API como string decimal ("100000.00").
 * Solo se usa para mostrar: el cliente NUNCA opera montos (las sumas las hace la API).
 */
export function formatearMoneda(monto: string): string {
  if (!/^-?\d+(\.\d{1,2})?$/.test(monto)) return monto;
  return cop.format(Number(monto));
}

const fechaHora = new Intl.DateTimeFormat('es-CO', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'America/Bogota',
});

export function formatearFechaHora(iso: string): string {
  const fecha = new Date(iso);
  return Number.isNaN(fecha.getTime()) ? iso : fechaHora.format(fecha);
}
