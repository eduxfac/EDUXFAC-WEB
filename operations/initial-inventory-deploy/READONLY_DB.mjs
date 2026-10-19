import fs from 'node:fs';import pg from '/home/eduxadmin/eduxfac/releases/phase12b_20261013_0625/web/node_modules/pg/lib/index.js';
const s=JSON.parse(fs.readFileSync('/home/eduxadmin/.config/eduxfac/pilot/SECRETS_PRIVATE.json','utf8'));
const db=new pg.Client({host:'vmi3635195.contaboserver.net',database:'eduxfac_web_piloto',user:'eduxfac_web_migrator',password:s.roles.eduxfac_web_migrator,ssl:{rejectUnauthorized:true,ca:fs.readFileSync('/etc/ssl/certs/ssl-cert-snakeoil.pem','utf8')},options:'-c default_transaction_read_only=on -c statement_timeout=10000'});

async function snapshot(){
 const tables=(await db.query("select c.relname,c.relrowsecurity rls,c.relforcerowsecurity force_rls,pg_get_userbyid(c.relowner) owner from pg_class c where c.relnamespace='public'::regnamespace and c.relkind='r' order by c.relname")).rows;
 const fingerprints={};
 for(const t of tables.filter(t=>t.relname!=='web_schema_migrations')){
  const name='"'+t.relname.replaceAll('"','""')+'"';
  fingerprints[t.relname]=(await db.query("select count(*)::int rows,md5(coalesce(string_agg(h,',' order by h),'')) digest from (select md5(to_jsonb(t)::text) h from public."+name+" t) q")).rows[0];
 }
 const policies=(await db.query("select c.relname,p.polname,p.polcmd,p.polpermissive,p.polroles::text roles,pg_get_expr(p.polqual,p.polrelid) qual,pg_get_expr(p.polwithcheck,p.polrelid) check_expr from pg_policy p join pg_class c on c.oid=p.polrelid where c.relnamespace='public'::regnamespace order by c.relname,p.polname")).rows;
 const views=(await db.query("select c.relname,pg_get_userbyid(c.relowner) owner,c.reloptions,md5(pg_get_viewdef(c.oid,true)) definition_md5 from pg_class c where c.relnamespace='public'::regnamespace and c.relkind='v' order by c.relname")).rows;
 const grants=(await db.query("select c.relname,pg_get_userbyid(a.grantor) grantor,case when a.grantee=0 then 'PUBLIC' else pg_get_userbyid(a.grantee) end grantee,a.privilege_type,a.is_grantable from pg_class c cross join lateral aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) a where c.relnamespace='public'::regnamespace and c.relkind in ('r','v') order by 1,2,3,4,5")).rows;
 const columns=(await db.query("select table_name,column_name,data_type,numeric_precision,numeric_scale,is_nullable,column_default from information_schema.columns where table_schema='public' and ((table_name='lotes' and column_name in ('costo_unitario','valor_base_costos')) or (table_name='venta_detalles' and column_name='costo_snapshot') or (table_name='movimientos_inventario' and column_name='costo_unitario')) order by 1,2")).rows;
 const migrations=(await db.query('select version from web_schema_migrations order by version')).rows;
 const apronax=(await db.query("select id::text,cantidad_disponible::text,costo_unitario::text from lotes where producto_id='dfade78c-7cd3-4fc0-8660-ae7e608cdf79' order by id")).rows;
 const account=(await db.query("select e.ruc,e.empresa_codigo,e.activo empresa_activa,u.usuario,u.activo usuario_activo,u.debe_cambiar_password,a.estado,a.auth_version::text,a.estado_suscripcion,(a.fecha_inicio<=now() and a.fecha_vencimiento>now()) vigente from empresas e join usuarios u on u.empresa_id=e.id join empresa_acceso a on a.empresa_id=e.id where e.ruc='10460023039' and u.usuario='edwinpiloto'")).rows;
 return {tables,fingerprints,policies,views,grants,columns,migrations,apronax,account};
}

await db.connect();try{
 await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
 const id=(await db.query("select current_database() db,current_setting('transaction_read_only') read_only")).rows[0];
 if(id.db!=='eduxfac_web_piloto'||id.read_only!=='on')throw Error('READONLY_PILOT_REQUIRED');
 const result=await snapshot();await db.query('ROLLBACK');console.log(JSON.stringify(result));
}finally{await db.end();}
