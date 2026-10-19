import {existsSync,readFileSync} from 'node:fs';

/** Reviewed FASE10 policy plan. Execution is explicitly restricted to an isolated Linux laboratory. */
const shared=['roles','permisos','rol_permisos'],metadata=['eduxfac_migraciones','web_schema_migrations'];
const privateTables=['clientes_admin','legacy_import_runs','legacy_mappings','operacion_workers'];
const direct=['empresas','sucursales','usuarios','categorias','laboratorios','productos','proveedores','clientes','compras','ventas','movimientos_inventario','auditoria','ordenes_compra','solicitudes_internas','transferencias','ajustes_inventario','secuencias_documento','empresa_config','empresa_config_avanzada','empresa_acceso','acciones_admin','acciones_admin_intentos','eventos_comerciales','suscripcion_eventos'];
const inherited={precios_producto:['producto_id','productos','id'],lotes:['producto_id','productos','id'],cajas:['sucursal_id','sucursales','id'],sesiones_caja:['caja_id','cajas','id'],movimientos_caja:['sesion_caja_id','sesiones_caja','id'],compra_detalles:['compra_id','compras','id'],venta_detalles:['venta_id','ventas','id'],venta_pagos:['venta_id','ventas','id'],orden_compra_detalles:['orden_compra_id','ordenes_compra','id'],solicitud_interna_detalles:['solicitud_id','solicitudes_internas','id'],transferencia_detalles:['transferencia_id','transferencias','id'],devoluciones_venta:null,devolucion_venta_detalles:['devolucion_id','devoluciones_venta','id'],producto_sucursal:['producto_id','productos','id'],usuario_sucursal:['usuario_id','usuarios','id'],usuario_permisos:['usuario_id','usuarios','id']};
direct.push('devoluciones_venta');delete inherited.devoluciones_venta;
const serviceWrite=['clientes_admin','operacion_workers','empresas','sucursales','usuarios','usuario_sucursal','empresa_acceso','acciones_admin','acciones_admin_intentos','eventos_comerciales','suscripcion_eventos'];
const tenantNoAccess=['acciones_admin','acciones_admin_intentos','suscripcion_eventos'];
const appendOnly=['auditoria','eventos_comerciales'];
const authRead=['empresas','usuarios','sucursales','usuario_sucursal','empresa_acceso',...shared];
const branchColumns={precios_producto:['sucursal_id'],producto_sucursal:['sucursal_id'],lotes:['sucursal_id'],cajas:['sucursal_id'],compras:['sucursal_id'],ventas:['sucursal_id'],movimientos_inventario:['sucursal_id'],ajustes_inventario:['sucursal_id'],secuencias_documento:['sucursal_id'],ordenes_compra:['sucursal_id'],devoluciones_venta:['sucursal_id'],solicitudes_internas:['sucursal_solicitante_id','sucursal_origen_id'],transferencias:['sucursal_origen_id','sucursal_destino_id']};
const company="nullif(current_setting('app.empresa_id',true),'')::uuid";
const branches="string_to_array(coalesce(current_setting('app.sucursal_ids',true),''),',')::uuid[]";
export const GLOBAL_TABLES=Object.freeze([...shared,...metadata]);
export const PRIVATE_TABLES=Object.freeze(privateTables);
export const TENANT_TABLES=Object.freeze([...direct,...Object.keys(inherited)]);
const q=n=>{if(!/^[a-z_][a-z0-9_]*$/.test(n))throw Error('RLS_IDENTIFIER_INVALID');return '"'+n+'"';};
const arr=v=>Array.isArray(v)?v:String(v).replace(/^\{|\}$/g,'').split(',').filter(Boolean);
export async function inspectWebSchema(db){
const tables=(await db.query("SELECT c.relname name,c.relrowsecurity rls,c.relforcerowsecurity force,pg_get_userbyid(c.relowner) owner FROM pg_class c WHERE c.relnamespace='public'::regnamespace AND c.relkind='r' ORDER BY c.relname")).rows;
const columns=(await db.query("SELECT table_name name,column_name col FROM information_schema.columns WHERE table_schema='public'")).rows;
const constraints=(await db.query("SELECT c.conname,t.relname name,c.contype,ARRAY(SELECT a.attname::text FROM unnest(c.conkey) WITH ORDINALITY x(num,ord) JOIN pg_attribute a ON a.attrelid=c.conrelid AND a.attnum=x.num ORDER BY x.ord) cols,p.relname parent,ARRAY(SELECT a.attname::text FROM unnest(c.confkey) WITH ORDINALITY x(num,ord) JOIN pg_attribute a ON a.attrelid=c.confrelid AND a.attnum=x.num ORDER BY x.ord) parent_cols FROM pg_constraint c JOIN pg_class t ON t.oid=c.conrelid LEFT JOIN pg_class p ON p.oid=c.confrelid WHERE t.relnamespace='public'::regnamespace")).rows.map(r=>({...r,cols:arr(r.cols),parent_cols:arr(r.parent_cols)}));
return {tables,columns,constraints};
}
function ownerExpr(name){if(name==='empresas')return q('id')+'='+company;if(direct.includes(name))return q('empresa_id')+'='+company;const [col,parent,id]=inherited[name];return 'EXISTS(SELECT 1 FROM public.'+q(parent)+' own_parent WHERE own_parent.'+q(id)+'='+q(name)+'.'+q(col)+')';}
const extraChecks={
lotes:"(compra_detalle_id IS NULL OR EXISTS(SELECT 1 FROM compra_detalles cd JOIN compras c ON c.id=cd.compra_id WHERE cd.id=lotes.compra_detalle_id AND cd.producto_id=lotes.producto_id AND c.sucursal_id=lotes.sucursal_id))",
venta_detalles:"(lote_id IS NULL OR EXISTS(SELECT 1 FROM lotes l JOIN ventas v ON v.id=venta_detalles.venta_id WHERE l.id=venta_detalles.lote_id AND l.producto_id=venta_detalles.producto_id AND l.sucursal_id=v.sucursal_id))",
ventas:"(sesion_caja_id IS NULL OR EXISTS(SELECT 1 FROM sesiones_caja sc JOIN cajas c ON c.id=sc.caja_id WHERE sc.id=ventas.sesion_caja_id AND c.sucursal_id=ventas.sucursal_id))",
devoluciones_venta:"EXISTS(SELECT 1 FROM ventas v WHERE v.id=devoluciones_venta.venta_id AND v.sucursal_id=devoluciones_venta.sucursal_id)",
devolucion_venta_detalles:"EXISTS(SELECT 1 FROM devoluciones_venta dv JOIN venta_detalles vd ON vd.venta_id=dv.venta_id WHERE dv.id=devolucion_venta_detalles.devolucion_id AND vd.id=devolucion_venta_detalles.venta_detalle_id)",
transferencias:"(solicitud_id IS NULL OR EXISTS(SELECT 1 FROM solicitudes_internas si WHERE si.id=transferencias.solicitud_id AND si.sucursal_solicitante_id=transferencias.sucursal_destino_id AND (si.sucursal_origen_id IS NULL OR si.sucursal_origen_id=transferencias.sucursal_origen_id)))",
transferencia_detalles:"EXISTS(SELECT 1 FROM transferencias t WHERE t.id=transferencia_detalles.transferencia_id AND (lote_origen_id IS NULL OR EXISTS(SELECT 1 FROM lotes l WHERE l.id=transferencia_detalles.lote_origen_id AND l.producto_id=transferencia_detalles.producto_id AND l.sucursal_id=t.sucursal_origen_id)) AND (lote_destino_id IS NULL OR EXISTS(SELECT 1 FROM lotes l WHERE l.id=transferencia_detalles.lote_destino_id AND l.producto_id=transferencia_detalles.producto_id AND l.sucursal_id=t.sucursal_destino_id)))",
};
for(const name of ['movimientos_inventario','ajustes_inventario'])extraChecks[name]='(lote_id IS NULL OR EXISTS(SELECT 1 FROM lotes l WHERE l.id='+name+'.lote_id AND l.producto_id='+name+'.producto_id AND l.sucursal_id='+name+'.sucursal_id))';
export async function planGlobalRLS(db,{tenant='eduxfac_web_app_test',service='eduxfac_web_internal_test',auth='eduxfac_web_auth_test',backup='eduxfac_web_backup_test',migrator='eduxfac_web_migrator_test',dataMode='DEMO'}={}){
for(const role of [tenant,service,auth,backup,migrator])q(role);
if(new Set([tenant,service,auth,backup,migrator]).size!==5)throw Error('RLS_ROLES_MUST_BE_SEPARATE');
const runtime=(await db.query('SELECT rolname,rolsuper,rolbypassrls FROM pg_roles WHERE rolname=ANY($1)',[[tenant,service,auth,backup,migrator]])).rows;if(runtime.length!==5||runtime.filter(r=>r.rolname!==migrator).some(r=>r.rolsuper||r.rolbypassrls))throw Error('RLS_RUNTIME_ROLE_UNSAFE');
const schema=await inspectWebSchema(db);if(schema.tables.some(t=>t.owner===tenant))throw Error('RLS_APP_MUST_NOT_OWN_TABLES');const known=[...GLOBAL_TABLES,...PRIVATE_TABLES,...TENANT_TABLES];
for(const t of schema.tables)if(!known.includes(t.name))throw Error('RLS_UNCLASSIFIED_TABLE:'+t.name);
for(const name of known)if(!schema.tables.some(t=>t.name===name))throw Error('RLS_EXPECTED_TABLE_MISSING:'+name);
if(!['DEMO','PILOTO','PRODUCCION'].includes(dataMode))throw Error('RLS_DATA_MODE_INVALID');const modeComment=JSON.stringify({eduxfac_data_mode:dataMode,purpose:dataMode==='DEMO'?'FASE10_ISOLATED_LINUX':'FASE11_PREPARACION_PILOTO'});const dbName=(await db.query('SELECT current_database() name')).rows[0].name;
const statements=["COMMENT ON DATABASE "+q(dbName)+" IS '"+modeComment+"'",'REVOKE ALL ON ALL TABLES IN SCHEMA public FROM PUBLIC','REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM PUBLIC','REVOKE CREATE ON SCHEMA public FROM PUBLIC','REVOKE ALL ON ALL TABLES IN SCHEMA public FROM '+[tenant,service,auth,backup].map(q).join(','),'REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM '+[tenant,service,auth,backup].map(q).join(',')];
statements.push('GRANT USAGE ON SCHEMA public TO '+[tenant,service,auth,backup].map(q).join(','));
const rows=[];
for(const t of schema.tables){const name=t.name,table='public.'+q(name),global=GLOBAL_TABLES.includes(name),priv=PRIVATE_TABLES.includes(name),access=!global&&!priv&&!tenantNoAccess.includes(name);
for(const old of (await db.query("SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename=$1",[name])).rows)statements.push('DROP POLICY '+q(old.policyname)+' ON '+table);
if(global){statements.push('ALTER TABLE '+table+' DISABLE ROW LEVEL SECURITY');if(shared.includes(name))statements.push('GRANT SELECT ON '+table+' TO '+[tenant,service,auth].map(q).join(','));statements.push('GRANT SELECT ON '+table+' TO '+q(backup));rows.push({name,category:'A_GLOBAL_SISTEMA',rls:false,tenant:shared.includes(name)?'SELECT_SHARED':'DENIED',owner:null,branch:[],reason:shared.includes(name)?'Catálogo común, sólo lectura':'Ledger migraciones: sólo migrador/backup'});continue;}
statements.push('ALTER TABLE '+table+' ENABLE ROW LEVEL SECURITY','ALTER TABLE '+table+' FORCE ROW LEVEL SECURITY');
statements.push('CREATE POLICY f10_migrator ON '+table+' FOR ALL TO '+q(migrator)+' USING(true) WITH CHECK(true)','CREATE POLICY f10_backup ON '+table+' FOR SELECT TO '+q(backup)+' USING(true)');
statements.push('GRANT SELECT ON '+table+' TO '+q(backup));
if(serviceWrite.includes(name)){statements.push('GRANT SELECT ON '+table+' TO '+q(service));statements.push('CREATE POLICY f10_service ON '+table+' FOR ALL TO '+q(service)+' USING(true) WITH CHECK(true)');if(serviceWrite.includes(name))statements.push('GRANT INSERT,UPDATE,DELETE ON '+table+' TO '+q(service));}
if(authRead.includes(name)){statements.push('GRANT SELECT ON '+table+' TO '+q(auth),'CREATE POLICY f10_auth ON '+table+' FOR SELECT TO '+q(auth)+' USING(true)');}
if(access){
const owner=ownerExpr(name),branch=(branchColumns[name]||[]).map(col=>'('+q(col)+' IS NULL OR '+q(col)+'=ANY('+branches+'))');
const references=schema.constraints.filter(c=>c.name===name&&c.contype==='f'&&TENANT_TABLES.includes(c.parent)&&c.parent!==name).map(c=>'('+c.cols.map(q).map(col=>col+' IS NULL').join(' OR ')+' OR EXISTS(SELECT 1 FROM public.'+q(c.parent)+' fk_parent WHERE '+c.cols.map((col,i)=>'fk_parent.'+q(c.parent_cols[i])+'='+q(name)+'.'+q(col)).join(' AND ')+'))');
const using='('+owner+')'+(branch.length?' AND '+branch.join(' AND '):''),withCheck=using+(references.length?' AND '+references.join(' AND '):'')+(extraChecks[name]?' AND ('+extraChecks[name]+')':'');
statements.push('CREATE POLICY f10_tenant ON '+table+' FOR ALL TO '+q(tenant)+' USING('+using+') WITH CHECK('+withCheck+')');
statements.push('GRANT SELECT ON '+table+' TO '+q(tenant));
if(name==='empresas')statements.push('GRANT UPDATE(razon_social,ruc,nombre_comercial,telefono,email,direccion_fiscal,logo_data,web,slogan,departamento,provincia,distrito) ON '+table+' TO '+q(tenant));
else if(name==='empresa_acceso')statements.push('GRANT UPDATE(cuota_revision) ON '+table+' TO '+q(tenant));
else if(appendOnly.includes(name))statements.push('GRANT INSERT ON '+table+' TO '+q(tenant));
else statements.push('GRANT INSERT,UPDATE,DELETE ON '+table+' TO '+q(tenant));
rows.push({name,category:branch.length?'C_SUCURSAL':/audit|eventos/.test(name)?'D_HISTORIAL':/config/.test(name)?'E_CONFIGURACION':/transfer|solicitud|usuario_sucursal/.test(name)?'F_RELACION':'B_EMPRESA',rls:true,tenant:appendOnly.includes(name)?'SELECT_INSERT':name==='empresas'?'SELECT_UPDATE_COLUMNS':name==='empresa_acceso'?'SELECT_UPDATE_QUOTA':'CRUD',owner,branch:branchColumns[name]||[],using,withCheck,reason:'Tenant desde JWT verificado; hijos heredan parent RLS; FK y rama autorizada'});}
else rows.push({name,category:priv?'A_PRIVADO_SISTEMA':'D_ADMINISTRACION',rls:true,tenant:'DENIED',owner:priv?null:'empresa_id',branch:[],reason:'Administración interna/migración; sin permisos cliente'});
}
statements.push('GRANT SELECT ON ALL SEQUENCES IN SCHEMA public TO '+q(backup));
for(const seq of (await db.query("SELECT seq.relname name,tab.relname table_name FROM pg_class seq JOIN pg_depend d ON d.objid=seq.oid AND d.deptype IN ('a','i') JOIN pg_class tab ON tab.oid=d.refobjid WHERE seq.relkind='S' AND seq.relnamespace='public'::regnamespace")).rows){if(TENANT_TABLES.includes(seq.table_name)&&!tenantNoAccess.includes(seq.table_name)&&!['empresas','empresa_acceso'].includes(seq.table_name))statements.push('GRANT USAGE,SELECT ON public.'+q(seq.name)+' TO '+q(tenant));if(serviceWrite.includes(seq.table_name))statements.push('GRANT USAGE,SELECT ON public.'+q(seq.name)+' TO '+q(service));}
for(const view of (await db.query("SELECT viewname FROM pg_views WHERE schemaname='public'")).rows){statements.push('ALTER VIEW public.'+q(view.viewname)+' SET (security_invoker=true)','GRANT SELECT ON public.'+q(view.viewname)+' TO '+[tenant,service,backup].map(q).join(','));}
return {profile:'FASE10_GLOBAL',rows,statements,schema};
}
export async function installGlobalRLS(db,options={}){
const database=(await db.query('SELECT current_database() name')).rows[0].name;
if(process.platform!=='linux'||!existsSync('/.dockerenv')||!existsSync('/lab/FASE10_ISOLATED.json')||JSON.parse(readFileSync('/lab/FASE10_ISOLATED.json')).purpose!=='FASE10_ISOLATED_LINUX'||process.env.EDUXFAC_F10_ISOLATED!=='yes'||!/^web_f(?:9|10)_[a-z0-9_]+$/.test(database))throw Error('FASE10_LABORATORY_ONLY');
const plan=await planGlobalRLS(db,options);await db.query('BEGIN');
try{for(const sql of plan.statements)await db.query(sql);await db.query('COMMIT');return {...plan,applied:true,database};}
catch(e){await db.query('ROLLBACK');throw e;}
}
