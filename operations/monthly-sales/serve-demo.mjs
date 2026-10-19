import {createFixture,ids,PASSWORD} from '../../tests/helpers/initial-inventory-template-fixture.js';
import {seedMonthly} from '../../tests/helpers/monthly-sales-checks.js';
if(process.env.NODE_ENV!=='test')throw Error('TEST_ONLY');
const f=await createFixture();await seedMonthly(f,ids);
console.log(JSON.stringify({url:f.base,usuario:'admin',empresa_codigo:'EMPRESA-A',password:PASSWORD,onlyMemoryDatabase:true}));
let closed=false;async function close(){if(closed)return;closed=true;await f.close();process.exit(0)}
process.stdin.setEncoding('utf8');process.stdin.on('data',x=>{if(x.trim()==='stop')void close()});process.stdin.resume();process.on('SIGINT',close);process.on('SIGTERM',close);
