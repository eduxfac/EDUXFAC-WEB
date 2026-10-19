import {createFixture,ids,PASSWORD} from '../../tests/helpers/initial-inventory-template-fixture.js';
import {seedRequirement} from '../../tests/helpers/purchase-requirement-seed.js';
if(process.env.NODE_ENV!=='test')throw Error('ISOLATED_TEST_ENV_REQUIRED');
const f=await createFixture();await seedRequirement(f,ids);
console.log(JSON.stringify({url:f.base,login:{ruc:'20111111111',usuario:'admin',password:PASSWORD},onlyMemoryDatabase:true,stop:'write stop'}));
let closed=false;async function close(){if(closed)return;closed=true;await f.close();process.exit(0)}
process.stdin.setEncoding('utf8');process.stdin.on('data',x=>{if(x.trim()==='stop')void close()});process.stdin.resume();process.on('SIGTERM',close);process.on('SIGINT',close);
