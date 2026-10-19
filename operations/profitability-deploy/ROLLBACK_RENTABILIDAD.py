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
 need(sys.argv[1:]==['--apply'],'ROLLBACK_NOT_REQUESTED')
 check_scope();guard()
 state=json.loads((WORK/'BEFORE.json').read_text());manifest=json.loads((WORK/'MANIFEST.json').read_text())
 restore(state,manifest)
 (WORK/'ROLLBACK_DONE.json').write_text(json.dumps({'rolled_back':True,'files':FILES,'health':health()}))
 print('RENTABILIDAD_ROLLBACK_OK')
