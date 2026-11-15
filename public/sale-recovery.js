/* Browser-only durable checkout. No tokens, certificates or customer names are persisted. */
(()=>{
 globalThis.createWebSaleRecovery=({storage,scope,send,uuid,onChange=()=>{},locks=globalThis.navigator?.locks})=>{
  let processing=false;const prefix='eduxfac.web.sale.v1:';
  const key=()=>{const s=scope();if(!s||!s.empresa||!s.usuario||!s.sucursal)throw Error('Seleccione una sesión y sucursal válidas.');return prefix+[s.empresa,s.usuario,s.sucursal].join(':')};
  function read(k=key()){const raw=storage.getItem(k);if(!raw)return null;let v;try{v=JSON.parse(raw)}catch{throw Error('El intento guardado requiere revisión; no se creará otra venta.');}if(v.version!==1||!v.payload||!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(String(v.command_id))||v.scope!==k||!k.endsWith(':'+String(v.payload.sucursal_id))||!Array.isArray(v.payload.items)||JSON.stringify(v.payload)!==v.fingerprint)throw Error('Intento guardado incompatible: requiere revisión manual.');return v;}
  const exclusive=fn=>{if(!locks?.request)throw Error('Se requiere un navegador con bloqueo seguro Web Locks para proteger los reintentos.');return locks.request(key(),{mode:'exclusive'},fn);};
  async function execute(intent,k){processing=true;onChange();try{
   const sale=await send({...intent.payload,command_id:intent.command_id});
   if(!sale?.id)throw Error('Respuesta de venta incompleta. Verifique el intento original.');
   const saved=read(k);if(saved?.command_id!==intent.command_id)throw Error('Cambió el intento guardado; requiere verificación.');
   storage.removeItem(k);if(storage.getItem(k))throw Error('Venta confirmada; no pudo liberarse el intento local. Reintente para verificar la misma venta.');return sale;
  }catch(e){if([400,422].includes(e.status)||e.code==='CASH_REQUIRED'){const saved=read(k);if(saved?.command_id===intent.command_id)storage.removeItem(k);}throw e;}finally{processing=false;onChange();}}
  return{read,isProcessing:()=>processing,
   submit:payload=>exclusive(async()=>{const k=key();if(read(k))throw Error('Hay una venta pendiente de verificar. Use Reintentar venta original.');const fingerprint=JSON.stringify(payload),intent={version:1,scope:k,command_id:uuid(),payload:JSON.parse(fingerprint),fingerprint,created_at:new Date().toISOString()};storage.setItem(k,JSON.stringify(intent));if(read(k)?.command_id!==intent.command_id)throw Error('No se pudo proteger el intento. No se envió la venta.');return execute(intent,k);}),
   retry:()=>exclusive(async()=>{const k=key(),intent=read(k);if(!intent)throw Error('No hay venta pendiente en esta sesión/sucursal.');return execute(intent,k);})};
 };
})();
