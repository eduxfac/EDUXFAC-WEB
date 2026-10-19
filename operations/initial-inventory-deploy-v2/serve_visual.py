from http.server import ThreadingHTTPServer,SimpleHTTPRequestHandler
from pathlib import Path
from urllib.parse import urlsplit,parse_qs
import re
ROOT=Path(__file__).resolve().parents[2];PUBLIC=ROOT/'public'
class Handler(SimpleHTTPRequestHandler):
 def __init__(self,*a,**kw):super().__init__(*a,directory=str(PUBLIC),**kw)
 def do_GET(self):
  url=urlsplit(self.path)
  if url.path=='/':
   baseline=parse_qs(url.query).get('before',['0'])[0]=='1'
   raw=(ROOT/'operations/initial-inventory-deploy-v2/HTTPS_INDEX.html').read_bytes()
   source=raw.decode('utf-8')
   head=source[:source.index('</head>')+len('</head>')]
   head=re.sub(r'<script\b[^>]*>[\s\S]*?</script>','',head,flags=re.I)
   section=re.search(r'<section id="inventory"[\s\S]*?</section>',source).group()
   section=section.replace('class="module"','class="module active"',1)
   body='<body><p>HTML DESPLEGADO · VERIFICACIÓN AISLADA · SIN DATOS REALES</p>'+section+'</body></html>'
   data=(head+body).encode('utf-8')
   self.send_response(200);self.send_header('Content-Type','text/html;charset=utf-8');self.end_headers();self.wfile.write(data);return
  if url.path.startswith('/api') or url.path.endswith('.env'):self.send_error(403);return
  super().do_GET()
 def log_message(self,*a):pass
if __name__=='__main__':
 print('DEPLOYED_INITIAL_INVENTORY_VISUAL_127_0_0_1_4406',flush=True)
 ThreadingHTTPServer(('127.0.0.1',4406),Handler).serve_forever()
