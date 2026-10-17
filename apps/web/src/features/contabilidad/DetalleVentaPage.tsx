import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useTieneRol } from '../../shared/auth/ModuloContext';
import type { ContabilidadApi } from './data/contabilidadApi';
import { aCentavos, deCentavos, formatoCOP, formatoPorcentaje, sumar } from './lib/formato';
import type { AjusteFila, TipoAjuste, VentaDetalle } from './types';
import './contabilidad.css';

const mensajeDe = (e: unknown) =>
  e instanceof Error && e.message ? e.message : 'No se pudo cargar la venta.';

/** Hoy en hora de Colombia (AAAA-MM-DD). */
function hoyContable(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(new Date());
}

interface Props {
  api: ContabilidadApi;
  /** Ruta del listado de ventas, para volver. */
  rutaVolver: string;
}

/**
 * HU-CON-02: desglose de una venta (bruto, % aplicado, comisión y neto).
 * HU-CON-06: historial de ajustes y registro de devoluciones o cancelaciones (contador).
 */
export function DetalleVentaPage({ api, rutaVolver }: Props) {
  const { id = '' } = useParams();
  const puedeAjustar = useTieneRol('CONTADOR');
  const [venta, setVenta] = useState<VentaDetalle | null>(null);
  const [ajustes, setAjustes] = useState<AjusteFila[]>([]);
  const [error, setError] = useState<string | null>(null);

  const cargarAjustes = useCallback(async () => {
    setAjustes(await api.listarAjustes(id));
  }, [api, id]);

  useEffect(() => {
    let activo = true;
    setVenta(null);
    setError(null);
    Promise.all([api.obtenerVenta(id), api.listarAjustes(id)])
      .then(([v, a]) => {
        if (!activo) return;
        setVenta(v);
        setAjustes(a);
      })
      .catch((e: unknown) => activo && setError(mensajeDe(e)));
    return () => {
      activo = false;
    };
  }, [api, id]);

  const cuadra =
    venta && aCentavos(venta.comision) + aCentavos(venta.valorNeto) === aCentavos(venta.valorBruto);
  const ajustado = sumar(ajustes.map((a) => a.valor));
  const porAjustar = venta ? deCentavos(aCentavos(venta.valorBruto) - aCentavos(ajustado)) : '0.00';

  return (
    <section className="cp-panel">
      <header className="cp-header">
        <p>
          <Link className="cp-enlace" to={rutaVolver}>
            ← Volver a ventas
          </Link>
        </p>
        <h1>{venta ? `Venta ${venta.numeroOrden}` : 'Detalle de venta'}</h1>
        {venta && (
          <p>
            {venta.vendedorNombre} · {venta.fecha} · quincena {venta.periodo}
          </p>
        )}
      </header>

      {error && (
        <p role="alert" className="cp-error">
          {error}
        </p>
      )}
      {!venta && !error && <p className="cp-vacio">Cargando…</p>}

      {venta && (
        <>
          <dl className="cp-desglose">
            <div className="cp-tarjeta">
              <dt className="cp-etiqueta">Valor bruto</dt>
              <dd className="cp-destacado">{formatoCOP(venta.valorBruto)}</dd>
            </div>
            <div className="cp-tarjeta">
              <dt className="cp-etiqueta">
                Comisión ({formatoPorcentaje(venta.porcentajeAplicado)})
              </dt>
              <dd className="cp-destacado">{formatoCOP(venta.comision)}</dd>
            </div>
            <div className="cp-tarjeta">
              <dt className="cp-etiqueta">Neto para el vendedor</dt>
              <dd className="cp-destacado">{formatoCOP(venta.valorNeto)}</dd>
            </div>
          </dl>

          <p className={cuadra ? 'cp-ok' : 'cp-error'} role="status">
            {cuadra
              ? 'Control: valor bruto = comisión + neto.'
              : 'Control: la comisión y el neto no suman el valor bruto.'}
          </p>
          <p className="cp-nota">
            El porcentaje es el que regía en la fecha de la venta; un cambio posterior no la altera.
            Estado de la orden: {venta.estadoOrigen}
            {venta.registradoEn &&
              ` · registrada el ${new Date(venta.registradoEn).toLocaleString('es-CO', { timeZone: 'America/Bogota' })}`}
            .
          </p>

          <h2 className="cp-subtitulo">Ajustes por devoluciones o cancelaciones</h2>
          <p className="cp-nota">
            Ajustado: {formatoCOP(ajustado)} · Pendiente por ajustar: {formatoCOP(porAjustar)}. Los
            ajustes no modifican la venta: revierten comisión y neto con el % original y descuentan
            el saldo del vendedor.
          </p>

          {puedeAjustar && aCentavos(porAjustar) > 0n && (
            <FormularioAjuste
              api={api}
              ventaId={venta.id}
              porAjustar={porAjustar}
              minimo={venta.fecha}
              onGuardado={cargarAjustes}
            />
          )}

          {ajustes.length === 0 ? (
            <p className="cp-vacio">Esta venta no tiene ajustes.</p>
          ) : (
            <TablaAjustes filas={ajustes} />
          )}
        </>
      )}
    </section>
  );
}

function TablaAjustes({ filas }: { filas: AjusteFila[] }) {
  return (
    <div className="cp-scroll">
      <table className="cp-tabla">
        <thead>
          <tr>
            <th>Fecha</th>
            <th>Tipo</th>
            <th className="cp-envolver">Motivo</th>
            <th className="cp-num">Valor</th>
            <th className="cp-num cp-envolver">Comisión revertida</th>
            <th className="cp-num cp-envolver">Neto revertido</th>
            <th className="cp-num cp-envolver">Saldo a favor</th>
            <th>Origen</th>
          </tr>
        </thead>
        <tbody>
          {filas.map((a) => (
            <tr key={a.id}>
              <td>{a.fechaContable}</td>
              <td>{a.tipo === 'DEVOLUCION' ? 'Devolución' : 'Cancelación'}</td>
              <td className="cp-envolver">{a.motivo}</td>
              <td className="cp-num">{formatoCOP(a.valor)}</td>
              <td className="cp-num">{formatoCOP(a.comisionRevertida)}</td>
              <td className="cp-num">{formatoCOP(a.netoRevertido)}</td>
              <td className="cp-num">{formatoCOP(a.saldoAFavor)}</td>
              <td className="cp-envolver">
                {a.origen === 'MANUAL' ? `Manual (${a.registradoPor})` : 'Módulo de Órdenes'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function FormularioAjuste({
  api,
  ventaId,
  porAjustar,
  minimo,
  onGuardado,
}: {
  api: ContabilidadApi;
  ventaId: string;
  porAjustar: string;
  minimo: string;
  onGuardado: () => Promise<void>;
}) {
  const hoy = hoyContable();
  const [tipo, setTipo] = useState<TipoAjuste>('DEVOLUCION');
  const [valor, setValor] = useState('');
  const [motivo, setMotivo] = useState('');
  const [fecha, setFecha] = useState(hoy);
  const [guardando, setGuardando] = useState(false);
  const [mensaje, setMensaje] = useState<{ ok: boolean; texto: string } | null>(null);

  async function enviar(e: FormEvent) {
    e.preventDefault();
    setGuardando(true);
    setMensaje(null);
    try {
      const ajuste = await api.registrarAjuste({
        ventaId,
        tipo,
        motivo,
        fecha,
        ...(tipo === 'DEVOLUCION' ? { valor: valor.trim().replace(',', '.') } : {}),
      });
      setValor('');
      setMotivo('');
      setMensaje({
        ok: true,
        texto: `Ajuste registrado: se revirtieron ${formatoCOP(ajuste.netoRevertido)} del saldo del vendedor.`,
      });
      await onGuardado();
    } catch (err) {
      setMensaje({ ok: false, texto: mensajeDe(err) });
    } finally {
      setGuardando(false);
    }
  }

  return (
    <form className="cp-barra cp-form" onSubmit={enviar} aria-label="Registrar ajuste">
      <label className="cp-filtro">
        Tipo
        <select value={tipo} onChange={(e) => setTipo(e.target.value as TipoAjuste)}>
          <option value="DEVOLUCION">Devolución</option>
          <option value="CANCELACION">Cancelación</option>
        </select>
      </label>
      {tipo === 'DEVOLUCION' && (
        <label className="cp-filtro">
          Valor devuelto
          <input
            inputMode="decimal"
            required
            placeholder={porAjustar}
            value={valor}
            onChange={(e) => setValor(e.target.value)}
          />
        </label>
      )}
      <label className="cp-filtro">
        Motivo
        <input
          required
          maxLength={500}
          placeholder="Producto defectuoso"
          value={motivo}
          onChange={(e) => setMotivo(e.target.value)}
        />
      </label>
      <label className="cp-filtro">
        Fecha
        <input
          type="date"
          required
          min={minimo}
          max={hoy}
          value={fecha}
          onChange={(e) => setFecha(e.target.value)}
        />
      </label>
      <button type="submit" className="cp-boton" disabled={guardando}>
        {guardando ? 'Registrando…' : 'Registrar ajuste'}
      </button>
      <p className="cp-nota cp-form-nota">
        {tipo === 'CANCELACION'
          ? `La cancelación revierte todo lo pendiente por ajustar (${formatoCOP(porAjustar)}).`
          : `Puede devolver hasta ${formatoCOP(porAjustar)}.`}
      </p>
      {mensaje && (
        <p role="status" className={mensaje.ok ? 'cp-ok' : 'cp-error'}>
          {mensaje.texto}
        </p>
      )}
    </form>
  );
}
