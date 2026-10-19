# Despliegue REQUERIMIENTO DE COMPRA — WEB PILOTO

Resultado: GO para validación manual.

Se desplegaron exclusivamente los seis archivos autorizados. Candidato funcional sin cambios.

## SHA256 antes / después

| Archivo | Antes | Después (D = VPS) |
|---|---|---|
| server/src/app.js | 7fd8b9361cfbd54d791aa07cbe160fe7ba69bce7589188c7d27e52e1dc3984ab | dfb160b96cce099f89283c221a3671affd3357e87f9b528b3bd2bb100c071576 |
| server/src/purchase-requirement.js | AUSENTE | 63490a4332454ef4e6807727b46017cac6210238bb4ce970ba1b2e5a551e5347 |
| server/src/access-policy.js | 68f5665d5aefbca2985d460694a87cab5bae5c89115c6c4fb18ee7a423773f4b | 5e490184f5569968ad9c415b7ed27a426d8a15e7fd9ef543cae0a71056f09054 |
| public/index.html | 72abe70e9da810f7bc3c76b271f52e24cb3a800c0f5f2ba7f7db9e7f76a88a32 | 06ad9349541563ef990fcf5c8a7ecf63c5db05b28b2688bfe25aaf8b63f524c1 |
| public/purchase-requirement.js | AUSENTE | 55a68638b2ec8f0d6a47400414b8c51ec122026d1ea26f0628c67c962eb1d070 |
| public/desktop-responsive.css | 5d1678f53d5a2e375aa29c2532d7f34d1f78f54817bdf5409bc2aa366ae94eb6 | f30b44ebf7936886ec7cb75142149ab4370669d287d65fcf06aa7fef00f4584c |

HTML, public/purchase-requirement.js y CSS servidos por HTTPS: SHA256 idéntico al candidato. CSP validada.

## Backup y rollback

Backup verificado: /home/eduxadmin/.local/share/eduxfac/purchase_requirement_deploy_20261014_214725/backup

Los dos archivos nuevos tienen marcadores verificables de ausencia previa. Rollback valida todos los backups/hashes antes de restaurar; elimina solo los módulos nuevos si conservan el hash desplegado. No se ejecutó rollback en este despliegue exitoso.

Comando disponible:

    python3 /home/eduxadmin/.local/share/eduxfac/purchase_requirement_deploy_20261014_214725/DEPLOY_REQUIREMENT.py --rollback

## Salud y proceso

Health loopback/HTTPS 200, database=true, data_mode=PILOTO. App, admin y dominio raíz HTTPS 200. Tres respuestas consecutivas estables en loopback y tres en HTTPS. Único reinicio: EDUXFAC-WEB-PILOTO id 4, pid 359274. PANEL y WEB anterior conservaron PID/reinicios/configuración.

Tiempo de reinicio y readiness estable: 10.169 s.

## Validación

- Windows: 31/31; Linux funcional: 16/16; PostgreSQL nativo/RLS: 18/18. Total regresión: 65/65, cero fallidas/omitidas.
- VPS READ ONLY: seis comprobaciones aprobadas. Total automatizado: 71/71.
- 44 tablas FORCE RLS conservadas; permisos, esquema y fingerprints de todas las tablas PILOTO idénticos antes/después.
- Dashboard stock bajo real: 0; consulta independiente y requerimiento coinciden. No se cambiaron mínimos ni productos reales para forzar filas.
- Navegador ficticio: Dashboard 7 -> Ver todos -> Requerimiento; cantidad vacía inicialmente; ingreso manual 12 -> generar una fila; descarga Excel verificada con ocho columnas/Información/costo 4.4; botón Imprimir invocado sin errores de consola. No se envió nada a una impresora física.
- Laboratorio: casos 5/2 excluido; 2/2,1/2,0/2,negativo/2,0/0 incluidos; compra posterior real por API ficticia retira producto y decrementa Dashboard; cantidades >0; última compra y último proveedor conocido; sin evidencia=null/Sin proveedor; empresa/sucursal ajenas 403.
- Generar/Excel/imprimir no alteran ninguna de doce tablas monitoreadas en laboratorio. BD PILOTO sin escrituras; no se hicieron compras/ventas reales.
- 5.000 productos: PostgreSQL HTTP ~194.8 ms. PILOTO consulta READ ONLY ~25.7 ms con cero filas.

El laboratorio usa el mismo código desplegado y conserva inventory-count.js original remoto (1e99adfc02152a633bcc3724d5fdc5f5d7f6b3871ff1f6feaf30fa2ddb488e65), sin desplegar su candidato pendiente de D:. Contenedor aislado sin red externa, eliminado al terminar.

No se modificaron Nginx, certificados, PostgreSQL global, PANEL, usuarios, suscripciones, stock, costos, precios, compras, ventas ni históricos reales.

Evidencias: RESULT.json, APPLY_DONE.json, FINAL_VERIFY.json, DB_VERIFIED.json, HTTPS_ASSETS.json, EVENTS.jsonl, logs Windows/Linux/PostgreSQL, BROWSER_EXCEL.json, REQUERIMIENTO_UI_FICTICIO.xlsx y REQUERIMIENTO_FICTICIO.jpg.
