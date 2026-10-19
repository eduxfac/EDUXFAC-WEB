import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {createSubscriptionFixture} from './helpers/subscription-fixture.js';
import {webIndexHTML} from '../server/src/csp-header.js';

const lines=webIndexHTML.split('\n');
const line=prefix=>{const found=lines.find(x=>x.startsWith(prefix));assert.ok(found,'Falta código real: '+prefix);return found;};
test('Login PILOTO: todos los scripts inline del HTML compilan',()=>{
 let count=0;
 for(const match of webIndexHTML.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)){
  if(!match[1].trim())continue;
  new vm.Script(match[1],{filename:'index-inline-'+(++count)+'.js'});
 }
 assert.equal(count,5);
});

function ui(f){
 const elements=new Map(),stored=new Map(),requests=[];
 let overlay,bootstraps=0,reloads=0;
 const element=()=>{const classes=new Set();return {value:'',textContent:'',classList:{add:c=>classes.add(c),remove:c=>classes.delete(c),contains:c=>classes.has(c)},focus(){}};};
 for(const id of ['loginRuc','loginUser','loginPass','loginForm','loginStatus','logout','currentUser','topUser','login','app'])elements.set(id,element());
 elements.get('app').classList.add('hidden');
 function createElement(){
  const inputs=['password_temporal','password_nuevo','confirm'].map(()=>element());
  const error=element(),submit={disabled:false},cancel={};
  const form={elements:Object.fromEntries(['password_temporal','password_nuevo','confirm'].map((k,i)=>[k,inputs[i]])),
   querySelectorAll:()=>inputs,querySelector:s=>s==='[type="submit"]'?submit:cancel};
  return {style:{},form,inputs,error,removed:false,
   querySelector:s=>s==='form'?form:error,remove(){this.removed=true;}};
 }
 const context=vm.createContext({window:{},document:{getElementById:id=>elements.get(id),createElement,body:{append:x=>overlay=x}},
  localStorage:{setItem:(k,v)=>stored.set(k,v),removeItem:k=>stored.delete(k)},location:{reload:()=>reloads++},
  state:{token:null,user:null},$:id=>elements.get(id),setTimeout,
  fetch:async(route,opts={})=>{
   const body=opts.body?JSON.parse(opts.body):undefined,token=opts.headers?.Authorization?.replace(/^Bearer /,'');
   const result=await f.request(route,{method:opts.method||'GET',body,token});
   // Retain only non-secret request metadata.
   requests.push({route,status:result.status,ruc:body?.ruc,usuario:body?.usuario});
   return {ok:result.status>=200&&result.status<300,status:result.status,json:async()=>result.data};
  },
  bootstrap:async()=>{bootstraps++;const r=await f.request('/api/bootstrap',{token:context.state.token});assert.equal(r.status,200);},
 });
 vm.runInContext(readFileSync(new URL('../public/initial-password.js',import.meta.url),'utf8'),context);
 vm.runInContext([line('async function api('),line('async function login('),line("$('loginForm').onsubmit=")].join('\n'),context);
 return {context,elements,stored,requests,get overlay(){return overlay;},get bootstraps(){return bootstraps;},get reloads(){return reloads;}};
}

test('Login PILOTO: alta Panel → ACTIVA → RUC/temporal → cambio obligatorio → acceso normal',async t=>{
 const x=await createSubscriptionFixture();
 t.after(async()=>{x.m.db.close();await x.f.close();});
 const company=await x.create('BASICO',{name:'Botica ficticia prueba de login'});
 const access=await x.f.panel.estado(company.web);
 assert.equal(access.estado,'ACTIVO');
 const row=(await x.f.query('SELECT ruc FROM empresas WHERE id=$1',[company.web])).rows[0];
 const browser=ui(x.f),el=id=>browser.elements.get(id);
 el('loginRuc').value=row.ruc;el('loginUser').value='admin_f5';el('loginPass').value='FAKE_F5_TEMP_PASSWORD_123';
 let prevented=false;
 const pending=el('loginForm').onsubmit({preventDefault(){prevented=true;}});
 await t.test('formulario envía RUC y abre cambio sin guardar JWT restringido',async()=>{
  for(let i=0;i<500&&!browser.overlay;i++)await new Promise(resolve=>setTimeout(resolve,10));
  assert.equal(prevented,true);assert.ok(browser.overlay,'No apareció el cambio obligatorio');
  assert.equal(browser.requests[0].ruc,row.ruc);assert.equal(browser.requests[0].usuario,'admin_f5');
  assert.equal(browser.requests[0].status,200);assert.equal(browser.stored.has('bw_token'),false);
  assert.equal(browser.context.state.token,null);assert.equal(browser.bootstraps,0);
 });
 await t.test('cambio de contraseña crea sesión normal y oculta login',async()=>{
  const form=browser.overlay.form;
  form.elements.password_temporal.value='FAKE_F5_TEMP_PASSWORD_123';
  form.elements.password_nuevo.value='FAKE_FRESH_PASSWORD_LOGIN_456';
  form.elements.confirm.value='FAKE_FRESH_PASSWORD_LOGIN_456';
  await form.onsubmit({preventDefault(){}});await pending;
  assert.equal(browser.overlay.error.textContent,'');assert.equal(browser.overlay.removed,true);
  assert.ok(browser.overlay.inputs.every(x=>x.value===''));assert.equal(el('loginPass').value,'');
  assert.equal(browser.bootstraps,1);assert.equal(browser.reloads,0);
  assert.equal(el('login').classList.contains('hidden'),true);assert.equal(el('app').classList.contains('hidden'),false);
  assert.equal(browser.stored.get('bw_token'),browser.context.state.token);
  assert.equal((await x.f.query('SELECT debe_cambiar_password FROM usuarios WHERE empresa_id=$1',[company.web])).rows[0].debe_cambiar_password,false);
  assert.equal((await x.f.request('/api/auth/login',{method:'POST',body:{ruc:row.ruc,usuario:'admin_f5',password:'FAKE_F5_TEMP_PASSWORD_123'}})).status,401);
 });
 await t.test('nuevo login con contraseña propia accede sin repetir cambio',async()=>{
  const again=ui(x.f);again.elements.get('loginRuc').value=row.ruc;again.elements.get('loginUser').value='admin_f5';
  again.elements.get('loginPass').value='FAKE_FRESH_PASSWORD_LOGIN_456';
  await again.elements.get('loginForm').onsubmit({preventDefault(){}});
  assert.equal(again.overlay,undefined);assert.equal(again.bootstraps,1);
  assert.equal(again.elements.get('loginStatus').textContent,'');
 });
 await t.test('error 401 se muestra sin recargar ni conservar token',async()=>{
  const bad=ui(x.f);bad.elements.get('loginRuc').value=row.ruc;bad.elements.get('loginUser').value='admin_f5';
  bad.elements.get('loginPass').value='FAKE_WRONG_PASSWORD';
  await bad.elements.get('loginForm').onsubmit({preventDefault(){}});
  assert.equal(bad.requests[0].status,401);assert.ok(bad.elements.get('loginStatus').textContent);
  assert.equal(bad.reloads,0);assert.equal(bad.stored.size,0);assert.equal(bad.bootstraps,0);
 });
});
