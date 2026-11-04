# Parche de índices sobre bases existentes — 31/10/2026

Este parche mejora búsquedas y relaciones de ventas, detalles, pagos, devoluciones, lotes, movimientos, clientes y cola fiscal. Contiene 17 especificaciones WEB y 4 Greenter. Se reutilizan índices válidos existentes que cubran las claves requeridas. No crea una base por empresa ni cambia la arquitectura multiempresa.

El comando solo consulta catálogos PostgreSQL y añade índices B-tree con `CREATE INDEX CONCURRENTLY`. No carga `schema.sql`, no importa datos locales, no cambia tablas o permisos, no inserta ni actualiza empresas/clientes/productos/ventas/stock, y no ejecuta DELETE/TRUNCATE/DROP sobre tablas. Los índices son no únicos: no introducen una restricción nueva que pueda rechazar registros comerciales existentes.

## Archivos exactos del parche

En WEB:

- `server/src/online-indexes.js`
- `server/scripts/optimize-indexes.mjs`
- `database/online-indexes/20261031.json`
- `tests/online-indexes-native.test.js`
- Este documento y `operations/indexes-20261031/snapshot-web.sql`.

En Greenter:

- `database/online-indexes/20261031.json`

No es necesario desplegar cambios funcionales de checkout, PerúDevs, UI o SUNAT para aplicar únicamente estos índices. El árbol local contiene otros cambios pendientes: preparar un commit/paquete con esta lista explícita, revisar el diff y conservar el código/archivos del VPS que no correspondan al parche. No usar `git add .`, `git reset --hard` ni copiar toda la carpeta local sobre producción.

## 1. Identificar el destino antes de modificarlo

Registrar la revisión Git, ruta y proceso de WEB/PANEL/Greenter del VPS; identificar los nombres actuales de sus bases, host, puerto y roles. Conservar `.env`, certificados, claves de cifrado y storage del VPS. No sustituirlos por archivos de la Mac ni crear otra base vacía para hacer funcionar el arranque.

El comando utiliza PGHOST/PGPORT/PGUSER/PGPASSFILE y el nombre obligatorio `--database`. No carga `.env` ni utiliza `DATABASE_URL` de la aplicación por defecto. Así se evita seleccionar silenciosamente una conexión local o la base de otra instancia. El plan muestra servidor, puerto, base y rol para revisar el destino.

Usar un rol autorizado para respaldar; para construir los índices, usar el propietario/migrador de las tablas. No ampliar privilegios del usuario habitual de la aplicación solo para aplicar el parche.

Si el VPS usa una versión o estructura diferente de la local, revisar la diferencia. El script se detiene si falta una tabla/columna, encuentra una tabla particionada o un índice del mismo nombre incompatible/inválido. No intenta reconstruir el esquema para resolverlo.

## 2. Respaldo y ensayo de restauración

Antes del despliegue, respaldar las bases existentes y la configuración/storage fiscal. Conservar las claves que descifran los certificados/SOL y el token PeruDevs. Restaurar esas copias en un entorno separado y probar allí el mismo parche.

Ejemplo orientativo; sustituir nombres, host y usuario por los ya existentes en el VPS. Las contraseñas se suministran mediante un archivo `.pgpass` protegido o el mecanismo seguro de operación del servidor; no escribirlas en el comando ni pegarlas en logs.

```bash
umask 077
export PGHOST=127.0.0.1
export PGPORT=5432
export PGUSER=ROL_DE_BACKUP_AUTORIZADO
patch_dir=$(mktemp -d /var/backups/eduxfac/indices-XXXXXXXX)
pg_dump --dbname=TU_BD_WEB --format=custom --file="$patch_dir/web.dump"
pg_dump --dbname=TU_BD_PANEL --format=custom --file="$patch_dir/panel.dump"
pg_dump --dbname=TU_BD_CPE --format=custom --file="$patch_dir/cpe.dump"
pg_restore --list "$patch_dir/web.dump" > "$patch_dir/web.list"
pg_restore --list "$patch_dir/panel.dump" > "$patch_dir/panel.list"
pg_restore --list "$patch_dir/cpe.dump" > "$patch_dir/cpe.list"
```

La lista del archivo no sustituye una restauración de prueba. Guardar además una copia del código/revisión anterior, configuración privada y storage. Una restauración se ensaya contra bases temporales con nombres diferentes: nunca restaurar el dump local encima de producción ni usar `pg_restore --clean` sobre las bases en uso.

En el entorno restaurado mantener desactivados el scheduler, los workers y los servicios externos: `CPE_SCHEDULER_ENABLED=false`, `CPE_WORKER_ENABLED=false`, `CPE_ALLOW_PRODUCTION=no`. Evitar que una copia de producción envíe su cola fiscal o consuma APIs al arrancar.

## 3. Plan de solo lectura

Desde el directorio WEB del VPS, con las dependencias existentes:

```bash
export PGUSER=ROL_MIGRADOR_PROPIETARIO
node server/scripts/optimize-indexes.mjs \
  --manifest=database/online-indexes/20261031.json \
  --database=TU_BD_WEB --plan \
  --report="$patch_dir/web-plan.json"

node server/scripts/optimize-indexes.mjs \
  --manifest=../EDUX-GREENTER/database/online-indexes/20261031.json \
  --database=TU_BD_CPE --plan \
  --report="$patch_dir/cpe-plan.json"
```

La ruta del manifiesto Greenter debe ajustarse si el VPS no tiene los repositorios como directorios hermanos. Revisar los estados `missing` y `covered`, el índice reutilizado, el tamaño de las tablas y la base/servidor. El tamaño exacto adicional de los índices depende de los datos; el tamaño de tabla mostrado no es una estimación del espacio del índice. Reservar capacidad de disco y WAL antes del proceso.

No usar `npm run migrate`, `database/schema.sql` o scripts de bootstrap para este parche. El migrador general también ejecuta actualizaciones de estructura y rellenos de históricos; no es equivalente a añadir estos índices. Las migraciones funcionales de SUNAT/PeruDevs se revisan y ensayan por separado sobre el esquema real del VPS.

## 4. Aplicar índices concurrentes

Después de aprobar el plan restaurado, aplicar en el VPS durante una franja de carga baja, un componente a la vez:

```bash
node server/scripts/optimize-indexes.mjs \
  --manifest=database/online-indexes/20261031.json \
  --database=TU_BD_WEB --apply \
  --report="$patch_dir/web-applied.json"

node server/scripts/optimize-indexes.mjs \
  --manifest=../EDUX-GREENTER/database/online-indexes/20261031.json \
  --database=TU_BD_CPE --apply \
  --report="$patch_dir/cpe-applied.json"
```

No envolverlos en `BEGIN` ni ejecutarlos mediante un migrador que abra una transacción: PostgreSQL no admite CREATE INDEX CONCURRENTLY dentro de ella. El comando serializa sus propias ejecuciones con un advisory lock. Limita esperas de bloqueo a 5 segundos y cada sentencia a 2 horas; el límite puede ajustarse con `--statement-timeout-ms`. No promete cero impacto: la construcción concurrente conserva la posibilidad de escribir en las tablas, pero consume CPU/disco/WAL y puede esperar transacciones antiguas.

El proceso no es una transacción global: si falla el índice número 8, los anteriores siguen disponibles. Corregir la causa y revisar `pg_index`. Si quedó un índice inválido, el comando lo detecta y exige revisión; no borra índices existentes automáticamente. Un `IF NOT EXISTS` por nombre no se considera validación suficiente.

Los reportes se crean con permisos privados y no sobrescriben un archivo anterior. Elegir rutas nuevas para cada intento.

## 5. Verificar y conservar datos

```bash
node server/scripts/optimize-indexes.mjs \
  --manifest=database/online-indexes/20261031.json \
  --database=TU_BD_WEB --verify \
  --report="$patch_dir/web-verified.json"

node server/scripts/optimize-indexes.mjs \
  --manifest=../EDUX-GREENTER/database/online-indexes/20261031.json \
  --database=TU_BD_CPE --verify \
  --report="$patch_dir/cpe-verified.json"
```

La salida de `--verify` es distinta de cero si falta cobertura. Si las estadísticas están antiguas, actualizar ANALYZE de las tablas afectadas como operación separada y controlada. Medir consultas con EXPLAIN (ANALYZE, BUFFERS) de SELECT representativos. No usar EXPLAIN ANALYZE de escrituras en producción para comprobar rendimiento.

`operations/indexes-20261031/snapshot-web.sql` toma un resumen consistente de empresas/clientes/productos/ventas y stock por empresa/sucursal. Comparar antes/después durante una pausa de escrituras, o en la copia restaurada. Con ventas en curso, los conteos y existencias cambian legítimamente; una diferencia no demuestra por sí sola pérdida causada por índices. Para historiales muy grandes, estimar el costo del conteo completo y tomarlo fuera de la hora punta.

Comprobar además login de las empresas existentes, búsqueda DNI/RUC local, catálogo y stock, historial y caja. La prueba de venta productiva requiere una operación real autorizada: no emitir una factura ficticia para verificar índices.

## 6. Recuperación y alcance

El código de negocio no cambia en este parche: no necesita reiniciar WEB/PANEL/Greenter para que PostgreSQL use los índices. Si aparece un problema al desplegar otros cambios, regresar al código anterior puede hacerse conservando los índices nuevos. No restaurar una copia antigua encima de ventas posteriores para deshacer índices.

Si fuera necesario retirar un índice de este parche, revisar la lista `created` del reporte y sus dependencias antes de ejecutar un DROP INDEX CONCURRENTLY específico. No eliminar índices reutilizados, índices de restricciones ni todo lo que tenga un prefijo parecido. No se incluye una eliminación automática.

La preparación de estos índices no corrige los pendientes funcionales de facturación identificados en la auditoría. La liberación completa de checkout/notas/bajas tiene otra validación y no debe mezclarse con este parche.

## Evidencia local

- 10 comprobaciones PostgreSQL aprobadas en una base temporal, con 25 000 ventas y 100 000 detalles: preservación de registros/stock, esquema incompleto, base equivocada, índice incompatible, índice inválido y segunda aplicación sin duplicados.
- Consulta puntual de detalles: pasó de Seq Scan a Bitmap Heap Scan usando el índice nuevo. Una muestra local midió 2.527 ms antes y 0.008 ms después; no es un benchmark del VPS ni una garantía de latencia.
- Respaldos locales restaurados en bases temporales: 52 tablas WEB y 7 Greenter comparadas por conteo y hash completo antes/después, sin cambios en las filas.
- En esas copias se crearon 15 índices WEB y se reutilizaron 2 existentes; Greenter recibió 4. La segunda ejecución creó cero índices.
- Los índices aún no se aplicaron a las bases originales ni al VPS. El esquema y carga del VPS están pendientes de inspección.

Referencia técnica: https://www.postgresql.org/docs/16/sql-createindex.html
