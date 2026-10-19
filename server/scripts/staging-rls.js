// Explicit laboratory installer; never auto-applied by the WEB runtime.
export async function installStagingRLS(client,{tenant='eduxfac_web_app_test',service='eduxfac_web_internal_test',auth='eduxfac_web_auth_test',backup='eduxfac_web_backup_test'}={}){
 const db=(await client.query('select current_database() n')).rows[0].n;
 if(process.env.EDUXFAC_F9_ISOLATED!=='yes'||!/^web_f9_[a-z0-9_]+$/.test(db))throw Error('RLS_STAGING_ONLY');
 for(const r of [tenant,service,auth,backup])if(!/^[a-z][a-z0-9_]+$/.test(r))throw Error('RLS_ROLE_INVALID');
 const tables=(await client.query("select tablename name from pg_tables where schemaname='public'")).rows.map(x=>x.name),columns=(await client.query("select table_name name,column_name col from information_schema.columns where table_schema='public'")).rows;
 const foreign=(await client.query("select t.relname child,a.attname col,p.relname parent,b.attname parentcol from pg_constraint c join pg_class t on t.oid=c.conrelid join pg_class p on p.oid=c.confrelid join pg_attribute a on a.attrelid=t.oid and a.attnum=c.conkey[1] join pg_attribute b on b.attrelid=p.oid and b.attnum=c.confkey[1] where c.contype='f' and cardinality(c.conkey)=1 and t.relnamespace='public'::regnamespace")).rows;
 const owners=new Map();for(const name of tables)if(name==='empresas')owners.set(name,'id');else if(columns.some(x=>x.name===name&&x.col==='empresa_id'))owners.set(name,'empresa_id');
 for(let pass=0;pass<tables.length;pass++)for(const name of tables)if(!owners.has(name)){const fk=foreign.find(x=>x.child===name&&owners.has(x.parent));if(fk)owners.set(name,{fk});}
 const ident=v=>{if(!/^[a-z_][a-z0-9_]*$/.test(v))throw Error('RLS_IDENTIFIER');return '"'+v+'"';};
 const local="nullif(current_setting('app.empresa_id',true),'')::uuid";
 const expression=(name)=>{const owner=owners.get(name);if(typeof owner==='string')return ident(owner)+'='+local;return owner?'EXISTS(SELECT 1 FROM public.'+ident(owner.fk.parent)+' parent WHERE parent.'+ident(owner.fk.parentcol)+'='+ident(name)+'.'+ident(owner.fk.col)+')':'false';};
 const global=['roles','permisos','rol_permisos','eduxfac_migraciones'],authRead=['empresas','usuarios','sucursales','usuario_sucursal','empresa_acceso','empresa_condiciones','empresa_planes','planes'];
 await client.query('BEGIN');try{
 await client.query('REVOKE CREATE ON SCHEMA public FROM PUBLIC');
 for(const name of tables){
 if(global.includes(name)){await client.query('REVOKE INSERT,UPDATE,DELETE ON public.'+ident(name)+' FROM '+tenant+','+service+','+auth+','+backup);await client.query('GRANT SELECT ON public.'+ident(name)+' TO '+tenant+','+auth);continue;}
 const table='public.'+ident(name);await client.query('ALTER TABLE '+table+' ENABLE ROW LEVEL SECURITY');await client.query('ALTER TABLE '+table+' FORCE ROW LEVEL SECURITY');
 for(const policy of ['f9_tenant','f9_internal','f9_auth','f9_backup'])await client.query('DROP POLICY IF EXISTS '+policy+' ON '+table);
 const expr=expression(name),references=foreign.filter(x=>x.child===name&&x.parent!==name&&owners.has(x.parent)).map(x=>'('+ident(x.col)+' IS NULL OR EXISTS(SELECT 1 FROM public.'+ident(x.parent)+' reference WHERE reference.'+ident(x.parentcol)+'='+ident(name)+'.'+ident(x.col)+'))');
 await client.query('CREATE POLICY f9_tenant ON '+table+' FOR ALL TO '+tenant+' USING('+expr+') WITH CHECK('+expr+(references.length?' AND '+references.join(' AND '):'')+')');
 await client.query('CREATE POLICY f9_internal ON '+table+' FOR ALL TO '+service+' USING(true) WITH CHECK(true)');
 await client.query('CREATE POLICY f9_backup ON '+table+' FOR SELECT TO '+backup+' USING(true)');
 if(authRead.includes(name)){await client.query('CREATE POLICY f9_auth ON '+table+' FOR SELECT TO '+auth+' USING(true)');await client.query('GRANT SELECT ON '+table+' TO '+auth);}
 }
 for(const view of (await client.query("select viewname from pg_views where schemaname='public'")).rows)await client.query('ALTER VIEW public.'+ident(view.viewname)+' SET (security_invoker=true)');
 await client.query('COMMIT');return {status:'INSTALLED_STAGING',tables:tables.filter(n=>!global.includes(n)),global,authRead,tenant,service,auth};
 }catch(e){await client.query('ROLLBACK');throw e;}
}
