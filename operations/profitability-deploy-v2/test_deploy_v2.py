from pathlib import Path
import importlib.util,unittest,tempfile,json,hashlib,io,ssl,socket,urllib.error
from unittest.mock import patch
import contextlib

BASE=Path(__file__).resolve().parent
spec=importlib.util.spec_from_file_location('deploy_v2',BASE/'APPLY_RENTABILIDAD_V2.py')
d=importlib.util.module_from_spec(spec);spec.loader.exec_module(d)
class Clock:
 def __init__(self):self.now=0
 def monotonic(self):self.now+=0.01;return self.now
 def sleep(self,n):self.now+=n
def health(status=200,mode='PILOTO',ok=True):
 return {'record':{'url':d.LOOPBACK+'/api/health','status':status,'error_type':None},
  'status':status,'body':json.dumps({'ok':ok,'database':True,'data_mode':mode}).encode(),'headers':{},'error_type':None}
def process(pid=1,count=1,status='online'):
 return {'id':4,'pid':pid,'status':status,'restarts':count}
class Response:
 def __init__(self,url,body,status=200,headers=None):self.url=url;self.body=body;self.status=status;self.headers=headers or {}
 def __enter__(self):return self
 def __exit__(self,*args):pass
 def read(self,*args):return self.body
 def geturl(self):return self.url

class V2Tests(unittest.TestCase):
 def setUp(self):
  self.events=[];self.clock=Clock()
  self.patches=[patch.object(d,'event',lambda kind,**kw:self.events.append({'kind':kind,**kw})),
    patch.object(d.time,'monotonic',self.clock.monotonic),patch.object(d.time,'sleep',self.clock.sleep),
    patch.object(d,'guard',lambda:process())]
  for p in self.patches:p.start()
 def tearDown(self):
  for p in reversed(self.patches):p.stop()
 def test_01_three_stable_samples_required(self):
  with patch.object(d,'request',return_value=health()):
   r=d.wait_stable(d.LOOPBACK+'/api/health')
  self.assertEqual(r['attempts'],3);self.assertGreaterEqual(self.clock.now,2)
 def test_02_startup_refused_then_ready(self):
  failed=health();failed.update(status=None,error_type='CONNECTION_REFUSED')
  with patch.object(d,'request',side_effect=[failed,health(),health(),health()]):
   self.assertEqual(d.wait_stable(d.LOOPBACK+'/api/health')['attempts'],4)
 def test_03_transient_502_resets_stability(self):
  with patch.object(d,'request',side_effect=[health(),health(502),health(),health(),health()]):
   self.assertEqual(d.wait_stable(d.HTTPS+'/api/health')['attempts'],5)
 def test_04_persistent_500_application(self):
  with patch.object(d,'request',return_value=health(500)):
   with self.assertRaises(d.DeploymentError) as caught:d.wait_stable(d.LOOPBACK+'/api/health',budget=3)
  self.assertEqual(caught.exception.details['layer'],'APPLICATION')
  self.assertEqual(caught.exception.details['last_http']['status'],500)
 def test_05_https_502_healthy_local_is_proxy(self):
  with patch.object(d,'request',side_effect=lambda u,*a,**kw:health() if u.startswith(d.LOOPBACK) else health(502)):
   with self.assertRaises(d.DeploymentError) as caught:d.wait_stable(d.HTTPS+'/api/health',budget=3)
  self.assertEqual(caught.exception.details['layer'],'NGINX_OR_UPSTREAM')
 def test_06_flapping_pid_does_not_pass(self):
  ids=iter(range(1000))
  with patch.object(d,'guard',side_effect=lambda:process(next(ids))),patch.object(d,'request',return_value=health()):
   with self.assertRaises(d.DeploymentError):d.wait_stable(d.LOOPBACK+'/api/health',budget=3)
 def test_07_restart_counter_resets_samples(self):
  with patch.object(d,'guard',side_effect=[process(1,1),process(1,2),process(1,2),process(1,2)]),patch.object(d,'request',return_value=health()):
   self.assertEqual(d.wait_stable(d.LOOPBACK+'/api/health')['attempts'],4)
 def test_08_offline_process_blocks_ready_http(self):
  with patch.object(d,'guard',return_value=process(0,1,'stopped')),patch.object(d,'request',return_value=health()):
   with self.assertRaises(d.DeploymentError) as c:d.wait_stable(d.LOOPBACK+'/api/health',budget=2)
  self.assertEqual(c.exception.details['layer'],'PM2')
 def test_09_health_wrong_mode_rejected(self):self.assertFalse(d.health_valid(health(mode='PRODUCCION')))
 def test_10_health_database_required(self):
  r=health();r['body']=b'{"ok":true,"data_mode":"PILOTO"}';self.assertFalse(d.health_valid(r))
 def test_11_malformed_health_rejected(self):
  r=health();r['body']=b'<html>error</html>';self.assertFalse(d.health_valid(r))
 def test_12_hash_difference_is_immediate_integrity_failure(self):
  r=health();r['body']=b'wrong html'
  with patch.object(d,'request',return_value=r):
   with self.assertRaisesRegex(d.DeploymentError,'HTTP_CONTENT_HASH_MISMATCH'):d.content_check(d.HTTPS+'/',hashlib.sha256(b'right html').hexdigest())
  self.assertEqual(len([e for e in self.events if e['kind']=='readiness']),0)
 def test_13_body_secrets_are_not_logged(self):
  secret='NEVER_PRINT_PASSWORD_OR_TOKEN'
  body=json.dumps({'ok':True,'database':True,'data_mode':'PILOTO','password':secret,'hash':secret,'token':secret,'error':secret}).encode()
  safe=d.safe_body(body);self.assertNotIn(secret,json.dumps(safe));self.assertEqual(safe['data_mode'],'PILOTO')
 def test_14_http_error_preserves_url_status_and_timestamps(self):
  url=d.HTTPS+'/api/health';err=urllib.error.HTTPError(url,502,'Bad Gateway',{},io.BytesIO(b'<h1>502 Bad Gateway</h1>'))
  with patch.object(d.opener,'open',side_effect=err):r=d.request(url,attempt=2)
  record=r['record'];self.assertEqual(record['url'],url);self.assertEqual(record['status'],502)
  self.assertEqual(record['attempt'],2);self.assertIn('started_utc',record);self.assertIn('ended_utc',record)
  self.assertEqual(record['body_sanitized']['http_error_title'],'502 Bad Gateway')
 def test_15_tls_classification(self):
  with patch.object(d.opener,'open',side_effect=urllib.error.URLError(ssl.SSLError('secret not logged'))):r=d.request(d.HTTPS+'/api/health')
  self.assertEqual(r['error_type'],'TLS');self.assertNotIn('secret not logged',json.dumps(self.events))
 def test_16_timeout_classification(self):
  with patch.object(d.opener,'open',side_effect=urllib.error.URLError(socket.timeout())):
   self.assertEqual(d.request(d.HTTPS+'/api/health')['error_type'],'TIMEOUT')
 def test_17_connection_refused_classification(self):
  with patch.object(d.opener,'open',side_effect=urllib.error.URLError(ConnectionRefusedError())):
   self.assertEqual(d.request(d.LOOPBACK+'/api/health')['error_type'],'CONNECTION_REFUSED')
 def test_18_dns_classification(self):
  self.assertEqual(d.transport_kind(urllib.error.URLError(socket.gaierror())),'DNS')
 def test_19_redirect_does_not_pass(self):
  url=d.HTTPS+'/api/health'
  with patch.object(d.opener,'open',return_value=Response(d.HTTPS+'/login',b'{}')):
   self.assertEqual(d.request(url)['error_type'],'UNEXPECTED_REDIRECT')
 def test_20_large_body_not_logged(self):
  with patch.object(d.opener,'open',return_value=Response(d.HTTPS+'/',b'x'*(d.MAX_BODY+1))):
   r=d.request(d.HTTPS+'/');self.assertEqual(r['error_type'],'BODY_LIMIT');self.assertEqual(r['body'],b'')
 def test_21_csp_exact_candidate(self):
  body=(BASE/'payload/public/index.html').read_bytes()
  blocks=[m[1] for m in d.re.finditer(r'<script\b[^>]*>([\s\S]*?)</script>',body.decode().replace('\r\n','\n'),d.re.I) if m[1].strip()]
  header="script-src 'self' "+' '.join("'sha256-"+d.base64.b64encode(hashlib.sha256(b.encode()).digest()).decode()+"'" for b in blocks)
  self.assertTrue(d.csp_valid(body,{'Content-Security-Policy':header}))
  self.assertFalse(d.csp_valid(body,{'Content-Security-Policy':header+" 'unsafe-inline'"}))
 def test_22_503_requires_full_recovery(self):
  with patch.object(d,'request',side_effect=[health(503),health(),health(),health()]):
   self.assertEqual(d.wait_stable(d.HTTPS+'/api/health')['stable_samples'],3)
 def test_23_local_down_during_https_failure(self):
  with patch.object(d,'request',return_value=health(500)):
   with self.assertRaises(d.DeploymentError) as c:d.wait_stable(d.HTTPS+'/api/health',budget=2)
  self.assertEqual(c.exception.details['layer'],'APPLICATION_OR_PM2')
 def test_24_v2_manifest_exact_four_unchanged(self):
  m=json.loads((BASE/'MANIFEST.json').read_text())
  self.assertEqual(set(m['after']),set(d.FILES))
  for n,h in m['after'].items():self.assertEqual(hashlib.sha256((BASE/'payload'/n).read_bytes()).hexdigest(),h)

class TransactionTests(unittest.TestCase):
 def setUp(self):
  self.tmp=tempfile.TemporaryDirectory(dir=BASE,prefix='v2-isolated-test-')
  self.work=Path(self.tmp.name)/'work';self.root=Path(self.tmp.name)/'web';self.work.mkdir();self.root.mkdir()
  self.manifest=json.loads((BASE/'MANIFEST.json').read_text());self.before={}
  original=BASE.parent/'profitability-deploy'
  # Real original before files are retained in D: documentation backup.
  backup=BASE.parents[1]/'docs/profitability_candidate_20261013'
  for n in d.FILES:
   p=self.root/n;p.parent.mkdir(parents=True,exist_ok=True)
   if self.manifest['before'][n] is not None:p.write_bytes((backup/n).read_bytes());self.before[n]=p.read_bytes()
   q=self.work/'payload'/n;q.parent.mkdir(parents=True,exist_ok=True);q.write_bytes((BASE/'payload'/n).read_bytes())
  (self.root/'database').mkdir()
  (self.root/'database/untouched.sql').write_text('unchanged')
  (self.work/'MANIFEST.json').write_text(json.dumps(self.manifest))
  (self.work/'ROLLBACK_RENTABILIDAD_V2.py').write_text('prepared rollback')
  self.clock=Clock();self.restarts=0
  self.ps={'eduxfac':{'pid':10},'EDUXFAC-PANEL-PILOTO':{'pid':20}}
  def restart():self.restarts+=1
  self.patches=[patch.object(d,'ROOT',self.root),patch.object(d,'WORK',self.work),
   patch.object(d,'check_scope',lambda:None),patch.object(d,'guard',lambda:process()),
   patch.object(d,'processes',lambda:self.ps.copy()),patch.object(d,'restart',restart),
   patch.object(d,'diagnostics',lambda:None),
   patch.object(d.subprocess,'run',return_value=type('R',(),{'returncode':0})()),
   patch.object(d.time,'monotonic',self.clock.monotonic),patch.object(d.time,'sleep',self.clock.sleep)]
  for p in self.patches:p.start()
 def tearDown(self):
  for p in reversed(self.patches):p.stop()
  self.tmp.cleanup()
 def ready(self):return {'loopback':{'pid':1,'restarts':1},'https':{'pid':1,'restarts':1}}
 def execute(self,ready=None,content=None):
  with patch.object(d,'readiness',side_effect=ready or (lambda:self.ready())),patch.object(d,'content_check',side_effect=content or (lambda *a,**k:None)),patch.object(d,'wait_stable',return_value={}):
   with contextlib.redirect_stdout(io.StringIO()):return d.apply()
 def assert_restored(self):
  for n in d.FILES:
   p=self.root/n
   if n in self.before:self.assertEqual(p.read_bytes(),self.before[n])
   else:self.assertFalse(p.exists())
  self.assertEqual((self.root/'database/untouched.sql').read_text(),'unchanged')
 def test_25_success_exact_four_and_one_restart(self):
  self.assertEqual(self.execute(),0);self.assertEqual(self.restarts,1)
  self.assertTrue((self.work/'APPLY_DONE.json').exists())
  for n,h in self.manifest['after'].items():self.assertEqual(d.sha(self.root/n),h)
 def test_26_persistent_readiness_failure_rolls_back_once(self):
  self.assertEqual(self.execute(ready=[self.ready(),d.DeploymentError('STABILITY_FAILED',{'url':d.LOOPBACK+'/api/health','layer':'APPLICATION','last_http':{'status':500}}),self.ready()]),1)
  self.assertEqual(self.restarts,2);self.assert_restored()
  f=json.loads((self.work/'FAILURE.json').read_text());self.assertTrue(f['rollback_ok']);self.assertEqual(f['details']['last_http']['status'],500)
 def test_27_rollback_unhealthy_never_claims_ok(self):
  self.assertEqual(self.execute(ready=[self.ready(),d.DeploymentError('STABILITY_FAILED'),d.DeploymentError('STABILITY_FAILED')]),1)
  self.assert_restored();f=json.loads((self.work/'FAILURE.json').read_text())
  self.assertFalse(f['rollback_ok']);self.assertEqual(f['rollback_status'],'FAILED_REQUIRES_MANUAL_REVIEW')
 def test_28_mismatched_baseline_no_write_no_restart(self):
  p=self.root/'server/src/app.js';p.write_bytes(b'new third party')
  with self.assertRaisesRegex(d.DeploymentError,'BASELINE_CHANGED_STOP'):d.preflight()
  self.assertEqual(p.read_bytes(),b'new third party');self.assertEqual(self.restarts,0)
 def test_29_mismatched_payload_no_write(self):
  (self.work/'payload/public/index.html').write_bytes(b'wrong candidate')
  with self.assertRaisesRegex(d.DeploymentError,'PAYLOAD_HASH_MISMATCH'):d.preflight()
  self.assert_restored();self.assertEqual(self.restarts,0)
 def test_30_reused_directory_does_not_redeploy(self):
  (self.work/'BEFORE.json').write_text('{}')
  with self.assertRaisesRegex(d.DeploymentError,'V2_ALREADY_USED_STOP'):d.preflight()
  self.assertEqual(self.restarts,0)
 def test_31_third_party_change_rollback_stops_before_writes(self):
  def corrupt(*a,**kw):
   (self.root/'public/index.html').write_bytes(b'third party');raise d.DeploymentError('HTTP_CONTENT_HASH_MISMATCH')
  self.assertEqual(self.execute(content=corrupt),1)
  self.assertEqual((self.root/'public/index.html').read_bytes(),b'third party')
  f=json.loads((self.work/'FAILURE.json').read_text());self.assertFalse(f['rollback_ok'])
  self.assertEqual(f['rollback_error']['code'],'THIRD_PARTY_CHANGE_NO_ROLLBACK');self.assertEqual(self.restarts,1)
 def test_32_baseline_unhealthy_no_code_write(self):
  with patch.object(d,'readiness',side_effect=d.DeploymentError('STABILITY_FAILED')):
   with self.assertRaises(d.DeploymentError):d.apply()
  self.assert_restored();self.assertEqual(self.restarts,0)
 def test_33_real_event_journal_contains_timestamp_phase(self):
  self.assertEqual(self.execute(),0)
  records=[json.loads(s) for s in (self.work/'EVENTS.jsonl').read_text().splitlines()]
  self.assertTrue(all('utc' in e and 'phase' in e for e in records));self.assertEqual(records[-1]['kind'],'success')
 def test_34_backup_individual_content_and_absence_markers(self):
  self.assertEqual(self.execute(),0)
  for n in d.FILES:
   if n in self.before:self.assertEqual((self.work/'backup'/n).read_bytes(),self.before[n])
   else:self.assertTrue((self.work/'backup'/(n+'.absent.json')).exists())

if __name__=='__main__':unittest.main(verbosity=2)
