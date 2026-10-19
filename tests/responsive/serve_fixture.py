from pathlib import Path
from http.server import ThreadingHTTPServer,SimpleHTTPRequestHandler
from urllib.parse import urlsplit,parse_qs
import re,json
ROOT=Path(__file__).resolve().parents[2];PUBLIC=ROOT/'public'
SCREENS=['sales','productsAdmin','inventory','purchases','reports','usersAdmin','settings']
def fixture(screen,baseline=False):
 h=(PUBLIC/'index.html').read_text(encoding='utf-8')
 h=re.sub(r'<script\b[^>]*>[\s\S]*?</script>','',h,flags=re.I)
 h=re.sub(r'(<div\b[^>]*\bid="login"[^>]*\bclass=")([^"]*)"',lambda m:m[1]+m[2]+' hidden"',h,count=1)
 h=re.sub(r'(<div\b[^>]*\bid="app"[^>]*\bclass=")([^"]*)"',lambda m:m[1]+m[2].replace('hidden','').strip()+'"',h,count=1)
 h=re.sub(r'(<section\b[^>]*\bid="([^"]+)"[^>]*\bclass=")([^"]*)"',lambda m:m[1]+re.sub(r'\bactive\b','',m[3]).strip()+(' active' if m[2]==screen else '')+'"',h)
 if baseline:h=h.replace('href="desktop-responsive.css"','href="/__before.css"')
 def show(id):
  nonlocal h
  h=re.sub(r'(<[^>]+\bid="'+re.escape(id)+r'"[^>]*\bclass=")([^"]*)"',lambda m:m[1]+m[2].replace('hidden','').strip()+'"',h,count=1)
 def fill(id,content):
  nonlocal h
  pattern=r'(<(?P<tag>tbody|div|b|span)\b[^>]*\bid="'+re.escape(id)+r'"[^>]*>)([\s\S]*?)(</(?P=tag)>)'
  h=re.sub(pattern,lambda m:m[1]+content+m[4],h,count=1)
 def row(cells):return '<tr>'+''.join('<td>'+c+'</td>' for c in cells)+'</tr>'
 product='APRONAX 550MG TABLETAS RECUBIERTAS — PRESENTACIÓN DE PRUEBA CON NOMBRE LARGO'
 fill('productRows',row(['P000001','<div class="sale-product-name"><b>'+product+'</b><div class="sale-product-sub">Naproxeno sódico · 550 mg</div></div>','Caja de 120 unidades','Laboratorio ficticio','<span class="price-stack"><b>S/ 1.57</b></span>','<span class="price-stack"><b>S/ 2.50</b></span>','<span class="margin-badge">59.24%</span>','<span class="stock-badge stock-ok">120</span>']))
 show('saleResultsWrap')
 cart='<div class="cart-row"><div class="cart-product-name"><b>'+product+'</b><small>CAJA · equivale a 120 unidades · disp. 120</small></div><div><input class="cart-price-input" value="300.00" title="Precio editable solo para esta venta"><small class="cart-price-original">Base S/300.00</small></div><div class="qty"><button title="Disminuir">−</button><input value="1" title="Cantidad de presentaciones"><button title="Aumentar">+</button></div><div class="cart-line-total">S/ 300.00</div><button class="cart-remove" title="Quitar">×</button></div>'
 fill('cart',cart);fill('total','S/ 300.00');fill('subtotalMirror','S/ 300.00')
 fill('recentSaleRows',row(['10:30','Cliente ficticio con nombre extenso','S/ 300.00','<button class="btn secondary">Ver detalle</button>']))
 fill('paRows',row(['P000001',product,'S/ 2.50','0','ACTIVO','<button class="btn secondary">Editar</button><button class="btn secondary">Desactivar</button>']))
 show('paListWrap')
 if screen=='productsAdmin':show('paFormModal')
 fill('inventoryRows',row(['P000001',product,'120','<input class="stock-edit" value="120">','0','0','S/ 2.50','<button class="btn secondary">Guardar ajuste</button>']))
 show('inventoryTableWrap')
 for id,text in {'invKpiTotal':'2','invKpiStock':'2','invKpiLow':'0','invKpiZero':'0','invKpiValue':'S/ 219.60'}.items():fill(id,text)
 purchaseCells=[product,'<input value="120" type="number">','<select><option>UNIDAD</option></select>','<input value="1.57" type="number">','<input value="1.57" type="number">','<select><option>18%</option></select>','<input value="2.50" type="number">','<input class="lot" value="DFDF">','<input class="expiry" type="date" value="2028-12-31">','S/ 188.40','<button class="btn secondary">Quitar</button>']
 fill('purchaseItemRows',row(purchaseCells));fill('purchaseGrandTotal','S/ 188.40');fill('purchaseItemCount','1 producto')
 fill('uaRows',row(['Administrador ficticio','Principal · Administrador','ACTIVO','<button class="btn secondary">Editar</button>']))
 fill('uaBranchRows',row(['PRINCIPAL','Sucursal ficticia principal','Av. de prueba 123, ciudad ficticia','2','ACTIVO','<button class="btn secondary">Editar</button>']))
 # Real report DOM containers rendered with representative sales columns.
 for id in re.findall(r'<tbody[^>]*id="([^"]+)"',h):
  if id.startswith('rep') and not id.startswith('replenish'):fill(id,row(['2026-10-13','B001-000001','Cliente ficticio','Administrador','Efectivo','120','S/ 300.00','S/ 111.60']))
 for id,text in {'rcKpi1Label':'Venta total','rcKpi4Label':'Costo total','rcKpi5Label':'Ganancia','rcKpi1':'S/ 300.00','rcKpi2':'1','rcKpi3':'120','rcKpi4':'S/ 188.40','rcKpi5':'S/ 111.60'}.items():fill(id,text)
 # Preserve actual form element structure; only fake values/options.
 for id,value in {'paCode':'P000003','paName':product,'paMin':'0','paPrice':'2.50','cfgLegalName':'BOTICA FICTICIA RESPONSIVE','cfgName':'Botica ficticia','cfgAddress':'Av. Ejemplo 123, dirección de prueba suficientemente extensa','cfgEmail':'demo@example.invalid','uaName':'Usuario ficticio','uaUser':'demo_responsive'}.items():
  h=re.sub(r'(<input\b[^>]*\bid="'+id+r'"[^>]*)(>)',lambda m:re.sub(r'\svalue="[^"]*"','',m[1])+' value="'+value+'"'+m[2],h,count=1)
 h=re.sub(r'(<select\b[^>]*id="(?:branch|repBranch|uaBranch|buySupplier|cfgPermUser)"[^>]*>)[\s\S]*?(</select>)',lambda m:m[1]+'<option>Sucursal PRINCIPAL ficticia</option>'+m[2],h)
 h=h.replace('<option value="UNIDAD">Unidad</option>','<option value="UNIDAD" selected>Unidad</option>')
 badge='<aside style="position:fixed;bottom:8px;left:8px;z-index:999;background:#082847;color:white;padding:6px;border-radius:6px;max-width:95vw">DEMO VISUAL LOCAL · DATOS FICTICIOS</aside>'
 links='<nav aria-label="Pruebas responsive" style="display:flex;flex-wrap:wrap;gap:8px;padding:8px;background:white">'+''.join('<a href="/?screen='+s+('&#38;baseline=1' if baseline else '')+'">'+s+'</a>' for s in SCREENS)+'</nav>'
 h=h.replace('</head>','<style>#login,.login{display:none!important}</style></head>').replace('<body>','<body>'+links).replace('</body>',badge+'</body>')
 return h
class Handler(SimpleHTTPRequestHandler):
 def __init__(self,*a,**kw):super().__init__(*a,directory=str(PUBLIC),**kw)
 def do_GET(self):
  p=urlsplit(self.path);q=parse_qs(p.query)
  if p.path=='/':
   screen=q.get('screen',['sales'])[0]
   if screen not in SCREENS:self.send_error(404);return
   data=fixture(screen,q.get('baseline',['0'])[0]=='1').encode()
   self.send_response(200);self.send_header('Content-Type','text/html;charset=utf-8');self.send_header('Cache-Control','no-store');self.end_headers();self.wfile.write(data);return
  if p.path=='/__before.css':
   data=(ROOT/'tests/responsive/original/public/desktop-responsive.css').read_bytes()
   self.send_response(200);self.send_header('Content-Type','text/css');self.end_headers();self.wfile.write(data);return
  if p.path.startswith('/api') or p.path.endswith('.env'):self.send_error(403);return
  super().do_GET()
 def log_message(self,*args):pass
if __name__=='__main__':
 print('RESPONSIVE_STATIC_QA_HTTP_127_0_0_1_4399',flush=True)
 ThreadingHTTPServer(('127.0.0.1',4399),Handler).serve_forever()
