> Estado operativo posterior: intento de despliegue revertido por HTTPError; la regla NO está activa y es NO-GO para probarla. Ver DESPLIEGUE_RENTABILIDAD_REVERTIDO.md. La validación técnica descrita abajo es anterior al intento.

# Validación PostgreSQL nativo/Linux — control de rentabilidad en ventas

Fecha: 2026-10-13 (America/Lima). Resultado: GO PARA DESPLIEGUE CONTROLADO EN WEB PILOTO.
Estado: validado y procedimiento preparado. NO desplegado, NO conectado al VPS.

## Resultado final

| Batería | Aprobadas | Fallidas | Omitidas |
|---|---:|---:|---:|
| Regresión WEB Linux (incluye suites nativas previas) | 300 | 0 | 0 |
| Rentabilidad PostgreSQL nativo + concurrencia | 22 | 0 | 0 |
| Servidor production/global RLS sin adaptador | 16 | 0 | 0 |
| Total de esta validación | 338 | 0 | 0 |

Conteo según Node, incluidas pruebas contenedoras. No se suman las 176 pruebas Windows anteriores a este total. El log nativo final contiene juntas las 38 pruebas de sus dos perfiles.

## Entorno e identidad del candidato

Ubuntu 24.04, Node v24.21.0, PostgreSQL 16.15 nativo. Contenedor nuevo eduxfac-profit-native-20261013, imagen local eduxfac-fase11-code:local. Network=none, sin puertos publicados ni montajes del host. PostgreSQL en clusters nuevos y puertos loopback efímeros, nunca bases instaladas ni PILOTO real.
Se copiaron fuente/pruebas oficiales WEB desde D:, excluyendo .env, datos, node_modules y clusters históricos. 91 archivos de fuente/pruebas/paquetes coinciden por SHA256 antes y después. Los cuatro archivos funcionales conservan exactamente los hashes del candidato aprobado localmente; no se corrigió ni cambió código funcional durante esta validación.

Las suites base usan PostgreSQL nativo con conexiones independientes. La batería RLS lanza server/start.mjs en un proceso separado NODE_ENV=production, sin installTestDatabase, con modo DEMO y marcador DEMO en la base ficticia. Usa cinco roles separados NOSUPER/NOBYPASS; tenant/auth/service no poseen tablas. Planes y suscripciones ficticias vigentes completan la fixture.
El esquema tiene 49 tablas, 44 con ENABLE/FORCE RLS. Se probó aislamiento por empresa/sucursal y limpieza de contexto de conexión.

## Escenarios aprobados

- Utilidad positiva: venta permitida, descuento correcto de unidades base, ingreso de caja y utilidad exacta.
- Utilidad cero y negativa: HTTP 422 y rollback total; snapshots de stock, venta/detalles, pagos y caja iguales antes/después.
- Costo ausente/no verificable: bloqueo y mensaje específico; no se registra utilidad ficticia. Costo cero documentado también probado.
- Carrito mixto: una línea con pérdida bloquea toda la venta; no compensa con otro producto/precio rentable.
- Descuentos: control sobre importe neto real; descuentos que anulan/eliminan margen se bloquean.
- Unidad/blíster/caja: costo proporcional. Factores/presentaciones inventados y cantidades submilésimas rechazados.
- Varios lotes FEFO: costo de las unidades realmente consumidas; el blíster dividido en tres lotes no pierde costo por cantidades 0.333.
- POST /api/sales directo con costo/utilidad/override falsos: sin bypass.
- Concurrencia: dos requests simultáneos contra un lote barato y otro caro. Solo una venta con utilidad 4 se confirma; la otra recibe 422. Queda consumido únicamente el lote barato; una venta/un pago/un ingreso neto de caja. También probado en el perfil global RLS.
- Administrador y cajero/vendedor: mismo bloqueo, ninguna excepción.
- Compras/inventario/caja/ventas: regresión conservada. Compra normal bajo RLS aprobada.
- Devolución parcial y anulación total: operativas; anulación también verificada bajo RLS.
- API/SQL no leen/escriben empresa B; contexto tenant se limpia tras rollback.
- Modal y transporte de detalle de error: pruebas frontend conservadas.

## Archivos definitivos de aplicación

- server/src/app.js
- server/src/sale-profitability.js
- public/index.html
- public/sale-profitability.js

Hashes definitivos: ver operations/profitability-deploy/MANIFEST.json y CONTROL_RENTABILIDAD_VENTAS_CANDIDATO.json.
Las pruebas nuevas/fixtures se añadieron solo en D:; están protegidas para ejecutarse únicamente con EDUXFAC_PROFIT_NATIVE=yes en laboratorio Linux Docker.

## Riesgos y bloqueantes

No se detectaron fallos funcionales, bypass de rentabilidad, alteraciones tras bloqueos ni regresiones en las baterías finales.
La regla impedirá vender productos sin costo verificable; es el comportamiento expresamente solicitado. No se modifican sus costos para evitar el bloqueo.
Queda pendiente la aceptación visual del usuario y el smoke posterior cuando autorice desplegar. No se usó edwinpiloto, sus credenciales o datos reales. Los tests UI usan DOM controlado.
El despliegue requiere un reinicio breve exclusivamente de WEB PILOTO, porque el backend y HTML/CSP se cargan al iniciar. La fase de validación no lo reinició.
Se debe volver a cotejar el estado VPS antes de aplicar; el preparador se detiene si los archivos base/roles de proceso no son los esperados. No forzar ese control.

## Procedimiento preparado, NO ejecutado

Paquete local sin ZIP: operations/profitability-deploy/.
Contiene payload/ con los cuatro archivos exactos, MANIFEST.json, APPLY_RENTABILIDAD.py y ROLLBACK_RENTABILIDAD.py. Scripts compilados/inspeccionados sin ejecutarlos; no se enviaron al VPS.

Después de una autorización posterior:
1. Consultar READ-ONLY proceso/rutas/hashes VPS. Conservar backups anteriores y no usar credenciales del cliente.
2. Crear una carpeta privada NUEVA en /home/eduxadmin/.local/share/eduxfac/ y subir únicamente este paquete sin ZIP.
3. Comparar hashes D:/payload/VPS y revisar scripts. BEFORE.json aún no debe existir.
4. Ejecutar APPLY_RENTABILIDAD.py --apply como eduxadmin, sin sudo.
5. El script verifica baseline, sintaxis y proceso PM2 4; respalda exactamente los archivos preexistentes, registra SHA256/modes, instala solo los cuatro y reinicia WEB PILOTO sin cambiar entorno.
6. Verifica health 200/PILOTO, HTML/asset/hashes CSP, tres HTTPS 200 y procesos PANEL/WEB anterior intactos. Si falla, restaura automáticamente solo su alcance y se detiene.
7. Registrar smoke/aceptación por interfaz normal, sin restablecer contraseña ni crear otro cliente desde base de datos.

Comandos futuros en SSH, SOLO tras autorizar el despliegue y subir a esa ruta:
```bash
/usr/bin/python3 /home/eduxadmin/.local/share/eduxfac/profitability_deploy_20261013_validado/APPLY_RENTABILIDAD.py --apply
```
Rollback futuro:
```bash
/usr/bin/python3 /home/eduxadmin/.local/share/eduxfac/profitability_deploy_20261013_validado/ROLLBACK_RENTABILIDAD.py --apply
```

Rollback conserva originales verificados, restaura app.js/index.html previos y retira exclusivamente los dos módulos nuevos si sus hashes no cambiaron. Reinicia únicamente WEB PILOTO. No solicita contraseña ni ejecuta sudo, SQL, migraciones, Nginx o Certbot.

## Evidencias y cierre

- REGRESION_RENTABILIDAD_LINUX.log: 300/300.
- PRUEBAS_RENTABILIDAD_NATIVO_LINUX.log: 38/38.
- PRUEBAS_RENTABILIDAD_RLS_LINUX.log: detalle de 16/16.
- RENTABILIDAD_MANIFEST_LINUX.json: 91 hashes iguales.
- El contenedor nuevo quedó detenido tras terminar pruebas (sin procesos WEB/PostgreSQL activos). Exit 137 corresponde a detener el sleep de laboratorio; OOM=false. Las pruebas terminaron con código 0 antes de detenerlo.
- Se conservaron los clusters ficticios/evidencias en el contenedor detenido, sin borrar/rehacer respaldos.

NO se modificó VPS, base PILOTO real, PANEL, Nginx, certificados, bases del sistema ni datos reales. NO ZIP. GO autoriza técnicamente preparar el despliegue; no equivale a haberlo ejecutado.
