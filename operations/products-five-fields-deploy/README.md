# Despliegue de productos 5 campos

Estado: aplicado una vez y verificado. No repetir prepare/apply.

Informe: docs/DESPLIEGUE_PRODUCTOS_5_CAMPOS_RESULTADO.md.

Backup: /home/eduxadmin/.local/share/eduxfac/products_five_fields_deploy_20261014_015653/backup

Rollback bajo autorización o fallo confirmado:

```bash
/usr/bin/python3 /home/eduxadmin/.local/share/eduxfac/products_five_fields_deploy_20261014_015653/ROLLBACK_RENTABILIDAD_V2.py --apply
```

Solo restaura dos archivos/reinicia WEB PILOTO; no migra/escribe la base ni modifica otros procesos.
