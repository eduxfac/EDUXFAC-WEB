from pathlib import Path
from http.server import ThreadingHTTPServer
from urllib.parse import urlsplit
import importlib.util
ROOT=Path(__file__).resolve().parents[2]
spec=importlib.util.spec_from_file_location('basefixture',ROOT/'tests/responsive/serve_fixture.py')
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
original=m.fixture
def fixture(screen,baseline=False):
 h=original(screen,False)
 return h.replace('href="desktop-responsive.css"','href="/__compact_before.css"') if baseline else h
m.fixture=fixture
class Handler(m.Handler):
 def do_GET(self):
  if urlsplit(self.path).path=='/__compact_before.css':
   b=(ROOT/'tests/sales-compact/BEFORE.css').read_bytes()
   self.send_response(200);self.send_header('Content-Type','text/css');self.send_header('Cache-Control','no-store');self.end_headers();self.wfile.write(b);return
  super().do_GET()
print('SALES_COMPACT_FIXTURE_127_0_0_1_4401',flush=True)
ThreadingHTTPServer(('127.0.0.1',4401),Handler).serve_forever()
