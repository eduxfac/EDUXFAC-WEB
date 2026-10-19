import vm from 'node:vm';import {readFileSync} from 'node:fs';
export const html=readFileSync(new URL('../../public/index.html',import.meta.url),'utf8');
export const formatter=html.slice(html.indexOf('function formatExpiryDate(value){'),html.indexOf('async function loadAlerts()'));
export function ui(){
 const nodes=new Map();const el=id=>{if(!nodes.has(id))nodes.set(id,{value:'',innerHTML:'',textContent:'',classList:{add(){},remove(){}}});return nodes.get(id)};
 const c={state:{branchId:'TEST'},$:el,esc:x=>String(x??''),stockHtml:x=>String(x),money:x=>'S/'+x,rcMoney:x=>'S/'+x,rcNum:x=>String(x??0),reportCenterType:'expiry',reportMeta:{expiry:{desc:'Vencimientos'}},rcSetKpis(){},rcSetHead(){},renderSalesProductDetails(){},document:{querySelectorAll:()=>[]}};
 c.rcSetRows=(rows,cols)=>{c.cells=rows.map(r=>cols.map(f=>f(r)))};
 vm.createContext(c);vm.runInContext(formatter,c);
 for(const[a,b]of [['function renderDashExpiry(','function renderDashLowStock('],['async function loadAlerts()','async function repairInventoryMetadata()'],['function renderReportCenter(d){','function reportDocumentMarkup(data){'],['function reportDocumentMarkup(data){','async function showReportDocument(']]){const start=html.indexOf(a),end=html.indexOf(b,start+1);if(start<0||end<0)throw Error('MissingUI:'+a);vm.runInContext(html.slice(start,end),c)}
 return{c,el,preview(row){c.d={rows:[row]};const line=html.split('\n').find(x=>x.includes("$('inventoryPreviewRows').innerHTML=d.rows.map"));vm.runInContext(line,c);return el('inventoryPreviewRows').innerHTML}};
}
