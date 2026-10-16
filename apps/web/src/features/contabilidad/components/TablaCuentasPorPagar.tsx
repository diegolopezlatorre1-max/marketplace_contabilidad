import { formatoCOP, sumar } from '../lib/formato';
import type { CuentaPorPagarFila } from '../types';
import { EstadoBadge } from './EstadoBadge';

interface Props {
  filas: CuentaPorPagarFila[];
  /** Abre las ventas que componen la cuenta; sin él el vendedor no es seleccionable. */
  onSeleccionar?: ((fila: CuentaPorPagarFila) => void) | undefined;
  /** Clave `${vendedorId}-${periodo}` de la cuenta abierta. */
  seleccionada?: string | undefined;
}

export function TablaCuentasPorPagar({ filas, onSeleccionar, seleccionada }: Props) {
  if (filas.length === 0) return <p className="cp-vacio">No hay cuentas con ese filtro.</p>;
  return (
    <div className="cp-scroll">
      <table className="cp-tabla">
        <thead>
          <tr>
            <th>Vendedor</th>
            <th>Periodo</th>
            <th className="cp-num">Total neto</th>
            <th className="cp-num">Pagado</th>
            <th className="cp-num">Saldo pendiente</th>
            <th>Estado</th>
          </tr>
        </thead>
        <tbody>
          {filas.map((f) => {
            const clave = `${f.vendedorId}-${f.periodo}`;
            return (
              <tr key={clave} className={clave === seleccionada ? 'cp-fila-activa' : undefined}>
                <td>
                  {onSeleccionar ? (
                    <button
                      type="button"
                      className="cp-enlace"
                      aria-expanded={clave === seleccionada}
                      onClick={() => onSeleccionar(f)}
                    >
                      {f.vendedorNombre}
                    </button>
                  ) : (
                    f.vendedorNombre
                  )}
                </td>
                <td>{f.periodo}</td>
                <td className="cp-num">{formatoCOP(f.totalNeto)}</td>
                <td className="cp-num">{formatoCOP(f.valorPagado)}</td>
                <td className="cp-num">{formatoCOP(f.saldoPendiente)}</td>
                <td>
                  <EstadoBadge estado={f.estado} />
                </td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr>
            <td colSpan={2}>Totales</td>
            <td className="cp-num">{formatoCOP(sumar(filas.map((f) => f.totalNeto)))}</td>
            <td className="cp-num">{formatoCOP(sumar(filas.map((f) => f.valorPagado)))}</td>
            <td className="cp-num">{formatoCOP(sumar(filas.map((f) => f.saldoPendiente)))}</td>
            <td />
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
