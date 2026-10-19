from pathlib import Path
import sys,os,json,hashlib,tempfile,subprocess,time,urllib.request,getpass
ROOT=Path('/home/eduxadmin/eduxfac/releases/phase12b_20261013_0625/web')
WORK=Path(__file__).resolve().parent
FILES=['server/src/app.js','server/src/sale-profitability.js','public/index.html','public/sale-profitability.js']
def need(ok,code):
 if not ok:raise RuntimeError(code)
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def check_scope():
 need(sys.platform=='linux' and getpass.getuser()=='eduxadmin','VPS_EDUXADMIN_ONLY')
 need(str(WORK).startswith('/home/eduxadmin/.local/share/eduxfac/'),'WORK_DIRECTORY_INVALID')
 need(ROOT.resolve()==ROOT,'RELEASE_SYMLINK')
 for name in FILES:
  p=ROOT/name;need(p.parent.resolve()==p.parent and p.resolve()==p,'TARGET_SYMLINK')
def processes():
 r=subprocess.run(['/usr/bin/pm2','jlist'],capture_output=True,text=True,timeout=20);need(r.returncode==0,'PM2_READ_FAILED')
 out={}
 for p in json.loads(r.stdout[r.stdout.index('['):]):
  e=p['pm2_env'];out[p['name']]={'id':p['pm_id'],'pid':p['pid'],'status':e['status'],'restarts':e['restart_time'],'cwd':e['pm_cwd'],'script':e['pm_exec_path'],'mode':e.get('EDUXFAC_DATA_MODE'),'port':str(e.get('PORT','')),'worker':e.get('EXPIRATION_WORKER_ENABLED'),'mutation':e.get('EDUXFAC_SUBSCRIPTION_WORKER_ALLOW_MUTATION')}
 return out
def guard():
 p=processes()['EDUXFAC-WEB-PILOTO']
 need(p['id']==4 and p['cwd']==str(ROOT) and p['script']==str(ROOT/'server/start.mjs'),'PROCESS_CHANGED')
 need(p['mode']=='PILOTO' and p['port']=='3001' and p['worker']=='false' and p['mutation']=='no','RUNTIME_CHANGED')
 return p
def atomic(path,data,mode):
 need(path in [ROOT/name for name in FILES],'FILE_NOT_ALLOWED')
 fd,temp=tempfile.mkstemp(prefix='.profit-deploy-',dir=path.parent)
 try:
  with os.fdopen(fd,'wb') as f:f.write(data);f.flush();os.fsync(f.fileno())
  os.chmod(temp,mode);os.replace(temp,path)
 finally:
  if Path(temp).exists():Path(temp).unlink()
def restart():
 guard();r=subprocess.run(['/usr/bin/pm2','restart','4'],capture_output=True,text=True,timeout=30)
 need(r.returncode==0,'WEB_PILOT_RESTART_FAILED')
def restore(state,manifest):
 # Entire preflight happens before rollback writes. Never overwrite third-party changes.
 for name in FILES:
  p=ROOT/name;old=state['files'][name]
  if p.exists():need(sha(p) in [old['sha256'],manifest['after'][name]],'CURRENT_CHANGED_NO_ROLLBACK')
  if old['exists']:need(sha(WORK/'backup'/name)==old['sha256'],'BACKUP_MISMATCH')
 for name in FILES:
  p=ROOT/name;old=state['files'][name]
  if old['exists']:atomic(p,(WORK/'backup'/name).read_bytes(),old['mode'])
  elif p.exists():
   need(sha(p)==manifest['after'][name],'NEW_FILE_CHANGED_NO_DELETE');p.unlink()
 restart()
 for name,old in state['files'].items():
  p=ROOT/name
  need((p.exists() and sha(p)==old['sha256']) if old['exists'] else not p.exists(),'ROLLBACK_VERIFY_FAILED')
opener=urllib.request.build_opener(urllib.request.ProxyHandler({}))
def get(url):
 with opener.open(urllib.request.Request(url,headers={'Cache-Control':'no-cache'}),timeout=5) as r:return r.status,r.read(),r.headers
def health():
 status,b,_=get('https://app.eduxfac.com/api/health');d=json.loads(b)
 need(status==200 and d.get('ok') is True and d.get('database') is True and d.get('data_mode')=='PILOTO','HEALTH_FAILED')
 return {'status':status,'data_mode':d['data_mode']}

if __name__=='__main__':
 need(sys.argv[1:]==['--apply'],'APPLY_NOT_REQUESTED')
 check_scope();guard()
 need(not(WORK/'BEFORE.json').exists(),'BACKUP_ALREADY_EXISTS_STOP')
 manifest=json.loads((WORK/'MANIFEST.json').read_text())
 for name in FILES:
  p=ROOT/name;old=manifest['before'][name]
  need((p.is_file() and sha(p)==old) if old is not None else not p.exists(),'BASELINE_CHANGED_STOP')
  need(sha(WORK/'payload'/name)==manifest['after'][name],'PAYLOAD_HASH_MISMATCH')
 node='/home/eduxadmin/.local/opt/eduxfac-node24/bin/node'
 for name in FILES:
  if name.endswith('.js'):
   r=subprocess.run([node,'--check',str(WORK/'payload'/name)],capture_output=True,timeout=15)
   need(r.returncode==0,'PAYLOAD_SYNTAX_FAILED')
 need((WORK/'ROLLBACK_RENTABILIDAD.py').is_file(),'ROLLBACK_MISSING')
 state={'processes':processes(),'files':{},'protected':{}}
 for part in ['server','public','database']:
  for path in (ROOT/part).rglob('*'):
   if path.is_file():state['protected'][str(path.relative_to(ROOT))]=sha(path)
 for name in FILES:
  p=ROOT/name;exists=p.exists()
  state['files'][name]={'exists':exists,'sha256':sha(p) if exists else None,'mode':p.stat().st_mode&0o777 if exists else 0o664}
  if exists:
   b=WORK/'backup'/name;b.parent.mkdir(parents=True,exist_ok=True)
   b.write_bytes(p.read_bytes());need(sha(b)==sha(p),'BACKUP_COPY_FAILED')
  else:
   marker=WORK/'backup'/(name+'.absent.json');marker.parent.mkdir(parents=True,exist_ok=True)
   marker.write_text(json.dumps({'file':name,'existed_before':False,'sha256_before':None}))

 os.chmod(WORK,0o700);(WORK/'BEFORE.json').write_text(json.dumps(state,indent=2));os.chmod(WORK/'BEFORE.json',0o600)
 changed=False
 try:
  for name in FILES:atomic(ROOT/name,(WORK/'payload'/name).read_bytes(),state['files'][name]['mode']);changed=True
  restart();time.sleep(1)
  for name in FILES:need(sha(ROOT/name)==manifest['after'][name],'FINAL_HASH_FAILED')
  samples=[]
  for i in range(3):
   samples.append(health())
   status,b,headers=get('https://app.eduxfac.com/')
   need(status==200 and hashlib.sha256(b).hexdigest()==manifest['after']['public/index.html'],'HTTPS_HTML_MISMATCH')
   import re,base64
   html=b.decode().replace('\r\n','\n').replace('\r','\n')
   blocks=[m.group(1) for m in re.finditer(r'<script\b[^>]*>([\s\S]*?)</script>',html,re.I) if m.group(1).strip()]
   csp=headers.get('Content-Security-Policy','')
   need(len(blocks)==5 and "'unsafe-eval'" not in csp and "'unsafe-inline'" not in csp.split(';')[1],'CSP_INVALID')
   need(all("'sha256-"+base64.b64encode(hashlib.sha256(body.encode()).digest()).decode()+"'" in csp for body in blocks),'CSP_HASH_FAILED')
   time.sleep(1)
  # Health/HTTP/hash failures below trigger immediate rollback; no retries.
  
  status,b,_=get('https://app.eduxfac.com/sale-profitability.js')
  need(status==200 and hashlib.sha256(b).hexdigest()==manifest['after']['public/sale-profitability.js'],'FRONTEND_ASSET_MISMATCH')
  https={h:get('https://'+h+'/')[0] for h in ['app.eduxfac.com','admin.eduxfac.com','eduxfac.com']}
  need(all(s==200 for s in https.values()),'HTTPS_FAILED')
  for name in FILES:need(sha(ROOT/name)==manifest['after'][name],'FINAL_HASH_FAILED')
  protected_after={}
  for part in ['server','public','database']:
   for path in (ROOT/part).rglob('*'):
    if path.is_file():protected_after[str(path.relative_to(ROOT))]=sha(path)
  changed_files=sorted(name for name in set(state['protected'])|set(protected_after) if state['protected'].get(name)!=protected_after.get(name))
  need(changed_files==sorted(FILES),'UNAUTHORIZED_FILE_CHANGE')
  after=processes()
  for name in ['eduxfac','EDUXFAC-PANEL-PILOTO']:need(after[name]==state['processes'][name],'OTHER_PROCESS_CHANGED')
  status,_,_=get('https://app.eduxfac.com/api/health');need(status==200,'FINAL_HEALTH_FAILED')
  report={'applied':True,'files':FILES,'changed_files':changed_files,'sha256':manifest['after'],'health':samples,'https':https,'rollback':str(WORK/'ROLLBACK_RENTABILIDAD.py'),'other_processes_unchanged':True,'real_customer_test':'PENDING_USER_NORMAL_UI','database_config_modified':False}
  (WORK/'APPLY_DONE.json').write_text(json.dumps(report,indent=2));print('RENTABILIDAD_DEPLOY_OK')
 except Exception as e:
  rolled=False
  if changed:
   try:restore(state,manifest);rolled=True
   except Exception:pass
  (WORK/'FAILURE.json').write_text(json.dumps({'error_code':str(e) if isinstance(e,RuntimeError) else type(e).__name__,'rollback_ok':rolled}))
  print('DETENER_DEPLOY_FAILED_ROLLBACK_'+str(rolled));raise SystemExit(1)
