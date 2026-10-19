import fs from 'node:fs';import pg from '/home/eduxadmin/eduxfac/releases/phase12b_20261013_0625/web/node_modules/pg/lib/index.js';
const s=JSON.parse(fs.readFileSync('/home/eduxadmin/.config/eduxfac/pilot/SECRETS_PRIVATE.json','utf8'));
const db=new pg.Client({host:'vmi3635195.contaboserver.net',database:'eduxfac_web_piloto',user:'eduxfac_web_migrator',password:s.roles.eduxfac_web_migrator,ssl:{rejectUnauthorized:true,ca:fs.readFileSync('/etc/ssl/certs/ssl-cert-snakeoil.pem','utf8')},options:'-c default_transaction_read_only=on -c statement_timeout=10000'});



import crypto from 'node:crypto';
await db.connect();try{
 await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
 const p=(await db.query("select p.id,p.empresa_id from productos p join empresas e on e.id=p.empresa_id where e.ruc='10460023039' and p.codigo_interno='P000004' and p.nombre='ABRILAR JARABE 120ML'")).rows[0];
 const lots=(await db.query('select id,numero_lote,cantidad_disponible,costo_unitario,valor_base_costos from lotes where producto_id=$1 order by numero_lote',[p.id])).rows;
 const auditCount=Number((await db.query("select count(*)::int n from auditoria where empresa_id=$1 and accion='REPARAR_APERTURA_INICIAL' and entidad_id=$2",[p.empresa_id,p.id])).rows[0].n);
 const force=Number((await db.query("select count(*)::int n from pg_class where relnamespace='public'::regnamespace and relkind='r' and relforcerowsecurity")).rows[0].n);
 const dbGuard=(await db.query("select current_database() db,current_setting('transaction_read_only') read_only")).rows[0];
 await db.query('ROLLBACK');
 const path='/home/eduxadmin/eduxfac/releases/phase12b_20261013_0625/web/server/src/initial-inventory.js';const sourceHash=crypto.createHash('sha256').update(fs.readFileSync(path)).digest('hex');
 const response=await fetch('http://127.0.0.1:3001/api/health'),h=await response.json();
 console.log(JSON.stringify({dbGuard,lots,repair_audit_count:auditCount,force_rls:force,remote_importer_sha256:sourceHash,health:{http:response.status,ok:h.ok,data_mode:h.data_mode},read_only:true},null,2));
}finally{await db.end()}
