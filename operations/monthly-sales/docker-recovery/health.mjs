import {createProfitNativeCluster} from '../../tests/helpers/profit-native-cluster.js';
import {execFile} from 'node:child_process';import {promisify} from 'node:util';import assert from 'node:assert/strict';
const cluster=await createProfitNativeCluster();try{
 const readiness=await promisify(execFile)('/usr/lib/postgresql/16/bin/pg_isready',['-h','127.0.0.1','-p',String(cluster.port),'-U','eduxfac_profit_fixture','-d','postgres']);
 const result=(await cluster.query("select 1 as healthy,version(),current_setting('listen_addresses') as listen_addresses,current_setting('port')::int as port,pg_is_in_recovery() as in_recovery")).rows[0];assert.equal(result.healthy,1);assert.equal(result.listen_addresses,'127.0.0.1');
 console.log(JSON.stringify({ok:true,readiness:readiness.stdout.trim(),...result,network:'none',published_ports:[],isolated:true}));
}finally{await cluster.close()}
