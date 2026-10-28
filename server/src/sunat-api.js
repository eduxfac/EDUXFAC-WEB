import {pool,tx} from './db.js';
import {cpeRequest} from './cpe-client.js';
const validId=v=>{if(!/^[a-f0-9-]{36}$/.test(String(v)))throw Object.assign(Error('Identificador inválido.'),{status:400});return v;};
const taxCode=v=>{const s=String(v||'10').trim().toUpperCase();if(/^(10|20|30)(?:\D|$)/.test(s))return s.slice(0,2);if(s.includes('EXONERAD'))return '20';if(s.includes('INAFECT'))return '30';if(s.includes('GRAVAD'))return '10';throw Object.assign(Error('Afectación tributaria no soportada: '+s),{status:400});};
export async function enqueueSaleCpe(db,tenant,saleId){
 if(!process.env.CPE_API_URL||(process.env.NODE_ENV==='test'&&process.env.CPE_TEST_ALLOW!=='yes'))return;
 const sale=(await db.query(`SELECT v.*,c.tipo_doc,c.nro_doc,c.nombres,c.direccion cliente_direccion FROM ventas v LEFT JOIN clientes c ON c.id=v.cliente_id WHERE v.id=$1 AND v.empresa_id=$2`,[saleId,tenant])).rows[0];
 if(!sale)return;const type={FACTURA:'01',BOLETA:'03','01':'01','03':'03'}[String(sale.tipo_comprobante).toUpperCase()];if(!type)return;
 const settings=(await db.query('SELECT * FROM sunat_sucursales WHERE empresa_id=$1 AND sucursal_id=$2 AND habilitado=true',[tenant,sale.sucursal_id])).rows[0];if(!settings)return;
 const items=(await db.query(`SELECT vd.id,p.codigo_interno,p.nombre,p.tipo_afectacion_igv,vd.cantidad,vd.importe_neto FROM venta_detalles vd JOIN productos p ON p.id=vd.producto_id AND p.empresa_id=$2 WHERE vd.venta_id=$1 ORDER BY vd.id`,[saleId,tenant])).rows;
 const documentType=String(sale.tipo_doc||'').toUpperCase();const clientType={RUC:'6',DNI:'1',CE:'4',PASAPORTE:'7','6':'6','1':'1','4':'4','7':'7'}[documentType]||(!sale.nro_doc?'0':String(sale.nro_doc).length===11?'6':'1');
 if(type==='01'&&(clientType!=='6'||!/^\d{11}$/.test(String(sale.nro_doc||''))))throw Object.assign(Error('Factura electrónica requiere cliente con RUC de 11 dígitos.'),{status:400});
 const payload={branch_id:sale.sucursal_id,environment:settings.ambiente,source_id:sale.id,doc_type:type,serie:type==='01'?settings.serie_factura:settings.serie_boleta,issued_at:new Date(sale.created_at).toISOString(),currency:'PEN',client:{doc_type:clientType,doc_number:sale.nro_doc||'0',name:sale.nombres||'PÚBLICO EN GENERAL',address:sale.cliente_direccion||''},discount_total:'0',total:String(sale.total),items:items.map(i=>({code:i.codigo_interno,description:i.nombre,quantity:String(i.cantidad),gross_total:String(i.importe_neto),tax_code:taxCode(i.tipo_afectacion_igv),unit:'NIU',igv_rate:'18'}))};
 await db.query('INSERT INTO sunat_outbox(empresa_id,sucursal_id,venta_id,payload_json) VALUES($1,$2,$3,$4::jsonb) ON CONFLICT(empresa_id,venta_id) DO NOTHING',[tenant,sale.sucursal_id,saleId,JSON.stringify(payload)]);
}
export async function processCpeJob(tenant,jobId,{send=true}={}){
 try{return await tx(async db=>{
  const acquired=(await db.query('SELECT pg_try_advisory_xact_lock(hashtextextended($1,0)) locked',[tenant+':'+jobId])).rows[0]?.locked;
  if(!acquired)throw Object.assign(Error('Comprobante procesándose.'),{status:409,code:'CPE_BUSY'});
  const job=(await db.query('SELECT * FROM sunat_outbox WHERE id=$1 AND empresa_id=$2',[jobId,tenant])).rows[0];if(!job)throw Object.assign(Error('Envío no encontrado.'),{status:404});
  await db.query("UPDATE sunat_outbox SET intentos=intentos+1,error=NULL,updated_at=now() WHERE id=$1 AND empresa_id=$2",[jobId,tenant]);
  let doc=job.documento_id?await cpeRequest('web',tenant,'/v1/documents/'+job.documento_id):await cpeRequest('web',tenant,'/v1/documents',job.payload_json);
  await db.query('UPDATE sunat_outbox SET documento_id=$3,estado=$4,updated_at=now() WHERE id=$1 AND empresa_id=$2',[jobId,tenant,doc.id,doc.state]);
  await db.query('UPDATE ventas SET serie=$3,numero=$4 WHERE id=$1 AND empresa_id=$2',[job.venta_id,tenant,doc.serie,String(doc.number)]);
  if(!['PREPARADO','FIRMADO','NO_RECIBIDO'].includes(doc.state))return doc;
  doc=await cpeRequest('web',tenant,'/v1/documents/'+doc.id+(send?'/send':'/sign'),{});
  await db.query('UPDATE sunat_outbox SET estado=$3,error=$4,updated_at=now() WHERE id=$1 AND empresa_id=$2',[jobId,tenant,doc.state,doc.description||null]);return doc;
 });}catch(e){if(e.code!=='CPE_BUSY')await pool.query('UPDATE sunat_outbox SET intentos=intentos+1,error=$3,updated_at=now() WHERE id=$1 AND empresa_id=$2',[jobId,tenant,e.status?e.message:'Envío sin confirmación']);throw e;}
}
export async function completeCheckoutCpe(tenant,saleId){
 if(!process.env.CPE_API_URL||(process.env.NODE_ENV==='test'&&process.env.CPE_TEST_ALLOW!=='yes'))return null;
 // The sale has already committed. Fiscal failures must never turn a paid sale into a failed checkout.
 try{const job=(await pool.query('SELECT o.*,c.envio_automatico FROM sunat_outbox o JOIN sunat_sucursales c ON c.sucursal_id=o.sucursal_id AND c.empresa_id=o.empresa_id WHERE o.empresa_id=$1 AND o.venta_id=$2',[tenant,saleId])).rows[0];if(!job)return null;
  if(!job.envio_automatico)return {job_id:job.id,state:job.estado,automatic:false};
  try{return {...await processCpeJob(tenant,job.id),job_id:job.id,automatic:true};}catch(e){return {job_id:job.id,state:'PENDIENTE',automatic:true,error:e.status?e.message:'Emisión sin confirmación; revisa el monitor SUNAT.'};}
 }catch{return {state:'PENDIENTE',error:'Venta registrada; consulta el monitor SUNAT para verificar su emisión.'};}
}
export function registerSunat(app,{requireAuth,ensureBranchAccess,isAdminUser}){
 const handle=fn=>async(req,res)=>{try{await fn(req,res);}catch(e){res.status(e.status||503).json({error:e.status?e.message:'No se pudo completar la operación SUNAT.'});}};
 app.get('/api/sunat/config',requireAuth,handle(async(req,res)=>{const branch=validId(req.query.sucursal_id);await ensureBranchAccess(pool,req.user,branch);const r=(await pool.query('SELECT ambiente,habilitado,serie_factura,serie_boleta,fiscal_json,envio_automatico,series_notas FROM sunat_sucursales WHERE empresa_id=$1 AND sucursal_id=$2',[req.user.empresa_id,branch])).rows[0];res.json(r||{habilitado:false});}));
 app.get('/api/sunat/outbox',requireAuth,handle(async(req,res)=>{const branch=validId(req.query.sucursal_id);await ensureBranchAccess(pool,req.user,branch);res.json({rows:(await pool.query('SELECT id,venta_id,documento_id,estado,intentos,error,created_at FROM sunat_outbox WHERE empresa_id=$1 AND sucursal_id=$2 ORDER BY created_at DESC LIMIT 200',[req.user.empresa_id,branch])).rows});}));
 app.get('/api/sunat/documents',requireAuth,handle(async(req,res)=>{const branch=validId(req.query.sucursal_id);await ensureBranchAccess(pool,req.user,branch);const env=String(req.query.environment||'beta');res.json(await cpeRequest('web',req.user.empresa_id,'/v1/documents?'+new URLSearchParams({branch_id:branch,environment:env})));}));
 app.post('/api/sunat/sales/:id/prepare',requireAuth,handle(async(req,res)=>{
  const sale=(await pool.query('SELECT id,sucursal_id,estado FROM ventas WHERE empresa_id=$1 AND id=$2',[req.user.empresa_id,validId(req.params.id)])).rows[0];if(!sale)throw Object.assign(Error('Venta no encontrada.'),{status:404});await ensureBranchAccess(pool,req.user,sale.sucursal_id);if(sale.estado!=='EMITIDA')throw Object.assign(Error('La venta debe estar emitida y sin devoluciones.'),{status:409});await tx(db=>enqueueSaleCpe(db,req.user.empresa_id,sale.id));const job=(await pool.query('SELECT id FROM sunat_outbox WHERE empresa_id=$1 AND venta_id=$2',[req.user.empresa_id,sale.id])).rows[0];if(!job)throw Object.assign(Error('Configura y habilita SUNAT en PANEL para esta sucursal.'),{status:409});res.json({job_id:job.id});
 }));
 app.post('/api/sunat/outbox/:id/:action',requireAuth,handle(async(req,res)=>{
  if(!['sign','send'].includes(req.params.action))throw Object.assign(Error('Acción inválida.'),{status:400});const job=(await pool.query('SELECT sucursal_id FROM sunat_outbox WHERE id=$1 AND empresa_id=$2',[validId(req.params.id),req.user.empresa_id])).rows[0];if(!job)throw Object.assign(Error('Envío no encontrado.'),{status:404});await ensureBranchAccess(pool,req.user,job.sucursal_id);res.json(await processCpeJob(req.user.empresa_id,req.params.id,{send:req.params.action==='send'}));
 }));
 app.all('/api/sunat/documents/:id/:action',requireAuth,handle(async(req,res)=>{
  const tenant=req.user.empresa_id,doc=await cpeRequest('web',tenant,'/v1/documents/'+validId(req.params.id));await ensureBranchAccess(pool,req.user,doc.branch_id);const action=req.params.action;
  if(req.method==='GET'&&action==='events')return res.json(await cpeRequest('web',tenant,'/v1/documents/'+doc.id+'/events'));
  if(req.method==='POST'&&['sign','send','consult'].includes(action)){const result=await cpeRequest('web',tenant,'/v1/documents/'+doc.id+'/'+action,{});await pool.query('UPDATE sunat_outbox SET estado=$3,error=$4,updated_at=now() WHERE empresa_id=$1 AND documento_id=$2',[tenant,doc.id,result.state,result.description]);return res.json(result);}
  if(req.method==='POST'&&action==='note'){
   if(!(await isAdminUser(pool,req.user.sub)))throw Object.assign(Error('Solo administradores emiten notas.'),{status:403});
   const settings=(await pool.query('SELECT series_notas FROM sunat_sucursales WHERE empresa_id=$1 AND sucursal_id=$2',[tenant,doc.branch_id])).rows[0];const noteSerie=settings?.series_notas?.[String(req.body.doc_type)+doc.serie[0]];if(!noteSerie)throw Object.assign(Error('Configura la serie de esta nota desde PANEL.'),{status:409});if(req.body.serie&&req.body.serie!==noteSerie)throw Object.assign(Error('La serie de notas se selecciona exclusivamente desde PANEL.'),{status:403});
   const result=await cpeRequest('web',tenant,'/v1/notes',{reference_id:doc.id,command_id:validId(req.body.command_id),doc_type:req.body.doc_type,serie:noteSerie,reason_code:req.body.reason_code,reason:req.body.reason,issued_at:req.body.issued_at,amount:req.body.amount});return res.json(result);
  }
  throw Object.assign(Error('Operación inválida.'),{status:400});
 }));
 app.get('/api/sunat/batches',requireAuth,handle(async(req,res)=>{const branch=validId(req.query.sucursal_id);await ensureBranchAccess(pool,req.user,branch);res.json(await cpeRequest('web',req.user.empresa_id,'/v1/batches?'+new URLSearchParams({branch_id:branch,environment:req.query.environment||'beta'})));}));
 app.post('/api/sunat/batches',requireAuth,handle(async(req,res)=>{if(!(await isAdminUser(pool,req.user.sub)))throw Object.assign(Error('Solo administradores preparan resúmenes y bajas.'),{status:403});const branch=validId(req.body.branch_id);await ensureBranchAccess(pool,req.user,branch);if(!Array.isArray(req.body.document_ids))throw Object.assign(Error('Documentos requeridos.'),{status:400});for(const id of req.body.document_ids){const doc=await cpeRequest('web',req.user.empresa_id,'/v1/documents/'+validId(id));if(doc.branch_id!==branch)throw Object.assign(Error('Sucursal diferente.'),{status:403});}res.json(await cpeRequest('web',req.user.empresa_id,'/v1/batches',req.body));}));
 app.all('/api/sunat/batches/:id/:action',requireAuth,handle(async(req,res)=>{const tenant=req.user.empresa_id,batch=await cpeRequest('web',tenant,'/v1/batches/'+validId(req.params.id));await ensureBranchAccess(pool,req.user,batch.branch_id);if(req.method!=='POST'||!['send','consult'].includes(req.params.action)||!(await isAdminUser(pool,req.user.sub)))throw Object.assign(Error('Operación no autorizada.'),{status:403});res.json(await cpeRequest('web',tenant,'/v1/batches/'+batch.id+'/'+req.params.action,{}));}));
 app.get('/api/sunat/batches/:id/files/:kind',requireAuth,handle(async(req,res)=>{const tenant=req.user.empresa_id,batch=await cpeRequest('web',tenant,'/v1/batches/'+validId(req.params.id));await ensureBranchAccess(pool,req.user,batch.branch_id);if(!['xml','zip','cdr'].includes(req.params.kind))throw Object.assign(Error('Archivo inválido.'),{status:400});const file=await cpeRequest('web',tenant,'/v1/batches/'+batch.id+'/files/'+req.params.kind);res.set('Content-Disposition','attachment; filename="'+file.filename.replace(/[^A-Za-z0-9_.-]/g,'')+'"');res.type(req.params.kind==='xml'?'application/xml':'application/zip');res.send(Buffer.from(file.base64,'base64'));}));
 app.get('/api/sunat/documents/:id/files/:kind',requireAuth,handle(async(req,res)=>{const tenant=req.user.empresa_id,doc=await cpeRequest('web',tenant,'/v1/documents/'+validId(req.params.id));await ensureBranchAccess(pool,req.user,doc.branch_id);if(!['xml','zip','cdr','pdf','ticket'].includes(req.params.kind))throw Object.assign(Error('Archivo inválido.'),{status:400});const file=await cpeRequest('web',tenant,'/v1/documents/'+doc.id+'/files/'+req.params.kind);res.set('Content-Disposition','attachment; filename="'+file.filename.replace(/[^A-Za-z0-9_.-]/g,'')+'"');res.type(req.params.kind==='xml'?'application/xml':['pdf','ticket'].includes(req.params.kind)?'application/pdf':'application/zip');res.send(Buffer.from(file.base64,'base64'));}));
}
