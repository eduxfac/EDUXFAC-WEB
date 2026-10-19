from pathlib import Path
from http.server import ThreadingHTTPServer,SimpleHTTPRequestHandler
from urllib.parse import urlsplit,parse_qs
import re,json
ROOT=Path(__file__).resolve().parents[2];PUBLIC=ROOT/'public'
DATA=json.loads(Path(__file__).with_name('data.json').read_text(encoding='utf-8'))
class Handler(SimpleHTTPRequestHandler):
 def __init__(self,*a,**kw):super().__init__(*a,directory=str(PUBLIC),**kw)
 def do_GET(self):
  p=urlsplit(self.path);q=parse_qs(p.query)
  if p.path=='/':
   before=q.get('baseline',['0'])[0]=='1'
   source=(ROOT/'tests/purchase-detail-visual/original/public/index.html' if before else PUBLIC/'index.html').read_text(encoding='utf-8')
   funcs=source[source.index('function reportDocumentMarkup(data){'):source.index("document.addEventListener('click',e=>{const button=e.target.closest?.('[data-report-document]')")]
   head=source.split('</head>')[0]+'</head>'
   head=re.sub(r'<script\b[^>]*>[\s\S]*?</script>','',head,flags=re.I)
   if before:head=head.replace('href="desktop-responsive.css"','href="/__before.css"')
   modal=re.search(r'<dialog id="reportDocumentModal"[\s\S]*?</dialog>',source).group()
   case=q.get('kind',['purchases'])[0]
   data={**DATA,'tipo':case}
   esc="const esc=v=>String(v??'').replace(/[&<>\"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',\"'\":'&#39;'}[c]));"
   js="const $=id=>document.getElementById(id);"+esc+"const DATA="+json.dumps(data,ensure_ascii=False)+";const api=async route=>structuredClone(DATA);"+funcs
   js += "$('fixtureOpen').onclick=()=>showReportDocument("+json.dumps(case)+",'DEMO-123');"
   body='<body><p>DEMO VISUAL LOCAL · DATOS FICTICIOS</p><button id="fixtureOpen" type="button">Abrir detalle</button>'+modal+'<script>'+js+'</script></body></html>'
   b=(head+body).encode('utf-8');self.send_response(200);self.send_header('Content-Type','text/html;charset=utf-8');self.send_header('Cache-Control','no-store');self.end_headers();self.wfile.write(b);return
  if p.path=='/__before.css':
   b=(ROOT/'tests/purchase-detail-visual/original/public/desktop-responsive.css').read_bytes();self.send_response(200);self.send_header('Content-Type','text/css');self.end_headers();self.wfile.write(b);return
  if p.path.startswith('/api') or p.path.endswith('.env'):self.send_error(403);return
  super().do_GET()
 def log_message(self,*a):pass
if __name__=='__main__':
 print('PURCHASE_DETAIL_VISUAL_FIXTURE_127_0_0_1_4403',flush=True)
 ThreadingHTTPServer(('127.0.0.1',4403),Handler).serve_forever()
