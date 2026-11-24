import 'dotenv/config';
import { parseArgs } from 'node:util';
import { MockPaymentsGateway } from '../src/infrastructure/integration/payments/MockPaymentsGateway';

/**
 * Simulador de la pasarela / módulo de Pagos (HU-CON-04): envía eventos pago.recibido
 * a la API en ejecución (npm run dev:api) con el token mock-sistema, o con --api-key <clave de servicio>.
 *
 *   npm run simular:pago -- --valor 150000 --ordenes ORD-1,ORD-2   pago que se concilia solo
 *   npm run simular:pago -- --valor 95000                         pago sin órdenes (bandeja)
 *   npm run simular:pago -- --referencia PSE-1 --repetir 2        reenvío (YA_PROCESADO)
 */
const { values } = parseArgs({
  options: {
    url: { type: 'string', default: `http://localhost:${process.env.PORT ?? 3000}` },
    token: { type: 'string', default: 'mock-sistema' },
    // Clave de servicio (x-api-key); si se indica, reemplaza al token.
    'api-key': { type: 'string' },
    referencia: { type: 'string' },
    valor: { type: 'string' },
    ordenes: { type: 'string' },
    fecha: { type: 'string' },
    repetir: { type: 'string', default: '1' },
  },
});

const ordenes = values.ordenes
  ?.split(',')
  .map((s) => s.trim())
  .filter(Boolean);
const evento = new MockPaymentsGateway().generarPagoRecibido({
  ...(values.referencia ? { referencia: values.referencia } : {}),
  ...(values.valor ? { valor: Number(values.valor).toFixed(2) } : {}),
  ...(ordenes?.length ? { ordenes } : {}),
  ...(values.fecha ? { fecha: new Date(values.fecha) } : {}),
});
const endpoint = `${values.url}/api/contabilidad/eventos/pago-recibido`;

for (let intento = 1; intento <= Number(values.repetir); intento++) {
  let res: Response;
  try {
    res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(values['api-key']
          ? { 'x-api-key': values['api-key'] }
          : { authorization: `Bearer ${values.token}` }),
      },
      body: JSON.stringify(evento),
    });
  } catch {
    console.error(`No se pudo conectar a ${endpoint}. ¿Está corriendo npm run dev:api?`);
    process.exit(1);
  }
  console.log(
    `${evento.referenciaPasarela} ${evento.valor} [${evento.ordenes?.join(', ') ?? 'sin órdenes'}] -> HTTP ${res.status}`,
    JSON.stringify(await res.json()),
  );
}
