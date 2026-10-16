import { aCentavos, deCentavos } from '../lib/formato';
import type {
  AjusteFila,
  ComisionFila,
  CuentaPorPagarFila,
  NuevaVenta,
  NuevoAjuste,
  FiltroReporte,
  NuevoPago,
  ReporteIngresos,
  SaldoVendedorFila,
  VentaDetalle,
  VigenciaPorcentaje,
} from '../types';
import type { ContabilidadApi, FiltroCuentas } from './puerto';

/** Error por una regla de negocio incumplida; la pantalla lo muestra tal cual. */
export class ErrorDeNegocio extends Error {
  constructor(mensaje: string) {
    super(mensaje);
    this.name = 'ErrorDeNegocio';
  }
}

const PATRON_MONTO = /^\d{1,16}(\.\d{1,2})?$/;
const PATRON_PORCENTAJE = /^\d{1,3}(\.\d{1,4})?$/;
const PATRON_FECHA = /^(\d{4})-(\d{2})-(\d{2})$/;

function validarFecha(fecha: string): void {
  const m = PATRON_FECHA.exec(fecha);
  const anio = Number(m?.[1]);
  const mes = Number(m?.[2]);
  const dia = Number(m?.[3]);
  const f = new Date(Date.UTC(anio, mes - 1, dia));
  const valida =
    m !== null &&
    f.getUTCFullYear() === anio &&
    f.getUTCMonth() === mes - 1 &&
    f.getUTCDate() === dia;
  if (!valida) throw new ErrorDeNegocio(`Fecha inválida: ${fecha} (use AAAA-MM-DD)`);
}

/** Quincena: días 1 a 15 = Q1, 16 a fin de mes = Q2 (igual que Periodo en la API). */
function periodoDe(fecha: string): string {
  return `${fecha.slice(0, 7)}-Q${Number(fecha.slice(8, 10)) <= 15 ? 1 : 2}`;
}

function textoObligatorio(valor: string, campo: string): string {
  const limpio = valor.trim();
  if (!limpio) throw new ErrorDeNegocio(`${campo} es obligatorio`);
  return limpio;
}

function montoPositivo(valor: string, campo: string): bigint {
  if (!PATRON_MONTO.test(valor)) {
    throw new ErrorDeNegocio(`${campo} inválido: use un número con máximo 2 decimales`);
  }
  const centavos = aCentavos(valor);
  if (centavos <= 0n) throw new ErrorDeNegocio(`${campo} debe ser mayor que cero`);
  return centavos;
}

/** "12.5" -> 125000n (diezmilésimas de punto porcentual; 100 % = 1.000.000n). */
function porcentajeEnDiezMilesimas(valor: string): bigint {
  if (!PATRON_PORCENTAJE.test(valor)) {
    throw new ErrorDeNegocio('Porcentaje inválido: use un número con máximo 4 decimales');
  }
  const [entero = '0', decimales = ''] = valor.split('.');
  const diezmilesimas = BigInt(entero + decimales.padEnd(4, '0'));
  if (diezmilesimas > 1_000_000n)
    throw new ErrorDeNegocio('El porcentaje debe estar entre 0 y 100');
  return diezmilesimas;
}

function textoPorcentaje(diezmilesimas: bigint): string {
  const entero = diezmilesimas / 10_000n;
  const decimales = (diezmilesimas % 10_000n).toString().padStart(4, '0');
  return `${entero}.${decimales}`;
}

/** comisión = bruto × %, redondeo HALF_UP a 2 decimales (misma regla que Money.percentage). */
function calcularComision(brutoCentavos: bigint, diezmilesimas: bigint): bigint {
  return (brutoCentavos * diezmilesimas + 500_000n) / 1_000_000n;
}

interface CuentaInterna {
  vendedorId: string;
  vendedorNombre: string;
  periodo: string;
  totalNeto: bigint;
  pagado: bigint;
}

/** Simula en memoria las reglas de HU-CON-09, 01, 02 y 03 (el dinero siempre en centavos). */
export class AlmacenContabilidad {
  private vigencias: VigenciaPorcentaje[] = [];
  private comisiones: ComisionFila[] = [];
  private registradas = new Map<string, string>();
  private cuentas = new Map<string, CuentaInterna>();
  private ajustes: Array<{ ventaId: string; fila: AjusteFila }> = [];

  // ---- HU-CON-09: porcentaje con vigencia ----
  configurarPorcentaje(vigencia: VigenciaPorcentaje): VigenciaPorcentaje {
    validarFecha(vigencia.desde);
    const normalizado = textoPorcentaje(porcentajeEnDiezMilesimas(vigencia.porcentaje));
    if (this.vigencias.some((v) => v.desde === vigencia.desde)) {
      throw new ErrorDeNegocio(`Ya existe un porcentaje que rige desde ${vigencia.desde}`);
    }
    const nueva = { desde: vigencia.desde, porcentaje: normalizado };
    this.vigencias.push(nueva);
    this.vigencias.sort((a, b) => a.desde.localeCompare(b.desde));
    return nueva;
  }

  listarVigencias(): VigenciaPorcentaje[] {
    return [...this.vigencias].reverse();
  }

  private porcentajeVigente(fecha: string): VigenciaPorcentaje {
    let vigente: VigenciaPorcentaje | undefined;
    for (const v of this.vigencias) if (v.desde <= fecha) vigente = v;
    if (!vigente)
      throw new ErrorDeNegocio(`No hay un porcentaje de comisión vigente para ${fecha}`);
    return vigente;
  }

  // ---- HU-CON-01 + HU-CON-02: registrar venta y calcular comisión ----
  registrarVenta(venta: NuevaVenta): ComisionFila {
    const numeroOrden = textoObligatorio(venta.numeroOrden, 'La orden');
    const vendedorId = textoObligatorio(venta.vendedorId, 'El vendedor');
    const vendedorNombre = textoObligatorio(venta.vendedorNombre, 'El nombre del vendedor');
    validarFecha(venta.fecha);
    const bruto = montoPositivo(venta.valorBruto, 'El valor bruto');

    if (this.comisiones.some((c) => c.numeroOrden === numeroOrden && c.vendedorId === vendedorId)) {
      throw new ErrorDeNegocio(
        `La orden ${numeroOrden} del vendedor ${vendedorId} ya está registrada`,
      );
    }

    const vigente = this.porcentajeVigente(venta.fecha);
    const comision = calcularComision(bruto, porcentajeEnDiezMilesimas(vigente.porcentaje));
    const neto = bruto - comision;
    const periodo = periodoDe(venta.fecha);

    const fila: ComisionFila = {
      id: `venta-${this.comisiones.length + 1}`,
      numeroOrden,
      vendedorId,
      vendedorNombre,
      periodo,
      fecha: venta.fecha,
      valorBruto: deCentavos(bruto),
      porcentajeAplicado: vigente.porcentaje, // snapshot: no cambia si el % cambia después
      comision: deCentavos(comision),
      valorNeto: deCentavos(neto),
    };
    this.comisiones.push(fila);
    this.registradas.set(fila.id, new Date().toISOString());

    // ---- HU-CON-03: la venta alimenta la cuenta del vendedor en esa quincena ----
    const clave = `${vendedorId}|${periodo}`;
    const cuenta = this.cuentas.get(clave) ?? {
      vendedorId,
      vendedorNombre,
      periodo,
      totalNeto: 0n,
      pagado: 0n,
    };
    cuenta.totalNeto += neto;
    this.cuentas.set(clave, cuenta);
    return fila;
  }

  listarComisiones(periodo?: string, vendedorId?: string): ComisionFila[] {
    return this.comisiones
      .filter(
        (c) => (!periodo || c.periodo === periodo) && (!vendedorId || c.vendedorId === vendedorId),
      )
      .sort((a, b) => a.fecha.localeCompare(b.fecha) || a.numeroOrden.localeCompare(b.numeroOrden));
  }

  obtenerVenta(id: string): VentaDetalle {
    const fila = this.comisiones.find((c) => c.id === id);
    if (!fila) throw new ErrorDeNegocio(`No existe la venta ${id}`);
    return { ...fila, estadoOrigen: 'CONFIRMADA', registradoEn: this.registradas.get(id) ?? '' };
  }

  listarPeriodos(): string[] {
    return [...new Set(this.comisiones.map((c) => c.periodo))].sort();
  }

  // ---- HU-CON-03: consulta pendiente / pagado ----
  private aFila(c: CuentaInterna): CuentaPorPagarFila {
    const saldo = c.totalNeto - c.pagado;
    return {
      vendedorId: c.vendedorId,
      vendedorNombre: c.vendedorNombre,
      periodo: c.periodo,
      totalNeto: deCentavos(c.totalNeto),
      valorPagado: deCentavos(c.pagado),
      saldoPendiente: deCentavos(saldo),
      estado: c.totalNeto > 0n && saldo === 0n ? 'PAGADO' : 'PENDIENTE',
    };
  }

  listarCuentasPorPagar({ periodo, estado }: FiltroCuentas): CuentaPorPagarFila[] {
    return [...this.cuentas.values()]
      .map((c) => this.aFila(c))
      .filter((f) => (!periodo || f.periodo === periodo) && (!estado || f.estado === estado))
      .sort(
        (a, b) =>
          a.periodo.localeCompare(b.periodo) || a.vendedorNombre.localeCompare(b.vendedorNombre),
      );
  }

  resumirPorVendedor(periodo?: string): SaldoVendedorFila[] {
    const porVendedor = new Map<
      string,
      { nombre: string; cuentas: number; total: bigint; pagado: bigint }
    >();
    for (const c of this.cuentas.values()) {
      if (periodo && c.periodo !== periodo) continue;
      const a = porVendedor.get(c.vendedorId) ?? {
        nombre: c.vendedorNombre,
        cuentas: 0,
        total: 0n,
        pagado: 0n,
      };
      a.cuentas += 1;
      a.total += c.totalNeto;
      a.pagado += c.pagado;
      porVendedor.set(c.vendedorId, a);
    }
    return [...porVendedor.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([vendedorId, a]) => ({
        vendedorId,
        vendedorNombre: a.nombre,
        cuentas: a.cuentas,
        totalNeto: deCentavos(a.total),
        valorPagado: deCentavos(a.pagado),
        saldoPendiente: deCentavos(a.total - a.pagado),
      }));
  }

  // ---- HU-CON-06: ajustes por devolución o cancelación (D-07) ----
  listarAjustes(ventaId: string): AjusteFila[] {
    return this.ajustes
      .filter((a) => a.ventaId === ventaId)
      .map((a) => a.fila)
      .reverse();
  }

  registrarAjuste(nuevo: NuevoAjuste): AjusteFila {
    const venta = this.comisiones.find((c) => c.id === nuevo.ventaId);
    if (!venta) throw new ErrorDeNegocio(`No existe la venta ${nuevo.ventaId}`);
    const motivo = textoObligatorio(nuevo.motivo, 'El motivo');
    const fecha = nuevo.fecha ?? new Date().toISOString().slice(0, 10);
    validarFecha(fecha);
    if (fecha < venta.fecha) throw new ErrorDeNegocio('El ajuste no puede ser anterior a la venta');

    const previos = this.ajustes.filter((a) => a.ventaId === venta.id).map((a) => a.fila);
    const suma = (campo: 'valor' | 'comisionRevertida' | 'netoRevertido') =>
      previos.reduce((acc, a) => acc + aCentavos(a[campo]), 0n);
    const disponible = aCentavos(venta.valorBruto) - suma('valor');
    if (disponible <= 0n) throw new ErrorDeNegocio('La venta ya está ajustada por completo');

    let valor: bigint;
    if (nuevo.tipo === 'CANCELACION') {
      valor = disponible;
    } else {
      valor = montoPositivo(nuevo.valor ?? '', 'El valor devuelto');
      if (valor > disponible) {
        throw new ErrorDeNegocio(
          `El valor devuelto supera lo que queda por ajustar (${deCentavos(disponible)})`,
        );
      }
    }

    // Mismas reglas que AjusteContable en la API: proporcional, y el último cierra exacto.
    const comisionRestante = aCentavos(venta.comision) - suma('comisionRevertida');
    const netoRestante = aCentavos(venta.valorNeto) - suma('netoRevertido');
    let comision = comisionRestante;
    if (valor !== disponible) {
      const proporcional = calcularComision(
        valor,
        porcentajeEnDiezMilesimas(venta.porcentajeAplicado),
      );
      const minimo = valor - netoRestante;
      comision = proporcional < minimo ? minimo : proporcional;
      if (comision > comisionRestante) comision = comisionRestante;
    }
    const neto = valor - comision;

    const cuenta = this.cuentas.get(`${venta.vendedorId}|${venta.periodo}`)!;
    const pendiente = cuenta.totalNeto - cuenta.pagado;
    const aplicable = neto < pendiente ? neto : pendiente;
    cuenta.totalNeto -= aplicable;

    const fila: AjusteFila = {
      id: `ajuste-${this.ajustes.length + 1}`,
      tipo: nuevo.tipo,
      motivo,
      fechaContable: fecha,
      valor: deCentavos(valor),
      comisionRevertida: deCentavos(comision),
      netoRevertido: deCentavos(neto),
      saldoAFavor: deCentavos(neto - aplicable),
      origen: 'MANUAL',
      registradoPor: 'contador',
    };
    this.ajustes.push({ ventaId: venta.id, fila });
    return fila;
  }

  // ---- HU-CON-05: reporte de ingresos (ajustes por la fecha del ajuste) ----
  obtenerReporte({ desde, hasta, vendedorId }: FiltroReporte): ReporteIngresos {
    validarFecha(desde);
    validarFecha(hasta);
    if (desde > hasta)
      throw new ErrorDeNegocio('La fecha "desde" no puede ser posterior a "hasta"');

    type Suma = { cantidad: number; bruto: bigint; comision: bigint; neto: bigint };
    const cero = (): Suma => ({ cantidad: 0, bruto: 0n, comision: 0n, neto: 0n });
    const dias = new Map<string, { ventas: Suma; ajustes: Suma }>();
    const total = { ventas: cero(), ajustes: cero() };
    const acumular = (
      fecha: string,
      grupo: 'ventas' | 'ajustes',
      bruto: string,
      comision: string,
      neto: string,
    ) => {
      const dia = dias.get(fecha) ?? { ventas: cero(), ajustes: cero() };
      dias.set(fecha, dia);
      for (const s of [dia[grupo], total[grupo]]) {
        s.cantidad += 1;
        s.bruto += aCentavos(bruto);
        s.comision += aCentavos(comision);
        s.neto += aCentavos(neto);
      }
    };
    const enRango = (fecha: string, vendedor: string) =>
      fecha >= desde && fecha <= hasta && (!vendedorId || vendedor === vendedorId);

    for (const v of this.comisiones) {
      if (enRango(v.fecha, v.vendedorId))
        acumular(v.fecha, 'ventas', v.valorBruto, v.comision, v.valorNeto);
    }
    for (const { ventaId, fila: a } of this.ajustes) {
      const venta = this.comisiones.find((c) => c.id === ventaId)!;
      if (enRango(a.fechaContable, venta.vendedorId)) {
        acumular(a.fechaContable, 'ajustes', a.valor, a.comisionRevertida, a.netoRevertido);
      }
    }

    const aTotales = (s: Suma) => ({
      cantidad: s.cantidad,
      valorBruto: deCentavos(s.bruto),
      comision: deCentavos(s.comision),
      valorNeto: deCentavos(s.neto),
    });
    const diferencia = (a: Suma, b: Suma) => ({
      valorBruto: deCentavos(a.bruto - b.bruto),
      comision: deCentavos(a.comision - b.comision),
      valorNeto: deCentavos(a.neto - b.neto),
    });
    const cuadra = (s: Suma) => s.comision + s.neto === s.bruto;
    const ok = cuadra(total.ventas) && cuadra(total.ajustes);

    return {
      desde,
      hasta,
      vendedorId: vendedorId ?? null,
      ventas: aTotales(total.ventas),
      ajustes: aTotales(total.ajustes),
      totales: diferencia(total.ventas, total.ajustes),
      control: {
        cuadra: ok,
        detalle: ok
          ? 'Bruto = comisión + neto en ventas, ajustes y totales'
          : 'No cuadra bruto = comisión + neto',
      },
      porDia: [...dias.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([fecha, d]) => ({
          fecha,
          ventas: aTotales(d.ventas),
          ajustes: aTotales(d.ajustes),
          totales: diferencia(d.ventas, d.ajustes),
        })),
    };
  }

  registrarPago(pago: NuevoPago): CuentaPorPagarFila {
    const cuenta = this.cuentas.get(`${pago.vendedorId}|${pago.periodo}`);
    if (!cuenta) throw new ErrorDeNegocio('No existe una cuenta para ese vendedor y periodo');
    const valor = montoPositivo(pago.valor, 'El pago');
    if (valor > cuenta.totalNeto - cuenta.pagado) {
      throw new ErrorDeNegocio('El pago supera el saldo pendiente');
    }
    cuenta.pagado += valor;
    return this.aFila(cuenta);
  }
}

/** Envuelve el almacén en el puerto asíncrono; `retardoMs` simula la latencia de una API. */
export function crearApiEnMemoria(almacen: AlmacenContabilidad, retardoMs = 0): ContabilidadApi {
  const espera = (): Promise<void> =>
    retardoMs > 0
      ? new Promise<void>((resolver) => setTimeout(resolver, retardoMs))
      : Promise.resolve();

  return {
    async listarPeriodos() {
      await espera();
      return almacen.listarPeriodos();
    },
    async listarVigencias() {
      await espera();
      return almacen.listarVigencias();
    },
    async configurarPorcentaje(vigencia) {
      await espera();
      return almacen.configurarPorcentaje(vigencia);
    },
    async registrarVenta(venta) {
      await espera();
      return almacen.registrarVenta(venta);
    },
    async listarComisiones(periodo, vendedorId) {
      await espera();
      return almacen.listarComisiones(periodo, vendedorId);
    },
    async obtenerVenta(id) {
      await espera();
      return almacen.obtenerVenta(id);
    },
    async listarCuentasPorPagar(filtro) {
      await espera();
      return almacen.listarCuentasPorPagar(filtro);
    },
    async resumirPorVendedor(periodo) {
      await espera();
      return almacen.resumirPorVendedor(periodo);
    },
    async registrarPago(pago) {
      await espera();
      return almacen.registrarPago(pago);
    },
    async listarAjustes(ventaId) {
      await espera();
      return almacen.listarAjustes(ventaId);
    },
    async registrarAjuste(ajuste) {
      await espera();
      return almacen.registrarAjuste(ajuste);
    },
    async obtenerReporte(filtro) {
      await espera();
      return almacen.obtenerReporte(filtro);
    },
  };
}
