import subprocess,json,sys,tarfile,io,hashlib,datetime,uuid
from pathlib import Path
ROOT=Path(__file__).resolve().parents[3];W=Path(__file__).resolve().parent
HOST='eduxadmin@85.239.248.248';SSH=['ssh','-o','BatchMode=yes','-o','PasswordAuthentication=no','-o','ConnectTimeout=10',HOST]
def ssh(cmd,data=None,timeout=180):
 r=subprocess.run(SSH+[cmd],input=data,capture_output=True,timeout=timeout)
 if r.returncode:raise RuntimeError(r.stdout.decode(errors='replace')+'\n'+r.stderr.decode(errors='replace'))
 return r.stdout
mode=sys.argv[1]
if mode=='prepare':
 assert not (W/'REMOTE.json').exists(),'WORK_ALREADY_PREPARED'
 pre=json.loads((W/'PRECHECK.json').read_text());after=json.loads((W/'CANDIDATE_HASHES.json').read_text());files=list(after)
 for n,h in after.items():assert hashlib.sha256((ROOT/n).read_bytes()).hexdigest()==h
 work='/home/eduxadmin/.local/share/eduxfac/monthly_sales_deploy_'+datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%d_%H%M%S')+'_'+uuid.uuid4().hex[:6]
 manifest={'before':pre['files'],'after':after}
 buf=io.BytesIO()
 with tarfile.open(fileobj=buf,mode='w') as tar:
  def add(n,b):
   t=tarfile.TarInfo(n);t.size=len(b);t.mode=0o600;tar.addfile(t,io.BytesIO(b))
  for n in files:add('payload/'+n,(ROOT/n).read_bytes())
  add('MANIFEST.json',json.dumps(manifest).encode())
  for n in ['DEPLOY_MONTHLY.py','VERIFY_PILOT.mjs']:add(n,(W/n).read_bytes())
  add('ROLLBACK_RENTABILIDAD_V2.py',b"import runpy,sys\nfrom pathlib import Path\np=Path(__file__).with_name('DEPLOY_MONTHLY.py');sys.argv=[str(p),'--rollback'];runpy.run_path(str(p),run_name='__main__')\n")
 ssh("umask 077; mkdir '"+work+"' && tar -xf - -C '"+work+"'",buf.getvalue())
 (W/'REMOTE.json').write_text(json.dumps({'work':work,'manifest':manifest},indent=2),encoding='utf-8')
 out=ssh('python3 '+work+'/DEPLOY_MONTHLY.py --prepare');(W/'PREPARE.log').write_bytes(out)
 result=json.loads(out);assert result['result']=='PREPARE_OK'
 archive=ssh('cat '+work+'/backup.tar.gz');assert hashlib.sha256(archive).hexdigest()==result['backup']['sha256'];(W/'backup.tar.gz').write_bytes(archive)
 with tarfile.open(fileobj=io.BytesIO(archive)) as tar:
  for n,h in pre['files'].items():
   if h:assert hashlib.sha256(tar.extractfile('backup/'+n).read()).hexdigest()==h
 (W/'BACKUP_VERIFIED.json').write_text(json.dumps({'remote':result['backup'],'local_archive':str(W/'backup.tar.gz'),'sha256':hashlib.sha256(archive).hexdigest(),'verified':True,'replaced_files':sum(h is not None for h in pre['files'].values()),'new_files_absent':sum(h is None for h in pre['files'].values())},indent=2),encoding='utf-8')
 print(out.decode())
else:
 work=json.loads((W/'REMOTE.json').read_text())['work'];assert mode in ['apply','verify','rollback','collect']
 if mode=='collect':
  for n in ['BEFORE.json','BACKUP.json','DB_BEFORE.json','APPLY_DONE.json','VERIFY.json','PILOT_API_SQL.json','FINAL_VERIFY.json','FAILURE.json','ROLLBACK_DONE.json']:
   out=ssh("if test -f '"+work+'/'+n+"'; then cat '"+work+'/'+n+"'; fi")
   if out:(W/n).write_bytes(out)
  print('EVIDENCE_COLLECTED')
 else:
  try:out=ssh('python3 '+work+'/DEPLOY_MONTHLY.py --'+mode,timeout=240)
  except Exception as e:(W/(mode.upper()+'_FAILED.log')).write_text(str(e),encoding='utf-8');raise
  (W/(mode.upper()+'.log')).write_bytes(out);print(out.decode())
