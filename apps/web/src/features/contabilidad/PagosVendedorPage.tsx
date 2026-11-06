import { useCallback, useEffect, useState, type FormEvent } from 'react';
import type { ContabilidadApi } from './data/contabilidadApi';
import { formatoCOP, sumar } from './lib/formato';
import type { PagoVendedorFila, SaldoVendedorFila } from './types';
import './contabilidad.css';

const mensajeDe = (e: unknown) =>
  e instanceof Error && e.message ? e.message : 'No se pudo cargar la información.';

/** Hoy en hora de Colombia (AAAA-MM-DD). */
function hoyContable(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(new Date());
}

/**
 * HU-CON-10: el contador registra el pago hecho a un vendedor y consulta el historial.
 * El pago descuenta primero el saldo a favor del marketplace y se aplica a las cuentas
 * pendientes más antiguas (FIFO por periodo, D-06).
 */
export function PagosVendedorPage({ api }: { api: ContabilidadApi }) {
  const hoy = hoyContable();
  const [saldos, setSaldos] = useState<SaldoVendedorFila[]>([]);
  const [pagos, setPagos] = useState<PagoVendedorFila[]>([]);
  const [desde, setDesde] = useState(`${hoy.slice(0, 7)}-01`);
  const [hasta, setHasta] = useState(hoy);
  const [vendedorFiltro, setVendedorFiltro] = useState('');
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const cargarSaldos = useCallback(async () => {
    setSaldos(await api.resumirPorVendedor());
  }, [api]);

  const cargarPagos = useCallback(async () => {
    setPagos(
      await api.listarPagos({
        desde: desde || undefined,
        hasta: hasta || undefined,
        vendedorId: vendedorFiltro || undefined,
      }),
    );
  }, [api, desde, hasta, vendedorFiltro]);

  useEffect(() => {
    let activo = true;
    setCargando(true);
    setError(null);
    Promise.all([cargarSaldos(), cargarPagos()])
      .catch((e: unknown) => activo && setError(mensajeDe(e)))
      .finally(() => activo && setCargando(false));
    return () => {
      activo = false;
    };
  }, [cargarSaldos, cargarPagos]);

  const conSaldo = saldos.filter((s) => Number(s.saldoPendiente) > 0);
  const nombreDe = (vendedorId: string) =>
    saldos.find((s) => s.vendedorId === vendedorId)?.vendedorNombre ?? vendedorId;

  return (
    <section className="cp-panel">
      <header className="cp-header">
        <h1>Pagos a vendedores</h1>
        <p>
          El pago descuenta primero el saldo a favor del marketplace (devoluciones de ventas ya
          pagadas) y se aplica a las cuentas pendientes más antiguas.
        </p>
      </header>

      <h2 className="cp-subtitulo">Registrar un pago</h2>
      <FormularioPago
        api={api}
        vendedores={conSaldo}
        hoy={hoy}
        onGuardado={async () => {
          await Promise.all([cargarSaldos(), cargarPagos()]);
        }}
      />

      <h2 className="cp-subtitulo">Historial de pagos</h2>
      <div className="cp-barra">
        <label className="cp-filtro">
          Desde
          <input type="date" max={hasta} value={desde} onChange={(e) => setDesde(e.target.value)} />
        </label>
        <label className="cp-filtro">
          Hasta
          <input type="date" min={desde} value={hasta} onChange={(e) => setHasta(e.target.value)} />
        </label>
        <label className="cp-filtro">
          Vendedor
          <select value={vendedorFiltro} onChange={(e) => setVendedorFiltro(e.target.value)}>
            <option value="">Todos</option>
            {saldos.map((s) => (
              <option key={s.vendedorId} value={s.vendedorId}>
                {s.vendedorNombre}
              </option>
            ))}
          </select>
        </label>
      </div>

      {error && (
        <p role="alert" className="cp-error">
          {error}
        </p>
      )}
      {cargando && !error && <p className="cp-vacio">Cargando…</p>}
      {!cargando &&
        !error &&
        (pagos.length === 0 ? (
          <p className="cp-vacio">No hay pagos en el rango.</p>
        ) : (
          <div className="cp-scroll">
            <table className="cp-tabla">
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Vendedor</th>
                  <th>Referencia</th>
                  <th className="cp-num">Valor pagado</th>
                  <th className="cp-num cp-envolver">Saldo a favor descontado</th>
                  <th className="cp-envolver">Cuentas aplicadas</th>
                  <th className="cp-envolver">Soporte</th>
                </tr>
              </thead>
              <tbody>
                {pagos.map((p) => (
                  <tr key={p.id}>
                    <td>{p.fechaContable}</td>
                    <td>{nombreDe(p.vendedorId)}</td>
                    <td>{p.referencia}</td>
                    <td className="cp-num">{formatoCOP(p.valor)}</td>
                    <td className="cp-num">{formatoCOP(p.saldoAFavorAplicado)}</td>
                    <td className="cp-envolver">
                      {p.aplicaciones
                        .map(
                          (a) =>
                            `${a.periodo}: ${formatoCOP(a.valorAplicado)} (${a.estado === 'PAGADO' ? 'pagada' : 'parcial'})`,
                        )
                        .join(' · ')}
                    </td>
                    <td className="cp-envolver">{p.soporte ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={3}>Total ({pagos.length})</td>
                  <td className="cp-num">{formatoCOP(sumar(pagos.map((p) => p.valor)))}</td>
                  <td className="cp-num">
                    {formatoCOP(sumar(pagos.map((p) => p.saldoAFavorAplicado)))}
                  </td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            </table>
          </div>
        ))}
    </section>
  );
}

interface FormularioProps {
  api: ContabilidadApi;
  /** Vendedores con saldo pendiente. */
  vendedores: SaldoVendedorFila[];
  hoy: string;
  onGuardado: () => Promise<void>;
}

function FormularioPago({ api, vendedores, hoy, onGuardado }: FormularioProps) {
  const [vendedorId, setVendedorId] = useState('');
  const [valor, setValor] = useState('');
  const [referencia, setReferencia] = useState('');
  const [soporte, setSoporte] = useState('');
  const [fecha, setFecha] = useState(hoy);
  const [guardando, setGuardando] = useState(false);
  const [mensaje, setMensaje] = useState<{ ok: boolean; texto: string } | null>(null);

  const seleccionado = vendedores.find((v) => v.vendedorId === vendedorId);

  async function enviar(e: FormEvent) {
    e.preventDefault();
    if (!seleccionado) return;
    setGuardando(true);
    setMensaje(null);
    try {
      const pago = await api.registrarPago({
        vendedorId,
        valor: valor.trim().replace(',', '.'),
        referencia: referencia.trim(),
        fecha,
        ...(soporte.trim() ? { soporte: soporte.trim() } : {}),
      });
      const cuentas = pago.aplicaciones
        .map((a) => `${a.periodo} ${a.estado === 'PAGADO' ? 'pagada' : 'con pago parcial'}`)
        .join(', ');
      const descuento =
        Number(pago.saldoAFavorAplicado) > 0
          ? ` Se descontaron ${formatoCOP(pago.saldoAFavorAplicado)} de saldo a favor.`
          : '';
      setMensaje({
        ok: true,
        texto: `Pago de ${formatoCOP(pago.valor)} registrado a ${seleccionado.vendedorNombre}: ${cuentas}.${descuento}`,
      });
      setValor('');
      setReferencia('');
      setSoporte('');
      setVendedorId('');
      await onGuardado();
    } catch (err) {
      setMensaje({ ok: false, texto: mensajeDe(err) });
    } finally {
      setGuardando(false);
    }
  }

  return (
    <>
      <form className="cp-barra cp-form" onSubmit={enviar} aria-label="Registrar pago">
        <label className="cp-filtro">
          Vendedor
          <select required value={vendedorId} onChange={(e) => setVendedorId(e.target.value)}>
            <option value="">Seleccione…</option>
            {vendedores.map((v) => (
              <option key={v.vendedorId} value={v.vendedorId}>
                {v.vendedorNombre} · debe {formatoCOP(v.saldoPendiente)}
              </option>
            ))}
          </select>
        </label>
        <label className="cp-filtro">
          Valor pagado
          <input
            inputMode="decimal"
            required
            placeholder={seleccionado?.saldoPendiente ?? '0.00'}
            value={valor}
            onChange={(e) => setValor(e.target.value)}
          />
        </label>
        <label className="cp-filtro">
          Referencia
          <input
            required
            maxLength={100}
            placeholder="TRF-2026-0001"
            value={referencia}
            onChange={(e) => setReferencia(e.target.value)}
          />
        </label>
        <label className="cp-filtro">
          Soporte (opcional)
          <input
            maxLength={500}
            placeholder="Comprobante 0001.pdf"
            value={soporte}
            onChange={(e) => setSoporte(e.target.value)}
          />
        </label>
        <label className="cp-filtro">
          Fecha
          <input
            type="date"
            required
            max={hoy}
            value={fecha}
            onChange={(e) => setFecha(e.target.value)}
          />
        </label>
        <button type="submit" className="cp-boton" disabled={guardando || !seleccionado}>
          {guardando ? 'Guardando…' : 'Registrar pago'}
        </button>
      </form>
      {vendedores.length === 0 && (
        <p className="cp-vacio">No hay vendedores con saldo pendiente.</p>
      )}
      {mensaje && (
        <p role="status" className={mensaje.ok ? 'cp-ok' : 'cp-error'}>
          {mensaje.texto}
        </p>
      )}
    </>
  );
}
