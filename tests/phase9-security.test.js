import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {contentSecurityPolicy,webIndexHTML} from '../server/src/csp-header.js';
import {requestLimits} from '../server/src/request-limits.js';
const code=readFileSync(new URL('../public/delegated-events.js',import.meta.url),'utf8');
test('FASE9 CSP autoriza cada script normalizado y no eval/inline JS',()=>{assert.ok(!contentSecurityPolicy.includes("'unsafe-eval'"));assert.ok(!contentSecurityPolicy.split(';')[1].includes("'unsafe-inline'"));for(const m of webIndexHTML.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi))if(m[1].trim())assert.ok(contentSecurityPolicy.includes(createHash('sha256').update(m[1]).digest('base64')));});
test('FASE9 HTML transforma todos los onclick heredados',()=>{const markup=webIndexHTML.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'');assert.ok(!/\bonclick\s*=/.test(markup));assert.ok(webIndexHTML.includes('data-edux-action='));assert.ok(webIndexHTML.includes('delegated-events.js'));});
test('FASE9 eventos delegados resuelven callbacks léxicos permitidos',()=>{let click,value;const sandbox={document:{addEventListener:(_n,fn)=>click=fn},window:{eduxfacActions:{openBranchEdit:x=>value=x},print:()=>{}}};vm.runInNewContext(code,sandbox);click({target:{closest:()=>({getAttribute:()=>"openBranchEdit('uuid-ficticio')"})},preventDefault(){}});assert.equal(value,'uuid-ficticio');});
test('Modificar contraseña usa un solo manejador de clic',()=>{assert.ok(!webIndexHTML.includes('data-edux-action="toggleUserPasswordEdit()"'));assert.ok(webIndexHTML.includes("$('uaChangePassBtn').onclick=toggleUserPasswordEdit"));});
test('FASE9 eventos delegados no ejecutan código ni funciones ajenas',()=>{let click,calls=0;const sandbox={document:{addEventListener:(_n,fn)=>click=fn},window:{eduxfacActions:{alert:()=>calls++},print:()=>{}}};vm.runInNewContext(code,sandbox);for(const value of ["alert('secret')","openBranchEdit('x');alert(1)","eval('malicious')"])click({target:{closest:()=>({getAttribute:()=>value})},preventDefault(){}});assert.equal(calls,0);});
test('FASE9 rate limit controlado y peer no confiado a cabecera',()=>{const limit=requestLimits({max:2}),res={setHeader(){},status(n){this.code=n;return this;},json(){return this;}};let calls=0;for(let i=0;i<3;i++)limit({socket:{remoteAddress:'127.0.0.1'},headers:{'x-forwarded-for':'fake'+i}},res,()=>calls++);assert.equal(calls,2);assert.equal(res.code,429);});

test('FASE9 limite por cuenta no bloquea otra cuenta normal detrás del proxy',()=>{const limit=requestLimits({max:1,keyOf:r=>r.socket.remoteAddress+':'+r.body.usuario});let passed=0;const res={setHeader(){},status(n){this.code=n;return this;},json(){}};for(const usuario of ['ataque','ataque','legitimo'])limit({socket:{remoteAddress:'127.0.0.1'},body:{usuario}},res,()=>passed++);assert.equal(passed,2);assert.equal(res.code,429);});
