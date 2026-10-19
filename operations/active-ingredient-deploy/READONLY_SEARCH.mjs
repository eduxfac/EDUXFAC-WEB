import fs from 'node:fs';
import pg from '/home/eduxadmin/eduxfac/releases/phase12b_20261013_0625/web/node_modules/pg/lib/index.js';
import assert from 'node:assert/strict';
const root='/home/eduxadmin/eduxfac/releases/phase12b_20261013_0625/web';
const secrets=JSON.parse(fs.readFileSync('/home/eduxadmin/.config/eduxfac/pilot/SECRETS_PRIVATE.json','utf8'));
const config=role=>({host:'vmi3635195.contaboserver.net',database:'eduxfac_web_piloto',user:role,password:secrets.roles[role],ssl:{rejectUnauthorized:true,ca:fs.readFileSync('/etc/ssl/certs/ssl-cert-snakeoil.pem','utf8')},options:'-c default_transaction_read_only=on -c statement_timeout=15000'});
const admin=new pg.Client(config('eduxfac_web_migrator'));let tenant;
const checks=[],durations=[];
const record=(name,condition)=>{assert.ok(condition,name);checks.push(name);};
try{
 await admin.connect();await admin.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
 const id=(await admin.query("SELECT current_database() db,current_setting('transaction_read_only') ro")).rows[0];record('READONLY_PILOT_ONLY',id.db==='eduxfac_web_piloto'&&id.ro==='on');
 const u=(await admin.query("SELECT u.id,u.empresa_id,u.activo,u.debe_cambiar_password,a.estado,a.estado_suscripcion,(a.fecha_inicio<=now() and a.fecha_vencimiento>now()) vigente FROM usuarios u JOIN empresas e ON e.id=u.empresa_id JOIN empresa_acceso a ON a.empresa_id=e.id WHERE e.ruc='10460023039' AND u.usuario='edwinpiloto'")).rows;
 record('PILOT_ACCOUNT_ACTIVE',u.length===1&&u[0].activo&&u[0].estado==='ACTIVO'&&u[0].estado_suscripcion==='ACTIVA'&&u[0].vigente&&!u[0].debe_cambiar_password);
 const user=u[0],branches=(await admin.query('SELECT s.id,s.codigo FROM sucursales s JOIN usuario_sucursal us ON us.sucursal_id=s.id WHERE us.usuario_id=$1 AND s.empresa_id=$2 AND s.activo=true ORDER BY s.codigo',[user.id,user.empresa_id])).rows;
 record('ASSIGNED_BRANCH_PRESENT',branches.length>0);const branch=branches.find(x=>x.codigo==='PRINCIPAL')||branches[0];
 const apronax=(await admin.query("SELECT p.id,p.codigo_interno,p.codigo_anterior,p.codigo_barras,p.principio_activo FROM productos p JOIN producto_sucursal ps ON ps.producto_id=p.id WHERE p.empresa_id=$1 AND ps.sucursal_id=$2 AND ps.activo=true AND p.nombre ILIKE '%APRONAX%' ORDER BY p.nombre",[user.empresa_id,branch.id])).rows;
 record('APRONAX_PRESENT',apronax.length>0);
 const ingredient=apronax.some(p=>String(p.principio_activo||'').toUpperCase().includes('NAPROXENO'));
 record('APRONAX_NAPROXENO_REGISTERED',ingredient);
 const roles=(await admin.query("SELECT DISTINCT r.rolname FROM pg_policy p JOIN pg_class c ON c.oid=p.polrelid JOIN pg_roles r ON r.oid=ANY(p.polroles) WHERE c.relname='productos' AND r.rolname LIKE 'eduxfac_web_%' AND r.rolname NOT LIKE '%migrator%' AND r.rolname NOT LIKE '%backup%' AND r.rolname NOT LIKE '%auth%' AND r.rolname NOT LIKE '%service%'")).rows;
 record('TENANT_ROLE_UNIQUE',roles.length===1);const role=roles[0].rolname;
 const flags=(await admin.query('SELECT rolsuper,rolbypassrls FROM pg_roles WHERE rolname=$1',[role])).rows[0];record('TENANT_NO_BYPASS',!flags.rolsuper&&!flags.rolbypassrls);
 const force=(await admin.query("SELECT count(*)::int n FROM pg_class WHERE relnamespace='public'::regnamespace AND relkind='r' AND relrowsecurity AND relforcerowsecurity")).rows[0].n;record('44_FORCE_RLS',force===44);
 if(process.argv.includes('--preflight')){await admin.query('ROLLBACK');console.log(JSON.stringify({result:'SEARCH_READONLY_PRECHECK_OK',checks:checks.length,APRONAX_NAPROXENO_registered:true,force_rls:force}));}
 else{
  const src=fs.readFileSync(root+'/server/src/app.js','utf8'),start=src.indexOf("app.get('/api/products',"),end=src.indexOf("app.get('/api/products/:id/presentations'",start),route=src.slice(start,end),bt=String.fromCharCode(96);
  const sql=route.slice(route.indexOf(bt+'select p.id')+1,route.indexOf(bt+', [req.user.empresa_id'));
  record('DEPLOYED_SEARCH_QUERY_PRESENT',sql.startsWith('select p.id')&&sql.includes('p.principio_activo')&&sql.includes('limit $4 offset $6'));
  tenant=new pg.Client(config(role));await tenant.connect();await tenant.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  await tenant.query("SELECT set_config('app.empresa_id',$1,true),set_config('app.usuario_id',$2,true),set_config('app.sucursal_ids',$3,true)",[user.empresa_id,user.id,branches.map(x=>x.id).join(',')]);
  const search=async(q,scope=true,offset=0)=>{const t=performance.now();const rows=(await tenant.query(sql,[user.empresa_id,branch.id,q,30,scope,offset])).rows;durations.push(+(performance.now()-t).toFixed(2));return rows;};
  for(const q of ['APRONAX','NAPROXENO','NAPRO','naproxeno'])record('FIND_'+q,(await search(q)).some(x=>apronax.some(p=>p.id===x.id)));
  for(const field of ['codigo_interno','codigo_anterior','codigo_barras']){
   const p=apronax.find(p=>p[field]);if(p)record('FIND_'+field,(await search(p[field])).some(x=>x.id===p.id));else checks.push('ISOLATED_FIXTURE_REQUIRED_'+field);
  }
  const expected=(await tenant.query("SELECT p.id FROM productos p JOIN producto_sucursal ps ON ps.producto_id=p.id WHERE p.empresa_id=$1 AND ps.sucursal_id=$2 AND ps.activo=true AND translate(coalesce(p.principio_activo,''),'ÁÉÍÓÚÜÑ','áéíóúüñ') ILIKE '%naproxeno%' ",[user.empresa_id,branch.id])).rows;
  const all=[];for(let offset=0;offset<100000;offset+=30){const page=await search('NAPROXENO',true,offset);record('PAGE_BOUND_'+offset,page.length<=30);all.push(...page);if(page.length<30)break;}
  record('ALL_ACTIVE_MATCHES_FOUND',expected.every(p=>all.some(x=>x.id===p.id)));record('NO_DUPLICATE_RESULTS',new Set(all.map(x=>x.id)).size===all.length);
  record('NO_OTHER_COMPANY_RESULT',(await tenant.query('SELECT count(*)::int n FROM productos WHERE empresa_id<>$1',[user.empresa_id])).rows[0].n===0);
  record('NO_UNASSIGNED_BRANCH_LOTS',(await tenant.query('SELECT count(*)::int n FROM lotes WHERE NOT(sucursal_id=ANY($1::uuid[]))',[branches.map(x=>x.id)])).rows[0].n===0);
  const missing=(await tenant.query("SELECT p.codigo_interno FROM productos p JOIN producto_sucursal ps ON ps.producto_id=p.id WHERE p.empresa_id=$1 AND ps.sucursal_id=$2 AND ps.activo=true AND p.principio_activo IS NULL LIMIT 1",[user.empresa_id,branch.id])).rows[0];
  if(missing)record('NULL_INGREDIENT_SAFE',(await search(missing.codigo_interno)).length>0);else checks.push('ISOLATED_FIXTURE_REQUIRED_NULL_INGREDIENT');
  await tenant.query('ROLLBACK');await admin.query('ROLLBACK');
  const sorted=durations.toSorted((a,b)=>a-b);console.log(JSON.stringify({result:'SEARCH_PILOT_READONLY_OK',checks:checks.length,checks_passed:checks,native_SQL_from_deployed_backend:true,transactions_read_only:true,HTTP_user_login_executed:false,force_rls:force,real_pilot_matches:all.length,timing_ms:{samples:sorted.length,median:sorted[Math.floor(sorted.length/2)],max:sorted.at(-1)}}));
 }
}catch(e){console.log(JSON.stringify({result:'SEARCH_READONLY_STOP',code:e instanceof assert.AssertionError?e.message:e.code||e.name}));process.exitCode=1;}
finally{if(tenant)await tenant.end();await admin.end();}
