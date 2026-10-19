# Despliegue de consistencia de costos

Aplicado una vez. No repetir prepare/migrate/apply.

Payload: únicamente siete archivos del MANIFEST.json. Sin herramienta de reparación APRONAX.

VPS privado: \home\eduxadmin\.local\share\eduxfac\cost_consistency_deploy_20261014_005646

Informe: docs/DESPLIEGUE_CONSISTENCIA_COSTOS_RESULTADO.md.

Rollback WEB PILOTO bajo autorización o fallo confirmado:

```bash
/usr/bin/python3 /home/eduxadmin/.local/share/eduxfac/cost_consistency_deploy_20261014_005646/ROLLBACK_RENTABILIDAD_V2.py --apply
```

Retiene DDL 007 compatible. No restaura datos de clientes ni cambia PostgreSQL global, bases o roles.
