# Escaneo de seguridad del checkpoint

- Archivos candidatos examinados antes del manifiesto: 36.
- Claves privadas o encabezados PEM privados: 0.
- URLs de base de datos con contraseña embebida: 0.
- JWT completos: 0.
- Tokens GitHub/OpenAI/AWS: 0.
- Credenciales SOL: 0.
- Contraseñas de certificado: 0.
- Archivos `.env` o `.env.*`: 0.
- Certificados `.p12`, `.pfx`, `.pem` o claves `.key`: 0.
- Bases SQLite, dumps o backups PostgreSQL: 0.
- Datos comerciales reales dentro de migraciones SQL: 0.

Las instrucciones SQL incluidas corresponden exclusivamente a esquema, backfill relacional y registro técnico de migraciones. La evidencia P0 contiene metadata de esquema, no filas comerciales.

Los scripts HTTP V1 y V2 fueron excluidos por obsoletos. El certificado real, su contraseña y cualquier credencial operativa no fueron abiertos ni copiados. También se excluyeron el resto de `.lab_fe2`, logs, runtimes, archivos temporales y un archivo accidental no relacionado presente en la raíz local.
