import type { EstadoCuenta } from '../types';

const ETIQUETAS: Record<EstadoCuenta, string> = {
  PENDIENTE: 'Pendiente',
  PARCIAL: 'Parcial',
  PAGADO: 'Pagado',
};

export function EstadoBadge({ estado }: { estado: EstadoCuenta }) {
  return <span className={`cp-badge cp-badge--${estado.toLowerCase()}`}>{ETIQUETAS[estado]}</span>;
}
