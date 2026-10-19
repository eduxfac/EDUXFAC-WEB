from pathlib import Path
import sys,os,json,hashlib,importlib.util,subprocess,time,re,base64
sys.dont_write_bytecode=True
W=Path(__file__).resolve().parent
T=Path('/home/eduxadmin/.local/share/eduxfac/profitability_deploy_v2_20261013/APPLY_RENTABILIDAD_V2.py')
assert hashlib.sha256(T.read_bytes()).hexdigest()=='90a1393ac5090aa3a95dd85730cd795cfc0269c37425ecfda7863827d090a785','READINESS_TOOL_CHANGED'
spec=importlib.util.spec_from_file_location('requirement_readiness',T);m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
m.WORK=W;m.EXPECTED_WORK=W;m.FILES=['server/src/app.js', 'server/src/purchase-requirement.js', 'server/src/access-policy.js', 'public/index.html', 'public/purchase-requirement.js', 'public/desktop-responsive.css']
NODE='/home/eduxadmin/.local/opt/eduxfac-node24/bin/node'
def csp_valid(body,headers):
 html=body.decode('utf-8').replace('\r\n','\n').replace('\r','\n')
 blocks=[x[1] for x in re.finditer(r'<script\b[^>]*>([\s\S]*?)</script>',html,re.I) if x[1].strip()]
 csp=next((v for k,v in headers.items() if k.lower()=='content-security-policy'),'')
 script=next((x.strip() for x in csp.split(';') if x.strip().startswith('script-src ')),'')
 return bool(blocks) and "'unsafe-inline'" not in script and "'unsafe-eval'" not in script and all("'sha256-"+base64.b64encode(hashlib.sha256(b.encode()).digest()).decode()+"'" in script for b in blocks)
m.csp_valid=csp_valid
def snapshot():
 r=subprocess.run([NODE,str(W/'READONLY_DB.mjs')],capture_output=True,text=True,timeout=90);m.need(r.returncode==0,'READONLY_DB_FAILED');return json.loads(r.stdout)
def domains():
 for host in ['app.eduxfac.com','admin.eduxfac.com','eduxfac.com']:m.wait_stable('https://'+host+'/',lambda r:r['status']==200 and r['error_type'] is None,budget=20)
def state():
 m.check_scope();m.guard();s=json.loads((W/'BEFORE.json').read_text());p=json.loads((W/'MANIFEST.json').read_text())
 for n in m.FILES:
  old=s['files'][n]
  if old['exists']:m.need(m.sha(W/'backup'/n)==old['sha256'],'BACKUP_INVALID')
  else:m.need(json.loads(Path(str(W/'backup'/n)+'.absent.json').read_text())=={'file':n,'existed_before':False},'ABSENCE_MARKER_INVALID')
 return s,p
def db_unchanged():
 now=snapshot();old=json.loads((W/'DB_BEFORE.json').read_text());m.need(now==old,'DATABASE_OR_RLS_CHANGED');m.save('DB_VERIFIED.json',{'database_unchanged':True,'RLS_schema_grants_unchanged':True,'all_table_fingerprints_unchanged':True,'force_rls_tables':sum(t['force_rls'] for t in now['tables'])})
def prepare():
 os.umask(0o077);p=m.preflight();m.readiness();domains();s={'processes':m.processes(),'protected':m.inventory(),'files':{},'utc':m.utc()}
 for n in m.FILES:
  f=m.ROOT/n;exists=f.exists();s['files'][n]={'exists':exists,'sha256':m.sha(f) if exists else None,'mode':f.stat().st_mode&0o777 if exists else 0o664};b=W/'backup'/n;b.parent.mkdir(parents=True,exist_ok=True,mode=0o700)
  if exists:b.write_bytes(f.read_bytes());os.chmod(b,0o600);m.need(m.sha(b)==p['before'][n],'BACKUP_INVALID')
  else:marker=Path(str(b)+'.absent.json');marker.write_text(json.dumps({'file':n,'existed_before':False}));os.chmod(marker,0o600)
 m.save('BEFORE.json',s);m.save('DB_BEFORE.json',snapshot());state();m.source_matches(s,p,False);m.other_processes_unchanged(s);print(json.dumps({'result':'PREPARE_OK','backup':str(W/'backup'),'before':p['before'],'after':p['after']}))
def served(p):
 out={}
 for n in ['public/index.html','public/purchase-requirement.js','public/desktop-responsive.css']:
  url=m.HTTPS+('/' if n.endswith('index.html') else '/'+n.split('/',1)[1]);out[n]=m.content_check(url,p['after'][n],html=n.endswith('index.html'))
 m.save('HTTPS_ASSETS.json',out);return out
def rollback():return m.restore(*state())
def apply():
 s,p=state();m.need(not any((W/n).exists() for n in ['APPLY_DONE.json','FAILURE.json','ROLLBACK_DONE.json']),'ALREADY_USED');changed=False
 try:
  m.source_matches(s,p,False);m.other_processes_unchanged(s);db_unchanged();m.set_phase('apply_six_files')
  for n in m.FILES:
   data=(W/'payload'/n).read_bytes();m.need(hashlib.sha256(data).hexdigest()==p['after'][n],'PAYLOAD_CHANGED');m.atomic(m.ROOT/n,data,s['files'][n]['mode']);changed=True;m.event('file_applied',file=n,before=p['before'][n],after=m.sha(m.ROOT/n))
  m.source_matches(s,p,True);start=time.monotonic();m.set_phase('restart');m.restart();m.set_phase('readiness');ready=m.readiness();duration=round(time.monotonic()-start,3);domains();assets=served(p);m.source_matches(s,p,True);m.other_processes_unchanged(s);db_unchanged()
  result={'result':'REQUIREMENT_DEPLOY_OK','before':p['before'],'after':p['after'],'backup':str(W/'backup'),'readiness':ready,'restart_readiness_seconds':duration,'pm2':m.guard(),'only_six_release_files_changed':True,'database_unchanged':True,'other_processes_unchanged':True,'rollback':'python3 '+str(W/'DEPLOY_REQUIREMENT.py')+' --rollback'};m.save('APPLY_DONE.json',result);print(json.dumps(result))
 except Exception as e:
  f=m.error_info(e);f['rollback_ok']=False
  if changed:
   try:m.restore(s,p);f['rollback_ok']=True
   except Exception as re:f['rollback_error']=m.error_info(re)
  m.save('FAILURE.json',f);print(json.dumps({'result':'STOP',**f}));sys.exit(1)
def verify():
 s,p=state()
 try:
  m.source_matches(s,p,True);m.other_processes_unchanged(s);db_unchanged();r=m.readiness();domains();served(p);m.diagnostics();m.save('FINAL_VERIFY.json',{'result':'FINAL_OK','readiness':r,'pm2':m.guard(),'database_unchanged':True,'only_six_release_files_changed':True});print('FINAL_OK')
 except Exception as e:
  m.save('FINAL_FAILURE.json',m.error_info(e));m.restore(s,p);raise
if __name__=='__main__':
 try:
  m.need(sys.argv[1:] in [['--prepare'],['--apply'],['--verify'],['--rollback']],'INVALID_MODE');{'--prepare':prepare,'--apply':apply,'--verify':verify,'--rollback':rollback}[sys.argv[1]]()
 except Exception as e:print(json.dumps({'result':'STOP','code':str(e) if isinstance(e,m.DeploymentError) else type(e).__name__}));sys.exit(1)
