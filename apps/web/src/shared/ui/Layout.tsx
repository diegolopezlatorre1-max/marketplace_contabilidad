import { NavLink, Outlet } from 'react-router-dom';
import type { Rol } from '@contabilidad/contracts';
import { useModulo } from '../auth/ModuloContext';
import { rutaDelModulo } from './rutas';

interface ItemMenu {
  to: string;
  label: string;
  roles: Rol[];
  /** Sprint en el que se habilita (las opciones futuras se muestran deshabilitadas). */
  sprint?: number;
}

const MENU: ItemMenu[] = [
  { to: '.', label: 'Inicio', roles: ['ADMIN'] },
  { to: 'ventas', label: 'Ventas', roles: ['ADMIN'] },
  { to: 'configuracion/comision', label: 'Comisión', roles: ['ADMIN'] },
  { to: 'cuentas-por-pagar', label: 'Cuentas por pagar', roles: ['ADMIN'] },
  { to: 'pagos-vendedor', label: 'Pagos a vendedores', roles: ['ADMIN'] },
  { to: 'vendedores', label: 'Estado por vendedor', roles: ['ADMIN'] },
  { to: 'conciliaciones', label: 'Conciliación', roles: ['ADMIN'] },
  { to: 'ajustes', label: 'Ajustes', roles: ['ADMIN'] },
  { to: 'reportes/ingresos', label: 'Reportes', roles: ['ADMIN'] },
  { to: 'auditoria', label: 'Auditoría', roles: ['ADMIN'] },
  { to: 'documentacion-api', label: 'Documentación API', roles: ['ADMIN'] },
];

export function Layout() {
  const { usuario, onLogout, basePath } = useModulo();
  const visibles = MENU.filter((i) => i.roles.some((r) => usuario.roles.includes(r)));

  return (
    <div className="ct-layout">
      <aside className="ct-sidebar">
        <h1 className="ct-brand">Contabilidad</h1>
        <nav>
          <ul>
            {visibles.map((item) => (
              <li key={item.to}>
                {item.sprint ? (
                  <span
                    className="ct-nav-disabled"
                    title={`Disponible en el Sprint ${item.sprint}`}
                  >
                    {item.label}
                    <small>Sprint {item.sprint}</small>
                  </span>
                ) : (
                  <NavLink to={rutaDelModulo(basePath, item.to)} end>
                    {item.label}
                  </NavLink>
                )}
              </li>
            ))}
          </ul>
        </nav>
      </aside>
      <div className="ct-main">
        <header className="ct-header">
          <span>
            {usuario.nombre} · <strong>{usuario.roles.join(', ')}</strong>
          </span>
          {onLogout && (
            <button type="button" onClick={onLogout}>
              Salir
            </button>
          )}
        </header>
        <main className="ct-content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
