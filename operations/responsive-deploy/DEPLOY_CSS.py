from pathlib import Path
import sys,os,json,hashlib,subprocess,urllib.request,time,datetime
WORK=Path(__file__).resolve().parent
ROOT=Path('/home/eduxadmin/eduxfac/releases/phase12b_20261013_0625/web')
TARGET=ROOT/'public/desktop-responsive.css'
MANIFEST=json.loads((WORK/'MANIFEST.json').read_text())
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
utc=lambda:datetime.datetime.now(datetime.timezone.utc).isoformat()
def need(v,msg):
 if not v:raise RuntimeError(msg)
def save(name,obj):
 p=WORK/name;p.write_text(json.dumps(obj,indent=2));os.chmod(p,0o600)
def processes():
 r=subprocess.run(['/usr/bin/pm2','jlist'],capture_output=True,text=True,timeout=20)
 need(r.returncode==0,'PM2_QUERY_FAILED')
 return {x['name']:{'id':x['pm_id'],'pid':x['pid'],'status':x['pm2_env'].get('status'),'restarts':x['pm2_env'].get('restart_time'),'cwd':x['pm2_env'].get('pm_cwd'),'script':x['pm2_env'].get('pm_exec_path')} for x in json.loads(r.stdout)}
def guard():
 p=processes();w=p.get('EDUXFAC-WEB-PILOTO',{})
 need(w.get('id')==4 and w.get('status')=='online' and w.get('pid',0)>0 and w.get('cwd')==str(ROOT) and w.get('script')==str(ROOT/'server/start.mjs'),'WEB_PILOT_PROCESS_UNEXPECTED')
 need(TARGET.resolve()==ROOT/'public/desktop-responsive.css','CSS_TARGET_UNEXPECTED')
 return p
def protected():
 paths=[]
 for folder in ['server','public','database']:
  base=ROOT/folder
  if base.exists():paths.extend(p for p in base.rglob('*') if p.is_file() and p!=TARGET and 'node_modules' not in p.parts and p.suffix not in ['.log','.db','.sqlite'] and p.name not in ['.env'])
 for n in ['schema.sql','package.json','package-lock.json']:
  p=ROOT/n
  if p.is_file():paths.append(p)
 return {str(p.relative_to(ROOT)):sha(p) for p in sorted(set(paths))}
def request(url):
 start=time.monotonic();rec={'url':url,'utc':utc()}
 try:
  with urllib.request.urlopen(urllib.request.Request(url,headers={'Cache-Control':'no-cache','User-Agent':'EDUXFAC-CSS-DEPLOY-CHECK'}),timeout=8) as r:
   body=r.read();rec['status']=r.status;rec['sha256']=hashlib.sha256(body).hexdigest()
   if '/api/health' in url:
    d=json.loads(body);rec['body']={k:d.get(k) for k in ['ok','database','data_mode']}
   else:rec['body']={'bytes':len(body)}
  rec['error']=None
 except Exception as e:
  rec.update(status=getattr(e,'code',None),error=type(e).__name__)
 rec['duration_ms']=round((time.monotonic()-start)*1000,2)
 with (WORK/'HTTP_EVENTS.jsonl').open('a') as f:f.write(json.dumps(rec)+'\n')
 return rec
def stable(url,health=False,expected=None):
 rows=[];consecutive=0
 for attempt in range(10):
  r=request(url);r['attempt']=attempt+1;rows.append(r)
  ok=r.get('status')==200 and r.get('error') is None
  if health:ok=ok and r.get('body')=={'ok':True,'database':True,'data_mode':'PILOTO'}
  if expected:ok=ok and r.get('sha256')==expected
  consecutive=consecutive+1 if ok else 0
  if consecutive==3:return rows
  time.sleep(.5)
 raise RuntimeError('HTTP_STABILITY_FAILED:'+url)
def health():
 return {'loopback':stable('http://127.0.0.1:3001/api/health',True),'https':stable('https://app.eduxfac.com/api/health',True),'app':stable('https://app.eduxfac.com/'),'admin':stable('https://admin.eduxfac.com/')}
def content(expected):
 return {'loopback':stable('http://127.0.0.1:3001/desktop-responsive.css',expected=expected),'https':stable('https://app.eduxfac.com/desktop-responsive.css',expected=expected)}
def atomic(data,mode):
 tmp=TARGET.with_name('.desktop-responsive.css.deploy-tmp')
 need(not tmp.exists(),'TEMP_ALREADY_EXISTS')
 with tmp.open('xb') as f:f.write(data);f.flush();os.fsync(f.fileno())
 os.chmod(tmp,mode);os.replace(tmp,TARGET)
def rollback(state):
 need(sha(WORK/'backup/public/desktop-responsive.css')==state['sha256'],'BACKUP_INVALID')
 need(sha(TARGET) in [state['sha256'],MANIFEST['after']],'CSS_CHANGED_BY_OTHER_STOP')
 atomic((WORK/'backup/public/desktop-responsive.css').read_bytes(),state['mode'])
 need(sha(TARGET)==state['sha256'],'ROLLBACK_HASH_FAILED')
 result={'utc':utc(),'health':health(),'css':content(state['sha256']),'sha256':sha(TARGET),'restart':False}
 need(protected()==state['protected'] and guard()==state['processes'],'PROTECTED_CHANGED')
 save('ROLLBACK_DONE.json',result);return result
def prepare():
 need(not (WORK/'BEFORE.json').exists(),'PREPARE_ALREADY_DONE')
 os.umask(0o077)
 p=guard();h=health()
 need(sha(TARGET)==MANIFEST['before'],'BASELINE_HASH_UNEXPECTED')
 content(MANIFEST['before'])
 state={'utc':utc(),'sha256':sha(TARGET),'mode':TARGET.stat().st_mode&0o777,'processes':p,'protected':protected(),'health':h}
 b=WORK/'backup/public/desktop-responsive.css';b.parent.mkdir(parents=True,mode=0o700);b.write_bytes(TARGET.read_bytes());os.chmod(b,0o600)
 need(sha(b)==state['sha256'],'BACKUP_INVALID');save('BEFORE.json',state)
 return {'result':'CSS_PRECHECK_BACKUP_OK','before':state['sha256'],'after':MANIFEST['after'],'backup':str(b),'pm2':p['EDUXFAC-WEB-PILOTO'],'health':'200/PILOTO'}
def apply():
 state=json.loads((WORK/'BEFORE.json').read_text());changed=False
 need(not (WORK/'APPLY_DONE.json').exists() and not (WORK/'FAILURE.json').exists(),'APPLY_ALREADY_USED')
 try:
  need(sha(TARGET)==state['sha256'] and protected()==state['protected'] and guard()==state['processes'],'STATE_CHANGED_STOP')
  payload=WORK/'payload/public/desktop-responsive.css'
  need(sha(payload)==MANIFEST['after'],'PAYLOAD_HASH_FAILED')
  atomic(payload.read_bytes(),state['mode']);changed=True
  need(sha(TARGET)==MANIFEST['after'],'AFTER_HASH_FAILED')
  h=health();c=content(MANIFEST['after'])
  need(protected()==state['protected'] and guard()==state['processes'],'PROTECTED_CHANGED')
  result={'result':'CSS_DEPLOY_OK','utc':utc(),'before':state['sha256'],'after':sha(TARGET),'backup':str(WORK/'backup/public/desktop-responsive.css'),'health':h,'css_http':c,'pm2':guard()['EDUXFAC-WEB-PILOTO'],'restart':False,'protected_files_unchanged':True,'other_processes_unchanged':True,'rollback_command':'/usr/bin/python3 '+str(WORK/'DEPLOY_CSS.py')+' --rollback'}
  save('APPLY_DONE.json',result);return result
 except Exception as e:
  failure={'result':'FAILED_STOP','error':str(e),'utc':utc(),'rollback':False}
  if changed:
   try:rollback(state);failure['rollback']=True
   except Exception as re:failure['rollback_error']=type(re).__name__
  save('FAILURE.json',failure);print(json.dumps(failure));raise SystemExit(1)
def verify():
 state=json.loads((WORK/'BEFORE.json').read_text())
 need(sha(TARGET)==MANIFEST['after'] and protected()==state['protected'] and guard()==state['processes'],'FINAL_STATE_CHANGED')
 r={'result':'CSS_FINAL_OK','utc':utc(),'health':health(),'css_http':content(MANIFEST['after']),'sha256':sha(TARGET),'restart':False,'protected_files_unchanged':True,'processes_unchanged':True}
 save('FINAL.json',r);return r
if __name__=='__main__':
 try:
  mode=sys.argv[1];need(mode in ['--prepare','--apply','--verify','--rollback'],'MODE_INVALID')
  result=prepare() if mode=='--prepare' else apply() if mode=='--apply' else verify() if mode=='--verify' else rollback(json.loads((WORK/'BEFORE.json').read_text()))
  print(json.dumps(result))
 except Exception as e:print(json.dumps({'result':'STOP','error':str(e)}));sys.exit(1)
