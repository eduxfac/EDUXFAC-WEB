from pathlib import Path
import sys,os,json,hashlib,subprocess,importlib.util,time
sys.dont_write_bytecode=True
WORK=Path(__file__).resolve().parent
TOOL=Path('/home/eduxadmin/.local/share/eduxfac/profitability_deploy_v2_20261013/APPLY_RENTABILIDAD_V2.py')
assert hashlib.sha256(TOOL.read_bytes()).hexdigest()=='90a1393ac5090aa3a95dd85730cd795cfc0269c37425ecfda7863827d090a785','READINESS_TOOL_CHANGED'
spec=importlib.util.spec_from_file_location('active_search_readiness',TOOL);m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
m.WORK=WORK;m.EXPECTED_WORK=WORK;m.FILES=['public/index.html','public/desktop-responsive.css']
NODE='/home/eduxadmin/.local/opt/eduxfac-node24/bin/node'
def db_snapshot():
 r=subprocess.run([NODE,str(WORK/'READONLY_DB.mjs')],capture_output=True,text=True,timeout=45)
 m.need(r.returncode==0,'READONLY_DB_FAILED')
 return json.loads(r.stdout)
def state_files():
 m.check_scope();m.guard()
 state=json.loads((WORK/'BEFORE.json').read_text());manifest=json.loads((WORK/'MANIFEST.json').read_text())
 for n in m.FILES:m.need(m.sha(WORK/'backup'/n)==state['files'][n]['sha256'],'BACKUP_INVALID')
 return state,manifest
def db_unchanged():
 now=db_snapshot();old=json.loads((WORK/'DB_BEFORE.json').read_text())
 m.need(now==old,'DATABASE_CHANGED_STOP')
 m.save('DB_POST.json',{'utc':m.utc(),'all_48_table_fingerprints_unchanged':True,'RLS_policies_grants_schema_unchanged':True,'apronax_unchanged':now['apronax'],'account_unchanged':True})
 return True
def prepare():
 manifest=m.preflight();os.umask(0o077)
 m.set_phase('precheck');ready=m.readiness()
 for host in ['admin.eduxfac.com','eduxfac.com']:
  r=m.request('https://'+host+'/');m.need(r['status']==200 and r['error_type'] is None,'BASELINE_DOMAIN_FAILED')
 state={'utc':m.utc(),'processes':m.processes(),'files':{},'protected':m.inventory(),'readiness':ready}
 for n in m.FILES:
  p=m.ROOT/n;m.need(p.is_file() and m.sha(p)==manifest['before'][n],'BASELINE_CHANGED')
  state['files'][n]={'exists':True,'sha256':m.sha(p),'mode':p.stat().st_mode&0o777}
  b=WORK/'backup'/n;b.parent.mkdir(parents=True,exist_ok=True,mode=0o700);b.write_bytes(p.read_bytes());os.chmod(b,0o600)
  m.need(m.sha(b)==manifest['before'][n],'BACKUP_HASH_MISMATCH')
 m.save('BEFORE.json',state);m.save('DB_BEFORE.json',db_snapshot())
 state_files();m.source_matches(state,manifest,False);m.other_processes_unchanged(state)
 m.save('PREPARE_DONE.json',{'utc':m.utc(),'backup_verified':True,'rollback_ready':True,'only_two_source_files':True})
 print(json.dumps({'result':'PURCHASE_VISUAL_PRECHECK_BACKUP_OK','work':str(WORK),'backup':str(WORK/'backup'),'before':manifest['before'],'candidate':manifest['after'],'pm2':m.guard()}))
def apply():
 state,manifest=state_files()
 m.need(not (WORK/'APPLY_DONE.json').exists() and not (WORK/'FAILURE.json').exists(),'DEPLOY_ALREADY_USED')
 changed=False
 try:
  m.source_matches(state,manifest,False);m.other_processes_unchanged(state);db_unchanged()
  m.set_phase('apply_two_files')
  for n in m.FILES:
   data=(WORK/'payload'/n).read_bytes();m.need(hashlib.sha256(data).hexdigest()==manifest['after'][n],'PAYLOAD_CHANGED')
   m.atomic(m.ROOT/n,data,state['files'][n]['mode']);changed=True;m.event('file_applied',file=n,before=manifest['before'][n],after=m.sha(m.ROOT/n))
  m.source_matches(state,manifest,True)
  m.set_phase('restart_web_pilot');start=time.monotonic();m.restart()
  m.set_phase('readiness_v2');ready=m.readiness();seconds=round(time.monotonic()-start,3)
  m.set_phase('frontend_and_domains')
  m.content_check(m.LOOPBACK+'/',manifest['after']['public/index.html'],html=True)
  m.content_check(m.HTTPS+'/',manifest['after']['public/index.html'],html=True)
  m.content_check(m.LOOPBACK+'/desktop-responsive.css',manifest['after']['public/desktop-responsive.css'])
  m.content_check(m.HTTPS+'/desktop-responsive.css',manifest['after']['public/desktop-responsive.css'])
  for host in ['admin.eduxfac.com','eduxfac.com']:
   m.wait_stable('https://'+host+'/',lambda r:r['status']==200 and r['error_type'] is None,budget=15)
  m.source_matches(state,manifest,True);m.other_processes_unchanged(state);db_unchanged()
  m.set_phase('final_health');final=m.readiness()
  m.need(final['loopback']['pid']==ready['loopback']['pid'] and final['loopback']['restarts']==ready['loopback']['restarts'],'UNEXPECTED_RESTART')
  result={'utc':m.utc(),'result':'PURCHASE_VISUAL_TWO_FILES_DEPLOY_OK','files':m.FILES,'before':manifest['before'],'after':manifest['after'],'backup':str(WORK/'backup'),'rollback':str(WORK/'ROLLBACK_RENTABILIDAD_V2.py')+' --apply','readiness':ready,'final_readiness':final,'restart_and_readiness_seconds':seconds,'pm2':m.guard(),'other_processes_unchanged':True,'database_unchanged':True,'schema_migration_executed':False,'CSP_valid':True,'post_deploy_functional_tests':'PENDING_ISOLATED_NO_REAL_PURCHASE_VISUAL_CREATED'}
  m.save('APPLY_DONE.json',result);m.event('success');print(json.dumps(result))
 except Exception as e:
  failure=m.error_info(e);m.save('FAILURE.json',{**failure,'rollback_ok':False})
  if changed:
   try:m.restore(state,manifest);failure['rollback_ok']=True
   except Exception as re:failure['rollback_ok']=False;failure['rollback_error']=m.error_info(re)
  m.save('FAILURE.json',failure);print(json.dumps({'result':'FAILED_STOP',**failure}));raise SystemExit(1)
def rollback():
 state,manifest=state_files();m.need(not (WORK/'ROLLBACK_DONE.json').exists(),'ROLLBACK_ALREADY_DONE')
 m.restore(state,manifest);print('PURCHASE_VISUAL_ROLLBACK_OK')
def verify():
 state,manifest=state_files();m.source_matches(state,manifest,True);m.other_processes_unchanged(state);db_unchanged()
 ready=m.readiness();m.diagnostics();print(json.dumps({'result':'PURCHASE_VISUAL_FINAL_READONLY_OK','pm2':m.guard(),'readiness':ready,'database_unchanged':True}))
if __name__=='__main__':
 try:
  m.need(sys.argv[1:] in [['--prepare'],['--apply'],['--rollback'],['--verify']],'MODE_INVALID')
  {'--prepare':prepare,'--apply':apply,'--rollback':rollback,'--verify':verify}[sys.argv[1]]()
 except Exception as e:
  print(json.dumps({'result':'STOP','phase':m.PHASE,'code':str(e) if isinstance(e,m.DeploymentError) else type(e).__name__}));raise SystemExit(1)
