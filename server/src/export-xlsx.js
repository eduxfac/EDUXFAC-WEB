import ExcelJS from 'exceljs';
import {Worker,isMainThread,parentPort,workerData} from 'node:worker_threads';
async function generate(req,res){
  try{
    const sheets=Array.isArray(req.body?.sheets)?req.body.sheets:[];
    if(!sheets.length)throw new Error('No hay datos para exportar.');
    if(sheets.length>30)throw new Error('Demasiadas hojas para exportar.');
    const wb=new ExcelJS.Workbook();
    wb.creator='BoticaWeb';wb.created=new Date();
    for(const sh of sheets){
      const safeName=String(sh.name||'Datos').replace(/[\\/?*\[\]:]/g,' ').trim().slice(0,31)||'Datos';
      let name=safeName,n=2;while(wb.getWorksheet(name))name=(safeName.slice(0,27)+' '+n++).slice(0,31);
      const ws=wb.addWorksheet(name,{views:[{state:'frozen',ySplit:2}]});
      let row=1;
      ws.mergeCells(row,1,row,Math.max(2,...(sh.blocks||[]).map(b=>(b.headers||[]).length||2)));
      const title=ws.getCell(row,1);title.value=String(sh.title||sh.name||'BoticaWeb');title.font={bold:true,size:16,color:{argb:'FFFFFFFF'}};title.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF10233F'}};title.alignment={vertical:'middle'};ws.getRow(row).height=26;row++;
      ws.getCell(row,1).value=`Exportado: ${new Date().toLocaleString('es-PE')}`;ws.getCell(row,1).font={italic:true,color:{argb:'FF6B778C'}};row+=2;
      for(const block of (sh.blocks||[])){
        if(block.title){const c=ws.getCell(row,1);c.value=String(block.title);c.font={bold:true,size:12,color:{argb:'FF10233F'}};row++;}
        const headers=(block.headers||[]).map(x=>String(x??''));
        if(headers.length){
          const hr=ws.getRow(row);headers.forEach((h,i)=>{const c=hr.getCell(i+1);c.value=h;c.font={bold:true,color:{argb:'FFFFFFFF'}};c.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF0D6EFD'}};c.alignment={vertical:'middle'};c.border={bottom:{style:'thin',color:{argb:'FFD9E2F3'}}};});row++;
        }
        const rows=Array.isArray(block.rows)?block.rows:[];
        for(const vals of rows.slice(0,50000)){
          const r=ws.getRow(row++);(Array.isArray(vals)?vals:[vals]).forEach((v,i)=>{const c=r.getCell(i+1);c.value=(typeof v==='number'&&Number.isFinite(v))?v:String(v??'');c.alignment={vertical:'top',wrapText:true};});
        }
        row+=2;
      }
      const maxCol=Math.min(30,Math.max(1,ws.columnCount));
      for(let i=1;i<=maxCol;i++){
        const col=ws.getColumn(i);let width=10;col.eachCell({includeEmpty:false},c=>{const len=String(c.value??'').length;width=Math.max(width,Math.min(38,len+2));});col.width=width;
      }
      ws.autoFilter=undefined;
    }
    const buffer=await wb.xlsx.writeBuffer();
    const filename=String(req.body?.filename||'BoticaWeb.xlsx').replace(/[^a-zA-Z0-9áéíóúÁÉÍÓÚñÑ._ -]/g,'_');
    res.setHeader('Content-Type','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition',`attachment; filename*=UTF-8''${encodeURIComponent(filename.endsWith('.xlsx')?filename:filename+'.xlsx')}`);
    res.send(Buffer.from(buffer));
  }catch(error){res.status(error.status||400).json({error:error.message});}
}

if(!isMainThread){
 const headers={};let status=200;
 const send=data=>{const bytes=Uint8Array.from(data);parentPort.postMessage({headers,status,bytes},[bytes.buffer])};
 await generate({body:workerData},{setHeader(k,v){headers[k]=v},status(code){status=code;return this},send,json(data){send(Buffer.from(JSON.stringify(data)));}});
}
let queue=Promise.resolve();
export async function exportXlsx(req,res){
 const task=()=>new Promise((resolve,reject)=>{
  const worker=new Worker(new URL(import.meta.url),{workerData:req.body});let settled=false;
  worker.once('message',message=>{settled=true;resolve(message)});
  worker.once('error',reject);
  worker.once('exit',code=>{if(!settled)reject(new Error('La exportación Excel terminó sin resultado ('+code+').'))});
 });
 const pending=queue.then(task);queue=pending.catch(()=>{});
 try{const result=await pending;for(const [key,value] of Object.entries(result.headers))res.setHeader(key,value);if(result.status!==200){res.status(result.status).json(JSON.parse(Buffer.from(result.bytes).toString()));return}res.send(Buffer.from(result.bytes));}
 catch(error){res.status(500).json({error:'No se pudo generar Excel: '+error.message})}
}
