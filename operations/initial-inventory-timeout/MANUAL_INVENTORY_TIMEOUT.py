from pathlib import Path
import os,sys,json,hashlib,subprocess,urllib.request,time,tempfile,pwd
sys.dont_write_bytecode=True
WORK=Path('/home/eduxadmin/.local/share/eduxfac/initial_inventory_timeout_20261014_201400')
TARGET=Path('/etc/nginx/sites-available/eduxfac-web-piloto')
BEFORE='292a0bc8365d3d2e1fbdf9e03e1f84f83fee3945420bcd4b255baa6bf917f9db'
AFTER='8c59627f6f46d3ed6d799eacbd4976b635823dbbde3a4cb29078ba21e4cb51d2'
def sha(data):return hashlib.sha256(data).hexdigest()
def need(ok,code):
 if not ok:raise RuntimeError(code)
def candidate(data):
 text=data.decode('utf-8')
 marker='    location / {\n        proxy_pass http://127.0.0.1:3001;\n'
 need(text.count(marker)==1,'BASE_LOCATION_NOT_UNIQUE')
 start=text.index(marker);end=text.index('    }\n',start)+len('    }\n')
 block=text[start:end]
 need(block.count('proxy_read_timeout 30s;')==1,'BASE_TIMEOUT_NOT_EXPECTED')
 need('/api/import/inventory/' not in text,'IMPORT_LOCATION_ALREADY_PRESENT')
 addition=block.replace('location / {','location ^~ /api/import/inventory/ {',1).replace('proxy_read_timeout 30s;','proxy_read_timeout 90s;',1)
 after=(text[:start]+addition+text[start:]).encode('utf-8')
 need(after.replace(addition.encode(),b'',1)==data,'SCOPE_DIFF_INVALID')
 return after,addition
def watched():
 paths=[Path('/etc/nginx/nginx.conf')]
 paths.extend(p.resolve() for p in Path('/etc/nginx/sites-enabled').iterdir() if p.resolve()!=TARGET)
 paths.extend(Path('/etc/nginx/conf.d').glob('*.conf'))
 web=Path('/home/eduxadmin/eduxfac/releases/phase12b_20261013_0625/web')
 paths.extend(web/n for n in ['server/src/app.js','server/src/initial-inventory.js','public/index.html','public/desktop-responsive.css'])
 return{str(p):sha(p.read_bytes()) if p.exists() else None for p in paths}
def save(name,value):
 data=(json.dumps(value,indent=2)+'\n').encode();p=WORK/name;p.write_bytes(data);os.chmod(p,0o600)
 account=pwd.getpwnam('eduxadmin');os.chown(p,account.pw_uid,account.pw_gid)
def command(argv):
 r=subprocess.run(argv,capture_output=True,text=True,timeout=30)
 need(r.returncode==0,Path(argv[0]).name.upper()+'_COMMAND_FAILED')
 return{'command':' '.join(argv),'returncode':r.returncode}
def nginx_test():return command(['/usr/sbin/nginx','-t'])
def reload_nginx():return command(['/bin/systemctl','reload','nginx'])
def check_health():
 samples=[]
 for url in ['http://127.0.0.1:3001/api/health','https://app.eduxfac.com/api/health','https://app.eduxfac.com/','https://admin.eduxfac.com/','https://eduxfac.com/']:
  for attempt in range(3):
   with urllib.request.urlopen(url,timeout=15) as r:
    need(r.status==200,'HTTPS_NOT_200')
    row={'url':url,'status':r.status}
    if url.endswith('/api/health'):
     d=json.load(r);need(d.get('ok') is True and d.get('database') is True and d.get('data_mode')=='PILOTO','HEALTH_MODE_INVALID')
     row.update({k:d.get(k) for k in ['ok','database','data_mode']})
    samples.append(row)
   if attempt<2:time.sleep(.25)
 return samples
def atomic(data,stat):
 fd,name=tempfile.mkstemp(prefix='.eduxfac-import-timeout-',dir=str(TARGET.parent))
 try:
  with os.fdopen(fd,'wb') as f:f.write(data);f.flush();os.fsync(f.fileno())
  os.chmod(name,stat.st_mode&0o777);os.chown(name,stat.st_uid,stat.st_gid);os.replace(name,TARGET)
 finally:
  if os.path.exists(name):os.unlink(name)
def apply():
 need(os.geteuid()==0,'SUDO_MANUAL_REQUIRED')
 need(Path(__file__).resolve().parent==WORK,'WORK_PATH_INVALID')
 need(TARGET.is_file() and not TARGET.is_symlink(),'TARGET_INVALID')
 need(not (WORK/'BEFORE.json').exists(),'ALREADY_ATTEMPTED_DO_NOT_REPEAT')
 original=TARGET.read_bytes();need(sha(original)==BEFORE,'CONFIG_CHANGED_STOP')
 after,addition=candidate(original);need(sha(after)==AFTER,'CANDIDATE_HASH_INVALID')
 baseline=watched();health_before=check_health();nginx_test()
 backup=WORK/'backup';backup.mkdir(mode=0o700)
 b=backup/TARGET.name;b.write_bytes(original);os.chmod(b,0o600)
 need(sha(b.read_bytes())==BEFORE,'BACKUP_HASH_INVALID')
 stat=TARGET.stat();save('BEFORE.json',{'before':BEFORE,'after':AFTER,'backup':str(b),'protected':baseline,'mode':stat.st_mode&0o777,'uid':stat.st_uid,'gid':stat.st_gid})
 changed=False
 try:
  atomic(after,stat);changed=True
  tested=nginx_test();reloaded=reload_nginx()
  samples=check_health()
  need(watched()==baseline,'PROTECTED_FILES_CHANGED')
  need(sha(TARGET.read_bytes())==AFTER,'POST_HASH_INVALID')
  result={'result':'INVENTORY_TIMEOUT_90S_OK','before':BEFORE,'after':AFTER,'backup':str(b),'nginx_test':tested,'reload':reloaded,'fragment':addition,'only_inventory_timeout_90s':True,'other_read_timeouts_30s':True,'body_limit_unchanged_30m':True,'other_limits_unchanged':True,'protected_files_unchanged':True,'import_code_not_deployed':True,'health':samples,'rollback_command':'sudo /usr/bin/python3 '+str(WORK/'MANUAL_INVENTORY_TIMEOUT.py')+' --rollback'}
  save('APPLY_DONE.json',result);print('INVENTORY_TIMEOUT_90S_OK')
 except Exception as e:
  failure={'result':'STOP','code':str(e),'rollback_ok':False}
  if changed:
   try:
    atomic(original,stat);nginx_test();reload_nginx();check_health()
    need(sha(TARGET.read_bytes())==BEFORE,'ROLLBACK_HASH_INVALID')
    failure['rollback_ok']=True
   except Exception as re:failure['rollback_error']=str(re)
  save('FAILURE.json',failure);print(json.dumps(failure));raise SystemExit(1)
def rollback():
 need(os.geteuid()==0,'SUDO_MANUAL_REQUIRED')
 need((WORK/'APPLY_DONE.json').exists() and not (WORK/'ROLLBACK_DONE.json').exists(),'ROLLBACK_STATE_INVALID')
 state=json.loads((WORK/'BEFORE.json').read_text())
 need(sha(TARGET.read_bytes())==AFTER,'CONFIG_CHANGED_STOP')
 data=Path(state['backup']).read_bytes();need(sha(data)==BEFORE,'BACKUP_INVALID')
 atomic(data,TARGET.stat());nginx_test();reload_nginx();samples=check_health()
 need(sha(TARGET.read_bytes())==BEFORE,'ROLLBACK_HASH_INVALID')
 save('ROLLBACK_DONE.json',{'result':'INVENTORY_TIMEOUT_ROLLBACK_OK','health':samples})
 print('INVENTORY_TIMEOUT_ROLLBACK_OK')
if __name__=='__main__':
 try:
  need(sys.argv[1:] in [['--apply'],['--rollback']],'MODE_INVALID')
  (apply if sys.argv[1:] == ['--apply'] else rollback)()
 except Exception as e:
  print('DETENER '+str(e));raise SystemExit(1)
