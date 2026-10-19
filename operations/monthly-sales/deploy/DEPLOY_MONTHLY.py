from pathlib import Path
import sys,os,json,hashlib,subprocess,importlib.util,tarfile,time
sys.dont_write_bytecode=True
W=Path(__file__).resolve().parent
T=Path('/home/eduxadmin/.local/share/eduxfac/profitability_deploy_v2_20261013/APPLY_RENTABILIDAD_V2.py')
assert hashlib.sha256(T.read_bytes()).hexdigest()=='90a1393ac5090aa3a95dd85730cd795cfc0269c37425ecfda7863827d090a785'
spec=importlib.util.spec_from_file_location('monthly_readiness',T);m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
m.WORK=W;m.EXPECTED_WORK=W;m.FILES=['server/src/app.js','server/src/monthly-sales.js','public/index.html','public/monthly-sales.js','public/desktop-responsive.css']
NODE='/home/eduxadmin/.local/opt/eduxfac-node24/bin/node'
SNAPSHOT_JS='import fs from \'node:fs\';import pg from \'/home/eduxadmin/eduxfac/releases/phase12b_20261013_0625/web/node_modules/pg/lib/index.js\';\nconst s=JSON.parse(fs.readFileSync(\'/home/eduxadmin/.config/eduxfac/pilot/SECRETS_PRIVATE.json\',\'utf8\'));\nconst db=new pg.Client({host:\'vmi3635195.contaboserver.net\',database:\'eduxfac_web_piloto\',user:\'eduxfac_web_migrator\',password:s.roles.eduxfac_web_migrator,ssl:{rejectUnauthorized:true,ca:fs.readFileSync(\'/etc/ssl/certs/ssl-cert-snakeoil.pem\',\'utf8\')},options:\'-c default_transaction_read_only=on -c statement_timeout=10000\'});\n\nasync function snapshot(){\n const tables=(await db.query("select c.relname,c.relrowsecurity rls,c.relforcerowsecurity force_rls,pg_get_userbyid(c.relowner) owner from pg_class c where c.relnamespace=\'public\'::regnamespace and c.relkind=\'r\' order by c.relname")).rows;\n const fingerprints={};\n for(const t of tables.filter(t=>t.relname!==\'web_schema_migrations\')){\n  const name=\'"\'+t.relname.replaceAll(\'"\',\'""\')+\'"\';\n  fingerprints[t.relname]=(await db.query("select count(*)::int rows,md5(coalesce(string_agg(h,\',\' order by h),\'\')) digest from (select md5(to_jsonb(t)::text) h from public."+name+" t) q")).rows[0];\n }\n const policies=(await db.query("select c.relname,p.polname,p.polcmd,p.polpermissive,p.polroles::text roles,pg_get_expr(p.polqual,p.polrelid) qual,pg_get_expr(p.polwithcheck,p.polrelid) check_expr from pg_policy p join pg_class c on c.oid=p.polrelid where c.relnamespace=\'public\'::regnamespace order by c.relname,p.polname")).rows;\n const views=(await db.query("select c.relname,pg_get_userbyid(c.relowner) owner,c.reloptions,md5(pg_get_viewdef(c.oid,true)) definition_md5 from pg_class c where c.relnamespace=\'public\'::regnamespace and c.relkind=\'v\' order by c.relname")).rows;\n const grants=(await db.query("select c.relname,pg_get_userbyid(a.grantor) grantor,case when a.grantee=0 then \'PUBLIC\' else pg_get_userbyid(a.grantee) end grantee,a.privilege_type,a.is_grantable from pg_class c cross join lateral aclexplode(coalesce(c.relacl,acldefault(\'r\',c.relowner))) a where c.relnamespace=\'public\'::regnamespace and c.relkind in (\'r\',\'v\') order by 1,2,3,4,5")).rows;\n const columns=(await db.query("select table_name,column_name,data_type,numeric_precision,numeric_scale,is_nullable,column_default from information_schema.columns where table_schema=\'public\' and ((table_name=\'lotes\' and column_name in (\'costo_unitario\',\'valor_base_costos\')) or (table_name=\'venta_detalles\' and column_name=\'costo_snapshot\') or (table_name=\'movimientos_inventario\' and column_name=\'costo_unitario\')) order by 1,2")).rows;\n const migrations=(await db.query(\'select version from web_schema_migrations order by version\')).rows;\n const apronax=(await db.query("select id::text,cantidad_disponible::text,costo_unitario::text from lotes where producto_id=\'dfade78c-7cd3-4fc0-8660-ae7e608cdf79\' order by id")).rows;\n const account=(await db.query("select e.ruc,e.empresa_codigo,e.activo empresa_activa,u.usuario,u.activo usuario_activo,u.debe_cambiar_password,a.estado,a.auth_version::text,a.estado_suscripcion,(a.fecha_inicio<=now() and a.fecha_vencimiento>now()) vigente from empresas e join usuarios u on u.empresa_id=e.id join empresa_acceso a on a.empresa_id=e.id where e.ruc=\'10460023039\' and u.usuario=\'edwinpiloto\'")).rows;\n return {tables,fingerprints,policies,views,grants,columns,migrations,apronax,account};\n}\n\nawait db.connect();try{\n await db.query(\'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY\');\n const id=(await db.query("select current_database() db,current_setting(\'transaction_read_only\') read_only")).rows[0];\n if(id.db!==\'eduxfac_web_piloto\'||id.read_only!==\'on\')throw Error(\'READONLY_PILOT_REQUIRED\');\n const result=await snapshot();await db.query(\'ROLLBACK\');console.log(JSON.stringify(result));\n}finally{await db.end();}\n'
def snapshot():
 r=subprocess.run([NODE,'--input-type=module','-'],input=SNAPSHOT_JS,capture_output=True,text=True,timeout=60);m.need(r.returncode==0,'READONLY_DB_FAILED');return json.loads(r.stdout)
def domains():
 for host in ['app.eduxfac.com','admin.eduxfac.com']:m.wait_stable('https://'+host+'/',lambda r:r['status']==200 and r['error_type'] is None,budget=20)
def state():
 m.check_scope();m.guard();s=json.loads((W/'BEFORE.json').read_text());p=json.loads((W/'MANIFEST.json').read_text())
 for n in m.FILES:
  if s['files'][n]['exists']:m.need(m.sha(W/'backup'/n)==s['files'][n]['sha256'],'BACKUP_INVALID')
 m.need(m.sha(W/'backup.tar.gz')==json.loads((W/'BACKUP.json').read_text())['sha256'],'BACKUP_ARCHIVE_CHANGED')
 return s,p
def unchanged(s):
 m.other_processes_unchanged(s);m.need(snapshot()==json.loads((W/'DB_BEFORE.json').read_text()),'DATABASE_OR_RLS_CHANGED')
def prepare():
 os.umask(0o077);p=m.preflight();ready=m.readiness();domains();s={'processes':m.processes(),'protected':m.inventory(),'files':{},'utc':m.utc(),'readiness':ready}
 for n in m.FILES:
  f=m.ROOT/n;exists=f.is_file();s['files'][n]={'exists':exists,'sha256':m.sha(f) if exists else None,'mode':f.stat().st_mode&0o777 if exists else 0o664}
  b=W/'backup'/n;b.parent.mkdir(parents=True,exist_ok=True,mode=0o700)
  if exists:b.write_bytes(f.read_bytes());os.chmod(b,0o600);m.need(m.sha(b)==p['before'][n],'BACKUP_MISMATCH')
  else:Path(str(b)+'.absent.json').write_text(json.dumps({'file':n,'existed_before':False}))
 m.save('BEFORE.json',s);m.save('DB_BEFORE.json',snapshot())
 with tarfile.open(W/'backup.tar.gz','w:gz') as tar:tar.add(W/'backup',arcname='backup');tar.add(W/'BEFORE.json',arcname='BEFORE.json');tar.add(W/'MANIFEST.json',arcname='MANIFEST.json')
 with tarfile.open(W/'backup.tar.gz') as tar:
  for n in m.FILES:
   if s['files'][n]['exists']:m.need(hashlib.sha256(tar.extractfile('backup/'+n).read()).hexdigest()==s['files'][n]['sha256'],'BACKUP_ARCHIVE_INVALID')
 m.save('BACKUP.json',{'path':str(W/'backup.tar.gz'),'sha256':m.sha(W/'backup.tar.gz'),'verified':True})
 state();m.source_matches(s,p,False);unchanged(s);print(json.dumps({'result':'PREPARE_OK','backup':json.loads((W/'BACKUP.json').read_text()),'before':p['before'],'after':p['after'],'pm2':m.guard()}))
def restore(s,p):
 result=m.restore(s,p);unchanged(s);m.save('ROLLBACK_DONE.json',{'ok':True,'readiness':result,'source_restored':True,'database_unchanged':True});return result
def assert_week(s):
 old=(W/'backup/public/index.html').read_text();now=(m.ROOT/'public/index.html').read_text()
 def block(src):
  i=src.index('<article class="dash-card dash-chart-card">');return src[i:src.index('</article>',i)+10]
 def fn(src):
  i=src.index('function renderDashWeek(');return src[i:i+src[i:].index('function ',10)]
 m.need(block(old)==block(now) and fn(old)==fn(now),'WEEK_CHART_CHANGED')
def verified(s,p):
 m.source_matches(s,p,True);unchanged(s);ready=m.readiness();domains();assert_week(s)
 for path,name,html in [('/', 'public/index.html',True),('/monthly-sales.js','public/monthly-sales.js',False),('/desktop-responsive.css','public/desktop-responsive.css',False)]:m.content_check(m.HTTPS+path,p['after'][name],html=html)
 m.save('VERIFY.json',{'ok':True,'readiness':ready,'source_hashes':p['after'],'other_processes_unchanged':True,'database_unchanged':True,'week_chart_unchanged':True,'https_assets_match':True});return ready
def apply():
 s,p=state();m.need(not (W/'APPLY_DONE.json').exists() and not (W/'FAILURE.json').exists(),'ALREADY_USED');changed=False
 try:
  m.source_matches(s,p,False);unchanged(s)
  # Modules first, HTML last; restart only WEB PILOTO after all five hashes match.
  for n in ['server/src/monthly-sales.js','public/monthly-sales.js','public/desktop-responsive.css','server/src/app.js','public/index.html']:
   data=(W/'payload'/n).read_bytes();m.need(hashlib.sha256(data).hexdigest()==p['after'][n],'PAYLOAD_CHANGED');m.atomic(m.ROOT/n,data,s['files'][n]['mode']);changed=True
  m.source_matches(s,p,True);m.restart();ready=verified(s,p)
  r=subprocess.run([NODE,str(W/'VERIFY_PILOT.mjs')],capture_output=True,text=True,timeout=90);m.need(r.returncode==0,'POST_DEPLOY_API_SQL_FAILED');api=json.loads(r.stdout);m.save('PILOT_API_SQL.json',api)
  unchanged(s);m.save('APPLY_DONE.json',{'result':'DEPLOY_OK_PENDING_BROWSER','readiness':ready,'backup':json.loads((W/'BACKUP.json').read_text()),'api_sql':api,'pm2':m.guard()});print(json.dumps({'result':'DEPLOY_OK_PENDING_BROWSER','api_sql':api,'readiness':ready}))
 except BaseException as e:
  failure=m.error_info(e);failure['rollback_ok']=False
  if changed:
   try:restore(s,p);failure['rollback_ok']=True
   except BaseException as re:failure['rollback_error']=m.error_info(re)
  m.save('FAILURE.json',failure);print(json.dumps({'result':'STOP',**failure}));raise SystemExit(1)
def final():
 s,p=state()
 try:ready=verified(s,p);m.save('FINAL_VERIFY.json',{'ok':True,'readiness':ready,'pm2':m.guard()});print('FINAL_OK')
 except BaseException as e:restore(s,p);m.save('FAILURE.json',{'result':'FINAL_FAILURE_ROLLED_BACK','code':type(e).__name__});raise
if __name__=='__main__':
 mode=sys.argv[1];{'--prepare':prepare,'--apply':apply,'--verify':final,'--rollback':lambda:restore(*state())}[mode]()
