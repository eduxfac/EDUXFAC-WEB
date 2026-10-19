from pathlib import Path
import sys,os,json,hashlib,importlib.util,subprocess,re,time
sys.dont_write_bytecode=True
WORK=Path(__file__).resolve().parent
TOOL=Path('/home/eduxadmin/.local/share/eduxfac/profitability_deploy_v2_20261013/APPLY_RENTABILIDAD_V2.py')
assert hashlib.sha256(TOOL.read_bytes()).hexdigest()=='90a1393ac5090aa3a95dd85730cd795cfc0269c37425ecfda7863827d090a785','READINESS_TOOL_CHANGED'
spec=importlib.util.spec_from_file_location('cost_readiness_v2',TOOL);m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
m.WORK=WORK;m.EXPECTED_WORK=WORK
m.FILES=['server/src/app.js','server/src/sale-profitability.js','server/src/inventory-entry.js','server/src/stock-cost.js','database/schema.sql','database/migrations/007_consistencia_costos.sql','public/index.html']
NODE='/home/eduxadmin/.local/opt/eduxfac-node24/bin/node'
def db_action(mode):
 r=subprocess.run([NODE,str(WORK/'MIGRATE_COSTS.mjs'),mode],capture_output=True,text=True,timeout=150)
 # All harness output is explicitly sanitized; do not expose pg errors or env values.
 need=r.returncode==0
 if r.stdout:
  try:m.event('database',mode=mode,result=json.loads(r.stdout))
  except ValueError:need=False
 m.need(need,'DB_HARNESS_FAILED_STOP')
 return json.loads(r.stdout)
def verified_backup():
 m.check_scope();m.guard()
 state=json.loads((WORK/'BEFORE.json').read_text());manifest=json.loads((WORK/'MANIFEST.json').read_text())
 for n in m.FILES:
  old=state['files'][n];p=WORK/'backup'/n
  m.need(m.sha(p)==old['sha256'] if old['exists'] else Path(str(p)+'.absent.json').is_file(),'BACKUP_INVALID')
 b=json.loads((WORK/'DB_BACKUP.json').read_text())
 m.need(m.sha(Path(b['path']))==b['sha256'] and b['archive_parse_valid'] and b['rows_verified'],'DB_BACKUP_INVALID')
 return state,manifest
def prepare():
 manifest=m.preflight();os.umask(0o077);m.set_phase('precheck');ready=m.readiness()
 state={'utc':m.utc(),'processes':m.processes(),'files':{},'protected':m.inventory(),'readiness':ready}
 m.set_phase('backup_files')
 for n in m.FILES:
  p=m.ROOT/n;exists=p.is_file();old={'exists':exists,'sha256':m.sha(p) if exists else None,'mode':p.stat().st_mode&0o777 if exists else 0o664}
  m.need(old['sha256']==manifest['before'][n],'BASELINE_CHANGED')
  state['files'][n]=old;b=WORK/'backup'/n;b.parent.mkdir(parents=True,exist_ok=True,mode=0o700)
  if exists:b.write_bytes(p.read_bytes());os.chmod(b,0o600);m.need(m.sha(b)==old['sha256'],'BACKUP_HASH_FAILED')
  else:Path(str(b)+'.absent.json').write_text(json.dumps({'file':n,'existed_before':False}),encoding='utf-8')
 m.save('BEFORE.json',state);m.set_phase('backup_database')
 db_action('--snapshot')
 baseline=json.loads((WORK/'DB_BEFORE.json').read_text())
 private=json.loads(Path('/home/eduxadmin/.config/eduxfac/pilot/SECRETS_PRIVATE.json').read_text())
 env=os.environ.copy();env.update(PGHOST='vmi3635195.contaboserver.net',PGPORT='5432',PGDATABASE='eduxfac_web_piloto',PGUSER='eduxfac_web_migrator',PGPASSWORD=private['roles']['eduxfac_web_migrator'],PGSSLMODE='verify-full',PGSSLROOTCERT='/etc/ssl/certs/ssl-cert-snakeoil.pem',PGOPTIONS='-c default_transaction_read_only=on')
 dump=WORK/'backup/eduxfac_web_piloto_pre007.dump'
 m.need(not dump.exists(),'BACKUP_ALREADY_EXISTS')
 r=subprocess.run(['/usr/bin/pg_dump','--format=custom','--enable-row-security','--inserts','--file',str(dump)],env=env,capture_output=True,timeout=150)
 m.need(r.returncode==0,'DB_DUMP_FAILED');os.chmod(dump,0o600)
 del env['PGPASSWORD'];del private
 r=subprocess.run(['/usr/bin/pg_restore','--list',str(dump)],capture_output=True,text=True,timeout=20)
 m.need(r.returncode==0,'DB_DUMP_TOC_INVALID')
 (WORK/'backup/DB_BACKUP_TOC.txt').write_text(r.stdout,encoding='utf-8')
 r=subprocess.run(['/usr/bin/pg_restore','--data-only','--file','-',str(dump)],capture_output=True,text=True,timeout=40)
 m.need(r.returncode==0,'DB_ARCHIVE_PARSE_FAILED')
 counts={}
 for name in re.findall(r'^INSERT INTO public\.([a-z_]+)\s',r.stdout,re.M):counts[name]=counts.get(name,0)+1
 m.need(all(counts.get(t,0)==v['rows'] for t,v in baseline['fingerprints'].items()),'DB_BACKUP_ROW_COUNTS_MISMATCH')
 r=None
 m.save('DB_BACKUP.json',{'utc':m.utc(),'path':str(dump),'sha256':m.sha(dump),'bytes':dump.stat().st_size,'database':'eduxfac_web_piloto','archive_parse_valid':True,'rows_verified':True,'tables_verified':len(baseline['fingerprints']),'RLS_dump_with_migrator_policy':True})
 verified_backup();m.source_matches(state,manifest,False);m.other_processes_unchanged(state)
 m.save('PREPARE_DONE.json',{'utc':m.utc(),'backup_files_verified':True,'backup_database_verified':True,'rollback_verified':True,'work':str(WORK),'migration_not_applied':True})
 print(json.dumps({'result':'COST_PREPARE_OK','work':str(WORK),'backup':str(WORK/'backup'),'file_backups':len(m.FILES),'database_backup_sha256':m.sha(dump),'pm2':m.guard()}))
def migrate():
 state,manifest=verified_backup()
 m.need(not (WORK/'MIGRATION_DONE.json').exists(),'MIGRATION_ALREADY_DONE_STOP')
 m.source_matches(state,manifest,False);m.other_processes_unchanged(state);m.set_phase('migration007')
 result=db_action('--apply');print(json.dumps(result))
def rollback():
 state,manifest=verified_backup()
 m.need(not (WORK/'ROLLBACK_DONE.json').exists(),'ROLLBACK_ALREADY_DONE')
 ready=m.restore(state,manifest)
 m.event('compatible_schema_retained',reason='Numeric widening and new nullable column are compatible with original code; no business rows reverted')
 print(json.dumps({'result':'COST_ROLLBACK_OK','readiness':ready,'compatible_007_retained':True}))
def deploy():
 state,manifest=verified_backup();m.need((WORK/'MIGRATION_DONE.json').is_file(),'007_REQUIRED')
 m.need(not (WORK/'APPLY_DONE.json').exists() and not (WORK/'FAILURE.json').exists(),'DEPLOY_ALREADY_USED_STOP')
 changed=False
 try:
  m.source_matches(state,manifest,False);m.other_processes_unchanged(state);db_action('--verify')
  m.set_phase('apply_seven_files')
  for n in m.FILES:
   data=(WORK/'payload'/n).read_bytes();m.need(hashlib.sha256(data).hexdigest()==manifest['after'][n],'PAYLOAD_CHANGED')
   m.atomic(m.ROOT/n,data,state['files'][n]['mode']);changed=True;m.event('file_applied',file=n,before=manifest['before'][n],after=m.sha(m.ROOT/n))
  m.source_matches(state,manifest,True)
  m.set_phase('restart_web_pilot');start=time.monotonic();m.restart()
  m.set_phase('readiness_v2');ready=m.readiness();ready_seconds=round(time.monotonic()-start,3)
  m.set_phase('html_and_domains')
  m.content_check(m.LOOPBACK+'/',manifest['after']['public/index.html'],html=True)
  m.content_check(m.HTTPS+'/',manifest['after']['public/index.html'],html=True)
  html=(m.ROOT/'public/index.html').read_text(encoding='utf-8')
  m.need(html.count('Compra promedio por documento')==1,'PURCHASE_LABEL_FAILED')
  for host in ['admin.eduxfac.com','eduxfac.com']:
   m.wait_stable('https://'+host+'/',lambda r:r['status']==200 and r['error_type'] is None,budget=15)
  m.source_matches(state,manifest,True);m.other_processes_unchanged(state)
  m.set_phase('database_post_readonly');post=db_action('--verify')
  m.set_phase('final_health');final=m.readiness()
  m.need(final['loopback']['pid']==ready['loopback']['pid'] and final['loopback']['restarts']==ready['loopback']['restarts'],'UNEXPECTED_RESTART')
  report={'utc':m.utc(),'result':'COST_CONSISTENCY_DEPLOY_OK','files':m.FILES,'before':manifest['before'],'after':manifest['after'],'readiness':ready,'final_readiness':final,'restart_and_readiness_seconds':ready_seconds,'pm2':m.guard(),'backup':str(WORK/'backup'),'rollback':str(WORK/'ROLLBACK_RENTABILIDAD_V2.py')+' --apply','CSP_valid':True,'purchase_label_valid':True,'other_processes_unchanged':True,'historical_data_unchanged':True,'apronax_repaired':False,'post_deploy_database':post,'isolated_regression':'PENDING'}
  m.save('APPLY_DONE.json',report);m.event('success');print(json.dumps(report))
 except Exception as e:
  failure=m.error_info(e);m.save('FAILURE.json',{**failure,'rollback_ok':False})
  if changed:
   try:m.restore(state,manifest);failure['rollback_ok']=True
   except Exception as error:failure['rollback_ok']=False;failure['rollback_error']=m.error_info(error)
  m.save('FAILURE.json',failure);print(json.dumps({'result':'FAILED_STOP',**failure}));raise SystemExit(1)
def verify():
 state,manifest=verified_backup();m.source_matches(state,manifest,True);m.other_processes_unchanged(state)
 post=db_action('--verify');ready=m.readiness();m.diagnostics()
 print(json.dumps({'result':'COST_FINAL_READONLY_OK','readiness':ready,'pm2':m.guard(),'db':post}))
if __name__=='__main__':
 try:
  m.need(len(sys.argv)==2 and sys.argv[1] in ['--prepare','--migrate','--apply','--rollback','--verify'],'MODE_INVALID')
  {'--prepare':prepare,'--migrate':migrate,'--apply':deploy,'--rollback':rollback,'--verify':verify}[sys.argv[1]]()
 except Exception as e:
  if isinstance(e,SystemExit):raise
  print(json.dumps({'result':'STOP','phase':m.PHASE,'code':str(e) if isinstance(e,m.DeploymentError) else type(e).__name__}));raise SystemExit(1)
