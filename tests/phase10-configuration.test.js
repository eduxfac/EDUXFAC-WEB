import test from 'node:test';import assert from 'node:assert/strict';import {dataMode,assertPilotConfiguration,assertOperationalProfile} from '../server/src/environment-mode.js';
test('FASE10 entorno local declarado DEMO',()=>assert.equal(dataMode({NODE_ENV:'test'}),'DEMO'));
test('FASE10 perfil global no inicia sin modo declarado en producción',()=>assert.throws(()=>assertPilotConfiguration({NODE_ENV:'production',WEB_RLS_PROFILE:'global',WEB_RLS_ENABLED:'true'}),/DATA_MODE_REQUIRED/));
test('FASE10 piloto no permite perfil global sin RLS habilitado',()=>assert.throws(()=>assertPilotConfiguration({NODE_ENV:'production',EDUXFAC_DATA_MODE:'PILOTO',WEB_RLS_PROFILE:'global'}),/GLOBAL_RLS/));
test('FASE10 PILOTO y PRODUCCION explícitos conservan etiqueta',()=>{for(const mode of ['PILOTO','PRODUCCION'])assert.equal(assertPilotConfiguration({NODE_ENV:'production',EDUXFAC_DATA_MODE:mode,WEB_RLS_PROFILE:'global',WEB_RLS_ENABLED:'true'}),mode)});
test('FASE10 etiqueta desconocida se rechaza',()=>assert.throws(()=>dataMode({EDUXFAC_DATA_MODE:'REAL_AMBIGUO'}),/DATA_MODE_INVALID/));
test('FASE10 producción no puede iniciar con perfil antiguo o RLS apagado',()=>assert.throws(()=>assertOperationalProfile({NODE_ENV:'production',EDUXFAC_DATA_MODE:'PILOTO'}),/PRODUCTION_REQUIRES/));
