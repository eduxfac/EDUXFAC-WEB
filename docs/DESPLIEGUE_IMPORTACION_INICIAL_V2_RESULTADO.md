# Despliegue V2 LF — importación inicial de inventario

GO para prueba manual pequeña con Excel. Despliegue completado únicamente en WEB PILOTO.

## Archivos y hashes
server/src/app.js
Antes: 7c32762622b79f77c5b3cb03ce0bc16f355eaf7c4766d865e6c29aab51ad02ab
Después (D = VPS): 7fd8b9361cfbd54d791aa07cbe160fe7ba69bce7589188c7d27e52e1dc3984ab

server/src/initial-inventory.js
Antes: None
Después (D = VPS): 57abcde45bc6b165875e1f8b6ad6c956e87bc4759a4483476f3bfef159b62377

public/index.html
Antes: 3e73a96aa412757b51409f2783fa84e8112fff8af623664a1d3bfecacb0a3295
Después (D = VPS): 72abe70e9da810f7bc3c76b271f52e24cb3a800c0f5f2ba7f7db9e7f76a88a32

HTML D LF = archivo VPS = HTTPS: 72abe70e9da810f7bc3c76b271f52e24cb3a800c0f5f2ba7f7db9e7f76a88a32
Comparación estricta byte a byte; sin normalizar respuestas para aceptar diferencias. Antiguo hash CRLF rechazado.

## Backup y rollback
Backup: /home/eduxadmin/.local/share/eduxfac/initial_inventory_deploy_v2_20261014_204239/backup
Incluye originales app.js/index.html y marcador de ausencia inicial-inventory.js.absent.json. Backup SHA256 y marcador verificados por precheck y verificación final.
Rollback preparado y verificado:
```bash
/usr/bin/python3 /home/eduxadmin/.local/share/eduxfac/initial_inventory_deploy_v2_20261014_204239/ROLLBACK_RENTABILIDAD_V2.py --apply
```

## Readiness y salud
Único reinicio: WEB PILOTO. PID 345824, online, contador 13. Otros procesos intactos.
Readiness: 7.892 s. Loopback 4 intentos, 3 estables; HTTPS 3 intentos, 3 estables. Verificación final: 3 estables en ambos.
Health loopback/HTTPS 200, ok/database true, PILOTO. app/admin/eduxfac.com HTTPS 200.
Nginx conserva hash 8c59627f6f46d3ed6d799eacbd4976b635823dbbde3a4cb29078ba21e4cb51d2; /api/import/inventory/ 90s, location / y API interna WEB PILOTO 30s. Ninguna modificación/reload Nginx en este despliegue.

## Plantilla
Generada por initialTemplate del módulo realmente desplegado y descargada desde el VPS; no se usó login ni conexión a datos reales. Además se comprobó descarga HTTP del endpoint en una base ficticia con el mismo código.
15 columnas exactas: Código interno, Código de barras, Producto, Principio activo, Concentración, Presentación, Unidad de medida, Categoría, Laboratorio, Stock del lote, Stock mínimo, Precio de compra, Precio de venta, Lote, Vencimiento.
Sin columnas Stock máximo ni Valor del stock. Hoja Información con instrucciones y ejemplo P000003, lotes EDED/DEDEEE y 4+6=10 unidades.
XLSX descargado: docs/initial_inventory_deploy_v2/Plantilla_Inventario_Inicial_EDUXFAC.xlsx; SHA256 717d0167ef5432d35d6b390e2f7a707e8c0283803986b3691afa33177cfbf0e6.

## Regresión post-deploy
129/129 Windows, 27/27 Linux/PostgreSQL nativo, 7/7 integridad estricta. Total 163/163, 0 fallidas, 0 omitidas (incluye tests padre de node:test).
Pruebas reales con copias app.js/initial-inventory.js/index.html descargadas del VPS y SHA256 idéntico a D; contenedor aislado sin red, PostgreSQL ficticio y 44 FORCE RLS.
Cubre 1/2/3 lotes por producto, costos/vencimientos diferentes, saldo sin lote, requeridos y mínimo 0, identidad por código, valorización, movimientos INVENTARIO_INICIAL y auditoría, rechazo de duplicados, rollback de error de fila y error SQL después de escrituras, aislamiento empresa/sucursal, roles y concurrencia.
5.000 productos/lotes: 34.970 ms en laboratorio nativo. Regresión ventas/compras/devoluciones/anulaciones/rentabilidad sin fallos.

## UI y restricciones
Función visible en Inventario; captura de HTML realmente servido por HTTPS renderizado en fixture local aislada, sin sesión real ni datos privados. No se abrió una sesión autenticada de BOTICA PILOTO.
48 huellas de tablas PILOTO idénticas antes/después, RLS/grants/esquema intactos. No se importaron datos reales ni cambiaron stock/productos/compras/ventas, usuarios o suscripciones.
Sin migraciones ni cambios PostgreSQL global, PANEL, Nginx, certificados o base antigua eduxfac. Workers desactivados. Laboratorio cerrado; backups conservados.

## Validación manual
Recargar https://app.eduxfac.com con Ctrl+F5 y abrir Inventario > Importación inicial. Descargar plantilla, revisar vista previa y resumen antes de confirmar una prueba pequeña autorizada.