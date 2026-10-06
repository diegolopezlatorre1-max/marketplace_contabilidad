import type { ReactNode } from 'react';
import type { Rol } from '@contabilidad/contracts';
import { useTieneRol } from './ModuloContext';

/** Guarda de ruta por rol. La API vuelve a validar el rol: esto solo mejora la experiencia. */
export function RequireRole({ roles, children }: { roles: Rol[]; children: ReactNode }) {
  if (!useTieneRol(...roles)) {
    return (
      <section className="ct-card">
        <h2>Acceso restringido</h2>
        <p>Su rol no tiene permisos para ver esta sección.</p>
      </section>
    );
  }
  return <>{children}</>;
}
