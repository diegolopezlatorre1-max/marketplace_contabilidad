import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useTieneRol } from '../../shared/auth/ModuloContext';
import type { ContabilidadApi } from './data/contabilidadApi';
import { formatoPorcentaje } from './lib/formato';
import type { VigenciaPorcentaje } from './types';
import './contabilidad.css';

/** Hoy en hora de Colombia (AAAA-MM-DD). */
function hoyContable(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(new Date());
}

const mensajeDe = (e: unknown) =>
  e instanceof Error && e.message ? e.message : 'No se pudo completar la operación.';

/** Vigencia que aplica hoy: empezó y no ha terminado (hasta inclusive). */
function vigenteEn(vigencias: VigenciaPorcentaje[], fecha: string) {
  return [...vigencias]
    .sort((a, b) => b.desde.localeCompare(a.desde))
    .find((v) => v.desde <= fecha && (!v.hasta || v.hasta >= fecha));
}

/** HU-CON-09: porcentaje de comisión vigente, cambio (solo ADMIN_FINANCIERO) e historial. */
export function ConfiguracionComisionPanel({ api }: { api: ContabilidadApi }) {
  const puedeConfigurar = useTieneRol('ADMIN_FINANCIERO');
  const [vigencias, setVigencias] = useState<VigenciaPorcentaje[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    setError(null);
    try {
      setVigencias(await api.listarVigencias());
    } catch (e) {
      setError(mensajeDe(e));
    } finally {
      setCargando(false);
    }
  }, [api]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const hoy = hoyContable();
  const vigente = vigenteEn(vigencias, hoy);

  return (
    <section className="cp-panel">
      <header className="cp-header">
        <h1>Comisión del marketplace</h1>
        <p>
          Porcentaje que se descuenta de cada venta. Cada venta conserva el porcentaje vigente en su
          fecha, aunque después se cambie.
        </p>
      </header>

      {error && (
        <p role="alert" className="cp-error">
          {error}
        </p>
      )}

      <div className="cp-tarjeta">
        <span className="cp-etiqueta">Porcentaje vigente hoy</span>
        {cargando ? (
          <p className="cp-nota">Cargando…</p>
        ) : vigente ? (
          <>
            <strong className="cp-destacado">{formatoPorcentaje(vigente.porcentaje)}</strong>
            <span className="cp-nota">
              Global, desde {vigente.desde}
              {vigente.hasta ? ` hasta ${vigente.hasta}` : ''}
            </span>
          </>
        ) : (
          <p className="cp-nota">No hay un porcentaje vigente: las ventas no se pueden liquidar.</p>
        )}
      </div>

      {puedeConfigurar && <FormularioComision api={api} hoy={hoy} onGuardado={cargar} />}

      <h2 className="cp-subtitulo">Historial de vigencias</h2>
      {!cargando && vigencias.length === 0 && (
        <p className="cp-vacio">Todavía no se ha configurado ningún porcentaje.</p>
      )}
      {vigencias.length > 0 && (
        <div className="cp-scroll">
          <table className="cp-tabla">
            <thead>
              <tr>
                <th>Desde</th>
                <th>Hasta</th>
                <th className="cp-num">Porcentaje</th>
                <th>Configurado por</th>
              </tr>
            </thead>
            <tbody>
              {vigencias.map((v) => (
                <tr key={v.desde}>
                  <td>{v.desde}</td>
                  <td>{v.hasta ?? <span className="cp-badge cp-badge--pagado">Vigente</span>}</td>
                  <td className="cp-num">{formatoPorcentaje(v.porcentaje)}</td>
                  <td>{v.creadoPor ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function FormularioComision({
  api,
  hoy,
  onGuardado,
}: {
  api: ContabilidadApi;
  hoy: string;
  onGuardado: () => Promise<void>;
}) {
  const [porcentaje, setPorcentaje] = useState('');
  const [desde, setDesde] = useState(hoy);
  const [guardando, setGuardando] = useState(false);
  const [mensaje, setMensaje] = useState<{ ok: boolean; texto: string } | null>(null);

  async function enviar(e: FormEvent) {
    e.preventDefault();
    setGuardando(true);
    setMensaje(null);
    try {
      const nueva = await api.configurarPorcentaje({
        porcentaje: porcentaje.trim().replace(',', '.'),
        desde,
      });
      setPorcentaje('');
      setMensaje({
        ok: true,
        texto: `Se configuró ${formatoPorcentaje(nueva.porcentaje)} desde ${nueva.desde}.`,
      });
      await onGuardado();
    } catch (err) {
      setMensaje({ ok: false, texto: mensajeDe(err) });
    } finally {
      setGuardando(false);
    }
  }

  return (
    <form className="cp-barra cp-form" onSubmit={enviar}>
      <label className="cp-filtro">
        Nuevo porcentaje (%)
        <input
          inputMode="decimal"
          required
          placeholder="12.5"
          value={porcentaje}
          onChange={(e) => setPorcentaje(e.target.value)}
        />
      </label>
      <label className="cp-filtro">
        Vigente desde
        <input type="date" required value={desde} onChange={(e) => setDesde(e.target.value)} />
      </label>
      <button type="submit" className="cp-boton" disabled={guardando}>
        {guardando ? 'Guardando…' : 'Guardar'}
      </button>
      <p className="cp-nota cp-form-nota">
        La vigencia actual se cerrará el día anterior a la fecha indicada.
      </p>
      {mensaje && (
        <p role="status" className={mensaje.ok ? 'cp-ok' : 'cp-error'}>
          {mensaje.texto}
        </p>
      )}
    </form>
  );
}
