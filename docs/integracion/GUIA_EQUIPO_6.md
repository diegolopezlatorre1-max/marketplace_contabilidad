# GUÍA DE TRABAJO BACKEND - EQUIPO 6: CONTABILIDAD
**Arquitectura:** Backend Node.js 20+, Express 5, TypeScript y PostgreSQL 16 administrado por Supabase | **Proyecto:** Marketplace USC - Construcción de Software II  
**Destinatario:** Equipo 6  
**Fuentes funcionales:** `requerimientos-modulo-contabilidad.txt` y `F01_Historias_Usuario_Contabilidad.xlsx`

---

## 1. Rol del Módulo y Responsabilidades

Contabilidad es responsable de registrar ventas confirmadas, calcular comisiones, controlar cuentas por pagar a vendedores, conciliar pagos recibidos, registrar ajustes y pagos a vendedores, producir reportes y conservar auditoría.

### Roles de usuario

- **Admin:** configura las comisiones y consulta la auditoría; además puede realizar las operaciones contables autorizadas.
- **Comprador:** consulta sus pedidos y notificaciones; no opera funciones internas de contabilidad.
- **Vendedor:** consulta el estado de sus cuentas y los pagos recibidos.

Los módulos que envían eventos se identifican por el origen del evento, no son roles de usuario. En esta guía, “CONTADOR” y “ADMIN_FINANCIERO” del requerimiento fuente se consolidan bajo el rol **Admin**.

### Límites de alcance

Quedan fuera de este módulo la facturación electrónica DIAN, IVA y retenciones, nómina y contabilidad general. La moneda es COP. Los cálculos monetarios usan precisión decimal, nunca `float`/`number` binario como fuente de verdad, con redondeo HALF_UP a dos decimales.

---

## 2. Reglas contables que deben conservarse

1. Registrar una venta solo cuando la orden está confirmada; no duplicar órdenes.
2. En una orden con varios vendedores, generar un registro por pareja `(orden, vendedor)`.
3. Aplicar el porcentaje de comisión vigente a la fecha de la venta. Guardar el porcentaje usado; un cambio futuro no recalcula ventas históricas.
4. Mantener `bruto = comisión + neto` y por vendedor `vendido - comisión - ajustes = pagado + pendiente`.
5. Agrupar cuentas por pagar por quincena, en zona horaria `America/Bogota`: días 1–15 y 16–fin de mes.
6. Al pagar, descontar primero saldos a favor del marketplace y luego aplicar FIFO a las cuentas pendientes más antiguas. No permitir pagar más de lo adeudado.
7. Los ajustes requieren una orden existente, motivo, fecha y valor. Usar el porcentaje original de comisión para reversar comisión y neto; admitir devoluciones parciales hasta el saldo no ajustado. Si la cuenta ya se pagó, crear saldo a favor del marketplace.
8. Las operaciones que cambian varias filas deben ser transaccionales y seguras ante reintentos y concurrencia.

---

## 3. Historias de usuario y secuencia de entrega

| Sprint | Historias | Resultado esperado |
|---|---|---|
| 1 | HU-CON-09, 01, 02, 03 | Vigencias de comisión; registro de ventas; comisión/neto; cuentas pendientes por quincena. |
| 2 | HU-CON-06, 04a, 04b, 05 | Ajustes; relación de pagos recibidos con órdenes; diferencias/estado de conciliación; reporte por periodo. |
| 3 | HU-CON-10, 07, 08, 11 | Pago a vendedor FIFO; estado financiero; exportación Excel; auditoría consultable. |

Las historias y planeación del Excel registran responsables pendientes para gran parte del trabajo; asignen responsable y criterios de aceptación antes de iniciar cada historia. El archivo de requerimientos reporta una versión implementada y pruebas ejecutadas el 6 de noviembre de 2026, mientras que el backlog del Excel conserva estados “Pendiente/Planeado”. Verifiquen el código y la evidencia vigente antes de dar una historia por terminada.

---

## 4. Arquitectura y estructura recomendada

La tecnología indicada es Node.js 20+, Express 5, TypeScript y PostgreSQL 16 con esquema propio `contabilidad`. **La base de datos y la validación de usuarios deben usar Supabase**: Supabase Auth valida la identidad y Supabase PostgreSQL aloja el esquema contable. La arquitectura es hexagonal: el dominio no depende de Express ni PostgreSQL. El alcance es el backend; no se construye interfaz gráfica.

Use precisión decimal para los cálculos y validación de entradas en el backend. Versionen las migraciones. No trasladen reglas de comisión ni asignación FIFO a controladores HTTP.

### Proyecto Supabase y autenticación

1. Usen el proyecto Supabase institucional/compartido que centraliza los usuarios; no creen un almacén de usuarios paralelo para Contabilidad.
2. El cliente envía el access token como `Authorization: Bearer <access_token>`.
3. El backend valida el token con Supabase Auth, por ejemplo con `supabase.auth.getClaims(token)` o `getUser(token)`. Rechacen tokens inválidos o expirados con `401`; nunca confíen en un JWT solo decodificado.
4. Los únicos roles de aplicación son **Admin, Comprador y Vendedor**. 
5. Usen el UUID autenticado como `usuario_id` y verifiquen propiedad de cuenta, orden y vendedor. Comprador no accede a liquidaciones internas; Vendedor consulta solo sus saldos y pagos; Admin opera las funciones internas autorizadas.
6. Mantengan RLS habilitado en las tablas expuestas. Una clave secreta de Supabase puede omitir RLS; si se usa en el backend, cada ruta debe validar token, rol y alcance antes de cada consulta/escritura. La clave secreta solo se almacena en servidor.

Usen el cliente Supabase o la conexión PostgreSQL/pool de Supabase para el esquema contable, transacciones y migraciones, según la operación. Protejan `DATABASE_URL` como secreto. Consulten la documentación oficial de [`getClaims`](https://supabase.com/docs/reference/javascript/auth-getclaims), [`getUser`](https://supabase.com/docs/reference/javascript/auth-getuser) y [RLS](https://supabase.com/docs/guides/database/postgres/row-level-security).

---

## 5. Modelo de datos y restricciones

El esquema debe guardar, como mínimo, la información necesaria para las entidades siguientes. Los nombres exactos de tablas se toman de las migraciones existentes; esta lista es el modelo lógico, no reemplaza el schema versionado del proyecto.

| Entidad | Datos y restricciones principales |
|---|---|
| Configuración de comisión | Porcentaje decimal, fecha de inicio/fin, actor y auditoría. No permitir vigencias solapadas; cambios solo por Admin. |
| Venta contable | Orden, vendedor, fecha, número de orden, bruto, porcentaje aplicado, comisión, neto y estado de conciliación. Unicidad `(orden_id, vendedor_id)`. |
| Cuenta por pagar | Vendedor, periodo quincenal, bruto, comisión, ajustes, pagado, pendiente y estado pendiente/parcial/pagado. |
| Pago recibido / conciliación | Referencia externa, monto, fecha, órdenes asociadas, diferencia y estado conciliado/pendiente. El origen puede ser evento o CSV. |
| Ajuste | Orden/venta existente, motivo, valor, fecha y reversión calculada con porcentaje original. Control de acumulado para no exceder el valor disponible. |
| Pago a vendedor | Vendedor, fecha, valor, referencia, soporte y asignaciones FIFO a cuentas pendientes. |
| Auditoría | Entidad, identificador, usuario, fecha, valores antes/después y correlación. No editable desde el flujo normal. |
| Outbox | Evento pendiente de publicación, payload, intentos y estado. Hoy el outbox se persiste, pero la publicación, reintentos y dead-letter constan como pendientes. |

Use `NUMERIC(18,2)` para importes y precisión decimal para porcentajes. Agregue índices para orden, vendedor, fecha y estado según consultas. Las escrituras que actualizan saldos y registran auditoría deben confirmarse en la misma transacción.

---

## 6. Contratos con otros módulos y API

El módulo recibe ventas confirmadas, pagos recibidos y eventos de cancelación/devolución. El contrato funcional del Excel denomina al primer evento `orden.confirmada v1`; los supuestos S-01..S-03 y el contrato `pago.recibido` deben confirmarse con los equipos productores. Incluyan identificador de evento para deduplicar reintentos y una clave de correlación.

Al completarse un abono a vendedor, Contabilidad debe emitir el evento de pago acreditado para Notificaciones (Equipo 3 en la guía correspondiente). El evento debe identificar al vendedor, monto y orden asociada, conforme HU-NOT-05.

Las guías disponibles para otros equipos documentan estas rutas de integración de escrow:

```text
POST /api/contabilidad/escrow/marcar-entrega/{pedido_id}
POST /api/contabilidad/escrow/bloquear/{pedido_id}
```

La primera activa la retención de 72 horas al confirmarse entrega; la segunda bloquea ante PQR. Validen las rutas, autenticación y respuestas en Swagger antes de conectarlas; el archivo de requisitos contables no define el contrato de escrow ni lista el catálogo completo de endpoints.

Para las funciones de negocio, mantengan las rutas y nombres del OpenAPI del servicio existente. El requerimiento fuente no proporciona rutas REST concretas para todas las historias; no inventen rutas incompatibles con el API ya desplegado. Como cobertura funcional, la API debe permitir administrar comisiones, registrar/consultar ventas, conciliar, registrar ajustes y pagos a vendedor, consultar reportes/estados, exportar Excel y consultar auditoría según los roles Admin, Comprador y Vendedor.

---

## 7. Seguridad, errores y operación

- Cada ruta valida el rol. **Admin** cambia comisiones, consulta auditoría y realiza las operaciones contables permitidas. **Vendedor** solo accede a su propio estado financiero y pagos. **Comprador** no accede a datos contables internos de vendedores ni a funciones administrativas.
- El modo de autenticación de prueba no debe iniciar en producción. La identidad se valida con Supabase Auth; el backend aplica los roles Admin, Comprador y Vendedor.
- Configure CORS y cabeceras de seguridad; limite peticiones y asegure HTTPS/TLS en el despliegue productivo (pendiente en el informe fuente).
- Registre logs JSON con `x-correlation-id`, sin exponer secretos ni datos sensibles innecesarios.
- Mantenga `GET /health` y cierre ordenado del proceso.
- La publicación del outbox, reintentos y dead-letter están marcados pendientes. Mientras no estén implementados, no afirme que los eventos emitidos ya se entregan a otros módulos.
- Los reportes y exportaciones deben contrastarse con las transacciones base. La meta de menos de 5 segundos para 200.000 ventas aún no está medida.

---

## 8. Verificación funcional por historia

- **HU-CON-01/02/03:** evento confirmado idempotente; venta multi-vendedor; comisión vigente y valores bruto/comisión/neto; saldo quincenal exacto.
- **HU-CON-04:** conciliar un pago contra una o varias órdenes; comprobar diferencia y estado, incluidos datos CSV.
- **HU-CON-05/07/08:** filtrar periodos; cuadrar totales contra registros; revisar columnas y valores de Excel.
- **HU-CON-06:** ajuste solo a orden existente; parcialidad, reversión con tasa original y saldo a favor si ya se pagó.
- **HU-CON-09:** autorización por rol, fechas no solapadas y comisión histórica inmutable.
- **HU-CON-10:** FIFO, saldo a favor aplicado primero, pagos parciales, auditoría y rechazo de sobrepago.
- **HU-CON-11:** filtros por entidad, usuario y fecha; valores previos y posteriores visibles solo a Admin.

El informe de requisitos indica 298 pruebas unitarias y 71 de integración pasando el 6 de noviembre de 2026. Esta guía no vuelve a ejecutar pruebas; consulten el pipeline actual al preparar una entrega.

---

## 9. Despliegue y entrega

```text
API Base URL: https://<nombre-del-servicio>.onrender.com/api
Swagger URL:  https://<nombre-del-servicio>.onrender.com/docs
```

Entreguen las URL reales respetando ese formato. Confirmen `GET /health`, Swagger/OpenAPI y estado del despliegue antes de conectar consumidores. Las integraciones de escrow documentadas para otros equipos son `POST /api/contabilidad/escrow/marcar-entrega/{pedido_id}` y `POST /api/contabilidad/escrow/bloquear/{pedido_id}`; confirmen que están disponibles en la versión publicada. Mantengan secretos fuera de Git.

Entreguen al resto de equipos: URL base verificada, Swagger/OpenAPI, contratos de eventos versionados, roles/autenticación, códigos de respuesta y estado de publicación del outbox.

---

## 10. Fuera del alcance

No implementar aquí facturación DIAN, IVA/retenciones, nómina ni contabilidad general. El módulo contabiliza reglas internas del marketplace y saldos de liquidación descritos en los requerimientos.
