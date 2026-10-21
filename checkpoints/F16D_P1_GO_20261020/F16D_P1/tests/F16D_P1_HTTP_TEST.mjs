import jwt from 'jsonwebtoken';
import {createHash, randomBytes, randomUUID} from 'node:crypto';
import {writeFile} from 'node:fs/promises';

const base=process.env.F16D_P1_BASE_URL;
const secret=process.env.PANEL_WEB_SERVICE_SECRET;
const issuer=process.env.PANEL_WEB_SERVICE_ISSUER;
const audience=process.env.PANEL_WEB_SERVICE_AUDIENCE;
const evidenceFile=process.env.F16D_P1_HTTP_EVIDENCE;
const runId=process.env.F16D_RUN_ID;
const port=Number(process.env.F16D_P1_PORT);
if(!base||!secret||!issuer||!audience||!evidenceFile||!/^[0-9]{8}T[0-9]{6}Z-[0-9]+-[a-f0-9]{8}$/.test(runId||'')||!Number.isInteger(port))throw Error('F16D_P1_TEST_CONFIGURATION_REQUIRED');

const scopes=[
 'health:read','clientes:crear','empresas:crear','empresas:plan',
 'empresas:sucursal-principal','empresas:administrador-inicial',
 'empresas:suscripcion','empresas:activar','empresas:operacion','empresas:read'
];
const token=jwt.sign({type:'panel_service',scopes},secret,{algorithm:'HS256',issuer,audience,subject:'panel-eduxfac',jwtid:randomUUID(),expiresIn:'4m'});
const wrongIssuerToken=jwt.sign({type:'panel_service',scopes},secret,{algorithm:'HS256',issuer:'f16dp1-wrong-issuer',audience,subject:'panel-eduxfac',jwtid:randomUUID(),expiresIn:'4m'});
const wrongAudienceToken=jwt.sign({type:'panel_service',scopes},secret,{algorithm:'HS256',issuer,audience:'f16dp1-wrong-audience',subject:'panel-eduxfac',jwtid:randomUUID(),expiresIn:'4m'});
const insufficientToken=jwt.sign({type:'panel_service',scopes:['health:read']},secret,{algorithm:'HS256',issuer,audience,subject:'panel-eduxfac',jwtid:randomUUID(),expiresIn:'4m'});
const results=[];
const record=(name,status,ok,extra={})=>{results.push({name,status,ok,...extra});console.log(`${name}=${ok?'PASS':'FAIL'} HTTP_${status}`);};
const assert=(condition,message)=>{if(!condition)throw Error(message);};

async function request(path,{method='GET',body,authorization=token}={}){
 const headers={Accept:'application/json'};
 if(authorization)headers.Authorization=`Bearer ${authorization}`;
 if(body!==undefined)headers['Content-Type']='application/json';
 const response=await fetch(base+path,{method,headers,body:body===undefined?undefined:JSON.stringify(body)});
 const text=await response.text();let data=null;
 try{data=text?JSON.parse(text):null;}catch{data={raw:text.slice(0,300)};}
 return {status:response.status,data};
}
async function expect(name,path,options,status,predicate=()=>true){
 const response=await request(path,options);const ok=response.status===status&&predicate(response.data);
 record(name,response.status,ok);assert(ok,`${name}_FAILED`);return response.data;
}

const digest=createHash('sha256').update(runId).digest('hex');
const suffix=String(BigInt(`0x${digest.slice(0,16)}`)%100000000n).padStart(8,'0');
const ruc=`209${suffix}`;
assert(ruc!=='20606624043'&&/^\d{11}$/.test(ruc),'FICTITIOUS_RUC_INVALID');
const companyCode=`F16P1${suffix}`;
const username=`f16p1_${suffix}`;
const temporaryPassword=`Tmp!${randomBytes(12).toString('hex')}`;
const reason='Ensayo ficticio F16D-P1 exclusivamente sobre clon.';
const administrador='f16dp1_test';
const cmd=()=>randomUUID();

try{
 await expect('JWT_REQUIRED','/api/internal/admin/v1/health',{authorization:null},401,d=>d?.code==='SERVICIO_NO_AUTORIZADO');
 await expect('JWT_ISSUER','/api/internal/admin/v1/health',{authorization:wrongIssuerToken},401,d=>d?.code==='SERVICIO_NO_AUTORIZADO');
 await expect('JWT_AUDIENCE','/api/internal/admin/v1/health',{authorization:wrongAudienceToken},401,d=>d?.code==='SERVICIO_NO_AUTORIZADO');
 await expect('JWT_VALID','/api/internal/admin/v1/health',{},200,d=>d?.ok===true&&d?.service==='eduxfac-web-admin');
 await expect('JWT_SCOPE','/api/internal/admin/v1/clientes',{method:'POST',authorization:insufficientToken,body:{}},403,d=>d?.code==='SERVICIO_SIN_PERMISO');

 const clientCommand=cmd();
 const clientBody={command_id:clientCommand,motivo:reason,administrador,cliente_panel_id:randomUUID(),nombre:'F16D-P1 CLIENTE FICTICIO HTTP',tipo_documento:'RUC',numero_documento:ruc,telefono:null,correo:null,estado:'ACTIVO'};
 const client=await expect('POST_CLIENTE','/api/internal/admin/v1/clientes',{method:'POST',body:clientBody},200,d=>d?.cliente_id&&d?.replayed===false);
 await expect('IDEMPOTENCIA_REPLAY_CLIENTE','/api/internal/admin/v1/clientes',{method:'POST',body:clientBody},200,d=>d?.cliente_id===client.cliente_id&&d?.replayed===true);
 await expect('IDEMPOTENCIA_REUSE_REJECTED','/api/internal/admin/v1/clientes',{method:'POST',body:{...clientBody,nombre:'CONTENIDO DIFERENTE'}},409,d=>d?.code==='COMANDO_REUTILIZADO');

 const company=await expect('POST_EMPRESA','/api/internal/admin/v1/empresas',{method:'POST',body:{command_id:cmd(),motivo:reason,administrador,cliente_id:client.cliente_id,razon_social:'F16D-P1 EMPRESA FICTICIA HTTP S.A.C.',nombre_comercial:'F16D-P1 SOLO CLON',ruc,empresa_codigo:companyCode}},200,d=>d?.empresa_id&&d?.estado==='PENDIENTE');
 const empresaId=company.empresa_id;
 await expect('PUT_PLAN',`/api/internal/admin/v1/empresas/${empresaId}/plan`,{method:'PUT',body:{command_id:cmd(),motivo:reason,administrador,plan_codigo:'EMPRESA',limite_sucursales:null,limite_usuarios:25,multisucursal:true,version_condiciones:'1'}},200,d=>d?.plan_codigo==='EMPRESA'&&d?.version_condiciones==='1');
 const branch=await expect('POST_SUCURSAL_PRINCIPAL',`/api/internal/admin/v1/empresas/${empresaId}/sucursal-principal`,{method:'POST',body:{command_id:cmd(),motivo:reason,administrador,nombre:'PRINCIPAL FICTICIA'}},200,d=>d?.sucursal_id);
 await expect('POST_ADMIN_INICIAL',`/api/internal/admin/v1/empresas/${empresaId}/administrador-inicial`,{method:'POST',body:{command_id:cmd(),motivo:reason,administrador,nombre:'ADMINISTRADOR FICTICIO',usuario:username,password_temporal:temporaryPassword,sucursal_id:branch.sucursal_id}},200,d=>d?.usuario_id&&d?.debe_cambiar_password===true);
 const subscriptionId=randomUUID();
 await expect('PUT_SUSCRIPCION',`/api/internal/admin/v1/empresas/${empresaId}/suscripcion`,{method:'PUT',body:{command_id:cmd(),motivo:reason,administrador,suscripcion_id:subscriptionId,version_esperada:'0',version_condiciones:'1',fecha_inicio:new Date().toISOString()}},200,d=>d?.suscripcion_id===subscriptionId&&d?.estado==='PENDIENTE');
 const activationCommand=cmd();
 const activationBody={command_id:activationCommand,motivo:reason,administrador};
 await expect('POST_ACTIVAR',`/api/internal/admin/v1/empresas/${empresaId}/activar`,{method:'POST',body:activationBody},200,d=>d?.estado==='ACTIVO'&&d?.replayed===false);
 await expect('IDEMPOTENCIA_REPLAY_ACTIVAR',`/api/internal/admin/v1/empresas/${empresaId}/activar`,{method:'POST',body:activationBody},200,d=>d?.estado==='ACTIVO'&&d?.replayed===true);
 await expect('GET_OPERACION',`/api/internal/admin/v1/empresas/${empresaId}/operacion?command_id=${activationCommand}`,{},200,d=>d?.empresa_id===empresaId&&d?.estado_empresa==='ACTIVO'&&d?.condiciones?.plan_codigo==='EMPRESA'&&d?.suscripcion?.estado==='ACTIVA'&&d?.comando_aplicado?.command_id===activationCommand);

 const login=await expect('REGRESSION_LOGIN','/api/auth/login',{method:'POST',authorization:null,body:{usuario:username,password:temporaryPassword,ruc}},200,d=>d?.token&&d?.user?.empresa_id===empresaId);
 const userAuthorization=login.token;
 await expect('REGRESSION_BOOTSTRAP','/api/bootstrap',{authorization:userAuthorization},200,d=>Array.isArray(d?.branches)&&d.branches.some(x=>x.id===branch.sucursal_id));
 await expect('REGRESSION_PRODUCTOS',`/api/products?sucursal_id=${branch.sucursal_id}&q=`,{authorization:userAuthorization},200,d=>Array.isArray(d));
 await expect('REGRESSION_CLIENTES','/api/admin/clients?q=',{authorization:userAuthorization},200,d=>Array.isArray(d));
 await expect('REGRESSION_VENTAS',`/api/sales/today?sucursal_id=${branch.sucursal_id}`,{authorization:userAuthorization},200,d=>Array.isArray(d?.rows));
 const date=new Date().toISOString().slice(0,10);
 await expect('REGRESSION_COMPRAS',`/api/purchases/history?sucursal_id=${branch.sucursal_id}&from=${date}&to=${date}`,{authorization:userAuthorization},200,d=>Array.isArray(d?.rows));
 await expect('REGRESSION_INVENTARIO',`/api/inventory/summary?sucursal_id=${branch.sucursal_id}`,{authorization:userAuthorization},200,d=>d!==null&&typeof d==='object');
 await expect('REGRESSION_REPORTES',`/api/reports/summary?sucursal_id=${branch.sucursal_id}`,{authorization:userAuthorization},200,d=>d!==null&&typeof d==='object');
 await expect('REGRESSION_USUARIOS','/api/admin/users',{authorization:userAuthorization},200,d=>Array.isArray(d));
 await expect('REGRESSION_SUCURSALES','/api/admin/branches',{authorization:userAuthorization},200,d=>Array.isArray(d)&&d.some(x=>x.id===branch.sucursal_id));

 const evidence={run_id:runId,timestamp_utc:new Date().toISOString(),port,database:'eduxfac_f16dp1_clone',fictitious:true,ruc,empresa_id:empresaId,cliente_id:client.cliente_id,sucursal_id:branch.sucursal_id,http_jwt:'PASS',onboarding:'PASS',idempotency:'PASS',regression:'PASS',results};
 await writeFile(evidenceFile,JSON.stringify(evidence,null,2)+'\n',{mode:0o600});
 console.log('F16D_P1_HTTP_JWT=PASS');
 console.log('F16D_P1_ONBOARDING=PASS');
 console.log('F16D_P1_IDEMPOTENCY=PASS');
 console.log('F16D_P1_REGRESSION=PASS');
}catch(error){
 const evidence={run_id:runId,timestamp_utc:new Date().toISOString(),port,database:'eduxfac_f16dp1_clone',fictitious:true,http_jwt:'FAIL',onboarding:'FAIL',idempotency:'FAIL',regression:'FAIL',error:String(error?.message||error),results};
 await writeFile(evidenceFile,JSON.stringify(evidence,null,2)+'\n',{mode:0o600}).catch(()=>{});
 console.error(`F16D_P1_HTTP_TEST_ERROR=${String(error?.message||error).replace(/[^A-Za-z0-9_.-]/g,'_')}`);
 process.exitCode=1;
}
