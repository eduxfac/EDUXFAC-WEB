from pathlib import Path
import importlib.util,hashlib
from urllib.parse import urlsplit
from http.server import ThreadingHTTPServer
ROOT=Path(__file__).resolve().parents[2]
spec=importlib.util.spec_from_file_location('fixture',ROOT/'tests/responsive/serve_fixture.py')
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
CSS=Path(__file__).with_name('HTTPS_DEPLOYED.css').read_bytes()
assert hashlib.sha256(CSS).hexdigest()=='3309210a7c0602c7559171c7f04183191a6e4ad55c798a0bd72a3217de20fe7c'
class Handler(m.Handler):
 def do_GET(self):
  if urlsplit(self.path).path=='/desktop-responsive.css':
   self.send_response(200);self.send_header('Content-Type','text/css');self.send_header('Cache-Control','no-store');self.end_headers();self.wfile.write(CSS);return
  super().do_GET()
print('POST_DEPLOY_VISUAL_FIXTURE_127_0_0_1_4400',flush=True)
ThreadingHTTPServer(('127.0.0.1',4400),Handler).serve_forever()
