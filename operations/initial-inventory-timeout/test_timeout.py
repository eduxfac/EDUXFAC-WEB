import importlib.util,tempfile,json,unittest,sys,types
if sys.platform=="win32":sys.modules["pwd"]=types.SimpleNamespace()
from pathlib import Path
from unittest.mock import patch
OP=Path(__file__).resolve().parent
spec=importlib.util.spec_from_file_location('timeout_tool',OP/'MANUAL_INVENTORY_TIMEOUT.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
BEFORE=(OP/'NGINX_BEFORE.conf').read_bytes();AFTER=(OP/'NGINX_AFTER.conf').read_bytes()
class Tests(unittest.TestCase):
 def test_fragment_only(self):
  data,fragment=m.candidate(BEFORE);self.assertEqual(data,AFTER);self.assertEqual(data.replace(fragment.encode(),b'',1),BEFORE);self.assertEqual(data.count(b'proxy_read_timeout 30s;'),2);self.assertEqual(data.count(b'proxy_read_timeout 90s;'),1)
 def test_headers_upstream_preserved(self):
  _,f=m.candidate(BEFORE)
  for line in ['proxy_pass http://127.0.0.1:3001;','proxy_http_version 1.1;','proxy_set_header Host $host;','proxy_set_header X-Real-IP $remote_addr;','proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;','proxy_set_header X-Forwarded-Proto $scheme;']:self.assertIn(line,f)
 def test_other_limits_preserved(self):
  self.assertEqual(BEFORE.count(b'client_max_body_size 30m;'),AFTER.count(b'client_max_body_size 30m;'))
  for x in [b'proxy_send_timeout',b'client_body_timeout']:self.assertEqual(BEFORE.count(x),AFTER.count(x))
 def test_rejects_duplicate(self):
  with self.assertRaisesRegex(RuntimeError,'IMPORT_LOCATION_ALREADY_PRESENT'):m.candidate(AFTER)
 def test_rejects_changed_base(self):
  with self.assertRaisesRegex(RuntimeError,'BASE_TIMEOUT_NOT_EXPECTED'):m.candidate(BEFORE.replace(b'proxy_read_timeout 30s;',b'proxy_read_timeout 45s;'))
 def exercise(self,failure=None):
  qa=OP/'qa';qa.mkdir(exist_ok=True)
  with tempfile.TemporaryDirectory(dir=qa) as d:
   work=Path(d).resolve();self.assertTrue(work.is_relative_to(qa.resolve()))
   target=work/'eduxfac-web-piloto';target.write_bytes(BEFORE);filename=work/'MANUAL_INVENTORY_TIMEOUT.py';filename.write_text('# fake only')
   def save(name,v):(work/name).write_text(json.dumps(v))
   called={'test':0,'reload':0,'health':0,'watched':0}
   def test():
    called['test']+=1
    if failure=='test' and called['test']==2:raise RuntimeError('NGINX_COMMAND_FAILED')
    return{'returncode':0}
   def reload():
    called['reload']+=1
    if failure=='reload' and called['reload']==1:raise RuntimeError('SYSTEMCTL_COMMAND_FAILED')
    return{'returncode':0}
   def health():
    called['health']+=1
    if failure=='health' and called['health']==2:raise RuntimeError('HTTPS_NOT_200')
    return[{'status':200,'data_mode':'PILOTO'}]
   def watched():
    called['watched']+=1
    return{'protected':'CHANGED' if failure=='protected' and called['watched']==2 else 'ORIGINAL'}
   with patch.object(m,'WORK',work),patch.object(m,'TARGET',target),patch.object(m,'__file__',str(filename)),patch.object(m.os,'geteuid',return_value=0,create=True),patch.object(m,'save',side_effect=save),patch.object(m,'nginx_test',side_effect=test),patch.object(m,'reload_nginx',side_effect=reload),patch.object(m,'check_health',side_effect=health),patch.object(m,'watched',side_effect=watched),patch.object(m,'atomic',side_effect=lambda data,stat:target.write_bytes(data)):
    if failure:
     with self.assertRaises(SystemExit):m.apply()
     self.assertEqual(target.read_bytes(),BEFORE);self.assertTrue(json.loads((work/'FAILURE.json').read_text())['rollback_ok'])
    else:
     m.apply();self.assertEqual(target.read_bytes(),AFTER);self.assertEqual((work/'backup/eduxfac-web-piloto').read_bytes(),BEFORE)
     m.rollback();self.assertEqual(target.read_bytes(),BEFORE);self.assertTrue((work/'ROLLBACK_DONE.json').exists())
 def test_apply_backup_and_manual_rollback(self):self.exercise()
 def test_nginx_failure_automatic_rollback(self):self.exercise('test')
 def test_reload_failure_automatic_rollback(self):self.exercise('reload')
 def test_health_failure_automatic_rollback(self):self.exercise('health')
 def test_other_files_failure_automatic_rollback(self):self.exercise('protected')
if __name__=='__main__':unittest.main(verbosity=2)
