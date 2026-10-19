from pathlib import Path
import sys,os,json,hashlib,importlib.util,subprocess,time
sys.dont_write_bytecode=True
W=Path(__file__).resolve().parent
T=Path('/home/eduxadmin/.local/share/eduxfac/profitability_deploy_v2_20261013/APPLY_RENTABILIDAD_V2.py')
assert hashlib.sha256(T.read_bytes()).hexdigest()=='90a1393ac5090aa3a95dd85730cd795cfc0269c37425ecfda7863827d090a785','READINESS_TOOL_CHANGED'
spec=importlib.util.spec_from_file_location('count_readiness',T);m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
m.WORK=W;m.EXPECTED_WORK=W;m.FILES=['server/src/initial-inventory.js']
NODE='/home/eduxadmin/.local/opt/eduxfac-node24/bin/node'
def snapshot():
 r=subprocess.run([NODE,str(W/'READONLY_DB.mjs')],capture_output=True,text=True,timeout=60);m.need(r.returncode==0,'READONLY_DB_FAILED');return json.loads(r.stdout)
def domains():
 for host in ['app.eduxfac.com','admin.eduxfac.com','eduxfac.com']:
  m.wait_stable('https://'+host+'/',lambda r:r['status']==200 and r['error_type'] is None,budget=20)
def state():
 m.check_scope();m.guard();s=json.loads((W/'BEFORE.json').read_text());p=json.loads((W/'MANIFEST.json').read_text());m.need(m.sha(W/'backup'/m.FILES[0])==s['files'][m.FILES[0]]['sha256'],'BACKUP_INVALID');return s,p
def db_unchanged():
 now=snapshot();old=json.loads((W/'DB_BEFORE.json').read_text());m.need(now==old,'DATABASE_OR_RLS_CHANGED');m.save('DB_VERIFIED.json',{'database_unchanged':True,'RLS_schema_grants_unchanged':True,'all_table_fingerprints_unchanged':True})
def restore(s,p):
 m.set_phase('rollback');m.guard();n=m.FILES[0];m.need(m.sha(m.ROOT/n) in [p['before'][n],p['after'][n]],'THIRD_PARTY_CHANGE');m.need(m.sha(W/'backup'/n)==p['before'][n],'BACKUP_INVALID');m.atomic(m.ROOT/n,(W/'backup'/n).read_bytes(),s['files'][n]['mode']);m.restart();r=m.readiness();domains();m.source_matches(s,p,False);m.other_processes_unchanged(s);m.save('ROLLBACK_DONE.json',{'ok':True,'readiness':r});return r
def prepare():
 os.umask(0o077);p=m.preflight();m.readiness();domains();s={'processes':m.processes(),'protected':m.inventory(),'files':{},'utc':m.utc()}
 for n in m.FILES:
  f=m.ROOT/n;s['files'][n]={'exists':True,'sha256':m.sha(f),'mode':f.stat().st_mode&0o777};b=W/'backup'/n;b.parent.mkdir(parents=True,mode=0o700);b.write_bytes(f.read_bytes());os.chmod(b,0o600);m.need(m.sha(b)==p['before'][n],'BACKUP_INVALID')
 m.save('BEFORE.json',s);m.save('DB_BEFORE.json',snapshot());state();m.source_matches(s,p,False);m.other_processes_unchanged(s);print(json.dumps({'result':'PREPARE_OK','backup':str(W/'backup'/m.FILES[0]),'before':p['before'],'after':p['after']}))
def apply():
 s,p=state();m.need(not (W/'APPLY_DONE.json').exists() and not (W/'FAILURE.json').exists(),'ALREADY_USED');changed=False
 try:
  m.source_matches(s,p,False);m.other_processes_unchanged(s);db_unchanged();n=m.FILES[0];data=(W/'payload'/n).read_bytes();m.need(hashlib.sha256(data).hexdigest()==p['after'][n],'PAYLOAD_CHANGED');m.atomic(m.ROOT/n,data,s['files'][n]['mode']);changed=True;m.source_matches(s,p,True)
  start=time.monotonic();m.restart();ready=m.readiness();duration=round(time.monotonic()-start,3);domains();m.source_matches(s,p,True);m.other_processes_unchanged(s);db_unchanged()
  r={'result':'INITIAL_OPENING_DEPLOY_OK','before':p['before'],'after':p['after'],'backup':str(W/'backup'/n),'readiness':ready,'restart_readiness_seconds':duration,'pm2':m.guard(),'only_one_release_file_changed':True,'database_unchanged':True,'other_processes_unchanged':True,'rollback':str(W/'DEPLOY_IMPORTER.py')+' --rollback'};m.save('APPLY_DONE.json',r);print(json.dumps(r))
 except Exception as e:
  f=m.error_info(e);f['rollback_ok']=False
  if changed:
   try:restore(s,p);f['rollback_ok']=True
   except Exception as re:f['rollback_error']=m.error_info(re)
  m.save('FAILURE.json',f);print(json.dumps({'result':'STOP',**f}));sys.exit(1)
def verify():
 s,p=state();m.source_matches(s,p,True);m.other_processes_unchanged(s);db_unchanged();r=m.readiness();domains();m.diagnostics();m.save('FINAL_VERIFY.json',{'result':'FINAL_OK','readiness':r,'pm2':m.guard(),'database_unchanged':True,'only_one_release_file_changed':True});print('FINAL_OK')
if __name__=='__main__':
 try:
  m.need(sys.argv[1:] in [['--prepare'],['--apply'],['--verify'],['--rollback']],'INVALID_MODE')
  {'--prepare':prepare,'--apply':apply,'--verify':verify,'--rollback':lambda:restore(*state())}[sys.argv[1]]()
 except Exception as e:
  print(json.dumps({'result':'STOP','code':str(e) if isinstance(e,m.DeploymentError) else type(e).__name__}));sys.exit(1)
