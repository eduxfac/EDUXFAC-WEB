# Despliegue Ventas por mes — WEB PILOTO

**Resultado: DESPLEGADO. GO para validación manual.**

Cierre: 2026-10-15T08:25:38.645821-05:00 (America/Lima). Cinco archivos funcionales autorizados; candidato validado sin modificaciones. No hubo fallos post-deploy ni se requirió rollback.

## Archivos y SHA256 antes/después

| Archivo | Antes en VPS | Después = candidato D: = VPS |
|---|---|---|
| server/src/app.js | dfb160b96cce099f89283c221a3671affd3357e87f9b528b3bd2bb100c071576 | 3a22cf3c1482aceac2788b86c8318aa9efbe70c9ca66e8e4571fefe861209d90 |
| server/src/monthly-sales.js | No existía | 4f7cea2a35b1ddcd82af4db81178c2fb6502c8cad58122ae9af4cf4efa6a001f |
| public/index.html | 06ad9349541563ef990fcf5c8a7ecf63c5db05b28b2688bfe25aaf8b63f524c1 | c2c01c26cd4cd1298e94223f87a64d9901659ac3516e47927aa57398ffb68e06 |
| public/monthly-sales.js | No existía | 158173086da9c1e5b3b0ef0471a7cf68f2c8da1be5e1acbd33fe28ac7eb44a77 |
| public/desktop-responsive.css | f30b44ebf7936886ec7cb75142149ab4370669d287d65fcf06aa7fef00f4584c | a3e525f414f396b14e7a98edf995bbd631b496acd0ec4a23604625d64e9bcf25 |

Los diez hashes del manifiesto funcional/pruebas siguen iguales a la validación. Solo estos cinco archivos cambiaron dentro de server/public/database del release. No se copiaron pruebas, operaciones o dependencias al directorio de aplicación. El procedimiento y evidencias viven en una carpeta privada externa al release.

## Backup y rollback

- Archivo remoto: /home/eduxadmin/.local/share/eduxfac/monthly_sales_deploy_20261015_131626_7c68b6/backup.tar.gz
- Copia local verificada: D:\EDUXFAC\EDUXFAC WEB\01_TRABAJO_ACTUAL\EDUXFAC_WEB_ACTUAL\operations\monthly-sales\deploy\backup.tar.gz
- SHA256 del archivo comprimido: ce7b9878f78b695c9982c008fc93512ffbedb3dc8da4d803c99a6398d409483a
- Contenido: tres originales, sus permisos y hashes; dos marcadores de ausencia para retirar los módulos nuevos al restaurar; manifiesto. Bytes del archivo comprimido y de cada original comprobados en remoto y tras descargar.
- Rollback preparado: `python3 /home/eduxadmin/.local/share/eduxfac/monthly_sales_deploy_20261015_131626_7c68b6/DEPLOY_MONTHLY.py --rollback`.
- No se ejecutó rollback porque todas las comprobaciones pasaron.

## Health, HTTPS y proceso

- Antes y después: loopback y HTTPS /api/health HTTP 200, ok=true, data_mode=PILOTO.
- app.eduxfac.com y admin.eduxfac.com HTTPS200, sin desactivar verificación TLS. Comprobados también desde la PC (HTTP_FROM_PC.json). HTML/JS/CSS publicados: tres hashes HTTPS iguales a D: y VPS, CSP válida.
- WEB PILOTO PM2 id4, PID 385070, online; contador de reinicios 19 → 20. Solo se reinició ese proceso. Proceso antiguo eduxfac y PANEL PILOTO sin cambios.
- Readiness final: tres muestras consecutivas estables en loopback y HTTPS, mismo PID/contador.

## Pruebas post-deploy

**46 comprobaciones API/SQL aprobadas, 0 fallidas**. Validación sobre el código desplegado y la identidad existente del usuario PILOTO; JWT técnico de cinco minutos generado únicamente en memoria, sin exportarlo ni persistirlo. Peticiones GET y transacciones SQL READ ONLY; no se creó usuario ni se cambió credencial/permiso.

Incluye 44 FORCE RLS, runtime sin superusuario/BYPASSRLS, contexto empresa/usuario/sucursales, ventas de empresa ajena invisibles, sin sesión 401, token inválido 401, sucursal ajena 403, empresa ajena 403, año inválido 400, doce meses, suma anual, zona Lima, equivalencia SQL nativo con RLS y API desplegada, y comparación exacta contra Reportes > Ventas de los doce meses de 2026.

En Inicio real: gráfico semanal intacto (HTML/función comparados byte a byte y render visible); tarjeta mensual presente; Ene–Dic; selector 2026; once meses vacíos con S/0.00; octubre y total anual S/434.40. Se navegó con la cuenta normal a Reportes > Ventas, fechas 01/10/2026–31/10/2026 y PRINCIPAL: Venta total S/434.40, seis tickets; coincidencia también visual y capturada.

Cambio de año y año vacío en API del PILOTO: 2025 y 1900 devuelven doce ceros y total 0. El selector solo ofrece 2026 porque es el único año con datos, más el año actual; no se inyectaron opciones ni se inventaron ventas para forzar otra selección. El cambio interanual del selector ya estaba cubierto por las pruebas UI validadas de Windows.

## Comparación mensual demostrada

| Periodo | Sucursal | Ventas por mes | Reportes > Ventas | Diferencia |
|---|---|---:|---:|---:|
| Octubre 2026 | PRINCIPAL | S/434.40 | S/434.40 | S/0.00 |

Los otros once meses 2026 coinciden en S/0.00. Evidencia: PILOT_API_SQL.json (doce periodos), responsive/pilot-report-comparison.json y pilot-report-october-2026.png.

Anulaciones/devoluciones: los datos reales observados contienen cuatro ventas ANULADA, seis EMITIDA y cuatro devoluciones. La agregación usa reporte_ventas_netas y estados EMITIDA/DEVOLUCION_PARCIAL; excluye anuladas, resta devoluciones de ventas válidas y atribuye el neto al mes original, como el reporte. No se efectuaron anulaciones ni devoluciones nuevas. Solo existen documentos ORDEN: no hay notas de crédito reales para repetir ese escenario en PILOTO; se preservó la lógica validada y su cobertura PostgreSQL/RLS aislada anterior.

## Responsive y rendimiento

| Ancho | Barras | Scroll global | Scroll interno mensual |
|---:|---:|---|---|
| 1920 | 12 | No | No |
| 1366 | 12 | No | No |
| 1024 | 12 | No | Sí |
| 768 | 12 | No | Sí |
| 375 | 12 | No | Sí |

Sin solapamiento de pie ni selector fuera de tarjeta. Capturas PNG y mediciones DOM del PILOTO real en responsive/. Viewport temporal restablecido; Inicio queda abierto.

Tiempos reales de consulta con datos PILOTO (medidos en VPS):
- Primera petición HTTPS autenticada: 295.634 ms.
- Tres peticiones HTTPS posteriores: 49.125, 64.675, 96.254 ms.
- Agregación SQL nativa bajo RLS: 5.348, 3.59, 4.599 ms.

No se cargó volumen ficticio en PILOTO. Las pruebas de 100.000 ventas/10.000 devoluciones pertenecen al laboratorio anterior, no a estas mediciones reales.

## Conservación y dictamen

Las huellas de 48 tablas, políticas RLS, vistas, grants y esquema coinciden antes/después. Ventas históricas, compras, inventario, costos, precios, usuarios y auditoría conservados. Nginx, certificados, PANEL, PostgreSQL global y otros proyectos no se modificaron. Sin migraciones, índices nuevos, instalación de dependencias o generación de datos reales.

**GO para validación manual de Ventas por mes en WEB PILOTO.** Windows 480/480 y laboratorio 36/36 permanecen como evidencia previa del mismo candidato; hoy se validaron 46 comprobaciones API/SQL reales, cinco resoluciones y comparación visual. La cobertura de notas de crédito y selección visual entre años/sucursales adicionales está limitada por los datos actuales del PILOTO, según lo documentado arriba.

RESULT.json contiene el resultado estructurado; BEFORE.json/MANIFEST en REMOTE.json conservan los hashes; BACKUP_VERIFIED.json registra el backup; VERIFY.json/FINAL_VERIFY.json y HTTP_FROM_PC.json documentan integridad y health.
