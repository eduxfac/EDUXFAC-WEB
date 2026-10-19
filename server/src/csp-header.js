import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
export const webIndexHTML=readFileSync(new URL('../../public/index.html',import.meta.url),'utf8').replace(/\r\n?/g,'\n');
const hash=s=>"'sha256-"+createHash('sha256').update(s).digest('base64')+"'";
const scripts=[...webIndexHTML.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].map(x=>x[1]).filter(x=>x.trim()).map(hash);
export const contentSecurityPolicy="default-src 'self'; script-src 'self' "+[...new Set(scripts)].join(' ')+"; style-src 'self' 'unsafe-inline'; img-src 'self' data:; frame-ancestors 'none'; base-uri 'self'";
