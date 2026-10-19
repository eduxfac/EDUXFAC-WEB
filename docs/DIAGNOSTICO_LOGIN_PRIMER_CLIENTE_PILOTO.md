> Actualización 13/10/2026: corrección aplicada y verificada en WEB PILOTO. Ver APLICACION_LOGIN_PRIMER_CLIENTE_PILOTO.md. El texto siguiente conserva el diagnóstico previo al despliegue.

# Diagnóstico y candidato: login del primer cliente PILOTO

Fecha: 2026-10-13, America/Lima.
Caso: BOTICA PILOTO EDUXFAC / RUC 10460023039 / PILOTO001 / edwinpiloto.
Estado: causa confirmada; candidato preparado en D:, NO desplegado. Investigación del VPS únicamente READ-ONLY.

## Causa exacta

Dos defectos del HTML servido impiden registrar el manejador del login:

1. Asignaciones JavaScript inválidas `.data-edux-action = ...`. La transformación de atributos HTML también alteró propiedades programáticas `.onclick`.
2. Un `</script>` literal dentro de la plantilla de fallbackReportExcelXls corta el bloque principal antes del login. Se escapa como `<\/script>` dentro de la cadena, conservando el contenido generado.

Los cinco bloques extraídos del documento original fallaban con Invalid left-hand side in assignment. Tras corregir ese defecto, la nueva prueba detectó Unexpected end of input por el cierre anticipado. Ese cierre ocultaba 86 asignaciones adicionales: el candidato restaura 125 propiedades en total y escapa un cierre de plantilla.

Sin `loginForm.onsubmit` no se ejecutan preventDefault, el POST por JavaScript ni la presentación de errores. El formulario vuelve a navegar al login.

## Verificación READ-ONLY

| Comprobación | Resultado |
|---|---|
| Empresa WEB PILOTO | Existe, ACTIVA, RUC y código exactos |
| edwinpiloto | Existe, ACTIVO, administrador inicial de la empresa correcta |
| Asignación | PRINCIPAL activa/principal, rol Administrador |
| Contraseña | Formato del hash válido; no extraído ni mostrado; contraseña real no comparada |
| Cambio obligatorio | usuarios.debe_cambiar_password=true, esperado |
| auth_version | empresa_acceso.auth_version=3; WEB usa versión de empresa, no del usuario |
| Suscripción | ACTIVA, BASICO, versión 2; vigente del 13/10/2026 00:00 al 13/11/2026 00:00 Lima |
| Endpoint | Acepta RUC o código; el manejador previsto envía RUC/usuario/password correctamente |
| Backend | Sin evidencia de 401/403/500 del intento; defecto previo a la llamada JavaScript |
| Logs | stdout y stderr WEB PILOTO vacíos, 0 bytes; no aportan historial HTTP |
| Frontend | No puede mostrar el error porque el bloque no compila |

No se intentó login con la contraseña real ni se capturó JWT/cookie real. La coherencia de auth_version se revisó en firma/validación. No se consultaron logs privilegiados de Nginx ni se dispone de captura de red del intento; no se atribuyen estados HTTP históricos no observados.

## Candidato

- public/index.html: solamente los dos defectos descritos.
- tests/phase9-security.test.js: comprobar ausencia de atributos HTML onclick sobre HTML sin cuerpos de script; mantener CSP estricta.
- tests/pilot-login-frontend.test.js: compilar los cinco bloques y probar el código real del login y diálogo de cambio con DOM controlado.

Sin cambios de backend, migraciones, contraseñas, otros usuarios, Nginx, certificados ni PostgreSQL global.

SHA256 HTML original normalizado: eb07a2bfe13b06698e411dc2cf7c16c27b5af972d1850036b71138823bc66db6
SHA256 HTML candidato normalizado: d5c51054a23d2a16fe65b0bf1226fb4cf5d1a6f24b72b88d7f8c4887695b5aa3

La transformación READ-ONLY del HTML remoto coincide exactamente con el candidato de D:. No se copió ni promovió al VPS. CSP calcula automáticamente sus hashes al iniciar WEB: no necesita relajar la política ni cambiar Nginx.

## Pruebas

La nueva prueba falló antes del parche por el SyntaxError original.
Resultado final: 80 aprobadas / 0 fallidas (incluye pruebas contenedoras según Node).
- 12: CSP, eventos y nuevo flujo.
- 68: regresión de altas y suscripciones.

Flujo: servicios Panel -> empresa ACTIVA -> usuario inicial -> login por RUC con contraseña ficticia -> cambio obligatorio -> sesión normal/bootstrap 200 -> nuevo login sin repetir cambio.
También comprueba que no se almacene JWT restringido, que deje de servir la contraseña temporal y que un 401 sea visible sin recarga.
Bases exclusivamente SQLite :memory: y PostgreSQL PGlite memory://. Ningún cliente nuevo en sistemas reales.
La prueba de interfaz usa VM/DOM controlado, no navegador gráfico completo. La aceptación visual real queda pendiente después de aplicar el candidato.

Comandos desde la fuente oficial WEB en D: con Node 24:
`node --test --test-isolation=none --test-concurrency=1 tests/pilot-login-frontend.test.js tests/phase9-security.test.js`
`node --test --test-concurrency=1 tests/onboarding.test.js tests/subscriptions.test.js`

## Pendiente

Aplicar únicamente el HTML validado al WEB PILOTO, conservar archivo anterior y verificar checksum. WEB cachea HTML/CSP al iniciar: será necesario reiniciar exclusivamente su proceso PILOTO. No se aplicó ni se reinició en esta investigación.
Después, verificar HTTPS/CSP y repetir login/cambio inicial con el usuario, sin compartir contraseña.
No es necesario restablecer edwinpiloto ni cambiar Nginx/PostgreSQL global.

No se modificó el VPS, la base antigua eduxfac, otros usuarios ni otros proyectos.
