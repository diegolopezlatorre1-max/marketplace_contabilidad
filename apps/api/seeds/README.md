# Seeds de desarrollo

Datos de ejemplo para desarrollo y demos (`npm run db:seed`). Nunca se cargan en
producción.

- Archivos `NNN_descripcion.sql`, ejecutados en orden y en una sola transacción.
- Se ejecutan **cada vez** (no se registran como las migraciones): cada archivo debe
  ser idempotente (`ON CONFLICT DO NOTHING`, `WHERE NOT EXISTS`).
- Solo datos: el esquema se crea con las migraciones (`npm run db:migrate`).
- Cada historia agrega sus seeds. Por ejemplo, HU-CON-09 agrega
  `010_comision_global.sql`: comisión global del 10 % vigente desde 2026-01-01.
- Las ventas de ejemplo no se insertan por SQL: se generan con el simulador de
  Órdenes (HU-CON-01) para recorrer el flujo real.
