import {createFixture,ids,PASSWORD} from '../../tests/helpers/initial-inventory-template-fixture.js';
if(process.env.NODE_ENV!=='test')throw Error('TEST_ONLY');
const f=await createFixture();await f.query("update lotes set fecha_vencimiento='2026-10-30' where producto_id=$1",[ids.productoA]);
console.log(JSON.stringify({url:f.base,usuario:'admin',ruc:'20111111111',password:PASSWORD,onlyMemoryDatabase:true}));
async function close(){await f.close();process.exit(0)}process.stdin.setEncoding('utf8');process.stdin.on('data',x=>{if(x.trim()==='stop')void close()});process.stdin.resume();process.on('SIGINT',close);process.on('SIGTERM',close);
