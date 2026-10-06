/** Inicio de sesión de desarrollo (AUTH_MODE=mock en la API). No se usa dentro del marketplace. */
const OPCIONES = [
  { token: 'mock-contador', label: 'Contador' },
  { token: 'mock-admin', label: 'Administrador financiero' },
];

export function MockLogin({ onLogin }: { onLogin: (token: string) => void }) {
  return (
    <div className="ct-login">
      <section className="ct-card">
        <h1>Contabilidad · Marketplace</h1>
        <p>Modo desarrollo: seleccione un rol para ingresar.</p>
        <div className="ct-login-actions">
          {OPCIONES.map((o) => (
            <button key={o.token} type="button" onClick={() => onLogin(o.token)}>
              Ingresar como {o.label}
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}
