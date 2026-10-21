# Candidato mínimo de API administrativa para F16D-P1

Este directorio contiene únicamente la infraestructura administrativa seleccionada desde el maestro local. No es un release desplegable ni debe copiarse sobre producción como árbol completo.

Archivos nuevos previstos en producción:

- `server/src/admin-service-api.js`
- `server/src/onboarding-api.js`
- `server/src/service-auth.js`
- `server/src/commercial-api.js`
- `server/src/subscription-api.js`
- `server/src/operations-api.js`
- `server/src/company-access.js`
- `server/src/company-state-policy.js`
- `server/src/commercial-conditions.js`
- `server/src/subscription-calendar.js`
- `server/src/subscription-service.js`

Archivos existentes que requerirían integración revisada, no reemplazo ciego:

- `server/src/app.js`: importar `adminServiceApi`, aplicar limitador al prefijo y montar `/api/internal/admin/v1` con JSON de 16 KiB.
- `server/src/db.js`: incorporar el contexto de servicio y la selección de pool correspondiente. La parte RLS queda deshabilitada en Etapa A.
- `package.json` y `package-lock.json`: solo si la auditoría confirma que producción no tiene `jsonwebtoken` compatible.

Montaje requerido en `app.js`:

```js
import { adminServiceApi } from './admin-service-api.js';

app.use('/api/internal/admin/v1', requestLimits({max:600}));
app.use('/api/internal/admin/v1', express.json({limit:'16kb'}), adminServiceApi);
```

Variables requeridas, sin valores:

- `PANEL_WEB_SERVICE_SECRET=[SECRETO_OCULTO]`
- `PANEL_WEB_SERVICE_ISSUER=[SECRETO_OCULTO]`
- `PANEL_WEB_SERVICE_AUDIENCE=[SECRETO_OCULTO]`

La integración final debe prepararse contra una copia exacta del código productivo auditado. El `app.js` del maestro contiene otras mejoras posteriores y no debe reemplazar íntegramente al archivo productivo dentro de F16D-P1.
