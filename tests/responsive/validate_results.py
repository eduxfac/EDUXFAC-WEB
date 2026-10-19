from pathlib import Path
import hashlib,json,sys
ROOT=Path(__file__).resolve().parents[2]
EVIDENCE=ROOT/'docs/responsive_visual'
WIDTHS={1920,1366,1024,768,375}
SCREENS={'sales','productsAdmin','inventory','purchases','reports','usersAdmin','settings'}
rows=json.loads((EVIDENCE/'FINAL_MATRIX.json').read_text(encoding='utf-8'))
assert len(rows)==35 and {(r['screen'],r['width']) for r in rows}=={(s,w) for s in SCREENS for w in WIDTHS},'Incomplete or duplicate matrix'
failures=[]
for r in rows:
 problems=[]
 if r['pageOverflow'] or r['pageWidth']>r['clientWidth']+1: problems.append('page overflow')
 if r['overflows']: problems.append('element outside viewport')
 baseline=next(x for x in rows if x['screen']==r['screen'] and x['width']==1920)
 if r['fonts']!=baseline['fonts']: problems.append('font size changed')
 if r['screen']=='productsAdmin' and r['width']<=768 and len(r['layout'].split())!=1: problems.append('product form must have one column')
 if r['screen']=='sales' and r['productNameClamped'] not in ('','none'): problems.append('product name clamped')
 for scroll in r['scrollContainers']:
  if not (r['screen']=='reports' and r['width']==375 and scroll['cls']=='report-center-table'): problems.append('unexpected horizontal scroll container')
 shot=Path(r['screenshot'])
 if not shot.is_file() or shot.stat().st_size<1000: problems.append('missing screenshot')
 if problems: failures.append({'screen':r['screen'],'width':r['width'],'problems':problems})
manifest=json.loads((EVIDENCE/'SOURCE_HASHES.json').read_text(encoding='utf-8'))
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
for rel,entry in manifest.items():
 assert sha(ROOT/rel)==entry['after'],f'Source changed after browser matrix: {rel}'
assert (ROOT/'public/index.html').read_bytes()==(ROOT/'tests/responsive/original/public/index.html').read_bytes(),'HTML or embedded JavaScript changed'
assert manifest['server/src/app.js']['after']==manifest['server/src/app.js']['before'],'Backend changed'
print(json.dumps({'combinations':35,'passed':35-len(failures),'failed':len(failures),'failures':failures,'source_integrity':'OK','font_sizes_fixed':True},indent=2))
sys.exit(bool(failures))
