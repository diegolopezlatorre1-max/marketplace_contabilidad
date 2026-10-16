import { formatoCOP, sumar } from '../lib/formato';
import type { SaldoVendedorFila } from '../types';

/** HU-CON-03: saldo pendiente total por vendedor en el periodo. */
export function TablaSaldosVendedor({ filas }: { filas: SaldoVendedorFila[] }) {
  if (filas.length === 0) return <p className="cp-vacio">No hay saldos en este periodo.</p>;
  return (
    <div className="cp-scroll">
      <table className="cp-tabla">
        <thead>
          <tr>
            <th>Vendedor</th>
            <th className="cp-num">Total neto</th>
            <th className="cp-num">Pagado</th>
            <th className="cp-num">Saldo pendiente</th>
          </tr>
        </thead>
        <tbody>
          {filas.map((f) => (
            <tr key={f.vendedorId}>
              <td>{f.vendedorNombre}</td>
              <td className="cp-num">{formatoCOP(f.totalNeto)}</td>
              <td className="cp-num">{formatoCOP(f.valorPagado)}</td>
              <td className="cp-num">{formatoCOP(f.saldoPendiente)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td>Total a pagar</td>
            <td className="cp-num">{formatoCOP(sumar(filas.map((f) => f.totalNeto)))}</td>
            <td className="cp-num">{formatoCOP(sumar(filas.map((f) => f.valorPagado)))}</td>
            <td className="cp-num">{formatoCOP(sumar(filas.map((f) => f.saldoPendiente)))}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
