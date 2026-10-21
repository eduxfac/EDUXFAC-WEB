# Checkpoint EDUXFAC WEB — F16D-P1 GO

Checkpoint técnico del flujo de adopción administrativa y onboarding validado exclusivamente contra el clon `eduxfac_f16dp1_clone`.

## Resultado validado

- `F16D_P1_FINAL=GO`
- `HTTP/JWT=PASS`
- `ONBOARDING=PASS`
- `IDEMPOTENCY=PASS`
- `REGRESSION=PASS`
- `SUNAT_CONTACTS=0`
- `PRODUCTION_DB_WRITES=0`
- `PILOT_DB_WRITES=0`
- `PRODUCTION_CODE_WRITES=0`

## Script HTTP vigente

El único script HTTP operativo de este checkpoint es:

`F16D_P1/scripts/F16D_P1_HTTP_CLONE_V3.sh`

Las versiones HTTP V1 y V2 fueron excluidas por ser históricas y obsoletas. Los demás scripts incluidos corresponden al ciclo final PRECHECK, CREATE_CLONE, APPLY, VERIFY y DESTROY.

## Alcance y seguridad

El checkpoint contiene código candidato, migraciones 001–005, scripts finales, pruebas, documentación y evidencia técnica de solo lectura. No contiene certificados, claves privadas, credenciales SOL, secretos, tokens, archivos `.env`, bases de datos, backups PostgreSQL ni datos comerciales.

La evidencia F16D-P0 contiene únicamente metadata técnica de esquema y declara `BUSINESS_DATA_ROWS_READ=0`.

`SHA256SUMS.txt` registra la integridad de todos los archivos del checkpoint, excepto el propio manifiesto.
