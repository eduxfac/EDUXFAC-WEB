import {createHash,createHmac,randomBytes} from 'node:crypto';

export async function lookupPerudevs(document,tenant,{environment=process.env,fetchImpl=globalThis.fetch}={}){
 const base=environment.PANEL_API_BASE_URL,secret=environment.PANEL_WEB_SERVICE_SECRET;
 if(!base||!secret||secret.length<32)throw Object.assign(Error('La consulta DNI/RUC no está disponible. Revisa la integración con el Panel administrador.'),{status:503,code:'PERUDEVS_PANEL_UNAVAILABLE'});
 let root;try{root=new URL(base);}catch{throw Object.assign(Error('La dirección del Panel no está configurada.'),{status:503,code:'PERUDEVS_PANEL_UNAVAILABLE'});}
 if(root.username||root.password||root.search||root.hash||!(root.protocol==='https:'||(root.protocol==='http:'&&['127.0.0.1','localhost','[::1]'].includes(root.hostname))))throw Object.assign(Error('La integración con el Panel requiere HTTPS; HTTP solo está permitido en localhost.'),{status:503,code:'PERUDEVS_PANEL_UNAVAILABLE'});
 const path='/api/internal/perudevs/lookup',scope='perudevs:lookup',timestamp=String(Math.floor(Date.now()/1000)),nonce=randomBytes(24).toString('hex'),body=JSON.stringify({tenant_id:tenant,document});
 const canonical=['POST',path,scope,timestamp,nonce,createHash('sha256').update(body).digest('hex')].join('\n'),signature=createHmac('sha256',secret).update(canonical).digest('hex'),url=new URL(path,root);
 let response;
 try{response=await fetchImpl(url,{method:'POST',headers:{Origin:root.origin,'Content-Type':'application/json','X-EDUXFAC-Scope':scope,'X-EDUXFAC-Time':timestamp,'X-EDUXFAC-Nonce':nonce,'X-EDUXFAC-Signature':signature},body,redirect:'error',signal:AbortSignal.timeout(11000)});}
 catch{throw Object.assign(Error('No se pudo conectar con el servicio de consultas del Panel.'),{status:503,code:'PERUDEVS_PANEL_UNAVAILABLE'});}
 let data;try{data=await response.json();}catch{throw Object.assign(Error('El servicio de consultas del Panel devolvió una respuesta inválida.'),{status:502,code:'PERUDEVS_PANEL_ERROR'});}
 if(!response.ok)throw Object.assign(Error(data.error||'No se pudo consultar DNI/RUC.'),{status:response.status,code:data.code||'PERUDEVS_ERROR'});
 return data;
}
