import type { EstadoCuenta } from '../types';

export function EstadoBadge({ estado }: { estado: EstadoCuenta }) {
  return (
    <span className={`cp-badge cp-badge--${estado.toLowerCase()}`}>
      {estado === 'PAGADO' ? 'Pagado' : 'Pendiente'}
    </span>
  );
}
