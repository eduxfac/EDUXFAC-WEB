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

# V2 is prepared locally only; importing this module never changes a server.
import datetime,ssl,socket,urllib.error,re,base64,signal

LOOPBACK='http://127.0.0.1:3001'
HTTPS='https://app.eduxfac.com'
EXPECTED_WORK=Path('/home/eduxadmin/.local/share/eduxfac/profitability_deploy_v2_20261013')
MAX_BODY=2*1024*1024
opener=urllib.request.build_opener(urllib.request.ProxyHandler({}))
PHASE='preflight'

def utc():return datetime.datetime.now(datetime.timezone.utc).isoformat()
def save(name,data):
 p=WORK/name
 with p.open('w',encoding='utf-8') as f:
  os.chmod(p,0o600);json.dump(data,f,indent=2);f.flush();os.fsync(f.fileno())
def event(kind,**data):
 record={'utc':utc(),'phase':PHASE,'kind':kind,**data}
 p=WORK/'EVENTS.jsonl'
 with p.open('a',encoding='utf-8') as f:
  os.chmod(p,0o600);f.write(json.dumps(record)+'\n');f.flush();os.fsync(f.fileno())
def set_phase(name):
 global PHASE
 PHASE=name;event('phase')

class DeploymentError(RuntimeError):
 def __init__(self,code,details=None):
  super().__init__(code);self.details=details or {}

def need(ok,code):
 if not ok:raise DeploymentError(code)

def safe_body(body):
 # Whitelist only booleans and known environment names, never echo arbitrary errors.
 out={'bytes':len(body),'sha256':hashlib.sha256(body).hexdigest()}
 try:
  d=json.loads(body)
  if isinstance(d,dict):
   for k in ['ok','database']:
    if type(d.get(k)) is bool:out[k]=d[k]
   if d.get('data_mode') in ['PILOTO','DEMO','PRODUCCION']:out['data_mode']=d['data_mode']
 except (ValueError,UnicodeError):pass
 for label in ['502 Bad Gateway','503 Service Temporarily Unavailable','504 Gateway Time-out','404 Not Found','500 Internal Server Error']:
  if label.encode() in body:out['http_error_title']=label;break
 return out

def transport_kind(error):
 reason=getattr(error,'reason',error)
 if isinstance(reason,ssl.SSLError):return 'TLS'
 if isinstance(reason,(TimeoutError,socket.timeout)):return 'TIMEOUT'
 if isinstance(reason,ConnectionRefusedError):return 'CONNECTION_REFUSED'
 if isinstance(reason,socket.gaierror):return 'DNS'
 return 'TRANSPORT'

def request(url,attempt=1,timeout=3):
 start=utc();t=time.monotonic();status=None;body=b'';headers={};category=None;final_url=url
 try:
  with opener.open(urllib.request.Request(url,headers={'Cache-Control':'no-cache'}),timeout=timeout) as r:
   status=r.status;body=r.read(MAX_BODY+1);headers=dict(r.headers);final_url=r.geturl()
 except urllib.error.HTTPError as e:
  status=e.code;final_url=e.geturl();headers=dict(e.headers or {});category='HTTP'
  try:body=e.read(MAX_BODY+1)
  except (urllib.error.URLError,ssl.SSLError,OSError) as body_error:category=transport_kind(body_error)
 except (urllib.error.URLError,ssl.SSLError,OSError) as e:category=transport_kind(e)
 if len(body)>MAX_BODY:body=b'';category='BODY_LIMIT'
 if final_url!=url:category='UNEXPECTED_REDIRECT'
 record={'started_utc':start,'ended_utc':utc(),'duration_ms':round((time.monotonic()-t)*1000,2),
         'url':url,'attempt':attempt,'status':status,'error_type':category,'redirected':final_url!=url,
         'body_sanitized':safe_body(body)}
 # Do not log headers, cookies, authentication, raw HTML or exception messages.
 event('http',**record)
 return {'record':record,'status':status,'body':body,'headers':headers,'error_type':category}

def health_valid(r):
 b=safe_body(r['body'])
 return r['status']==200 and r['error_type'] is None and b.get('ok') is True and b.get('database') is True and b.get('data_mode')=='PILOTO'

def wait_stable(url,predicate=health_valid,budget=45,required=3,interval=1):
 deadline=time.monotonic()+budget;consecutive=0;previous=None;attempt=0;last=None
 while time.monotonic()<deadline:
  attempt+=1;p=guard()
  # online is not readiness; require same PID and restart counter across samples.
  identity=(p['pid'],p['restarts'])
  last=request(url,attempt,timeout=max(0.1,min(3,deadline-time.monotonic())))
  ok=p['status']=='online' and p['pid']>0 and predicate(last)
  if ok:
   consecutive=consecutive+1 if identity==previous else 1
   previous=identity
  else:consecutive=0;previous=None
  event('readiness',url=url,attempt=attempt,consecutive=consecutive,
        process={'id':p['id'],'pid':p['pid'],'status':p['status'],'restarts':p['restarts']})
  if consecutive>=required:
   return {'url':url,'attempts':attempt,'pid':p['pid'],'restarts':p['restarts'],'stable_samples':consecutive}
  remaining=deadline-time.monotonic()
  if remaining>0:time.sleep(min(interval,remaining))
 layer='APPLICATION' if url.startswith(LOOPBACK) else 'HTTPS_PROXY_OR_TLS'
 if p['status']!='online' or p['pid']<=0:layer='PM2'
 if last and last['error_type']=='TLS':layer='TLS'
 if not url.startswith(LOOPBACK):
  diagnostic=request(LOOPBACK+'/api/health')
  if not health_valid(diagnostic):layer='APPLICATION_OR_PM2'
  elif last and last['status'] in [502,503,504]:layer='NGINX_OR_UPSTREAM'
 details={'url':url,'attempts':attempt,'layer':layer,'last_http':last['record'] if last else None}
 raise DeploymentError('STABILITY_FAILED',details)

def check_scope():
 need(sys.platform=='linux' and getpass.getuser()=='eduxadmin','VPS_EDUXADMIN_ONLY')
 need(WORK==EXPECTED_WORK and WORK.resolve()==WORK,'V2_PRIVATE_WORK_ONLY')
 need(ROOT.resolve()==ROOT,'RELEASE_SYMLINK')
 for name in FILES:
  p=ROOT/name;need(p.parent.resolve()==p.parent and p.resolve()==p,'TARGET_SYMLINK')
 need(not (WORK/'backup').is_symlink(),'BACKUP_SYMLINK')

def restart():
 p=guard();event('restart_requested',id=p['id'],pid=p['pid'],restarts=p['restarts'])
 try:
  r=subprocess.run(['/usr/bin/pm2','restart','4'],capture_output=True,text=True,timeout=30)
 except subprocess.TimeoutExpired:
  event('restart_result',return_code=None,error_type='TIMEOUT')
  raise DeploymentError('PM2_RESTART_TIMEOUT')
 event('restart_result',return_code=r.returncode)
 need(r.returncode==0,'PM2_RESTART_FAILED')

def inventory():
 return {p.relative_to(ROOT).as_posix():sha(p) for part in ['server','public','database']
         for p in (ROOT/part).rglob('*') if p.is_file()}

def other_processes_unchanged(state):
 now=processes()
 for name in ['eduxfac','EDUXFAC-PANEL-PILOTO']:
  need(now.get(name)==state['processes'].get(name),'OTHER_PROCESS_CHANGED')

def source_matches(state,manifest,after):
 for n in FILES:
  p=ROOT/n;expected=manifest['after'][n] if after else state['files'][n]['sha256']
  need((p.is_file() and sha(p)==expected) if expected is not None else not p.exists(),'SOURCE_HASH_MISMATCH')
 expected_changes=sorted(FILES) if after else []
 got=inventory()
 diff=sorted(n for n in set(got)|set(state['protected']) if got.get(n)!=state['protected'].get(n))
 need(diff==expected_changes,'UNAUTHORIZED_FILE_CHANGE')

def csp_valid(body,headers):
 html=body.decode('utf-8').replace('\r\n','\n').replace('\r','\n')
 blocks=[m[1] for m in re.finditer(r'<script\b[^>]*>([\s\S]*?)</script>',html,re.I) if m[1].strip()]
 csp=next((v for k,v in headers.items() if k.lower()=='content-security-policy'),'')
 script=next((x.strip() for x in csp.split(';') if x.strip().startswith('script-src ')),'')
 return len(blocks)==5 and "'unsafe-inline'" not in script and "'unsafe-eval'" not in script and all(
  "'sha256-"+base64.b64encode(hashlib.sha256(b.encode()).digest()).decode()+"'" in script for b in blocks)

def content_check(url,expected,html=False):
 def valid(r):
  if r['status']!=200 or r['error_type'] is not None:return False
  # A 200 response containing other source is a real integrity problem, not startup noise.
  need(hashlib.sha256(r['body']).hexdigest()==expected,'HTTP_CONTENT_HASH_MISMATCH')
  if html:need(csp_valid(r['body'],r['headers']),'CSP_INVALID')
  return True
 return wait_stable(url,valid,budget=20)

def readiness():
 local=wait_stable(LOOPBACK+'/api/health')
 public=wait_stable(HTTPS+'/api/health')
 need(local['pid']==public['pid'] and local['restarts']==public['restarts'],'PROCESS_CHANGED_DURING_READINESS')
 return {'loopback':local,'https':public}

def restore(state,manifest):
 set_phase('rollback_preflight');check_scope();guard()
 for n in FILES:
  p=ROOT/n;old=state['files'][n]
  if p.exists():need(sha(p) in [old['sha256'],manifest['after'][n]],'THIRD_PARTY_CHANGE_NO_ROLLBACK')
  if old['exists']:need(sha(WORK/'backup'/n)==old['sha256'],'BACKUP_MISMATCH')
 set_phase('rollback_files')
 for n in FILES:
  p=ROOT/n;old=state['files'][n]
  if old['exists']:atomic(p,(WORK/'backup'/n).read_bytes(),old['mode'])
  elif p.exists():
   need(sha(p)==manifest['after'][n],'NEW_FILE_CHANGED_NO_DELETE');p.unlink()
 set_phase('rollback_restart');restart()
 set_phase('rollback_readiness');ready=readiness()
 source_matches(state,manifest,False)
 content_check(HTTPS+'/',state['files']['public/index.html']['sha256'],html=True)
 for host in ['admin.eduxfac.com','eduxfac.com']:
  wait_stable('https://'+host+'/',lambda r:r['status']==200 and r['error_type'] is None,budget=15)
 other_processes_unchanged(state)
 save('ROLLBACK_DONE.json',{'utc':utc(),'rolled_back':True,'hashes_restored':True,'readiness':ready})
 return ready

def error_info(e):
 return {'code':str(e) if isinstance(e,DeploymentError) else type(e).__name__,
         'details':e.details if isinstance(e,DeploymentError) else {},'failed_phase':PHASE,'utc':utc()}

def diagnostics():
 # Only codes/counts/PM2 lifecycle lines from a short tail; no application bodies.
 d={'processes':processes()}
 logs=Path('/home/eduxadmin/.local/share/eduxfac/phase12b_20261013_0625')
 for n in ['web-piloto-out-4.log','web-piloto-error-4.log']:
  p=logs/n
  if p.is_file():
   s=p.read_text(errors='replace')[-32768:]
   d[n]={'bytes':p.stat().st_size,'mtime_utc':datetime.datetime.fromtimestamp(p.stat().st_mtime,datetime.timezone.utc).isoformat(),
     'ready_count_in_tail':s.count('EDUXFAC_WEB_LISTO'),
     'known_codes':[x for x in ['SyntaxError','ERR_MODULE_NOT_FOUND','WEB_PORT_BUSY','WEB_LISTEN_ERROR','WEB_DB_POOL_ERROR','RLS_GLOBAL_PENDIENTE','DATABASE_DATA_MODE_MISMATCH'] if x in s]}
 p=Path('/home/eduxadmin/.pm2/pm2.log')
 if p.is_file():
  d['pm2_lifecycle_tail']=[s for s in p.read_text(errors='replace').splitlines()[-150:]
   if re.fullmatch(r'\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d: PM2 log: (?:App \[EDUXFAC-WEB-PILOTO:4\] (?:online|starting in -fork mode-|exited with code \[\d+\] via signal \[\w+\]|will restart in \d+ms)|Stopping app:EDUXFAC-WEB-PILOTO id:4)',s)]
 save('DIAGNOSTICS.json',d)

def preflight():
 check_scope();guard()
 need(not any((WORK/n).exists() for n in ['BEFORE.json','APPLY_DONE.json','FAILURE.json','EVENTS.jsonl','backup']),'V2_ALREADY_USED_STOP')
 manifest=json.loads((WORK/'MANIFEST.json').read_text(encoding='utf-8'))
 need(set(manifest['before'])==set(FILES) and set(manifest['after'])==set(FILES),'MANIFEST_SCOPE_INVALID')
 for n in FILES:
  p=ROOT/n;old=manifest['before'][n]
  need((p.is_file() and sha(p)==old) if old is not None else not p.exists(),'BASELINE_CHANGED_STOP')
  payload=WORK/'payload'/n
  need(payload.is_file() and not payload.is_symlink() and sha(payload)==manifest['after'][n],'PAYLOAD_HASH_MISMATCH')
 node='/home/eduxadmin/.local/opt/eduxfac-node24/bin/node'
 for n in FILES:
  if n.endswith('.js'):
   r=subprocess.run([node,'--check',str(WORK/'payload'/n)],capture_output=True,timeout=15)
   need(r.returncode==0,'PAYLOAD_SYNTAX_FAILED')
 need((WORK/'ROLLBACK_RENTABILIDAD_V2.py').is_file(),'ROLLBACK_MISSING')
 return manifest

def apply():
 # One invocation only. No restart/deployment retry; retries are HTTP observations.
 manifest=preflight();os.chmod(WORK,0o700);set_phase('baseline_readiness')
 readiness()
 state={'utc':utc(),'processes':processes(),'files':{},'protected':inventory()}
 set_phase('backup')
 for n in FILES:
  p=ROOT/n;exists=p.exists()
  state['files'][n]={'exists':exists,'sha256':sha(p) if exists else None,'mode':p.stat().st_mode&0o777 if exists else 0o664}
  need(state['files'][n]['sha256']==manifest['before'][n],'BASELINE_CHANGED_BEFORE_BACKUP')
  b=WORK/'backup'/n;b.parent.mkdir(parents=True,exist_ok=True,mode=0o700)
  if exists:
   b.write_bytes(p.read_bytes());os.chmod(b,0o600);need(sha(b)==state['files'][n]['sha256'],'BACKUP_HASH_MISMATCH')
  else:
   marker=Path(str(b)+'.absent.json');marker.write_text(json.dumps({'file':n,'existed_before':False}),encoding='utf-8');os.chmod(marker,0o600)
 save('BEFORE.json',state)
 changed=False
 try:
  source_matches(state,manifest,False);other_processes_unchanged(state)
  set_phase('apply_files')
  for n in FILES:
   atomic(ROOT/n,(WORK/'payload'/n).read_bytes(),state['files'][n]['mode']);changed=True
   event('file_applied',file=n,before=state['files'][n]['sha256'],after=sha(ROOT/n))
  source_matches(state,manifest,True)
  set_phase('restart');restart()
  set_phase('readiness');ready=readiness()
  set_phase('frontend_and_domains')
  content_check(LOOPBACK+'/',manifest['after']['public/index.html'],html=True)
  content_check(HTTPS+'/',manifest['after']['public/index.html'],html=True)
  content_check(HTTPS+'/sale-profitability.js',manifest['after']['public/sale-profitability.js'])
  for host in ['admin.eduxfac.com','eduxfac.com']:
   wait_stable('https://'+host+'/',lambda r:r['status']==200 and r['error_type'] is None,budget=15)
  source_matches(state,manifest,True);other_processes_unchanged(state)
  set_phase('final_health');final=readiness()
  need(final['loopback']['pid']==ready['loopback']['pid'] and final['loopback']['restarts']==ready['loopback']['restarts'],'PROCESS_RESTARTED_DURING_VALIDATION')
  report={'utc':utc(),'applied':True,'files':FILES,'before':manifest['before'],'after':manifest['after'],
          'readiness':ready,'final_readiness':final,'other_processes_unchanged':True,
          'functional_post_deploy':'PENDING_SEPARATE_ISOLATED_SMOKE_NO_REAL_CUSTOMER_MUTATIONS',
          'rollback':str(WORK/'ROLLBACK_RENTABILIDAD_V2.py')}
  save('APPLY_DONE.json',report);event('success');print('RENTABILIDAD_DEPLOY_V2_OK')
  return 0
 except Exception as e:
  failure=error_info(e)
  try:diagnostics()
  except Exception as de:failure['diagnostics_error_class']=type(de).__name__
  save('FAILURE.json',{**failure,'rollback_ok':False,'rollback_status':'pending' if changed else 'not_required'})
  if changed:
   try:
    restore(state,manifest);failure.update(rollback_ok=True,rollback_status='stable_restored')
   except Exception as rollback_error:
    failure.update(rollback_ok=False,rollback_status='FAILED_REQUIRES_MANUAL_REVIEW',rollback_error=error_info(rollback_error))
  else:failure.update(rollback_ok=False,rollback_status='not_required')
  save('FAILURE.json',failure);event('failure',**failure);print('DETENER_DEPLOY_V2_FAILED_ROLLBACK_'+str(failure['rollback_ok']))
  return 1

def main():
 need(sys.argv[1:]==['--apply'],'APPLY_NOT_REQUESTED')
 def stop(signum,frame):raise DeploymentError('INTERRUPTED_SIGNAL_'+str(signum))
 signal.signal(signal.SIGTERM,stop);signal.signal(signal.SIGINT,stop)
 try:return apply()
 except Exception as e:
  # Failures before backup/write never invoke rollback.
  print('DETENER_PREFLIGHT_'+(str(e) if isinstance(e,DeploymentError) else type(e).__name__))
  return 1

if __name__=='__main__':raise SystemExit(main())
