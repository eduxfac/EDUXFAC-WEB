# Recuperación Docker y repetición PostgreSQL/RLS — Ventas por mes

**15/10/2026 — GO técnico para despliegue controlado al WEB PILOTO. No desplegado. No se accedió al VPS.**

## Causa y reparación

Error observable: arranque fallido del motor Linux/WSL, `DockerDesktop/Wsl/ExecError`, salida 1 de `wsl-bootstrap run`, conexiones IPC `connection refused`/`context deadline exceeded` y API Docker 500. El reinicio anterior excedió el timeout y registró acceso denegado al cerrar el frontend; los logs confirman que el cierre terminó después, a las 07:56:54 de Lima. Al comenzar esta continuación Docker estaba apagado: pipe inexistente y distribuciones WSL detenidas. Se inició Docker Desktop de nuevo después de ese cierre completo; motor Docker 29.7.2/API 1.55 saludable.

No se reinstaló ni actualizó Docker ni se reinició Windows/WSL globalmente. Cliente y servidor usan la misma API: no es incompatibilidad de versión. No se encontró conflicto de puertos. Contenedor anterior: OOMKilled=false, salida 255 tras recuperar el motor. El desencadenante interno del fallo WSL no queda demostrado; no se atribuye a corrupción o memoria sin evidencia. DOCKER_ERROR_EXCERPTS.log conserva los errores exactos.

## Diagnóstico y limpieza

Inventario inicial: 16 contenedores detenidos. Los otros 15 conservan idéntico estado, configuración y mounts al finalizar; se normalizó el orden variable de mounts en docker inspect al comparar. Redes, volúmenes e imágenes antes/después coinciden. No se inició, paró ni modificó ningún contenedor ajeno.

Se eliminó exclusivamente el viejo `eduxfac-monthly-sales-20261015-075139`, ID b77c4c2b..., comprobado contra el ID completo: detenido, red none, cero mounts, cero puertos publicados. No tenía PostgreSQL activo; el fallo ocurrió antes de ejecutar la suite. También se creó y eliminó el nuevo contenedor único de repetición, identificado en RESULT.json y ../CLEANUP.json. No se borraron imágenes, volúmenes o redes, ni se ejecutó prune/reset/unregister.

El laboratorio usa red none, cero volúmenes/binds y cero puertos publicados. PostgreSQL escucha en loopback y puerto efímero dentro del contenedor. Los puertos del host 5432, 5433, 3000, 3001, 4310 y 4312 se comprobaron antes/después: sin escuchas, sin conflicto con EDUXFAC.

Solo se ajustó el runner RUN_LINUX.ps1 y se agregó docker-recovery/health.mjs: preflight del motor; nombre único y etiqueta de tarea; chown limitado a rutas copiadas sin recorrer node_modules; comprobación de aislamiento/salud; control de errores stop/rm antes de declarar limpieza. Se preservaron runner, informe, logs y resultados anteriores en docker-recovery/*PREVIOUS* y RUN_LINUX.before.ps1. No se modificaron archivos funcionales ni de pruebas.

## Salud y pruebas

PostgreSQL 16.15: pg_isready acepta conexiones, SELECT 1 correcto, listen_addresses=127.0.0.1, pg_is_in_recovery=false. El preflight crea/cierra un clúster ficticio propio; la suite crea otro independiente, comprueba health HTTP y aplica 44 FORCE RLS con roles runtime NOSUPERUSER/NOBYPASSRLS.

**36/36 aprobadas, 0 fallidas, 0 omitidas**. Desglose: 19 comprobaciones del bloque PostgreSQL nativo/RLS y 17 complementarias SQL/HTTP/PGlite, incluidas las pruebas contenedoras de node:test. No se presentan las 36 como exclusivamente nativas. Runner exit 0; TEST_LINUX.log y REPEAT_RUN.log corresponden a esta repetición.

Cobertura: empresa y sucursal; JWT y permisos dashboard; global restringido; aislamiento multiempresa; anulaciones/borradores excluidos; devoluciones en mes original; notas de crédito y signo existente; netos; años disponibles/cambio de año/frontera America/Lima; doce meses, meses vacíos y total anual; comparación de doce periodos con Reportes > Ventas; una agregación SQL; históricos/stock/precios intactos; 44 FORCE RLS al inicio y al terminar; rendimiento.

Con 100,000 ventas y 10,000 devoluciones: 916.7 ms, 550.4 ms, 556.8 ms. EXPLAIN ANALYZE: 637.0 ms. Total neto completo comprobado. Sin nuevos índices o migraciones; plan en ../PERFORMANCE_PG.json.

## Integridad y dictamen final

Los 5 archivos funcionales y los 5 de pruebas conservan sus SHA256 del manifiesto FILES.json: HASHES_BEFORE/HASHES_AFTER coinciden 10/10 y se comprobaron contra disco. Windows 480/480 y responsive favorable siguen siendo evidencia válida del mismo código, sin repetición innecesaria.

Docker final saludable; ambos contenedores de esta tarea eliminados; sin clúster PostgreSQL, puertos o recursos temporales propios restantes. Los 15 contenedores ajenos, sus redes, imágenes y volúmenes permanecen intactos. Inventarios BEFORE/AFTER, OLD_CLEANUP.json, ../CLEANUP.json y RESULT.json documentan la verificación.

**GO técnico para el candidato con hashes conservados. El bloqueo Docker/RLS queda cerrado.** No se desplegó ni se accedió al VPS; no se tocaron datos reales, otros proyectos, PANEL, Nginx, certificados o PostgreSQL global.
