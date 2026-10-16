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
  { to: '.', label: 'Inicio', roles: ['CONTADOR', 'ADMIN_FINANCIERO'] },
  { to: 'ventas', label: 'Ventas', roles: ['CONTADOR'] },
  { to: 'configuracion/comision', label: 'Comisión', roles: ['CONTADOR', 'ADMIN_FINANCIERO'] },
  { to: 'cuentas-por-pagar', label: 'Cuentas por pagar', roles: ['CONTADOR'] },
  { to: 'conciliaciones', label: 'Conciliación', roles: ['CONTADOR'], sprint: 2 },
  { to: 'ajustes', label: 'Ajustes', roles: ['CONTADOR'], sprint: 2 },
  {
    to: 'reportes/ingresos',
    label: 'Reportes',
    roles: ['CONTADOR', 'ADMIN_FINANCIERO'],
    sprint: 2,
  },
  { to: 'auditoria', label: 'Auditoría', roles: ['ADMIN_FINANCIERO'], sprint: 3 },
  { to: 'documentacion-api', label: 'Documentación API', roles: ['CONTADOR', 'ADMIN_FINANCIERO'] },
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
