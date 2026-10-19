from pathlib import Path
import json,hashlib,itertools
ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/'docs/sales_compact_visual'
rows=json.loads((OUT/'MATRIX.json').read_text())
widths=[1920,1366,1024,768,375]
screens=['sales','productsAdmin','inventory','purchases','reports','usersAdmin','settings']
assert len(rows)==70
def get(screen,width,stage):return next(r for r in rows if (r['screen'],r['width'],r['stage'])==(screen,width,stage))
results=[]
for screen,width in itertools.product(screens,widths):
 before=get(screen,width,'before');after=get(screen,width,'after')
 assert before['fonts']==after['fonts'],(screen,width,'typography changed')
 assert not after['escapes'] and after['pageWidth']<=after['clientWidth']+1,(screen,width,'overflow')
 if screen!='sales':
  assert before['geometryHash']==after['geometryHash'],(screen,width,'other module changed')
 else:
  b=before['blocks'];a=after['blocks']
  height=lambda v:v['#sales .sale-doc-flow']['y']+v['#sales .sale-doc-flow']['h']-v['.bw-topbar']['y']
  reduction=(height(b)-height(a))/height(b)*100
  assert reduction>=30,(width,'insufficient reduction')
  for first,second in [('.bw-topbar','#sales .sale-heading'),('#sales .sale-heading','#sales .sale-doc-flow'),('#sales .sale-doc-flow','#sales .sale-workspace')]:
   assert a[first]['y']+a[first]['h']<=a[second]['y'],(width,'blocks overlap')
  for i,x in enumerate(after['buttons']):
   r=x['rect'];assert r['w']>0 and r['h']>0
   for y in after['buttons'][i+1:]:
    s=y['rect']
    assert not (min(r['x']+r['w'],s['x']+s['w'])-max(r['x'],s['x'])>1 and min(r['y']+r['h'],s['y']+s['h'])-max(r['y'],s['y'])>1),(width,'buttons overlap')
  docs=after['buttons'][-5:]
  assert len(set(x['rect']['y'] for x in docs))==(1 if width>=768 else 3),(width,'document layout')
  assert (OUT/f'sales_{width}_before.jpg').is_file() and (OUT/f'sales_{width}_after.jpg').is_file()
  results.append({'width':width,'before_px':height(b),'after_px':height(a),'reduction_percent':round(reduction,2),'components_before':{s:v['h'] for s,v in b.items()},'components_after':{s:v['h'] for s,v in a.items()},'workspace_gained_px':b['#sales .sale-workspace']['y']-a['#sales .sale-workspace']['y']})
old=json.loads((ROOT/'tests/sales-compact/SOURCE_BEFORE.json').read_text())
for name in ['public/index.html','server/src/app.js']:
 assert hashlib.sha256((ROOT/name).read_bytes()).hexdigest()==old[name],name
css=(ROOT/'public/desktop-responsive.css').read_bytes()
assert css.startswith((ROOT/'tests/sales-compact/BEFORE.css').read_bytes())
assert b'font-size' not in css[len((ROOT/'tests/sales-compact/BEFORE.css').read_bytes()):]
result={'comparisons_passed':35,'comparisons_failed':0,'before_after_observations':70,'other_module_comparisons_unchanged':30,'fonts_unchanged':True,'global_overflow':False,'overlaps':False,'HTML_JS_backend_unchanged':True,'css_sha256':hashlib.sha256(css).hexdigest(),'sales':results}
(OUT/'RESULT.json').write_text(json.dumps(result,indent=2),encoding='utf-8')
print(json.dumps(result,indent=2))
