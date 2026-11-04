# Rama parche-italo: publicación de código y despliegue

Publicar esta rama en GitHub no aplica migraciones ni actualiza el VPS.

El inventario del VPS del 04/11/2026 muestra una línea fiscal distinta de esta
rama: WEB F15 registra migraciones 008_facturacion_local_simulada a
020_transporte_sunat y utiliza comprobantes, cpe_cola y ciclo_documentos.
Esta rama integra una API PHP separada mediante sunat_outbox. No se deben
equiparar los números de migración ni ejecutar el migrador local completo
sobre esa base existente. El manifiesto de índices 20261031 requiere
sunat_outbox y debe adaptarse al esquema del destino antes de aplicarlo.

Procedimiento pendiente: restaurar el respaldo del VPS en un entorno aislado,
comparar esquema y código, preparar migraciones compatibles, probar los roles
y RLS del servidor, desplegar en una carpeta nueva y cambiar el proceso solo
tras validar. Conservar código anterior, datos, certificados, storage y claves.
La copia restaurada debe arrancar sin envíos fiscales ni consultas externas.

En PostgreSQL el PANEL requiere las migraciones PeruDevs 010 y 011 revisadas
contra su ledger. El token se configura en Planes WEB; PERUDEVS_ENCRYPTION_KEY
es privada del servidor. WEB necesita PANEL_API_BASE_URL y el secreto HMAC
compartido. No copiar los .env de la Mac al VPS.

Limitaciones conocidas que siguen pendientes de corrección y prueba:
- La consulta simultánea de un documento ausente puede consumir dos llamadas.
- PeruDevs HTTP 200 con error de negocio puede clasificarse como no encontrado.
- Anulación comercial y baja fiscal son flujos separados; revisar la cola de
  ventas anuladas antes de habilitar envíos automáticos.
- Revisar la consulta individual de un documento con baja aceptada para evitar
  que el CDR original vuelva a marcarlo como aceptado.

No considerar esta publicación una certificación de preparación para producción.
