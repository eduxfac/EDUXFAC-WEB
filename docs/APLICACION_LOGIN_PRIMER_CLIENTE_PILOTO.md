# Aplicación de corrección de login — WEB PILOTO

Estado: APLICADA Y VERIFICADA. Fecha: 2026-10-13 12:33, America/Lima (17:33 UTC).

Único archivo de aplicación modificado en el VPS:
`/home/eduxadmin/eduxfac/releases/phase12b_20261013_0625/web/public/index.html`

Fuente oficial comparada:
`D:\EDUXFAC\EDUXFAC WEB\01_TRABAJO_ACTUAL\EDUXFAC_WEB_ACTUAL\public\index.html`

Corrección: restaurar las 125 asignaciones de propiedades JavaScript onclick y escapar un cierre script de la plantilla Excel. El candidato fue cotejado contra las dos transformaciones exactas del HTML original antes de reemplazar el archivo.

## Backup y checksums

Backup exacto: `/home/eduxadmin/.local/share/eduxfac/phase12b_20261013_0625/login_frontend_fix_20261013_1730/index.html.before`
SHA256 antes y backup: `eb07a2bfe13b06698e411dc2cf7c16c27b5af972d1850036b71138823bc66db6`
SHA256 después, fuente D:, candidato remoto y HTML HTTPS servido: `d5c51054a23d2a16fe65b0bf1226fb4cf5d1a6f24b72b88d7f8c4887695b5aa3`

El backup fue creado y verificado ANTES del reemplazo, en carpeta privada. Se conservaron los respaldos anteriores.

## Comprobaciones finales

- 80 pruebas de login, cambio obligatorio, altas, suscripciones, CSP y eventos: aprobadas; 0 fallidas. Se ejecutaron antes y después; son 80 comprobaciones distintas, no 160.
- Pruebas con datos ficticios y bases exclusivamente en memoria. No se intentó autenticar a edwinpiloto ni cambiar su contraseña.
- Health loopback y HTTPS 200, ok=true, database=true, data_mode=PILOTO, tres muestras consecutivas y una comprobación final después de la regresión.
- app.eduxfac.com, admin.eduxfac.com y eduxfac.com: HTTPS 200 con validación TLS.
- Cinco bloques inline servidos compilan y coinciden con los hashes autorizados por CSP, sin relajar la política.
- initial-password.js, delegated-events.js y app-dialogs.js servidos: HTTP 200, sintaxis válida y checksum igual al archivo remoto.
- Manifest de 63 archivos de aplicación WEB: cambió únicamente public/index.html; los otros 62 conservaron sus hashes.
- Solo se reinició EDUXFAC-WEB-PILOTO (PM2 4): PID nuevo 279626, contador de reinicios 1, online y estable.
- PANEL PILOTO y WEB anterior conservaron PID, contador de reinicios y configuración filtrada.

El reinicio fue necesario porque csp-header.js carga HTML/CSP al importar el módulo. server/start.mjs utiliza initializeDatabase({migrate:false}); la inicialización consulta esquema/roles, no aplica migraciones. Worker de vencimientos desactivado y sin autorización de mutación.

## Rollback preparado

Script: `/home/eduxadmin/.local/share/eduxfac/phase12b_20261013_0625/login_frontend_fix_20261013_1730/ROLLBACK_LOGIN_FRONTEND.py`
Sintaxis validada y checksum del backup comprobado. Rechaza ejecutarse si el HTML activo ya no coincide con el candidato esperado. Restaura únicamente el HTML respaldado y reinicia solo PM2 WEB PILOTO 4.

Comando SSH como eduxadmin, sin sudo, SOLO si se decide revertir:

```bash
/usr/bin/python3 /home/eduxadmin/.local/share/eduxfac/phase12b_20261013_0625/login_frontend_fix_20261013_1730/ROLLBACK_LOGIN_FRONTEND.py --apply
```

El procedimiento de aplicación también disponía de rollback automático si fallaban las comprobaciones posteriores. No fue necesario ejecutarlo.

## Alcance conservado

No se modificaron PostgreSQL/configuración global/bases, Nginx, certificados, usuarios, contraseñas, base antigua eduxfac ni PANEL. No se registró otro cliente. No se utilizó sudo ni se ejecutaron migraciones.

El usuario ya puede abrir https://app.eduxfac.com, hacer una recarga completa (Ctrl+F5) y probar edwinpiloto con su contraseña temporal existente. El cambio obligatorio sigue habilitado; ese paso debe completarlo el usuario. La aceptación visual real queda pendiente de su prueba.

Evidencia remota: `/home/eduxadmin/.local/share/eduxfac/phase12b_20261013_0625/login_frontend_fix_20261013_1730/APPLY_DONE.json`
Evidencia local: APLICACION_LOGIN_PRIMER_CLIENTE_PILOTO.json
Salida de pruebas posterior: PRUEBAS_POST_APLICACION_LOGIN_PILOTO.log
