import {createHmac,createHash,randomBytes} from 'node:crypto';
export async function cpeRequest(service,tenant,path,body,{environment=process.env,fetchImpl=fetch}={}){
 if(!/^[a-f0-9-]{36}$/.test(tenant))throw Object.assign(Error('Tenant inválido.'),{status:400});
 const secret=environment[service==='panel'?'CPE_PANEL_SECRET':'CPE_WEB_SECRET'],base=environment.CPE_API_URL;
 if(!base||!secret||secret.length<32)throw Object.assign(Error('API Greenter sin configurar.'),{status:503});
 const url=new URL(base);if(url.username||url.password||url.search||url.hash||url.pathname!=='/'||!(url.protocol==='https:'||url.protocol==='http:'&&['127.0.0.1','localhost','[::1]'].includes(url.hostname)))throw Object.assign(Error('URL Greenter inválida.'),{status:503});
 const method=body===undefined?'GET':'POST',raw=body===undefined?'':JSON.stringify(body),time=String(Math.floor(Date.now()/1000)),nonce=randomBytes(24).toString('hex');
 const signature=createHmac('sha256',secret).update([method,path,tenant,service,time,nonce,createHash('sha256').update(raw).digest('hex')].join('\n')).digest('hex');
 let response;try{response=await fetchImpl(new URL(path,url),{method,headers:{'Content-Type':'application/json','X-Cpe-Service':service,'X-Cpe-Tenant':tenant,'X-Cpe-Time':time,'X-Cpe-Nonce':nonce,'X-Cpe-Signature':signature},...(raw?{body:raw}:{}),redirect:'error',signal:AbortSignal.timeout(90000)});}catch{throw Object.assign(Error('Greenter sin confirmación. Consulta el monitor antes de reintentar.'),{status:503});}
 const data=await response.json();if(!response.ok)throw Object.assign(Error(data.error||'Error Greenter.'),{status:response.status,code:data.code});return data;
}
