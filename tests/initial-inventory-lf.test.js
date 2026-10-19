import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import {readFileSync} from 'node:fs';import {createHash} from 'node:crypto';
import {createFixture} from './helpers/initial-inventory-template-fixture.js';
import {webIndexHTML,contentSecurityPolicy} from '../server/src/csp-header.js';
const old=readFileSync(new URL('../operations/initial-inventory-lf/index.before-crlf.html',import.meta.url));
const now=readFileSync(new URL('../public/index.html',import.meta.url));
const sha=b=>createHash('sha256').update(b).digest('hex');

test('Normalización histórica conserva su checksum y el HTML vigente mantiene LF',()=>{assert.equal(sha(old),'fa057a968001d037e63a41760911a9f5e5adbd1038c2c31ee320b0f700b7031d');assert.equal(old.toString().split('\r\n').length-1,2204);assert.equal(sha(Buffer.from(old.toString('utf8').replace(/\r\n/g,'\n'))),'72abe70e9da810f7bc3c76b271f52e24cb3a800c0f5f2ba7f7db9e7f76a88a32');assert.equal(now.includes(13),false);});
test('HTML vigente: scripts inline compilables y todos autorizados por CSP',()=>{assert.equal(webIndexHTML,now.toString('utf8'));let count=0;for(const x of now.toString('utf8').matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)){if(!x[1].trim())continue;new vm.Script(x[1]);const hash=createHash('sha256').update(x[1]).digest('base64');assert.ok(contentSecurityPolicy.includes("'sha256-"+hash+"'"));count++;}assert.ok(count>0);});
test('Servidor local: HTML vigente LF y cuerpo HTTP coinciden byte a byte con CSP válida',async()=>{const f=await createFixture();try{const r=await fetch(f.base+'/');assert.equal(r.status,200);const body=Buffer.from(await r.arrayBuffer());assert.equal(sha(body),sha(now));assert.equal(r.headers.get('content-security-policy'),contentSecurityPolicy);}finally{await f.close();}});
