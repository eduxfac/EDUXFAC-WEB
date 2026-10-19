import ExcelJS from 'exceljs';
import {createHash,randomUUID} from 'node:crypto';
import {linkProduct} from './branch-catalog.js';

export const INITIAL_COLUMNS=[
 ['codigo_interno','Código interno',true,40],['codigo_barras','Código de barras',false,80],
 ['nombre','Producto',true,180],['principio_activo','Principio activo',false,180],
 ['concentracion','Concentración',false,80],['presentacion','Presentación',false,120],
 ['unidad_medida','Unidad de medida',true,40],['categoria','Categoría',false,100],
 ['laboratorio','Laboratorio',false,120],['stock','Stock del lote',true],
 ['stock_minimo','Stock mínimo',true],['costo','Precio de compra',true],['precio','Precio de venta',true],
 ['lote','Lote',false,80],['vencimiento','Vencimiento',false]];
export const INITIAL_UNITS=['UNIDAD','BLISTER','CAJA','PAQUETE','DOCENA','FRASCO','BOTELLA','SOBRE','TUBO','AMPOLLA','VIAL','BOLSA','TABLETA','CAPSULA','GRAMO','MILILITRO'];
const clean=v=>String(v??'').trim().replace(/\s+/g,' ');
const key=v=>clean(v).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/[_\s]+/g,' ');
const same=v=>clean(v).toLocaleLowerCase('es');
const fail=message=>{throw new Error(message);};
const primitive=cell=>{
 const v=cell.value;
 if(v&&typeof v==='object'&&!(v instanceof Date))fail('No se admiten fórmulas, enlaces ni valores calculados; pegue valores.');
 return v;
};
function number(v,label,decimals){
 const text=clean(v).replace(',','.');
 if(!/^\d+(?:\.\d+)?$/.test(text))fail(label+' obligatorio y numéricamente válido (no negativo).');
 const n=Number(text);
 if(!Number.isFinite(n)||n>1e9||Math.abs(n-Number(n.toFixed(decimals)))>1e-8)fail(label+' fuera de rango o con demasiados decimales.');
 return n;
}
export function initialDate(v,date1904=false){
 if(v==null||v==='')return null;
 if(v instanceof Date){if(!Number.isFinite(v.getTime()))fail('Vencimiento inválido');return v.toISOString().slice(0,10);}
 if(typeof v==='number'){
  if(!Number.isInteger(v)||v<=0||(!date1904&&v===60))fail('Vencimiento Excel inválido');
  if(v>2958465)fail('Vencimiento Excel fuera de rango');
  return new Date(Date.UTC(date1904?1904:1899,date1904?0:11,date1904?1:30)+v*86400000+(date1904||v>60?0:86400000)).toISOString().slice(0,10);
 }
 const text=clean(v);let m=text.match(/^(\d{4})-(\d{2})-(\d{2})$/),y,mo,d;
 if(m)[,y,mo,d]=m;else{m=text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);if(!m)fail('Vencimiento debe ser dd/mm/aaaa o aaaa-mm-dd');[,d,mo,y]=m;}
 const date=new Date(Date.UTC(+y,+mo-1,+d));
 if(date.getUTCFullYear()!==+y||date.getUTCMonth()!==+mo-1||date.getUTCDate()!==+d||+y<1900||+y>9999)fail('Vencimiento inválido');
 return date.toISOString().slice(0,10);
}
export async function initialTemplate(){
 const wb=new ExcelJS.Workbook();wb.creator='EDUXFAC';
 const ws=wb.addWorksheet('Inventario inicial',{views:[{state:'frozen',ySplit:1}]});
 ws.addRow(INITIAL_COLUMNS.map(c=>c[1]));
 ws.columns.forEach((c,i)=>{c.width=[0,1,13].includes(i)?20:i===2?36:22;if([0,1,13].includes(i))c.numFmt='@';});
 ws.getRow(1).height=36;
 ws.getRow(1).eachCell((c,i)=>{c.font={bold:true,color:{argb:'FFFFFFFF'}};c.fill={type:'pattern',pattern:'solid',fgColor:{argb:INITIAL_COLUMNS[i-1][2]?'FF123F6D':'FF55718D'}};c.alignment={wrapText:true,vertical:'middle'};});
 ws.autoFilter='A1:O1';
 ws.dataValidations.add('G2:G5001',{type:'list',allowBlank:false,formulae:['"'+INITIAL_UNITS.join(',')+'"']});
 const info=wb.addWorksheet('Información');info.getColumn(1).width=105;
 info.addRows([
 ['IMPORTACIÓN INICIAL DE INVENTARIO — EDUXFAC'],
 ['Complete la hoja Inventario inicial; no copie el ejemplo si no corresponde a su inventario.'],
 ['Obligatorios: Código interno, Producto, Unidad de medida, Stock del lote, Stock mínimo, Precio de compra y Precio de venta.'],
 ['Stock mínimo acepta 0. Precios no negativos: compra hasta 4 decimales, venta hasta 2; stock hasta 3.'],
 ['Una fila por lote. Repita código y datos maestros idénticos; cada lote puede tener costo y vencimiento distintos.'],
 ['Código interno y código de barras son Texto: conserve ceros iniciales. No use fórmulas ni notación científica.'],
 ['Lote y vencimiento vacíos se conservan vacíos. Fechas: dd/mm/aaaa o aaaa-mm-dd.'],
 ['Sin Stock máximo ni Valor del stock. El sistema calcula stock × costo por lote.'],
 ['Solo saldo inicial: no reemplaza inventario ni crea compras. Productos con stock o movimientos previos en la sucursal se bloquean.'],
 ['Vista previa y resumen antes de confirmar. Cualquier error cancela toda la importación. Máximo 5.000 filas / 20 MB.'],
 ['Ejemplo: mismo producto, dos lotes; total 10 unidades y S/80.00.']
 ]);
 info.addRow(INITIAL_COLUMNS.map(c=>c[1]));
 info.addRow(['P000003','','LIMONADA AMRKOS 200ML','','','','BOTELLA','','',4,0,8,12.9,'EDED','29/10/2026']);
 info.addRow(['P000003','','LIMONADA AMRKOS 200ML','','','','BOTELLA','','',6,0,8,12.9,'DEDEEE','29/11/2026']);
 info.getRow(1).font={size:16,bold:true};info.getRow(12).font={bold:true};
 for(let c=2;c<=15;c++)info.getColumn(c).width=c===3?36:22;
 return Buffer.from(await wb.xlsx.writeBuffer());
}
export async function parseInitialWorkbook(base64){
 if(typeof base64!=='string'||!base64||base64.length>28*1024*1024)fail('Seleccione un Excel de hasta 20 MB.');
 const buffer=Buffer.from(base64.replace(/^data:.*?;base64,/,''),'base64');
 if(!buffer.length||buffer.length>20*1024*1024)fail('Archivo vacío o mayor a 20 MB.');
 const wb=new ExcelJS.Workbook();await wb.xlsx.load(buffer);
 const ws=wb.getWorksheet('Inventario inicial')||wb.worksheets.find(s=>key(s.name)!=='INFORMACION');
 if(!ws||ws.rowCount>20001)fail('Hoja inválida o demasiadas filas.');
 const map={};ws.getRow(1).eachCell((c,i)=>{const k=key(primitive(c)),column=INITIAL_COLUMNS.find(x=>key(x[1])===k);if(column){if(map[column[0]])fail('Encabezado duplicado: '+column[1]);map[column[0]]=i;}});
 for(const [field,label,required]of INITIAL_COLUMNS)if(required&&!map[field])fail('Falta columna obligatoria: '+label);
 const rows=[],groups=new Map(),names=new Map(),bars=new Map();
 for(let r=2;r<=ws.rowCount;r++){
  const excel=ws.getRow(r);if(!Object.values(map).some(i=>clean(excel.getCell(i).value)))continue;
  if(rows.length===5000)fail('Máximo 5.000 filas.');
  const item={row:r,errors:[],warnings:[]};
  for(const [field,label,required,max]of INITIAL_COLUMNS){
   try{
    const v=map[field]?primitive(excel.getCell(map[field])):null;
    if(['stock','stock_minimo','costo','precio'].includes(field))item[field]=number(v,label,field==='costo'?4:field==='precio'?2:3);
    else if(field==='vencimiento')item[field]=initialDate(v,wb.properties.date1904);
    else{
     item[field]=clean(v);
     if(required&&!item[field])fail(label+' obligatorio');
     if(max&&item[field].length>max)fail(label+' supera '+max+' caracteres');
     if(field==='unidad_medida'){item[field]=key(item[field]);if(!INITIAL_UNITS.includes(item[field]))fail('Unidad de medida inválida');}
     if(['codigo_interno','codigo_barras','lote'].includes(field)&&typeof v==='number'&&(!Number.isSafeInteger(v)||v<0))fail(label+': use formato Texto');
    }
   }catch(e){item.errors.push(e.message);}
  }
  if(item.stock>0&&item.costo===0)item.warnings.push('Costo explícito 0: este lote no aporta valor al inventario.');
  rows.push(item);
  if(item.codigo_interno){
   let group=groups.get(item.codigo_interno);
   if(!group){group={first:item,rows:[],lots:new Map()};groups.set(item.codigo_interno,group);}
   group.rows.push(item);
  }
 }
 if(!rows.length)fail('No hay filas de inventario.');
 for(const [code,g]of groups){
  const f=g.first;
  const fields=['nombre','unidad_medida','codigo_barras','principio_activo','concentracion','presentacion','categoria','laboratorio','stock_minimo','precio'];
  const differences=fields.filter(k=>g.rows.some(r=>(['stock_minimo','precio','codigo_barras'].includes(k)?r[k]:same(r[k]))!==( ['stock_minimo','precio','codigo_barras'].includes(k)?f[k]:same(f[k]))));
  if(differences.length){const msg='Código '+code+', filas '+g.rows.map(r=>r.row).join(', ')+': campos diferentes: '+differences.join(', ');g.rows.forEach(r=>r.errors.push(msg));}
  for(const r of g.rows){
   const identity=r.lote?key(r.lote):JSON.stringify([null,r.vencimiento,r.costo]);
   const prev=g.lots.get(identity);
   if(prev&&(prev.costo!==r.costo||prev.vencimiento!==r.vencimiento)){const msg='Código '+code+', filas '+prev.row+' y '+r.row+': mismo lote con costo/vencimiento incompatible';prev.errors.push(msg);r.errors.push(msg);}
   else if(prev)prev.stock=Number((prev.stock+r.stock).toFixed(3));
   else g.lots.set(identity,{...r,errors:r.errors});
  }
  for(const lot of g.lots.values())if(lot.stock>99999999999.999)g.rows.forEach(r=>r.errors.push('Código '+code+': stock acumulado del lote fuera de rango.'));
  for(const [mapName,k]of [[names,same(f.nombre)],[bars,f.codigo_barras]]){
   if(!k)continue;const prior=mapName.get(k);
   if(prior&&prior!==code){const msg='Duplicado '+(mapName===names?'nombre':'código de barras')+' entre códigos '+prior+' y '+code;g.rows.forEach(r=>r.errors.push(msg));groups.get(prior).rows.forEach(r=>r.errors.push(msg));}
   else mapName.set(k,code);
  }
 }
 return{rows,groups,sha256:createHash('sha256').update(buffer).digest('hex')};
}
const masterFields=['nombre','unidad_medida','codigo_barras','principio_activo','concentracion','presentacion','categoria','laboratorio'];
export async function validateInitialDatabase(db,user,branch,parsed){
 const records=(await db.query('select p.*,c.nombre categoria,l.nombre laboratorio from productos p left join categorias c on c.id=p.categoria_id left join laboratorios l on l.id=p.laboratorio_id where p.empresa_id=$1',[user.empresa_id])).rows;
 const codes=new Map(records.map(p=>[p.codigo_interno,p])),names=new Map(records.map(p=>[same(p.nombre),p])),bars=new Map(records.filter(p=>p.codigo_barras).map(p=>[p.codigo_barras,p]));
 const used=new Set((await db.query('select distinct p.id from productos p where p.empresa_id=$1 and (exists(select 1 from lotes l where l.producto_id=p.id and l.sucursal_id=$2) or exists(select 1 from movimientos_inventario m where m.producto_id=p.id and m.sucursal_id=$2))',[user.empresa_id,branch])).rows.map(p=>p.id));
 const prices=new Map((await db.query('select pp.producto_id,pp.precio_venta from precios_producto pp join productos p on p.id=pp.producto_id where p.empresa_id=$1 and pp.sucursal_id=$2 and pp.vigente_hasta is null and pp.factor_unidades=1',[user.empresa_id,branch])).rows.map(p=>[p.producto_id,Number(p.precio_venta)]));
 for(const [code,g]of parsed.groups){
  const f=g.first,p=codes.get(code);g.existing=p||null;g.hasPrice=p&&prices.has(p.id);const errors=[];
  if(p){
   if(used.has(p.id))errors.push('Ya tiene lotes o movimientos en esta sucursal: no es un saldo inicial.');
   const dif=masterFields.filter(k=>k==='codigo_barras'?clean(p[k])!==clean(f[k]):same(p[k])!==same(f[k]));
   if(dif.length)errors.push('Datos maestros existentes diferentes: '+dif.join(', '));
   if(g.hasPrice&&prices.get(p.id)!==f.precio)errors.push('Precio existente diferente; no se sobrescribe.');
  }
  for(const [index,k,label]of [[names,same(f.nombre),'nombre'],[bars,f.codigo_barras,'código de barras']]){
   const other=k&&index.get(k);if(other&&other.id!==p?.id)errors.push('Duplicado de '+label+' con código existente '+other.codigo_interno);
  }
  for(const r of g.rows){r.action=p?'VINCULAR EXISTENTE':'NUEVO';r.errors.push(...errors.map(e=>'Código '+code+', fila '+r.row+': '+e));}
 }
 return parsed;
}
export function initialSummary(parsed){
 let units=0n,value=0n;for(const r of parsed.rows){if(Number.isFinite(r.stock))units+=BigInt(Math.round(r.stock*1000));if(Number.isFinite(r.stock)&&Number.isFinite(r.costo))value+=BigInt(Math.round(r.stock*1000))*BigInt(Math.round(r.costo*10000));}
 const cents=(value+50000n)/100000n;if(cents>BigInt(Number.MAX_SAFE_INTEGER))fail('Valor total del archivo fuera de rango seguro. Divida la importación.');
 return{filas:parsed.rows.length,productos:parsed.groups.size,nuevos:[...parsed.groups.values()].filter(g=>!g.existing).length,actualizar:[...parsed.groups.values()].filter(g=>g.existing).length,
 errores:parsed.rows.filter(r=>r.errors.length).length,lotes:[...parsed.groups.values()].reduce((n,g)=>n+g.lots.size,0),
 stock_total:Number(units)/1000,valor_total:Number(cents)/100,
 errors:parsed.rows.filter(r=>r.errors.length).map(r=>({row:r.row,codigo:r.codigo_interno,errors:r.errors})),sha256:parsed.sha256};
}
export async function applyInitialInventory(db,user,branch,parsed,{catalog,audit}){
 // All validation and writes run inside caller's tenant-aware transaction.
 await db.query('select pg_advisory_xact_lock(hashtext($1::text),91001)',[user.empresa_id]);
 await db.query('select ps.producto_id from producto_sucursal ps join productos p on p.id=ps.producto_id where p.empresa_id=$1 and ps.sucursal_id=$2 order by ps.producto_id for update of ps',[user.empresa_id,branch]);
 await validateInitialDatabase(db,user,branch,parsed);
 const summary=initialSummary(parsed);if(summary.errores)fail('Importación cancelada: '+summary.errors.slice(0,5).map(e=>e.errors.join('; ')).join(' | '));
 const batch=randomUUID();let created=0,existing=0,lots=0;
 for(const [code,g]of parsed.groups){
  const f=g.first;let p=g.existing;
  if(!p){
   const category=await catalog(db,'categorias',user.empresa_id,f.categoria),lab=await catalog(db,'laboratorios',user.empresa_id,f.laboratorio);
   p=(await db.query('insert into productos(empresa_id,codigo_interno,codigo_barras,nombre,principio_activo,concentracion,presentacion,unidad_medida,categoria_id,laboratorio_id,stock_minimo,stock_maximo,requiere_lote) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,0,$12) returning id',[user.empresa_id,code,f.codigo_barras||null,f.nombre,f.principio_activo||null,f.concentracion||null,f.presentacion||null,f.unidad_medida,category,lab,f.stock_minimo,[...g.lots.values()].some(r=>r.lote||r.vencimiento)])).rows[0];created++;
  }else existing++;
  await linkProduct(db,p.id,branch,{stock_minimo:f.stock_minimo});
  if(!g.hasPrice)await db.query("insert into precios_producto(producto_id,sucursal_id,tipo,factor_unidades,precio_venta) values($1,$2,'unidad',1,$3)",[p.id,branch,f.precio]);
  for(const r of g.lots.values()){
   const lot=(await db.query('insert into lotes(producto_id,sucursal_id,numero_lote,fecha_vencimiento,costo_unitario,cantidad_inicial,cantidad_disponible,valor_base_costos) values($1,$2,$3,$4,$5,$6,$6,$6::numeric*$5::numeric) returning id',[p.id,branch,r.lote||null,r.vencimiento,r.costo,r.stock])).rows[0];
   await db.query("insert into movimientos_inventario(empresa_id,sucursal_id,producto_id,lote_id,tipo,cantidad,costo_unitario,referencia_tipo,referencia_id,usuario_id) values($1,$2,$3,$4,'INVENTARIO_INICIAL',$5,$6,'INVENTARIO_INICIAL',$7,$8)",[user.empresa_id,branch,p.id,lot.id,r.stock,r.costo,batch,user.sub]);lots++;
  }
 }
 await audit(db,user,'IMPORTAR_INVENTARIO_INICIAL','productos',null,{batch_id:batch,sucursal_id:branch,archivo_sha256:parsed.sha256,filas:summary.filas,creados:created,existentes:existing,lotes:lots,stock:summary.stock_total,valor:summary.valor_total});
 return{...summary,creados:created,actualizados:existing,lotes_creados:lots,filas_procesadas:summary.filas,filas_rechazadas:0,batch_id:batch,modo:'INVENTARIO_INICIAL'};
}
export function registerInitialInventory(app,{pool,tx,auth,branchAccess,catalog,audit}){
 const permission=async(db,user,branch)=>{const access=await branchAccess(db,user,branch);if(!['Administrador','Almacén'].includes(access.rol)){const e=new Error('Solo Administrador o Almacén de esta sucursal puede importar.');e.status=403;throw e;}};
 app.get('/api/import/inventory/template',auth,async(req,res)=>{try{
  await permission(pool,req.user,req.query.sucursal_id);
  res.setHeader('Content-Type','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');res.setHeader('Content-Disposition','attachment; filename="Plantilla_Inventario_Inicial_EDUXFAC.xlsx"');res.send(await initialTemplate());
 }catch(e){res.status(e.status||400).json({error:e.message});}});
 app.post('/api/import/inventory/preview',auth,async(req,res)=>{try{
  const {sucursal_id,file_base64}=req.body||{};await permission(pool,req.user,sucursal_id);
  const parsed=await parseInitialWorkbook(file_base64);await validateInitialDatabase(pool,req.user,sucursal_id,parsed);
  res.json({...initialSummary(parsed),total:parsed.rows.length,rows:parsed.rows.slice(0,100),warnings:parsed.rows.filter(r=>r.warnings.length).map(r=>({row:r.row,warnings:r.warnings}))});
 }catch(e){res.status(e.status||400).json({error:e.message});}});
 app.post('/api/import/inventory/commit',auth,async(req,res)=>{try{
  const {sucursal_id,file_base64,preview_sha256}=req.body||{};
  await permission(pool,req.user,sucursal_id);
  const parsed=await parseInitialWorkbook(file_base64);
  if(preview_sha256!==parsed.sha256)fail('Genere una vista previa del archivo actual antes de confirmar.');
  const result=await tx(async db=>{await permission(db,req.user,sucursal_id);return applyInitialInventory(db,req.user,sucursal_id,parsed,{catalog,audit});});
  res.status(201).json(result);
 }catch(e){res.status(e.status||400).json({error:e.message});}});
}
