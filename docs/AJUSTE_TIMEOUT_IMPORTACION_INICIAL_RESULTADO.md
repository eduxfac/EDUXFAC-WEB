# Ajuste de timeout para importación inicial — WEB PILOTO

Resultado: GO para retomar posteriormente el despliegue de importación inicial.

Archivo: /etc/nginx/sites-available/eduxfac-web-piloto
Hash antes: 292a0bc8365d3d2e1fbdf9e03e1f84f83fee3945420bcd4b255baa6bf917f9db
Hash después: 8c59627f6f46d3ed6d799eacbd4976b635823dbbde3a4cb29078ba21e4cb51d2
Backup creado y verificado durante aplicación: /home/eduxadmin/.local/share/eduxfac/initial_inventory_timeout_20261014_201400/backup/eduxfac-web-piloto

Fragmento final:
```nginx
location ^~ /api/import/inventory/ {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 90s;
    }
```

nginx -t: código 0. systemctl reload nginx: código 0. No restart de Nginx ni VPS.
Location específica /api/import/inventory/: proxy_read_timeout 90s.
Location / y /api/internal/admin/v1: proxy_read_timeout 30s, conservadas.
client_max_body_size 30m, proxy_send_timeout y client_body_timeout sin cambios.
Health loopback/HTTPS: 200, ok=true, database=true, data_mode=PILOTO.
app.eduxfac.com, admin.eduxfac.com y eduxfac.com HTTPS 200.
PM2 WEB PILOTO mismo PID 341404 y contador de reinicios 10; sin reinicio.
Código importación inicial NO desplegado: app.js/index.html conservan hashes anteriores y initial-inventory.js permanece ausente en VPS.
Configuraciones de PANEL y demás vhosts/global Nginx sin cambios. Sin cambios PostgreSQL, certificados o datos.

Rollback manual disponible:
```bash
sudo /usr/bin/python3 /home/eduxadmin/.local/share/eduxfac/initial_inventory_timeout_20261014_201400/MANUAL_INVENTORY_TIMEOUT.py --rollback
```

Evidencia: operations/initial-inventory-timeout/FINAL_READONLY.json.