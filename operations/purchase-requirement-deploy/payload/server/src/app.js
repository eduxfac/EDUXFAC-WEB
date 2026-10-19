import {prepareStockCosts,reconcileStockCosts} from './stock-cost.js';
import {validateSalePresentation,assertSaleProfitability} from './sale-profitability.js';
import {dataMode,assertPilotConfiguration,assertOperationalProfile} from './environment-mode.js';
import {contentSecurityPolicy,webIndexHTML} from './csp-header.js';
import {requestLimits} from './request-limits.js';
import { exportXlsx } from './export-xlsx.js';
import express from 'express';
import { backupMaintenance } from './backup-maintenance.js';
import cors from 'cors';
import bcrypt from 'bcryptjs';
import 'dotenv/config';
import { pool, tx,rlsEnabled,runWithUserContext,verifyGlobalRoleProfiles } from './db.js';
import { requireAuth, requirePasswordChange, signUser } from './auth.js';
import {changeInitialPassword} from './password-change.js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ExcelJS from 'exceljs';
import { readFile } from 'node:fs/promises';
import { routePermission } from './access-policy.js';
import { installBranchAdmin } from './branch-admin.js';
import { readReportDocument } from './report-document.js';
import { linkProduct, inventoryWorkbook } from './branch-catalog.js';
import { registerInitialInventory } from './initial-inventory.js';
import { inventorySummary, countWorkbook, countPlan } from './inventory-count.js';
import { registerPurchaseRequirements,lowStockCount } from './purchase-requirement.js';
import { applyPositiveStockEntry } from './inventory-entry.js';
import { adminServiceApi } from './admin-service-api.js';
import { getCompanyAccess, assertCompanyAccess, sendAccessError } from './company-access.js';
import { ensureCompanyProduct, ensureCompanyRequest } from './tenant-guard.js';

const app = express();
app.use((_req,res,next)=>{res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('X-Frame-Options','DENY');res.setHeader('Content-Security-Policy',contentSecurityPolicy);next();});
app.use(backupMaintenance);

app.use('/api/internal/admin/v1',requestLimits({max:600}));
let runtimeSchemaReady=false;
const allowedOrigin=process.env.CORS_ORIGIN || true;
app.use(cors({origin:allowedOrigin,credentials:false}));
app.use('/api/internal/admin/v1',express.json({limit:'16kb'}),adminServiceApi);
app.use(express.json({ limit: '30mb' }));
app.use('/api/auth/login',requestLimits({windowMs:900000,max:30,keyOf:req=>(req.socket.remoteAddress||'unknown')+'|'+String(req.body?.usuario||'').slice(0,80).toLowerCase()+'|'+String(req.body?.empresa_codigo||req.body?.ruc||'').slice(0,80).toLowerCase()}));

const here = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.resolve(here, '../../public');
app.get(['/','/index.html'],(_req,res)=>res.type('html').send(webIndexHTML));
app.use(express.static(publicDir));

const money = n => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
const numeric = (value, label) => {
  const n = Number(value);
  if (!Number.isFinite(n)) throw new Error(`${label} inválido.`);
  return n;
};
const VALID_TICKET_WIDTHS = new Set([58, 80, 210]);

async function ensureBranchAccess(db, user, branchId) {
  if (!branchId) throw new Error('Sucursal obligatoria.');
  const q = await db.query(
    `select s.id,r.nombre rol from sucursales s
       join usuario_sucursal us on us.sucursal_id=s.id and us.usuario_id=$2
       join roles r on r.id=us.rol_id
      where s.id=$1 and s.empresa_id=$3 and (s.activo=true or $4::boolean) limit 1${db===pool?'':' for share of s'}`,
    [branchId, user.sub, user.empresa_id, user.readOnlyBranchAccess===true]
  );
  if (!q.rows[0]) { const e=new Error('No tienes acceso a esta sucursal.'); e.status=403; throw e; }
  return q.rows[0];
}


const PERMISSION_MODULES=['dashboard','sales','productsAdmin','inventory','purchases','suppliers','customers','cash','alerts','replenishment','transfers','reports','usersAdmin','settings'];
async function ensureUserPermissions(db){
  if(runtimeSchemaReady) return;
  await db.query(`create table if not exists usuario_permisos(
    usuario_id uuid not null references usuarios(id) on delete cascade,
    modulo varchar(40) not null,
    puede_ver boolean not null default false,
    puede_crear boolean not null default false,
    puede_editar boolean not null default false,
    puede_eliminar boolean not null default false,
    updated_at timestamptz not null default now(),
    primary key(usuario_id,modulo)
  )`);
}
async function isAdminUser(db,userId){
  const q=await db.query(`select 1 from usuario_sucursal us join usuarios u on u.id=us.usuario_id join sucursales s on s.id=us.sucursal_id and s.empresa_id=u.empresa_id join roles r on r.id=us.rol_id where us.usuario_id=$1 and r.nombre='Administrador' limit 1`,[userId]);
  return !!q.rows[0];
}
function allPermissions(value=true){
  return Object.fromEntries(PERMISSION_MODULES.map(m=>[m,{ver:value,crear:value,editar:value,eliminar:value}]));
}
async function effectivePermissions(db,user){
  if(await isAdminUser(db,user.sub)) return allPermissions(true);
  await ensureUserPermissions(db);
  const q=await db.query(`select modulo,puede_ver,puede_crear,puede_editar,puede_eliminar from usuario_permisos where usuario_id=$1`,[user.sub]);
  if(q.rows.length){
    const out=allPermissions(false);
    for(const r of q.rows) if(out[r.modulo]) out[r.modulo]={ver:r.puede_ver,crear:r.puede_crear,editar:r.puede_editar,eliminar:r.puede_eliminar};
    return out;
  }
  // Perfil inicial seguro para vendedores/cajeros existentes hasta que el administrador personalice permisos.
  const out=allPermissions(false);
  for(const m of ['dashboard','sales','productsAdmin','inventory','customers','cash','alerts','reports']) out[m].ver=true;
  out.sales.crear=true; out.customers.crear=true; out.customers.editar=true; out.cash.crear=true; out.cash.editar=true;
  const warehouse=await db.query(`select 1 from usuario_sucursal us join roles r on r.id=us.rol_id where us.usuario_id=$1 and r.nombre='Almacén' limit 1`,[user.sub]);
  if(warehouse.rows.length) for(const m of ['productsAdmin','inventory','purchases','suppliers','replenishment','transfers']) out[m]={ver:true,crear:true,editar:true,eliminar:false};
  return out;
}

async function canReportGlobally(db,user) {
  const q=await db.query(`select
    exists(select 1 from usuario_sucursal us join sucursales s on s.id=us.sucursal_id join roles r on r.id=us.rol_id
      where us.usuario_id=$1 and s.empresa_id=$2 and s.activo=true and r.nombre='Administrador')
    and not exists(select 1 from sucursales s where s.empresa_id=$2 and s.activo=true
      and not exists(select 1 from usuario_sucursal us where us.usuario_id=$1 and us.sucursal_id=s.id)) as allowed`,[user.sub,user.empresa_id]);
  return q.rows[0]?.allowed===true;
}

async function writeAudit(db, user, action, entity, entityId=null, detail={}) {
  await db.query(
    `insert into auditoria(empresa_id,usuario_id,accion,entidad,entidad_id,detalle)
     values($1,$2,$3,$4,$5,$6::jsonb)`,
    [user.empresa_id,user.sub,action,entity,entityId,JSON.stringify(detail)]
  );
}

app.post('/api/auth/password/change',requirePasswordChange,changeInitialPassword);

app.use(async (req, res, next) => {
  if (!req.path.startsWith('/api/') || ['/api/health', '/api/auth/login', '/api/setup/status', '/api/setup/complete'].includes(req.path)) return next();
  await requireAuth(req, res, async error => {
    if (error) return next(error);
    try {
      req.user.readOnlyBranchAccess = req.method==='GET';
      for(const values of [req.query,req.body])if(values&&typeof values==='object'&&Object.hasOwn(values,'empresa_id')&&String(values.empresa_id).toLowerCase()!==req.user.empresa_id.toLowerCase())return res.status(403).json({error:'Empresa distinta de la sesión.',code:'TENANT_MISMATCH'});
      if (req.path === '/api/bootstrap') return next();
      if(req.path.startsWith('/api/export/')){const supplied=req.body?.sucursal_id??req.query.sucursal_id;if(supplied)await ensureBranchAccess(pool,req.user,supplied);}
      const rule = routePermission(req.method, req.path, req.body);
      const permissions = await effectivePermissions(pool, req.user);
      if (!rule || !permissions[rule[0]]?.ver || !permissions[rule[0]]?.[rule[1]]) {
        return res.status(403).json({ error: 'No tienes permiso para esta operación.' });
      }
      if (req.path === '/api/dashboard' || req.path.startsWith('/api/reports/')) {
        const branch = req.query.sucursal_id;
        if (branch !== undefined && (typeof branch !== 'string' || (branch !== '' && !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(branch)))) {
          return res.status(400).json({error:'Sucursal inválida.'});
        }
        if (branch) await ensureBranchAccess(pool,req.user,branch);
        else if (!/^\/api\/reports\/(cancellations|purchases)\/[^/]+\/detail$/.test(req.path) && !(await canReportGlobally(pool,req.user))) return res.status(403).json({error:'Selecciona una sucursal autorizada. No tienes acceso a reportes de toda la empresa.'});
      }
      return next();
    } catch (e) {
      if(e.status===403) return res.status(403).json({error:e.message});
      return next(e);
    }
  });
});

app.get('/api/health', async (_req, res) => {
  try {
    const { rows } = await pool.query('select now() as now');
    res.json({ ok: true, database: true, now: rows[0].now, data_mode:dataMode() });
  } catch (error) {
    res.status(503).json({ ok: false, database: false, error: error.message });
  }
});

// Solo está disponible mientras la base local nueva aún no tenga usuarios.
app.get('/api/setup/status', async (_req, res) => {
  try {
    const { rows } = await pool.query('select count(*)::int as total from usuarios');
    res.json({ ready: rows[0].total > 0 });
  } catch {
    res.status(503).json({ error: 'La base local aún no está lista.' });
  }
});

// El alta global pública no forma parte del WEB administrado por PANEL.
app.post('/api/setup/complete',(_req,res)=>res.status(403).json({error:'El alta WEB requiere administración autorizada.',code:'ALTA_ADMINISTRATIVA_REQUERIDA'}));
app.post('/api/auth/login',async(req,res)=>{
 try{
  const {usuario,password,ruc,empresa_codigo}=req.body||{};
  const code=typeof empresa_codigo==='string'?empresa_codigo.trim():'';
  const document=typeof ruc==='string'?ruc.trim():'';
  if(typeof usuario!=='string'||!usuario.trim()||typeof password!=='string'||!password||password.length>256||(!code&&!document)||(code&&document))return res.status(400).json({error:'Indica empresa_codigo o RUC, usuario y contraseña.',code:'EMPRESA_REQUERIDA'});
  const company=await pool.query('select id from empresas where '+(code?'lower(btrim(empresa_codigo))=lower($1)':'btrim(ruc)=$1')+' limit 2',[code||document]);
  if(company.rows.length!==1)return res.status(401).json({error:'Empresa o credenciales inválidas.',code:'LOGIN_INVALIDO'});
  const {rows}=await pool.query(`select u.id,u.empresa_id,u.nombre,u.usuario,u.password_hash,coalesce((to_jsonb(u)->>'debe_cambiar_password')::boolean,false) debe_cambiar_password from usuarios u where u.empresa_id=$1 and lower(u.usuario)=lower($2) and u.activo=true limit 2`,[company.rows[0].id,usuario.trim()]);
  if(rows.length!==1||!(await bcrypt.compare(password,rows[0].password_hash)))return res.status(401).json({error:'Empresa o credenciales inválidas.',code:'LOGIN_INVALIDO'});
  const executeLogin=()=>tx(async db=>{
   const user=rows[0];const access=assertCompanyAccess(await getCompanyAccess(db,user.empresa_id,{lock:true}));
   const active=await db.query('select id from usuarios where id=$1 and empresa_id=$2 and activo=true and password_hash=$3',[user.id,user.empresa_id,user.password_hash]);
   if(!active.rows.length)return null;
   const branches=await db.query(`select s.id,s.nombre,r.nombre rol from usuario_sucursal us join sucursales s on s.id=us.sucursal_id and s.empresa_id=$2 and s.activo=true join roles r on r.id=us.rol_id where us.usuario_id=$1`,[user.id,user.empresa_id]);
   return {token:signUser({...user,auth_version:access.auth_version}),debe_cambiar_password:user.debe_cambiar_password===true,user:{id:user.id,empresa_id:user.empresa_id,nombre:user.nombre,usuario:user.usuario,sucursales:branches.rows}};
  });
  const result=await (rlsEnabled()?runWithUserContext({sub:rows[0].id,empresa_id:rows[0].empresa_id},executeLogin):executeLogin());
  if(!result)return res.status(401).json({error:'Empresa o credenciales inválidas.',code:'LOGIN_INVALIDO'});
  res.json(result);
 }catch(error){if(error.code==='42703')return res.status(503).json({error:'Falta aplicar la migración de acceso WEB.',code:'ESQUEMA_ACCESO_PENDIENTE'});sendAccessError(res,error);}
});

app.get('/api/bootstrap', requireAuth, async (req, res) => {
  const branches = await pool.query(`select s.id,s.codigo,s.nombre,s.direccion,r.nombre rol from sucursales s join usuario_sucursal us on us.sucursal_id=s.id join roles r on r.id=us.rol_id where s.empresa_id=$1 and us.usuario_id=$2 and s.activo=true order by s.nombre`, [req.user.empresa_id,req.user.sub]);
  const uq=await pool.query(`select id,nombre,usuario from usuarios where id=$1 and empresa_id=$2`,[req.user.sub,req.user.empresa_id]);
  const permissions=await effectivePermissions(pool,req.user);
  const reportBranches=await pool.query(`select s.id,s.codigo,s.nombre,s.activo from sucursales s join usuario_sucursal us on us.sucursal_id=s.id where s.empresa_id=$1 and us.usuario_id=$2 order by s.nombre`,[req.user.empresa_id,req.user.sub]);
  res.json({ branches: branches.rows, report_branches:reportBranches.rows, user: uq.rows[0]||null, permissions, report_global: await canReportGlobally(pool,req.user) });
});

app.get('/api/products', requireAuth, async (req, res) => {
  const branch = req.query.sucursal_id;
  if (!branch) return res.status(400).json({ error: 'sucursal_id es obligatorio.' });
  const q = String(req.query.q || '').trim();
  const searchActiveIngredient = req.query.search_scope === 'ventas';
  const requestedOffset = Number.parseInt(req.query.offset || '0', 10);
  const offset = searchActiveIngredient ? Math.max(0, Math.min(Number.isFinite(requestedOffset) ? requestedOffset : 0, 1000000)) : 0;
  const requestedLimit = Number.parseInt(req.query.limit || (q ? '80' : '60'), 10);
  const limit = Math.max(20, Math.min(Number.isFinite(requestedLimit) ? requestedLimit : 60, searchActiveIngredient ? 100 : 5000));
  try { await ensureBranchAccess(pool, req.user, branch); } catch (error) { return res.status(error.status||400).json({error:error.message}); }
  const { rows } = await pool.query(
    `select p.id,p.codigo_interno,p.codigo_anterior,p.codigo_barras,p.nombre,coalesce((select ps.stock_minimo from producto_sucursal ps where ps.producto_id=p.id and ps.sucursal_id=$2),p.stock_minimo) stock_minimo,p.presentacion,p.unidad_medida,
            lab.nombre laboratorio,
            coalesce((select pp.precio_venta from precios_producto pp where pp.producto_id=p.id and (pp.sucursal_id=$2 or pp.sucursal_id is null) and pp.vigente_hasta is null and pp.factor_unidades=1 order by pp.sucursal_id nulls last,pp.vigente_desde desc,pp.id desc limit 1),0)::numeric(14,2) precio,
            coalesce((select cd.costo_unitario from compra_detalles cd join compras c on c.id=cd.compra_id where cd.producto_id=p.id and c.sucursal_id=$2 order by c.created_at desc, cd.id desc limit 1),
                     (select l2.costo_unitario from lotes l2 where l2.producto_id=p.id and l2.sucursal_id=$2 and l2.costo_unitario>0 order by l2.fecha_vencimiento desc nulls last, l2.id desc limit 1),0)::numeric(14,4) costo_compra,
            coalesce(sum(l.cantidad_disponible),0)::numeric(14,3) stock,
            exists(select 1 from precios_producto pe where pe.producto_id=p.id and pe.vigente_hasta is null and (pe.sucursal_id=$2 or pe.sucursal_id is null) and pe.factor_unidades>1) has_equivalencias
       from productos p
       left join laboratorios lab on lab.id=p.laboratorio_id
       left join lotes l on l.producto_id=p.id and l.sucursal_id=$2
      where ($2::uuid is null or exists(select 1 from producto_sucursal ps where ps.producto_id=p.id and ps.sucursal_id=$2 and ps.activo=true)) and p.empresa_id=$1 and ($2::uuid is not null or p.activo=true)
        and ($3='' or p.nombre ilike '%'||$3||'%' or p.codigo_interno ilike '%'||$3||'%' or coalesce(p.codigo_anterior,'') ilike '%'||$3||'%' or coalesce(p.codigo_barras,'') ilike '%'||$3||'%' or ($5::boolean and translate(coalesce(p.principio_activo,''),'ÁÉÍÓÚÜÑ','áéíóúüñ') ilike '%'||translate($3::text,'ÁÉÍÓÚÜÑ','áéíóúüñ')||'%'))
      group by p.id,lab.nombre
      order by
        case when lower(coalesce(p.codigo_barras,''))=lower($3) or lower(coalesce(p.codigo_interno,''))=lower($3) or lower(coalesce(p.codigo_anterior,''))=lower($3) then 0
             when lower(p.nombre)=lower($3) then 1
             when p.nombre ilike $3||'%' then 2
             else 3 end,
        p.nombre,p.id
      limit $4 offset $6`, [req.user.empresa_id, branch, q, limit, searchActiveIngredient, offset]
  );
  res.json(rows);
});

app.get('/api/products/:id/presentations', requireAuth, async (req,res)=>{
  try{
    const branch=req.query.sucursal_id; if(!branch) throw new Error('sucursal_id es obligatorio.');
    await ensureBranchAccess(pool,req.user,branch);
    const own=await pool.query(`select id,nombre,unidad_medida from productos where id=$1 and empresa_id=$2 and activo=true`,[req.params.id,req.user.empresa_id]);
    if(!own.rows[0]) throw new Error('Producto no encontrado.');
    const {rows}=await pool.query(`select distinct on (lower(tipo),factor_unidades) id,tipo,factor_unidades,precio_venta
      from precios_producto where producto_id=$1 and vigente_hasta is null and (sucursal_id=$2 or sucursal_id is null)
      order by lower(tipo),factor_unidades,sucursal_id nulls last,vigente_desde desc`,[req.params.id,branch]);
    const base=rows.find(x=>Number(x.factor_unidades)===1) || {id:null,tipo:own.rows[0].unidad_medida||'UNIDAD',factor_unidades:1,precio_venta:0};
    const extras=rows.filter(x=>Number(x.factor_unidades)>1);
    res.json({producto:own.rows[0],presentaciones:[base,...extras]});
  }catch(error){res.status(error.status||400).json({error:error.message});}
});

app.post('/api/cash/open', requireAuth, async (req, res) => {
  try {
    const { sucursal_id, caja_id, monto_apertura = 0 } = req.body || {};
    const amount = numeric(monto_apertura, 'Monto de apertura');
    if (amount < 0) throw new Error('El monto de apertura no puede ser negativo.');
    const result = await tx(async c => {
      await ensureBranchAccess(c, req.user, sucursal_id);
      let selectedCaja = caja_id;
      if (selectedCaja) {
        const q = await c.query(`select id from cajas where id=$1 and sucursal_id=$2 and activo=true for update`, [selectedCaja,sucursal_id]);
        if (!q.rows[0]) throw new Error('La caja seleccionada no está activa en esta sucursal.');
      } else {
        // A cash session is allowed to be the first cash record for a branch.
        // Locking the branch prevents two simultaneous first openings from creating duplicate default boxes.
        await c.query(`select id from sucursales where id=$1 for update`,[sucursal_id]);
        let q = await c.query(`select id from cajas where sucursal_id=$1 and activo=true order by nombre,id limit 1 for update`, [sucursal_id]);
        if (!q.rows[0]) q = await c.query(`insert into cajas(sucursal_id,nombre,activo) values($1,'Caja principal',true) returning id`,[sucursal_id]);
        selectedCaja = q.rows[0].id;
      }
      const open = await c.query(`select id from sesiones_caja where caja_id=$1 and usuario_id=$2 and estado='ABIERTA' limit 1`, [selectedCaja, req.user.sub]);
      if (open.rows[0]) return { id: open.rows[0].id, already_open: true };
      const q = await c.query(`insert into sesiones_caja(caja_id,usuario_id,monto_apertura) values($1,$2,$3) returning *`, [selectedCaja, req.user.sub, amount]);
      await writeAudit(c,req.user,'ABRIR_CAJA','sesiones_caja',q.rows[0].id,{sucursal_id,monto_apertura:amount});
      return q.rows[0];
    });
    res.status(201).json(result);
  } catch (error) { res.status(400).json({ error: error.message }); }
});

app.get('/api/cash/current', requireAuth, async (req, res) => {
  const { sucursal_id } = req.query;
  try { await ensureBranchAccess(pool, req.user, sucursal_id); } catch(error){ return res.status(error.status||400).json({error:error.message}); }
  const { rows } = await pool.query(
    `select sc.id,sc.abierto_en,sc.monto_apertura,sc.estado,c.nombre caja,
            coalesce(sum(case when mc.tipo='INGRESO' and mc.metodo='Efectivo' then mc.monto when mc.tipo='EGRESO' and mc.metodo='Efectivo' then -mc.monto else 0 end),0) movimientos_efectivo
       from sesiones_caja sc join cajas c on c.id=sc.caja_id
       left join movimientos_caja mc on mc.sesion_caja_id=sc.id
      where c.sucursal_id=$1 and sc.usuario_id=$2 and sc.estado='ABIERTA'
      group by sc.id,c.nombre order by sc.abierto_en desc limit 1`, [sucursal_id,req.user.sub]
  );
  const row = rows[0];
  if (!row) return res.json(null);
  row.efectivo_esperado = money(Number(row.monto_apertura) + Number(row.movimientos_efectivo));
  res.json(row);
});

app.post('/api/cash/close', requireAuth, async (req, res) => {
  try {
    const { sesion_caja_id, efectivo_contado } = req.body || {};
    const counted = numeric(efectivo_contado, 'Efectivo contado');
    if (counted < 0) throw new Error('El efectivo contado no puede ser negativo.');
    const result = await tx(async c => {
      const s = await c.query(`select sc.*, c.sucursal_id from sesiones_caja sc join cajas c on c.id=sc.caja_id where sc.id=$1 and sc.estado='ABIERTA' for update`, [sesion_caja_id]);
      if (!s.rows[0]) throw new Error('La caja ya está cerrada o no existe.');
      await ensureBranchAccess(c, req.user, s.rows[0].sucursal_id);
      const m = await c.query(`select coalesce(sum(case when tipo='INGRESO' and metodo='Efectivo' then monto when tipo='EGRESO' and metodo='Efectivo' then -monto else 0 end),0) total from movimientos_caja where sesion_caja_id=$1`, [sesion_caja_id]);
      const expected = money(Number(s.rows[0].monto_apertura) + Number(m.rows[0].total));
      const diff = money(counted - expected);
      const q = await c.query(`update sesiones_caja set cerrado_en=now(),efectivo_esperado=$2,efectivo_contado=$3,diferencia=$4,estado='CERRADA' where id=$1 returning *`, [sesion_caja_id, expected, counted, diff]);
      await writeAudit(c,req.user,'CERRAR_CAJA','sesiones_caja',sesion_caja_id,{efectivo_esperado:expected,efectivo_contado:counted,diferencia:diff});
      return q.rows[0];
    });
    res.json(result);
  } catch (error) { res.status(400).json({ error: error.message }); }
});

app.post('/api/purchases', requireAuth, async (req, res) => {
  try {
    const requiredFields=[['tipo_documento','Documento'],['serie','Serie'],['numero','Número'],['fecha','Fecha de emisión'],['tipo_compra','Tipo de compra'],['moneda','Moneda'],['proveedor_id','Proveedor']];
    const missing=requiredFields.filter(([key])=>!String(req.body?.[key]??'').trim()).map(([,label])=>label);
    if(missing.length)throw new Error('Complete los campos obligatorios: '+missing.join(', ')+'.');
    const { sucursal_id, proveedor_id = null, tipo_documento='FACTURA', serie=null, numero=null, fecha, tipo_compra='Mercadería', moneda='PEN', observacion=null, items=[] } = req.body || {};
    if (!sucursal_id || !fecha || !Array.isArray(items) || !items.length) throw new Error('Sucursal, fecha e items son obligatorios.');
    const result = await tx(async c => {
      await ensureBranchAccess(c, req.user, sucursal_id);
      if(proveedor_id){const pr=await c.query(`select id from proveedores where id=$1 and empresa_id=$2 and activo=true`,[proveedor_id,req.user.empresa_id]);if(!pr.rows[0])throw new Error('Proveedor inválido para esta empresa.');}
      let total = 0;
      const normalized = items.map(i => {
        const cantidad=numeric(i.cantidad,'Cantidad'), costo=numeric(i.costo_unitario,'Costo');
        if(cantidad<=0||costo<0||!i.producto_id||!i.numero_lote) throw new Error('Producto, cantidad, costo y lote son obligatorios.');
        const precioVenta=i.precio_venta===null||i.precio_venta===undefined||i.precio_venta===''?null:numeric(i.precio_venta,'Precio de venta'); const igvPct=i.igv_pct===null||i.igv_pct===undefined||i.igv_pct===''?18:numeric(i.igv_pct,'IGV'); if(precioVenta!==null&&precioVenta<0)throw new Error('El precio de venta no puede ser negativo.'); const line=money(cantidad*costo); total=money(total+line); return {...i,cantidad,costo,precioVenta,igvPct,line};
      });
      const purchase = await c.query(`insert into compras(empresa_id,sucursal_id,proveedor_id,tipo_documento,serie,numero,fecha,tipo_compra,moneda,observacion,total,usuario_id) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) returning *`, [req.user.empresa_id,sucursal_id,proveedor_id,tipo_documento,serie,numero,fecha,tipo_compra,moneda,observacion,total,req.user.sub]);
      for (const i of normalized) {
        await linkProduct(c,i.producto_id,sucursal_id);
        await prepareStockCosts(c,{empresaId:req.user.empresa_id,sucursalId:sucursal_id,productoId:i.producto_id});
        const detail = await c.query(`insert into compra_detalles(compra_id,producto_id,cantidad,costo_unitario,numero_lote,fecha_vencimiento,total,precio_venta,igv_pct) values($1,$2,$3,$4,$5,$6,$7,$8,$9) returning id`, [purchase.rows[0].id,i.producto_id,i.cantidad,i.costo,i.numero_lote,i.fecha_vencimiento||null,i.line,i.precioVenta,i.igvPct]);
        if(i.precioVenta!==null){await c.query(`insert into precios_producto(producto_id,sucursal_id,tipo,factor_unidades,precio_venta,vigente_desde) values($1,$2,'unidad',1,$3,now())`,[i.producto_id,sucursal_id,i.precioVenta]);}
        const lot = await c.query(`insert into lotes(producto_id,sucursal_id,numero_lote,fecha_vencimiento,costo_unitario,cantidad_inicial,cantidad_disponible,compra_detalle_id) values($1,$2,$3,$4,$5,0,0,$6) on conflict(producto_id,sucursal_id,numero_lote) do update set fecha_vencimiento=coalesce(excluded.fecha_vencimiento,lotes.fecha_vencimiento) returning id`, [i.producto_id,sucursal_id,i.numero_lote,i.fecha_vencimiento||null,i.costo,detail.rows[0].id]);
        await applyPositiveStockEntry(c,{empresaId:req.user.empresa_id,sucursalId:sucursal_id,productoId:i.producto_id,loteId:lot.rows[0].id,cantidad:i.cantidad,costoUnitario:i.costo,tipo:'COMPRA',referenciaTipo:'COMPRA',referenciaId:purchase.rows[0].id,usuarioId:req.user.sub,increaseInitial:true});
      }
      await writeAudit(c,req.user,'REGISTRAR_COMPRA','compras',purchase.rows[0].id,{sucursal_id,total});
      return purchase.rows[0];
    });
    res.status(201).json(result);
  } catch (error) { res.status(error.status||400).json({ error: error.message }); }
});

app.get('/api/purchases/history', requireAuth, async (req, res) => {
  let client;
  try {
    const branch=String(req.query.sucursal_id||'').trim();
    const from=String(req.query.from||'').trim();
    const to=String(req.query.to||'').trim();
    const docType=String(req.query.doc_type||'').trim();
    const search=String(req.query.q||'').trim();
    if(!branch) throw new Error('Selecciona una sucursal.');
    if(!/^\d{4}-\d{2}-\d{2}$/.test(from)||!/^\d{4}-\d{2}-\d{2}$/.test(to)) throw new Error('Selecciona fechas Desde y Hasta válidas.');
    if(from>to) throw new Error('La fecha Desde no puede ser posterior a la fecha Hasta.');
    await ensureBranchAccess(pool,req.user,branch);

    client=await pool.connect();
    await client.query('begin isolation level repeatable read read only');
    const params=[req.user.empresa_id,branch,from,to,docType,search];
    const where=`c.empresa_id=$1 and c.sucursal_id=$2 and c.fecha >= $3::date and c.fecha <= $4::date
      and ($5='' or upper(btrim(coalesce(c.tipo_documento,'')))=upper(btrim($5)))
      and ($6='' or coalesce(pr.razon_social,'') ilike '%'||$6||'%'
        or coalesce(c.serie,'') ilike '%'||$6||'%'
        or coalesce(c.numero,'') ilike '%'||$6||'%'
        or concat_ws('-',nullif(btrim(c.serie),''),nullif(btrim(c.numero),'')) ilike '%'||$6||'%'
        or concat_ws(' ',nullif(btrim(c.serie),''),nullif(btrim(c.numero),'')) ilike '%'||$6||'%'
        or regexp_replace(coalesce(c.serie,'')||coalesce(c.numero,''),'[^[:alnum:]]','','g') ilike '%'||regexp_replace($6,'[^[:alnum:]]','','g')||'%')`;
    const base=`from compras c left join proveedores pr on pr.id=c.proveedor_id left join usuarios u on u.id=c.usuario_id
      left join lateral (select count(*)::int items,coalesce(sum(cd.cantidad),0) unidades from compra_detalles cd where cd.compra_id=c.id) d on true
      where ${where}`;
    const rows=(await client.query(`select c.id,c.fecha::text fecha,coalesce(pr.razon_social,'Sin proveedor') proveedor,c.tipo_documento,c.serie,c.numero,
      coalesce(u.nombre,'—') usuario,coalesce(d.items,0) items,coalesce(d.unidades,0)::numeric(14,3) unidades,c.total::numeric(14,2) total
      ${base} order by c.fecha desc,c.created_at desc,c.id desc`,params)).rows;
    const summary=(await client.query(`select count(*)::int documentos,coalesce(sum(c.total),0)::numeric(14,2) total,
      coalesce(sum(d.unidades),0)::numeric(14,3) unidades,count(distinct c.proveedor_id)::int proveedores ${base}`,params)).rows[0];
    const documentTypes=(await client.query(`select distinct btrim(tipo_documento) tipo from compras
      where empresa_id=$1 and sucursal_id=$2 and nullif(btrim(tipo_documento),'') is not null order by tipo`,[req.user.empresa_id,branch])).rows.map(r=>r.tipo);
    await client.query('commit');
    res.json({rows,summary,document_types:documentTypes});
  } catch (error) {
    if(client) await client.query('rollback').catch(()=>{});
    res.status(error.status||400).json({error:error.message});
  } finally { client?.release(); }
});

app.get('/api/sales/today',requireAuth,async(req,res)=>{
 const branch=req.query.sucursal_id;let c;
 try{
  if(!branch)throw new Error('Selecciona una sucursal.');
  await ensureBranchAccess(pool,req.user,branch);
  const requested=Number(req.query.page||1);if(!Number.isSafeInteger(requested)||requested<1)throw new Error('Página inválida.');
  const snapshot=req.query.snapshot||null;if(snapshot&&!Number.isFinite(Date.parse(snapshot)))throw new Error('Fecha de consulta inválida.');
  c=await pool.connect();await c.query('begin isolation level repeatable read read only');
  const clock=(await c.query("select (now() at time zone 'America/Lima')::date::text today,case when ($1::timestamptz at time zone 'America/Lima')::date=(now() at time zone 'America/Lima')::date then least($1::timestamptz,now()) else now() end::text snapshot",[snapshot])).rows[0];
  const params=[req.user.empresa_id,branch,clock.today,clock.snapshot];
  const where="v.empresa_id=$1 and v.sucursal_id=$2 and v.created_at >= ($3::date::timestamp at time zone 'America/Lima') and v.created_at < (($3::date+1)::timestamp at time zone 'America/Lima') and v.created_at<=$4::timestamptz";
  const total=Number((await c.query('select count(*) n from ventas v where '+where,params)).rows[0].n);
  const pages=Math.max(1,Math.ceil(total/20)),page=Math.min(requested,pages);
  const rows=(await c.query("select v.id,v.created_at,v.numero,v.total,v.estado,to_char(v.created_at at time zone 'America/Lima','DD/MM/YYYY HH24:MI') fecha,coalesce(cl.nombres,'Consumidor final') cliente,u.nombre cajero from ventas v left join clientes cl on cl.id=v.cliente_id join usuarios u on u.id=v.usuario_id where "+where+' order by v.created_at desc,v.id desc limit 20 offset $5',[...params,(page-1)*20])).rows;
  await c.query('commit');res.json({rows,total,page,pages,page_size:20,date:clock.today,snapshot:clock.snapshot});
 }catch(e){if(c)await c.query('rollback');res.status(e.status||400).json({error:e.message});}finally{c?.release();}
});

app.post('/api/sales', requireAuth, async (req, res) => {
  try {
    await ensureReturnsSchema(pool);
    const { sucursal_id, sesion_caja_id, cliente_id=null, tipo_comprobante='BOLETA', items=[], pagos=[] } = req.body || {};
    if (!sucursal_id || !Array.isArray(items) || !items.length || !Array.isArray(pagos) || !pagos.length) throw new Error('Sucursal, productos y pago son obligatorios.');
    const result = await tx(async c => {
      await ensureBranchAccess(c, req.user, sucursal_id);
      if(cliente_id){const cl=await c.query(`select id from clientes where id=$1 and empresa_id=$2 and activo=true`,[cliente_id,req.user.empresa_id]);if(!cl.rows[0])throw new Error('Cliente inválido para esta empresa.');}
      if(sesion_caja_id){
        const cash = await c.query(`select sc.id from sesiones_caja sc join cajas ca on ca.id=sc.caja_id where sc.id=$1 and ca.sucursal_id=$2 and sc.usuario_id=$3 and sc.estado='ABIERTA' for update`, [sesion_caja_id,sucursal_id,req.user.sub]);
        if (!cash.rows[0]) throw new Error('La caja indicada no está abierta para este usuario.');
      }
      let subtotal=0;
      const normalized = items.map(i=>{const cantidad=numeric(i.cantidad,'Cantidad'), precio=numeric(i.precio_unitario,'Precio'),factor=numeric(i.factor_unidades??1,'Equivalencia'); if(cantidad<=0||precio<0||factor<=0||!i.producto_id) throw new Error('Producto, cantidad, equivalencia y precio inválidos.'); const line=money(cantidad*precio);subtotal=money(subtotal+line);return {...i,cantidad,precio,factor,tipo_venta:String(i.tipo_venta||'UNIDAD').trim().toUpperCase(),line};});
      for(const item of normalized)await validateSalePresentation(c,req.user.empresa_id,sucursal_id,item);
      const discount=money(numeric(req.body.descuento||0,'Descuento')); if(discount<0||discount>subtotal) throw new Error('Descuento inválido.');
      const total=money(subtotal-discount); const paid=money(pagos.reduce((s,p)=>s+numeric(p.monto,'Pago'),0)); if(Math.abs(paid-total)>0.009) throw new Error(`Los pagos (${paid.toFixed(2)}) deben sumar el total (${total.toFixed(2)}).`);
      for(const productId of [...new Set(normalized.map(i=>i.producto_id))].sort())
        await prepareStockCosts(c,{empresaId:req.user.empresa_id,sucursalId:sucursal_id,productoId:productId});
      const sale = await c.query(`insert into ventas(empresa_id,sucursal_id,sesion_caja_id,cliente_id,tipo_comprobante,subtotal,descuento,total,usuario_id) values($1,$2,$3,$4,$5,$6,$7,$8,$9) returning *`, [req.user.empresa_id,sucursal_id,sesion_caja_id,cliente_id,tipo_comprobante,subtotal,discount,total,req.user.sub]);
      for (const i of normalized) {
        if(!(await c.query(`select 1 from producto_sucursal ps join productos p on p.id=ps.producto_id where ps.producto_id=$1 and ps.sucursal_id=$2 and ps.activo and p.empresa_id=$3 for update of ps`,[i.producto_id,sucursal_id,req.user.empresa_id])).rowCount)throw new Error('Producto no activo en esta sucursal.');
        let remaining=Number((i.cantidad*i.factor).toFixed(3));
        const lots=await c.query(`select l.id,l.cantidad_disponible,l.costo_unitario,l.fecha_vencimiento,
          l.valor_base_costos+coalesce((select sum(mi.cantidad*coalesce(mi.costo_unitario,0)) from movimientos_inventario mi where mi.lote_id=l.id and mi.producto_id=l.producto_id and mi.sucursal_id=l.sucursal_id),0) valor_disponible
          from lotes l where l.producto_id=$1 and l.sucursal_id=$2 and l.cantidad_disponible>0 order by l.fecha_vencimiento asc nulls last,l.id for update of l`, [i.producto_id,sucursal_id]);
        const available=lots.rows.reduce((sum,lot)=>sum+Number(lot.cantidad_disponible),0);
        if(remaining>available){
          // Shortfall is unassigned stock: no fabricated batch number or expiry.
          // Keep the regular detail/movement path so every unit is deducted once.
          const unassigned=await c.query(`insert into lotes(producto_id,sucursal_id,numero_lote,fecha_vencimiento,costo_unitario,cantidad_inicial,cantidad_disponible)
            values($1,$2,null,null,0,0,0) on conflict(producto_id,sucursal_id,numero_lote)
            do update set numero_lote=excluded.numero_lote returning id,costo_unitario`,[i.producto_id,sucursal_id]);
          lots.rows.push({...unassigned.rows[0],costo_unitario:0,cantidad_disponible:Number((remaining-available).toFixed(3))});
        }
        for(const lot of lots.rows){if(remaining<=0)break;const take=Math.min(remaining,Number(lot.cantidad_disponible));const saleQty=take/i.factor;const lineTotal=money(saleQty*i.precio);const costPresentation=lot.costo_unitario;await c.query(`update lotes set cantidad_disponible=cantidad_disponible-$2 where id=$1`,[lot.id,take]);await c.query(`insert into venta_detalles(venta_id,producto_id,lote_id,cantidad,precio_unitario,descuento,costo_snapshot,total,factor_unidades,presentacion_venta,cantidad_base) values($1,$2,$3,$4,$5,0,case when $11::numeric>0 and $12::numeric>0 then $12::numeric*$8::numeric/$11::numeric else $6::numeric*$8::numeric end,$7,$8,$9,$10)`,[sale.rows[0].id,i.producto_id,lot.id,saleQty,i.precio,costPresentation,lineTotal,i.factor,i.tipo_venta,take,lot.cantidad_disponible,lot.valor_disponible||'0']);await c.query(`insert into movimientos_inventario(empresa_id,sucursal_id,producto_id,lote_id,tipo,cantidad,costo_unitario,referencia_tipo,referencia_id,usuario_id) values($1,$2,$3,$4,'VENTA',$5,$6,'VENTA',$7,$8)`,[req.user.empresa_id,sucursal_id,i.producto_id,lot.id,-take,lot.costo_unitario,sale.rows[0].id,req.user.sub]);remaining=Number((remaining-take).toFixed(3));}
      }
      await c.query(`with parts as (
        select id,round($2::numeric*total/nullif(sum(total) over(),0),2) part,row_number() over(order by id desc) last_row from venta_detalles where venta_id=$1
      ), exact as (select id,case when last_row=1 then coalesce(part,0)+$2::numeric-coalesce(sum(part) over(),0) else coalesce(part,0) end amount from parts)
      update venta_detalles vd set importe_neto=e.amount from exact e where vd.id=e.id`,[sale.rows[0].id,total]);
      await assertSaleProfitability(c,sale.rows[0].id,req.user.empresa_id);
      for(const productId of [...new Set(normalized.map(i=>i.producto_id))].sort())
        await reconcileStockCosts(c,{empresaId:req.user.empresa_id,sucursalId:sucursal_id,productoId:productId,usuarioId:req.user.sub,referenciaTipo:'VENTA',referenciaId:sale.rows[0].id});
      for(const p of pagos){const amount=money(numeric(p.monto,'Pago'));if(amount<=0)throw new Error('El pago debe ser mayor que cero.');await c.query(`insert into venta_pagos(venta_id,metodo,monto,referencia) values($1,$2,$3,$4)`,[sale.rows[0].id,p.metodo,amount,p.referencia||null]);if(sesion_caja_id){await c.query(`insert into movimientos_caja(sesion_caja_id,tipo,concepto,metodo,monto,usuario_id) values($1,'INGRESO',$2,$3,$4,$5)`,[sesion_caja_id,`Venta ${sale.rows[0].id}`,p.metodo,amount,req.user.sub]);}}
      await writeAudit(c,req.user,'REGISTRAR_VENTA','ventas',sale.rows[0].id,{sucursal_id,total});
      return sale.rows[0];
    });
    res.status(201).json(result);
  } catch (error) { res.status(error.status||400).json({ error: error.message,...(error.code?{code:error.code}:{}),...(error.productos?{productos:error.productos}:{}) }); }
});


async function ensureAdvancedSettings(db){
  if(runtimeSchemaReady) return;
  await db.query(`alter table empresas add column if not exists logo_data text, add column if not exists web varchar(180), add column if not exists slogan varchar(220), add column if not exists departamento varchar(100), add column if not exists provincia varchar(100), add column if not exists distrito varchar(100)`);
  await db.query(`create table if not exists empresa_config_avanzada(
    empresa_id uuid primary key references empresas(id) on delete cascade,
    exigir_apertura_caja boolean not null default false,
    mostrar_aviso_caja boolean not null default true,
    saldo_inicial_sugerido numeric(12,2) not null default 200,
    impresion_automatica boolean not null default false,
    mostrar_cajero_ticket boolean not null default true,
    documentos_config jsonb not null default '{}'::jsonb,
    updated_at timestamptz not null default now()
  )`);
  await db.query(`alter table empresa_config_avanzada add column if not exists documentos_config jsonb not null default '{}'::jsonb`);
}
app.get('/api/settings', requireAuth, async (req,res)=>{
  try{
    await ensureAdvancedSettings(pool);
    const { rows }=await pool.query(`select e.ruc,e.razon_social,e.nombre_comercial,e.telefono,e.email,e.direccion_fiscal,e.logo_data,e.web,e.slogan,e.departamento,e.provincia,e.distrito,
      coalesce(ec.moneda,'PEN') moneda,coalesce(ec.impresion_ancho_mm,80) impresion_ancho_mm,coalesce(ec.mensaje_ticket,'Gracias por su compra') mensaje_ticket,
      coalesce(a.exigir_apertura_caja,false) exigir_apertura_caja,coalesce(a.mostrar_aviso_caja,true) mostrar_aviso_caja,
      coalesce(a.saldo_inicial_sugerido,200) saldo_inicial_sugerido,coalesce(a.impresion_automatica,false) impresion_automatica,
      coalesce(a.mostrar_cajero_ticket,true) mostrar_cajero_ticket,coalesce(a.documentos_config,'{}'::jsonb) documentos_config
      from empresas e left join empresa_config ec on ec.empresa_id=e.id left join empresa_config_avanzada a on a.empresa_id=e.id where e.id=$1`,[req.user.empresa_id]);
    res.json(rows[0]||null);
  }catch(error){res.status(400).json({error:error.message});}
});

app.put('/api/settings', requireAuth, async (req,res)=>{
  try{
    const b=req.body||{};
    const result=await tx(async c=>{
      const role=await c.query(`select 1 from usuario_sucursal us join roles r on r.id=us.rol_id where us.usuario_id=$1 and r.nombre='Administrador' limit 1`,[req.user.sub]);
      if(!role.rows[0]){const e=new Error('Solo un administrador puede cambiar la configuración.');e.status=403;throw e;}
      await ensureAdvancedSettings(c);
      if(Object.keys(b).some(k=>['razon_social','ruc','nombre_comercial','telefono','email','direccion_fiscal','logo_data','web','slogan','departamento','provincia','distrito'].includes(k))){
        await c.query(`update empresas set razon_social=coalesce($2,razon_social),ruc=coalesce($3,ruc),nombre_comercial=coalesce($4,nombre_comercial),telefono=coalesce($5,telefono),email=coalesce($6,email),direccion_fiscal=coalesce($7,direccion_fiscal),logo_data=coalesce($8,logo_data),web=coalesce($9,web),slogan=coalesce($10,slogan),departamento=coalesce($11,departamento),provincia=coalesce($12,provincia),distrito=coalesce($13,distrito) where id=$1`,[req.user.empresa_id,b.razon_social??null,b.ruc??null,b.nombre_comercial??null,b.telefono??null,b.email??null,b.direccion_fiscal??null,b.logo_data??null,b.web??null,b.slogan??null,b.departamento??null,b.provincia??null,b.distrito??null]);
      }
      if('mensaje_ticket' in b || 'impresion_ancho_mm' in b){
        const current=await c.query(`select mensaje_ticket,impresion_ancho_mm from empresa_config where empresa_id=$1`,[req.user.empresa_id]); const x=current.rows[0]||{};
        const ticketWidth=Number(b.impresion_ancho_mm??x.impresion_ancho_mm??80);
        if(!VALID_TICKET_WIDTHS.has(ticketWidth)) throw new Error('El ancho de impresión debe ser 58 mm, 80 mm o A4 (210 mm).');
        await c.query(`insert into empresa_config(empresa_id,mensaje_ticket,impresion_ancho_mm) values($1,$2,$3) on conflict(empresa_id) do update set mensaje_ticket=excluded.mensaje_ticket,impresion_ancho_mm=excluded.impresion_ancho_mm,updated_at=now()`,[req.user.empresa_id,b.mensaje_ticket??x.mensaje_ticket??'Gracias por su compra',ticketWidth]);
      }
      const cur=await c.query(`select * from empresa_config_avanzada where empresa_id=$1`,[req.user.empresa_id]); const a=cur.rows[0]||{};
      await c.query(`insert into empresa_config_avanzada(empresa_id,exigir_apertura_caja,mostrar_aviso_caja,saldo_inicial_sugerido,impresion_automatica,mostrar_cajero_ticket,documentos_config) values($1,$2,$3,$4,$5,$6,$7::jsonb)
        on conflict(empresa_id) do update set exigir_apertura_caja=excluded.exigir_apertura_caja,mostrar_aviso_caja=excluded.mostrar_aviso_caja,saldo_inicial_sugerido=excluded.saldo_inicial_sugerido,impresion_automatica=excluded.impresion_automatica,mostrar_cajero_ticket=excluded.mostrar_cajero_ticket,documentos_config=excluded.documentos_config,updated_at=now()`,[req.user.empresa_id,b.exigir_apertura_caja??a.exigir_apertura_caja??false,b.mostrar_aviso_caja??a.mostrar_aviso_caja??true,Number(b.saldo_inicial_sugerido??a.saldo_inicial_sugerido??200),b.impresion_automatica??a.impresion_automatica??false,b.mostrar_cajero_ticket??a.mostrar_cajero_ticket??true,JSON.stringify(b.documentos_config??a.documentos_config??{})]);
      await writeAudit(c,req.user,'ACTUALIZAR_CONFIG','empresa_config',req.user.empresa_id,{secciones:Object.keys(b)});
      return {ok:true};
    }); res.json(result);
  }catch(error){res.status(error.status||400).json({error:error.message});}
});

// ===== v27.1: devoluciones y anulaciones de ventas =====
async function ensureReturnsSchema(db){
  if(runtimeSchemaReady) return;
  await db.query(`alter table venta_detalles add column if not exists factor_unidades numeric(14,3) not null default 1`);
  await db.query(`alter table venta_detalles add column if not exists presentacion_venta varchar(60)`);
  await db.query(`create table if not exists devoluciones_venta(
    id uuid primary key default gen_random_uuid(), venta_id uuid not null references ventas(id), empresa_id uuid not null references empresas(id),
    sucursal_id uuid not null references sucursales(id), tipo varchar(20) not null check(tipo in ('PARCIAL','TOTAL')),
    motivo varchar(240) not null, metodo_reembolso varchar(30) not null, monto numeric(14,2) not null check(monto>0),
    usuario_id uuid not null references usuarios(id), created_at timestamptz not null default now()
  )`);
  await db.query(`create table if not exists devolucion_venta_detalles(
    id uuid primary key default gen_random_uuid(), devolucion_id uuid not null references devoluciones_venta(id) on delete cascade,
    venta_detalle_id uuid not null references venta_detalles(id), cantidad numeric(14,3) not null check(cantidad>0),
    monto numeric(14,2) not null, unique(devolucion_id,venta_detalle_id)
  )`);
  await db.query(`create index if not exists idx_devoluciones_venta on devoluciones_venta(venta_id,created_at)`);
}

app.get('/api/sales/:id/returns', requireAuth, async (req,res)=>{
  try{
    await ensureReturnsSchema(pool);
    const sale=await pool.query(`select id,sucursal_id,total,subtotal,estado from ventas where id=$1 and empresa_id=$2`,[req.params.id,req.user.empresa_id]);
    if(!sale.rows[0]) return res.status(404).json({error:'Venta no encontrada.'});
    await ensureBranchAccess(pool,req.user,sale.rows[0].sucursal_id);
    const {rows}=await pool.query(`select d.id,d.tipo,d.motivo,d.metodo_reembolso,d.monto,d.created_at,u.nombre usuario,
      coalesce(json_agg(json_build_object('venta_detalle_id',dd.venta_detalle_id,'cantidad',dd.cantidad,'monto',dd.monto,'producto',p.nombre)) filter(where dd.id is not null),'[]') items
      from devoluciones_venta d left join usuarios u on u.id=d.usuario_id left join devolucion_venta_detalles dd on dd.devolucion_id=d.id
      left join venta_detalles vd on vd.id=dd.venta_detalle_id left join productos p on p.id=vd.producto_id
      where d.venta_id=$1 group by d.id,u.nombre order by d.created_at desc`,[req.params.id]);
    res.json(rows);
  }catch(error){res.status(error.status||400).json({error:error.message});}
});

app.post('/api/sales/:id/return', requireAuth, async (req,res)=>{
  try{
    const {tipo='PARCIAL',motivo='',metodo_reembolso='',items=[],sesion_caja_id=null}=req.body||{};
    if(!String(motivo).trim()) throw new Error('Indica el motivo de la devolución o anulación.');
    if(!String(metodo_reembolso).trim()) throw new Error('Selecciona el método de reembolso.');
    const result=await tx(async c=>{
      await ensureReturnsSchema(c);
      const q=await c.query(`select * from ventas where id=$1 and empresa_id=$2 for update`,[req.params.id,req.user.empresa_id]);
      const sale=q.rows[0]; if(!sale) throw new Error('Venta no encontrada.');
      await ensureBranchAccess(c,req.user,sale.sucursal_id);
      const refundCash=await c.query(`select sc.id from sesiones_caja sc join cajas ca on ca.id=sc.caja_id
        where ca.sucursal_id=$1 and ca.activo=true and sc.usuario_id=$2 and sc.estado='ABIERTA'
        and ($3::uuid is null or sc.id=$3) order by sc.abierto_en desc limit 1 for update of sc`,[sale.sucursal_id,req.user.sub,sesion_caja_id]);
      if(!refundCash.rows[0]) throw new Error('Abre una caja en la sucursal de la venta para registrar el reembolso.');
      if(sale.estado==='ANULADA') throw new Error('Esta venta ya está anulada totalmente.');
      // v28.4: una ANULACIÓN TOTAL solo puede realizarse el mismo día de la venta (hora Perú).
      // La validación vive en el servidor para que no pueda saltarse desde el navegador.
      if(String(tipo).toUpperCase()==='TOTAL'){
        const sameDay=await c.query(`select ((created_at at time zone 'America/Lima')::date = (now() at time zone 'America/Lima')::date) ok from ventas where id=$1`,[sale.id]);
        if(!sameDay.rows[0]?.ok) throw new Error('La anulación total solo se puede realizar el mismo día de la venta.');
      }
      const details=await c.query(`select vd.*,coalesce(nullif(vd.factor_unidades,0),1) factor,p.nombre,coalesce(vd.presentacion_venta,p.unidad_medida,'UNIDAD') presentacion_venta from venta_detalles vd join productos p on p.id=vd.producto_id where vd.venta_id=$1 order by vd.id for update`,[sale.id]);
      const prev=await c.query(`select dd.venta_detalle_id,coalesce(sum(dd.cantidad),0) cantidad,coalesce(sum(dd.cantidad_base),0) cantidad_base,coalesce(sum(dd.monto),0) monto from devolucion_venta_detalles dd join devoluciones_venta d on d.id=dd.devolucion_id where d.venta_id=$1 group by dd.venta_detalle_id`,[sale.id]);
      const returned=new Map(prev.rows.map(x=>[x.venta_detalle_id,Number(x.cantidad)]));
      let requested=[];
      if(String(tipo).toUpperCase()==='TOTAL'){
        requested=details.rows.map(d=>({venta_detalle_id:d.id,cantidad:Number(d.cantidad)-Number(returned.get(d.id)||0)})).filter(x=>x.cantidad>0.000001);
      }else{
        if(!Array.isArray(items)||!items.length) throw new Error('Selecciona al menos un producto para devolver.');
        requested=items.map(x=>({venta_detalle_id:x.venta_detalle_id,cantidad:numeric(x.cantidad,'Cantidad a devolver')}));
      }
      if(!requested.length) throw new Error('No quedan productos pendientes de devolución.');
      let refund=0; const normalized=[]; const seen=new Set();
      for(const x of requested){
        if(seen.has(x.venta_detalle_id)) throw new Error('El producto está repetido en la devolución.');
        seen.add(x.venta_detalle_id);
        const d=details.rows.find(z=>z.id===x.venta_detalle_id); if(!d) throw new Error('Uno de los productos no pertenece a esta venta.');
        const already=Number(returned.get(d.id)||0), max=Number(d.cantidad)-already;
        if(x.cantidad<=0||x.cantidad>max+0.000001) throw new Error(`Cantidad inválida para ${d.nombre}. Máximo disponible para devolver: ${max}.`);
        const previous=prev.rows.find(r=>r.venta_detalle_id===d.id)||{};
        const qty=Math.min(x.cantidad,max), complete=Math.abs(qty-max)<1e-10;
        const netLine=money((complete?Number(d.importe_neto):money((already+qty)/Number(d.cantidad)*Number(d.importe_neto)))-Number(previous.monto||0));
        const baseQty=Number(((complete?Number(d.cantidad_base):Number(((already+qty)/Number(d.cantidad)*Number(d.cantidad_base)).toFixed(3)))-Number(previous.cantidad_base||0)).toFixed(3));
        if(baseQty<=0) throw new Error('La cantidad a devolver es menor que la precisión del inventario.');
        refund=money(refund+netLine); normalized.push({d,qty,netLine,baseQty});
      }
      if(refund<0) throw new Error('El monto de devolución no puede ser negativo.');
      const dv=await c.query(`insert into devoluciones_venta(venta_id,empresa_id,sucursal_id,tipo,motivo,metodo_reembolso,monto,usuario_id,sesion_reembolso_id) values($1,$2,$3,$4,$5,$6,$7,$8,$9) returning *`,[sale.id,req.user.empresa_id,sale.sucursal_id,String(tipo).toUpperCase()==='TOTAL'?'TOTAL':'PARCIAL',String(motivo).trim(),String(metodo_reembolso).trim(),refund,req.user.sub,refundCash.rows[0].id]);
      for(const x of normalized){
        const {netLine,baseQty}=x;
        await c.query(`insert into devolucion_venta_detalles(devolucion_id,venta_detalle_id,cantidad,monto,cantidad_base) values($1,$2,$3,$4,$5)`,[dv.rows[0].id,x.d.id,x.qty,netLine,baseQty]);

        if(x.d.lote_id){await applyPositiveStockEntry(c,{empresaId:req.user.empresa_id,sucursalId:sale.sucursal_id,productoId:x.d.producto_id,loteId:x.d.lote_id,cantidad:baseQty,costoUnitario:(await c.query('select $1::numeric / $2::numeric costo',[x.d.costo_snapshot||'0',x.d.factor||'1'])).rows[0].costo,tipo:'DEVOLUCION_VENTA',referenciaTipo:'DEVOLUCION',referenciaId:dv.rows[0].id,usuarioId:req.user.sub});}
      }
      if(refund>0){await c.query(`insert into movimientos_caja(sesion_caja_id,tipo,concepto,metodo,monto,usuario_id) values($1,'EGRESO',$2,$3,$4,$5)`,[refundCash.rows[0].id,`${String(tipo).toUpperCase()==='TOTAL'?'Anulación':'Devolución'} venta ${sale.id}`,String(metodo_reembolso).trim(),refund,req.user.sub]);}
      const rem=await c.query(`select coalesce(sum(vd.cantidad-coalesce(r.cantidad,0)),0) restante from venta_detalles vd left join (select dd.venta_detalle_id,sum(dd.cantidad) cantidad from devolucion_venta_detalles dd join devoluciones_venta d on d.id=dd.devolucion_id where d.venta_id=$1 group by dd.venta_detalle_id) r on r.venta_detalle_id=vd.id where vd.venta_id=$1`,[sale.id]);
      const newState=Number(rem.rows[0].restante)<=0.000001?'ANULADA':'DEVOLUCION_PARCIAL';
      await c.query(`update ventas set estado=$2 where id=$1`,[sale.id,newState]);
      await writeAudit(c,req.user,newState==='ANULADA'?'ANULAR_VENTA':'DEVOLVER_VENTA','ventas',sale.id,{devolucion_id:dv.rows[0].id,monto:refund,motivo:String(motivo).trim()});
      return {...dv.rows[0],estado_venta:newState};
    });
    res.status(201).json(result);
  }catch(error){res.status(error.status||400).json({error:error.message});}
});

app.get('/api/sales/:id/receipt', requireAuth, async (req,res)=>{
  await ensureReturnsSchema(pool);
  const h=await pool.query(`select v.id,v.serie,v.numero,v.tipo_comprobante,v.subtotal,v.descuento,v.total,v.estado,v.created_at,coalesce(c.nombres,'Público en general') cliente,coalesce(c.nro_doc,'') nro_doc,
      s.id sucursal_id,s.nombre sucursal,s.direccion,s.telefono sucursal_telefono,u.nombre vendedor,e.ruc,e.razon_social,e.nombre_comercial,e.telefono,e.direccion_fiscal,e.logo_data,e.web,e.slogan,e.departamento,e.provincia,e.distrito,
      coalesce(ec.mensaje_ticket,'Gracias por su compra') mensaje_ticket,coalesce(ec.impresion_ancho_mm,80) impresion_ancho_mm,coalesce(eca.documentos_config,'{}'::jsonb) documentos_config
    from ventas v join sucursales s on s.id=v.sucursal_id join usuarios u on u.id=v.usuario_id join empresas e on e.id=v.empresa_id left join clientes c on c.id=v.cliente_id
    left join empresa_config ec on ec.empresa_id=e.id left join empresa_config_avanzada eca on eca.empresa_id=e.id where v.id=$1 and v.empresa_id=$2`,[req.params.id,req.user.empresa_id]);
  if(!h.rows[0])return res.status(404).json({error:'Venta no encontrada.'});
  try{await ensureBranchAccess(pool,req.user,h.rows[0].sucursal_id);}catch(error){return res.status(error.status||400).json({error:error.message});}
  const [d,p]=await Promise.all([
    pool.query(`select vd.id venta_detalle_id,vd.producto_id,p.codigo_interno,p.nombre,vd.cantidad,coalesce(vd.factor_unidades,1) factor_unidades,coalesce(vd.presentacion_venta,p.unidad_medida,'UNIDAD') presentacion_venta,vd.precio_unitario,vd.descuento,
      case when vd.costo_snapshot>0 then vd.costo_snapshot else coalesce(nullif(vd.factor_unidades,0),1)*coalesce(
        (select mi0.costo_unitario from movimientos_inventario mi0 where mi0.referencia_tipo='VENTA' and mi0.referencia_id=v.id and mi0.producto_id=vd.producto_id and (vd.lote_id is null or mi0.lote_id=vd.lote_id) and mi0.costo_unitario>0 order by mi0.id desc limit 1),
        (select cd.costo_unitario from compra_detalles cd join compras c on c.id=cd.compra_id where cd.producto_id=vd.producto_id and c.sucursal_id=v.sucursal_id and cd.costo_unitario>0 and c.created_at<=v.created_at order by c.fecha desc,c.created_at desc,cd.id desc limit 1),
        (select mi.costo_unitario from movimientos_inventario mi where mi.producto_id=vd.producto_id and mi.sucursal_id=v.sucursal_id and mi.costo_unitario>0 and mi.created_at<=v.created_at and mi.tipo not in ('VENTA','AJUSTE_EXCEL_STOCK') order by mi.created_at desc,mi.id desc limit 1),
        (select l2.costo_unitario from lotes l2 where l2.producto_id=vd.producto_id and l2.sucursal_id=v.sucursal_id and l2.costo_unitario>0 order by case when l2.numero_lote='AJUSTE-EXCEL' then 1 else 0 end,l2.id desc limit 1),0) end::numeric(14,4) costo_snapshot,
      vd.total,(vd.total-vd.cantidad*(case when vd.costo_snapshot>0 then vd.costo_snapshot else coalesce(nullif(vd.factor_unidades,0),1)*coalesce(
        (select mi0.costo_unitario from movimientos_inventario mi0 where mi0.referencia_tipo='VENTA' and mi0.referencia_id=v.id and mi0.producto_id=vd.producto_id and (vd.lote_id is null or mi0.lote_id=vd.lote_id) and mi0.costo_unitario>0 order by mi0.id desc limit 1),
        (select cd.costo_unitario from compra_detalles cd join compras c on c.id=cd.compra_id where cd.producto_id=vd.producto_id and c.sucursal_id=v.sucursal_id and cd.costo_unitario>0 and c.created_at<=v.created_at order by c.fecha desc,c.created_at desc,cd.id desc limit 1),
        (select mi.costo_unitario from movimientos_inventario mi where mi.producto_id=vd.producto_id and mi.sucursal_id=v.sucursal_id and mi.costo_unitario>0 and mi.created_at<=v.created_at and mi.tipo not in ('VENTA','AJUSTE_EXCEL_STOCK') order by mi.created_at desc,mi.id desc limit 1),
        (select l2.costo_unitario from lotes l2 where l2.producto_id=vd.producto_id and l2.sucursal_id=v.sucursal_id and l2.costo_unitario>0 order by case when l2.numero_lote='AJUSTE-EXCEL' then 1 else 0 end,l2.id desc limit 1),0) end))::numeric(14,2) utilidad,l.numero_lote
      from venta_detalles vd join ventas v on v.id=vd.venta_id join productos p on p.id=vd.producto_id left join lotes l on l.id=vd.lote_id where vd.venta_id=$1 order by vd.id`,[req.params.id]),
    pool.query(`select metodo,monto,referencia from venta_pagos where venta_id=$1 order by id`,[req.params.id])
  ]);
  await ensureReturnsSchema(pool);
  const rr=await pool.query(`select dd.venta_detalle_id,coalesce(sum(dd.cantidad),0)::numeric(14,3) cantidad from devolucion_venta_detalles dd join devoluciones_venta dv on dv.id=dd.devolucion_id where dv.venta_id=$1 group by dd.venta_detalle_id`,[req.params.id]);
  const rm=new Map(rr.rows.map(x=>[x.venta_detalle_id,Number(x.cantidad)]));
  d.rows.forEach(x=>{x.cantidad_devuelta=rm.get(x.venta_detalle_id)||0;x.cantidad_devolvible=Math.max(0,Number(x.cantidad)-x.cantidad_devuelta)});
  res.json({venta:h.rows[0],items:d.rows,pagos:p.rows});
});

app.get('/api/dashboard', requireAuth, async (req, res) => {
  try{
    const branch = req.query.sucursal_id || null;
    if(branch) await ensureBranchAccess(pool,req.user,branch);
    const params=[req.user.empresa_id,branch];
    const [sales,low,exp,expired,exp30,week,payments,recent]=await Promise.all([
      pool.query(`select coalesce(sum(total),0)::numeric(14,2) ventas,count(*)::int tickets from reporte_ventas_netas where empresa_id=$1 and estado IN ('EMITIDA','DEVOLUCION_PARCIAL') and (created_at at time zone 'America/Lima')::date=(now() at time zone 'America/Lima')::date and ($2::uuid is null or sucursal_id=$2)`,params),
      branch?lowStockCount(pool,req.user.empresa_id,branch):pool.query(`select count(*)::int cantidad from (select p.id,coalesce(sum(l.cantidad_disponible),0) stock,coalesce((select ps.stock_minimo from producto_sucursal ps where ps.producto_id=p.id and ps.sucursal_id=$2),p.stock_minimo) stock_minimo from productos p left join lotes l on l.producto_id=p.id and ($2::uuid is null or l.sucursal_id=$2) where ($2::uuid is null or exists(select 1 from producto_sucursal ps where ps.producto_id=p.id and ps.sucursal_id=$2 and ps.activo=true)) and p.empresa_id=$1 and ($2::uuid is not null or p.activo=true) group by p.id having coalesce(sum(l.cantidad_disponible),0)<=coalesce((select ps.stock_minimo from producto_sucursal ps where ps.producto_id=p.id and ps.sucursal_id=$2),p.stock_minimo)) x`,params),
      pool.query(`select count(*)::int cantidad from lotes l join productos p on p.id=l.producto_id where ($2::uuid is null or exists(select 1 from producto_sucursal ps where ps.producto_id=p.id and ps.sucursal_id=$2 and ps.activo=true)) and p.empresa_id=$1 and l.cantidad_disponible>0 and l.fecha_vencimiento between current_date and current_date+interval '90 days' and ($2::uuid is null or l.sucursal_id=$2)`,params),
      pool.query(`select count(*)::int cantidad from lotes l join productos p on p.id=l.producto_id where ($2::uuid is null or exists(select 1 from producto_sucursal ps where ps.producto_id=p.id and ps.sucursal_id=$2 and ps.activo=true)) and p.empresa_id=$1 and l.cantidad_disponible>0 and l.fecha_vencimiento<current_date and ($2::uuid is null or l.sucursal_id=$2)`,params),
      pool.query(`select count(*)::int cantidad from lotes l join productos p on p.id=l.producto_id where ($2::uuid is null or exists(select 1 from producto_sucursal ps where ps.producto_id=p.id and ps.sucursal_id=$2 and ps.activo=true)) and p.empresa_id=$1 and l.cantidad_disponible>0 and l.fecha_vencimiento between current_date and current_date+interval '30 days' and ($2::uuid is null or l.sucursal_id=$2)`,params),
      pool.query(`with dias as (select generate_series((now() at time zone 'America/Lima')::date-6,(now() at time zone 'America/Lima')::date,'1 day')::date fecha) select to_char(d.fecha,'Dy') dia,to_char(d.fecha,'YYYY-MM-DD') fecha,coalesce(sum(v.total),0)::numeric(14,2) total from dias d left join reporte_ventas_netas v on (v.created_at at time zone 'America/Lima')::date=d.fecha and v.empresa_id=$1 and v.estado IN ('EMITIDA','DEVOLUCION_PARCIAL') and ($2::uuid is null or v.sucursal_id=$2) group by d.fecha order by d.fecha`,params),
      pool.query(`select vp.metodo,coalesce(sum(vp.monto),0)::numeric(14,2) total from reporte_pagos_netos vp join reporte_ventas_netas v on v.id=vp.venta_id where v.empresa_id=$1 and v.estado IN ('EMITIDA','DEVOLUCION_PARCIAL') and (v.created_at at time zone 'America/Lima')::date=(now() at time zone 'America/Lima')::date and ($2::uuid is null or v.sucursal_id=$2) group by vp.metodo order by total desc`,params),
      pool.query(`select v.id,v.created_at,v.total,coalesce(c.nombres,'Público en general') cliente from reporte_ventas_netas v left join clientes c on c.id=v.cliente_id where v.empresa_id=$1 and v.estado IN ('EMITIDA','DEVOLUCION_PARCIAL') and ($2::uuid is null or v.sucursal_id=$2) order by v.created_at desc limit 5`,params)
    ]);
    const dias={Mon:'Lun',Tue:'Mar',Wed:'Mié',Thu:'Jue',Fri:'Vie',Sat:'Sáb',Sun:'Dom'};
    const semana=week.rows.map(x=>({...x,dia:dias[String(x.dia).trim()]||String(x.dia).trim()}));
    res.json({ventas_hoy:sales.rows[0].ventas,tickets:sales.rows[0].tickets,stock_bajo:low.rows[0].cantidad,por_vencer:exp.rows[0].cantidad,vencidos:expired.rows[0].cantidad,vencer_30:exp30.rows[0].cantidad,semana,pagos:payments.rows,ultimas_ventas:recent.rows});
  }catch(error){res.status(error.status||400).json({error:error.message});}
});


// ===== v5: Maestros administrables e inventario avanzado =====
async function requireAnyBranchRole(db,user,allowed=['Administrador']) {
  const q=await db.query(`select r.nombre from usuario_sucursal us join roles r on r.id=us.rol_id join sucursales s on s.id=us.sucursal_id where us.usuario_id=$1 and s.empresa_id=$2 and s.activo=true`,[user.sub,user.empresa_id]);
  const roles=q.rows.map(x=>x.nombre);
  if(!roles.some(r=>allowed.includes(r))){const e=new Error('No tienes permisos para esta operación.');e.status=403;throw e;}
}

app.get('/api/catalogs', requireAuth, async (req,res)=>{
  const [c,l]=await Promise.all([
    pool.query(`select id,nombre from categorias c where empresa_id=$1 and coalesce((to_jsonb(c)->>'activo')::boolean,true) order by nombre`,[req.user.empresa_id]),
    pool.query(`select id,nombre from laboratorios c where empresa_id=$1 and coalesce((to_jsonb(c)->>'activo')::boolean,true) order by nombre`,[req.user.empresa_id])
  ]);
  res.json({categorias:c.rows,laboratorios:l.rows});
});


async function nextProductCode(db, empresaId, lock=false) {
  if(lock) await db.query(`select pg_advisory_xact_lock(hashtext($1::text), 91001)`,[empresaId]);
  const q=await db.query(`select coalesce(max((substring(codigo_interno from '^P([0-9]+)$'))::bigint),0)+1 siguiente from productos where empresa_id=$1`,[empresaId]);
  return 'P'+String(q.rows[0].siguiente).padStart(6,'0');
}

const normalizeProductName=value=>String(value||'').trim().replace(/\s+/g,' ');
const normalizeProductBarcode=value=>String(value||'').trim();
function productDuplicateError(kind,product){
  const error=new Error(kind==='barcode'
    ? `Este código de barras ya está registrado en el producto: ${product.nombre}`
    : `Ya existe un producto con el mismo nombre: ${product.nombre}`);
  error.status=409;return error;
}
async function productIdentityMatches(db,empresaId,{nombre,codigo_barras},excludeId=null){
  const cleanName=normalizeProductName(nombre),cleanBarcode=normalizeProductBarcode(codigo_barras);
  const barcode=cleanBarcode?(await db.query(`select id,codigo_interno,codigo_barras,nombre from productos where empresa_id=$1 and ($2::uuid is null or id<>$2) and btrim(codigo_barras)=$3 order by created_at,id limit 1`,[empresaId,excludeId,cleanBarcode])).rows[0]:null;
  const name=cleanName?(await db.query(`select id,codigo_interno,codigo_barras,nombre from productos where empresa_id=$1 and ($2::uuid is null or id<>$2) and lower(regexp_replace(btrim(nombre),'\\s+',' ','g'))=$3 order by created_at,id limit 1`,[empresaId,excludeId,cleanName.toLowerCase()])).rows[0]:null;
  return {cleanName,cleanBarcode,barcode,name};
}
async function assertProductIdentityAvailable(db,empresaId,input,excludeId=null){
  const match=await productIdentityMatches(db,empresaId,input,excludeId);
  if(match.barcode)throw productDuplicateError('barcode',match.barcode);
  if(match.name)throw productDuplicateError('name',match.name);
  return match;
}

app.get('/api/admin/products/next-code', requireAuth, async (req,res)=>{
  try{await requireAnyBranchRole(pool,req.user,['Administrador','Almacén']);res.json({codigo_interno:await nextProductCode(pool,req.user.empresa_id,false)});}catch(error){res.status(error.status||400).json({error:error.message});}
});

app.get('/api/admin/products', requireAuth, async (req,res)=>{
  const branch=req.query.sucursal_id;
  try{await ensureBranchAccess(pool,req.user,branch);}catch(e){return res.status(e.status||400).json({error:e.message});}
  const includeInactive=String(req.query.include_inactive||'false')==='true';
  const q=String(req.query.q||'').trim();
  const {rows}=await pool.query(`
    select p.id,p.codigo_interno,p.codigo_barras,p.nombre,p.principio_activo,p.concentracion,p.presentacion,p.unidad_medida,
           ps.stock_minimo,ps.stock_maximo,p.requiere_lote,ps.activo,p.categoria_id,c.nombre categoria,p.laboratorio_id,l.nombre laboratorio,
           coalesce((select pp.precio_venta from precios_producto pp where pp.producto_id=p.id and pp.vigente_hasta is null and (pp.sucursal_id=$4 or pp.sucursal_id is null) and pp.factor_unidades=1 order by pp.sucursal_id nulls last,pp.vigente_desde desc limit 1),0)::numeric(14,2) precio,
           coalesce((select jsonb_agg(jsonb_build_object('id',pp.id,'tipo',pp.tipo,'factor_unidades',pp.factor_unidades,'precio_venta',pp.precio_venta) order by pp.factor_unidades,pp.tipo)
             from precios_producto pp where pp.producto_id=p.id and (pp.sucursal_id=$4 or (pp.sucursal_id is null and not exists(select 1 from precios_producto local where local.producto_id=p.id and local.sucursal_id=$4 and local.vigente_hasta is null and local.tipo=pp.tipo and local.factor_unidades=pp.factor_unidades))) and pp.vigente_hasta is null and pp.factor_unidades>1),'[]'::jsonb) equivalencias
      from productos p join producto_sucursal ps on ps.producto_id=p.id and ps.sucursal_id=$4 left join categorias c on c.id=p.categoria_id left join laboratorios l on l.id=p.laboratorio_id
     where ($4::uuid is null or exists(select 1 from producto_sucursal ps where ps.producto_id=p.id and ps.sucursal_id=$4)) and p.empresa_id=$1 and ($2 or ps.activo=true)
       and ($3='' or p.nombre ilike '%'||$3||'%' or p.codigo_interno ilike '%'||$3||'%' or coalesce(p.codigo_barras,'') ilike '%'||$3||'%')
     order by p.nombre limit 5000`,[req.user.empresa_id,includeInactive,q,branch]);
  res.json(rows);
});

function normalizeEquivalences(input){
  if(input===undefined||input===null)return [];
  if(!Array.isArray(input))throw new Error('Las equivalencias deben enviarse como una lista.');
  const seen=new Set();
  return input.map((x,idx)=>{
    const tipo=String(x?.tipo||'').trim().toUpperCase();
    const factor=numeric(x?.factor_unidades,`Equivalencia ${idx+1}`);
    const precio=numeric(x?.precio_venta,`Precio equivalencia ${idx+1}`);
    if(!tipo)throw new Error(`Indica el nombre de la equivalencia ${idx+1}.`);
    if(factor<=1)throw new Error(`La equivalencia ${tipo} debe contener más de 1 unidad base.`);
    if(precio<0)throw new Error(`El precio de ${tipo} no puede ser negativo.`);
    const key=tipo+'|'+factor; if(seen.has(key))throw new Error(`La equivalencia ${tipo} x ${factor} está repetida.`); seen.add(key);
    return {tipo,factor_unidades:factor,precio_venta:precio};
  });
}

app.post('/api/catalogs/:kind',requireAuth,async(req,res)=>{
 try{
  await requireAnyBranchRole(pool,req.user,['Administrador','Almacén']);
  const kind=req.params.kind,table=['categorias','laboratorios'].includes(kind)?kind:null;
  if(!table)throw new Error('Catálogo inválido.');
  const nombre=String(req.body?.nombre??'').trim().replace(/\s+/g,' '),limit=kind==='categorias'?100:120;
  if(!nombre||nombre.length>limit)throw new Error('Ingrese un nombre de 1 a '+limit+' caracteres.');
  const result=await tx(async c=>{
   // Serialize catalog writes, including concurrent imports, without changing existing records.
   await c.query('lock table '+table+' in share row exclusive mode');
   const duplicate=await c.query('select id from '+table+" where empresa_id=$1 and lower(regexp_replace(btrim(nombre),'\\s+',' ','g'))=lower($2) limit 1",[req.user.empresa_id,nombre]);
   if(duplicate.rowCount){const error=new Error('Ya existe '+(kind==='categorias'?'una categoría':'un laboratorio')+' con ese nombre.');error.status=409;throw error;}
   return (await c.query('insert into '+table+'(empresa_id,nombre) values($1,$2) returning id,nombre',[req.user.empresa_id,nombre])).rows[0];
  });res.status(201).json(result);
 }catch(error){res.status(error.status||400).json({error:error.message});}
});

const PRODUCT_FORM_UNITS = new Set(['UNIDAD','BLISTER','CAJA','PAQUETE','DOCENA','FRASCO','BOTELLA','SOBRE','TUBO','AMPOLLA','VIAL','BOLSA','TABLETA','CAPSULA','GRAMO','MILILITRO']);
async function validateProductFormFields(db,user,b,{create=false}={}){
 const required=[...(create?[['codigo_interno','Código de producto']]:[]),['nombre','Nombre del producto'],['unidad_medida','Unidad de medida'],['stock_minimo','Stock mínimo'],['precio','Precio de venta']];
 const missing=required.filter(([key])=>!String(b[key]??'').trim()).map(([,label])=>label);
 if(missing.length)throw new Error('Complete los campos obligatorios: '+missing.join(', ')+'.');
 if(create){
  b.codigo_interno=String(b.codigo_interno).trim();
  if(b.codigo_interno.length>40||b.codigo_interno==='Generando…')throw new Error('Código de producto inválido.');
 }
 b.unidad_medida=String(b.unidad_medida).trim();
 if(create&&!PRODUCT_FORM_UNITS.has(b.unidad_medida))throw new Error('Selecciona una unidad de medida válida.');
 for(const [key,label] of [['stock_minimo','Stock mínimo'],['precio','Precio de venta'],['stock_maximo','Stock máximo']]){
  if(key==='stock_maximo'&&!String(b[key]??'').trim()){b[key]=0;continue;}
  const value=b[key],text=String(value).trim();
  if(!['number','string'].includes(typeof value)||!/^[-+]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][-+]?\d+)?$/.test(text)||!Number.isFinite(Number(value))||Number(value)<0)throw new Error(label+' inválido.');
 }
 for(const key of ['codigo_barras','principio_activo','concentracion','presentacion'])b[key]=String(b[key]??'').trim()||null;
 for(const [table,key,label] of [['categorias','categoria_id','Categoría'],['laboratorios','laboratorio_id','Laboratorio']]){
  b[key]=String(b[key]??'').trim()||null;
  if(b[key]===null)continue;
  const found=await db.query('select id from '+table+" c where id=$1 and empresa_id=$2 and coalesce((to_jsonb(c)->>'activo')::boolean,true)",[b[key],user.empresa_id]);
  if(!found.rowCount)throw new Error(label+' inválido o no disponible.');
 }
}

app.post('/api/admin/products', requireAuth, async (req,res)=>{
  try{
    await requireAnyBranchRole(pool,req.user,['Administrador','Almacén']);
    const b={...(req.body||{})}; await validateProductFormFields(pool,req.user,b,{create:true}); await ensureBranchAccess(pool,req.user,b.sucursal_id); const max=numeric(b.stock_maximo??0,'Stock máximo');if(max<0)throw new Error('Stock máximo inválido.'); if(!String(b.nombre||'').trim()) throw new Error('El nombre del producto es obligatorio.');
    if(!String(b.unidad_medida||'').trim()) throw new Error('Selecciona la unidad de medida.');
    const min=numeric(b.stock_minimo??0,'Stock mínimo'); const price=numeric(b.precio??0,'Precio'); const equivalencias=normalizeEquivalences(b.equivalencias); if(min<0||price<0) throw new Error('Stock mínimo y precio no pueden ser negativos.');
    const result=await tx(async c=>{
      await c.query(`select pg_advisory_xact_lock(hashtext($1::text),91001)`,[req.user.empresa_id]);
      const identity=await assertProductIdentityAvailable(c,req.user.empresa_id,b);
      const codigo=b.codigo_interno;
      if((await c.query('select 1 from productos where empresa_id=$1 and btrim(codigo_interno)=$2',[req.user.empresa_id,codigo])).rowCount){
        const error=new Error('Ya existe un producto con ese código. Genera un código nuevo antes de guardar.');error.status=409;throw error;
      }
      const q=await c.query(`insert into productos(empresa_id,codigo_interno,codigo_barras,nombre,principio_activo,concentracion,presentacion,unidad_medida,categoria_id,laboratorio_id,stock_minimo,requiere_lote)
        values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) returning *`,[req.user.empresa_id,codigo,identity.cleanBarcode||null,identity.cleanName,b.principio_activo||null,b.concentracion||null,b.presentacion||null,String(b.unidad_medida).trim(),b.categoria_id||null,b.laboratorio_id||null,min,b.requiere_lote!==false]);
      await c.query(`insert into precios_producto(producto_id,tipo,factor_unidades,precio_venta,sucursal_id) values($1,$2,1,$3,$4)`,[q.rows[0].id,String(b.unidad_medida).trim().toUpperCase(),price,b.sucursal_id]);
      for(const e of equivalencias) await c.query(`insert into precios_producto(producto_id,tipo,factor_unidades,precio_venta,sucursal_id) values($1,$2,$3,$4,$5)`,[q.rows[0].id,e.tipo,e.factor_unidades,e.precio_venta,b.sucursal_id]);
      await linkProduct(c,q.rows[0].id,b.sucursal_id,{stock_minimo:min,stock_maximo:max});
      await writeAudit(c,req.user,'CREAR_PRODUCTO','productos',q.rows[0].id,{codigo_interno:codigo,nombre:b.nombre,precio:price,equivalencias});
      return q.rows[0];
    });
    res.status(201).json(result);
  }catch(error){if(error.code==='23505')return res.status(409).json({error:'Ya existe un producto con ese código o identificador. Vuelve a intentar.'});res.status(error.status||400).json({error:error.message});}
});

app.put('/api/admin/products/:id', requireAuth, async (req,res)=>{
  try{
    await requireAnyBranchRole(pool,req.user,['Administrador','Almacén']); const b=req.body||{}; await validateProductFormFields(pool,req.user,b); await ensureBranchAccess(pool,req.user,b.sucursal_id); const max=numeric(b.stock_maximo??0,'Stock máximo');if(max<0)throw new Error('Stock máximo inválido.');
    const min=numeric(b.stock_minimo??0,'Stock mínimo'); const price=numeric(b.precio??0,'Precio'); const equivalencias=normalizeEquivalences(b.equivalencias); if(min<0||price<0) throw new Error('Stock mínimo y precio no pueden ser negativos.');
    const result=await tx(async c=>{
      await c.query(`select pg_advisory_xact_lock(hashtext($1::text),91001)`,[req.user.empresa_id]);
      if(!(await c.query('select 1 from producto_sucursal where producto_id=$1 and sucursal_id=$2',[req.params.id,b.sucursal_id])).rowCount)throw new Error('Producto no vinculado a esta sucursal.');
      if(!String(b.nombre||'').trim()) throw new Error('El nombre del producto es obligatorio.');
      if(!String(b.unidad_medida||'').trim()) throw new Error('Selecciona la unidad de medida.');
      const identity=await assertProductIdentityAvailable(c,req.user.empresa_id,b,req.params.id);
      const q=await c.query(`update productos set codigo_barras=$3,nombre=$4,principio_activo=$5,concentracion=$6,presentacion=$7,unidad_medida=$8,categoria_id=$9,laboratorio_id=$10,stock_minimo=stock_minimo,requiere_lote=$12,updated_at=now()
        where id=$1 and empresa_id=$2 and $11::numeric>=0 returning *`,[req.params.id,req.user.empresa_id,identity.cleanBarcode||null,identity.cleanName,b.principio_activo||null,b.concentracion||null,b.presentacion||null,String(b.unidad_medida).trim(),b.categoria_id||null,b.laboratorio_id||null,min,b.requiere_lote!==false]);
      if(!q.rows[0]) throw new Error('Producto no encontrado.');
      await c.query(`update precios_producto set vigente_hasta=now() where producto_id=$1 and sucursal_id=$2 and vigente_hasta is null`,[req.params.id,b.sucursal_id]);
      await c.query(`insert into precios_producto(producto_id,tipo,factor_unidades,precio_venta,sucursal_id) values($1,$2,1,$3,$4)`,[req.params.id,String(b.unidad_medida).trim().toUpperCase(),price,b.sucursal_id]);
      for(const e of equivalencias) await c.query(`insert into precios_producto(producto_id,tipo,factor_unidades,precio_venta,sucursal_id) values($1,$2,$3,$4,$5)`,[req.params.id,e.tipo,e.factor_unidades,e.precio_venta,b.sucursal_id]);
      await linkProduct(c,req.params.id,b.sucursal_id,{stock_minimo:min,stock_maximo:max});
      await writeAudit(c,req.user,'EDITAR_PRODUCTO','productos',req.params.id,{precio:price,equivalencias}); return q.rows[0];
    }); res.json(result);
  }catch(error){res.status(error.status||400).json({error:error.message});}
});

app.patch('/api/admin/products/:id/status', requireAuth, async (req,res)=>{
  try{
    await requireAnyBranchRole(pool,req.user,['Administrador']);
    await ensureBranchAccess(pool,req.user,req.body?.sucursal_id);
    const active=!!req.body?.activo;
    if(active){
      const own=await pool.query(`select nombre from productos where id=$1 and empresa_id=$2`,[req.params.id,req.user.empresa_id]);
      if(!own.rows[0])throw new Error('Producto no encontrado.');
      const nombreNormalizado=String(own.rows[0].nombre||'').trim().replace(/\s+/g,' ').toLowerCase();
      const dup=await pool.query(`select codigo_interno,nombre from productos where empresa_id=$1 and id<>$2 and activo=true and lower(regexp_replace(btrim(nombre),'\\s+',' ','g'))=$3 limit 1`,[req.user.empresa_id,req.params.id,nombreNormalizado]);
      if(dup.rows[0])throw new Error(`No se puede reactivar: ya existe un producto activo con ese nombre (${dup.rows[0].codigo_interno}).`);
    }
    const q=await pool.query(`update producto_sucursal ps set activo=$3 from productos p where ps.producto_id=p.id and p.id=$1 and p.empresa_id=$2 and ps.sucursal_id=$4 returning p.id,ps.activo`,[req.params.id,req.user.empresa_id,active,req.body.sucursal_id]);
    if(!q.rows[0])throw new Error('Producto no encontrado.');
    await writeAudit(pool,req.user,active?'ACTIVAR_PRODUCTO':'DESACTIVAR_PRODUCTO','productos',req.params.id,{});
    res.json(q.rows[0]);
  }catch(error){res.status(error.status||400).json({error:error.message});}
});

app.get('/api/admin/products/:id/usage', requireAuth, async (req,res)=>{
  try{
    await ensureBranchAccess(pool,req.user,req.query.sucursal_id);
    await requireAnyBranchRole(pool,req.user,['Administrador']);
    const own=await pool.query(`select id,codigo_interno,nombre,activo from productos where id=$1 and empresa_id=$2`,[req.params.id,req.user.empresa_id]);
    if(!own.rows[0]) throw new Error('Producto no encontrado.');
    const tables=[
      ['otras_sucursales','producto_sucursal'],
      ['ventas','venta_detalles'],['compras','compra_detalles'],['lotes','lotes'],['movimientos','movimientos_inventario'],
      ['ajustes','ajustes_inventario'],['ordenes','orden_compra_detalles'],['solicitudes','solicitud_interna_detalles'],['transferencias','transferencia_detalles']
    ];
    const usage={};
    for(const [key,table] of tables){
      try{const q=await pool.query(`select count(*)::int cantidad from ${table} where producto_id=$1${table==='producto_sucursal'?' and sucursal_id<>$2':''}`,table==='producto_sucursal'?[req.params.id,req.query.sucursal_id]:[req.params.id]);usage[key]=q.rows[0]?.cantidad||0;}
      catch(e){if(e.code==='42P01')usage[key]=0;else throw e;}
    }
    const total=Object.values(usage).reduce((a,b)=>a+Number(b||0),0);
    res.json({...own.rows[0],usage,total_referencias:total,puede_eliminar:total===0});
  }catch(error){res.status(error.status||400).json({error:error.message});}
});

app.delete('/api/admin/products/:id', requireAuth, async (req,res)=>{
  try{
    await ensureBranchAccess(pool,req.user,req.query.sucursal_id);
    await requireAnyBranchRole(pool,req.user,['Administrador']);
    const result=await tx(async c=>{
      const own=await c.query(`select id,codigo_interno,nombre from productos where id=$1 and empresa_id=$2 for update`,[req.params.id,req.user.empresa_id]);
      if(!own.rows[0]) throw new Error('Producto no encontrado.');
      const refs=[
        'producto_sucursal',
        'venta_detalles','compra_detalles','lotes','movimientos_inventario','ajustes_inventario',
        'orden_compra_detalles','solicitud_interna_detalles','transferencia_detalles'
      ];
      for(const table of refs){
        try{const q=await c.query(`select 1 from ${table} where producto_id=$1${table==='producto_sucursal'?' and sucursal_id<>$2':''} limit 1`,table==='producto_sucursal'?[req.params.id,req.query.sucursal_id]:[req.params.id]);if(q.rows[0])throw new Error('Este producto tiene historial y no puede eliminarse. Desactívalo para conservar ventas, compras y Kardex.');}
        catch(e){if(e.code==='42P01')continue;throw e;}
      }
      await c.query(`delete from precios_producto where producto_id=$1`,[req.params.id]);
      await c.query(`delete from productos where id=$1 and empresa_id=$2`,[req.params.id,req.user.empresa_id]);
      await writeAudit(c,req.user,'ELIMINAR_PRODUCTO','productos',req.params.id,{codigo_interno:own.rows[0].codigo_interno,nombre:own.rows[0].nombre});
      return own.rows[0];
    });
    res.json({ok:true,producto:result});
  }catch(error){res.status(error.status||400).json({error:error.message});}
});


app.get('/api/admin/clients/by-doc/:doc',requireAuth,async(req,res)=>{
  try{
    const doc=String(req.params.doc||'').replace(/\D/g,'');
    if(!/^\d{8}$|^\d{11}$/.test(doc)) return res.status(400).json({error:'El documento debe tener 8 dígitos (DNI) u 11 dígitos (RUC).'});
    const {rows}=await pool.query(`select id,tipo_doc,nro_doc,nombres,telefono,email,direccion from clientes where empresa_id=$1 and activo=true and nro_doc=$2 order by updated_at desc nulls last limit 1`,[req.user.empresa_id,doc]);
    if(!rows[0]) return res.json(null);
    res.json(rows[0]);
  }catch(error){res.status(400).json({error:error.message});}
});

app.get('/api/admin/clients/by-dni/:dni',requireAuth,async(req,res)=>{
  try{
    const dni=String(req.params.dni||'').replace(/\D/g,'');
    if(!/^\d{8}$/.test(dni)) return res.status(400).json({error:'El DNI debe tener 8 dígitos.'});
    const {rows}=await pool.query(`select id,tipo_doc,nro_doc,nombres,telefono,email,direccion from clientes where empresa_id=$1 and activo=true and upper(coalesce(tipo_doc,'DNI'))='DNI' and nro_doc=$2 order by updated_at desc nulls last limit 1`,[req.user.empresa_id,dni]);
    if(!rows[0]) return res.json(null);
    res.json(rows[0]);
  }catch(error){res.status(400).json({error:error.message});}
});

for (const cfg of [
  {path:'clients',table:'clientes',name:'nombres',doc:'nro_doc',roles:['Administrador','Cajero / Vendedor']},
  {path:'suppliers',table:'proveedores',name:'razon_social',doc:'ruc',roles:['Administrador','Almacén']}
]) {
  app.get('/api/admin/'+cfg.path,requireAuth,async(req,res)=>{const q=String(req.query.q||'').trim();const {rows}=await pool.query(`select * from ${cfg.table} where empresa_id=$1 and activo=true and ($2='' or coalesce(${cfg.name},'') ilike '%'||$2||'%' or coalesce(${cfg.doc},'') ilike '%'||$2||'%' ${cfg.path==='suppliers'?"or coalesce(contacto,'') ilike '%'||$2||'%'":''}) order by ${cfg.name} nulls last ${cfg.path==='suppliers'?'':'limit 500'}`,[req.user.empresa_id,q]);res.json(rows)});
  app.post('/api/admin/'+cfg.path,requireAuth,async(req,res)=>{try{await requireAnyBranchRole(pool,req.user,cfg.roles);const b=req.body||{};b[cfg.name]=String(b[cfg.name]||'').trim();if(!b[cfg.name])throw new Error('Nombre / razón social es obligatorio.');let q;if(cfg.table==='clientes'){if(String(b.tipo_doc||'').toUpperCase()==='DNI'&&b.nro_doc){const dni=String(b.nro_doc).replace(/\D/g,'');if(!/^\d{8}$/.test(dni))throw new Error('El DNI debe tener 8 dígitos.');const dup=await pool.query(`select id,nombres from clientes where empresa_id=$1 and activo=true and upper(coalesce(tipo_doc,'DNI'))='DNI' and nro_doc=$2 limit 1`,[req.user.empresa_id,dni]);if(dup.rows[0])throw new Error('Ese DNI ya está registrado para '+(dup.rows[0].nombres||'otro cliente')+'.');b.nro_doc=dni;}q=await pool.query(`insert into clientes(empresa_id,tipo_doc,nro_doc,nombres,telefono,email,direccion) values($1,$2,$3,$4,$5,$6,$7) returning *`,[req.user.empresa_id,b.tipo_doc||null,b.nro_doc||null,b.nombres,b.telefono||null,b.email||null,b.direccion||null]);}else q=await pool.query(`insert into proveedores(empresa_id,ruc,razon_social,contacto,telefono,email,direccion) values($1,$2,$3,$4,$5,$6,$7) returning *`,[req.user.empresa_id,b.ruc||null,b.razon_social,b.contacto||null,b.telefono||null,b.email||null,b.direccion||null]);await writeAudit(pool,req.user,'CREAR_'+cfg.table.toUpperCase(),cfg.table,q.rows[0].id,{});res.status(201).json(q.rows[0]);}catch(error){res.status(error.status||400).json({error:error.message});}});
  app.put('/api/admin/'+cfg.path+'/:id',requireAuth,async(req,res)=>{try{await requireAnyBranchRole(pool,req.user,cfg.roles);const b=req.body||{};b[cfg.name]=String(b[cfg.name]||'').trim();if(!b[cfg.name])throw new Error('Nombre / razón social es obligatorio.');let q;if(cfg.table==='clientes'){if(String(b.tipo_doc||'').toUpperCase()==='DNI'&&b.nro_doc){const dni=String(b.nro_doc).replace(/\D/g,'');if(!/^\d{8}$/.test(dni))throw new Error('El DNI debe tener 8 dígitos.');const dup=await pool.query(`select id,nombres from clientes where empresa_id=$1 and activo=true and upper(coalesce(tipo_doc,'DNI'))='DNI' and nro_doc=$2 and id<>$3 limit 1`,[req.user.empresa_id,dni,req.params.id]);if(dup.rows[0])throw new Error('Ese DNI ya está registrado para '+(dup.rows[0].nombres||'otro cliente')+'.');b.nro_doc=dni;}q=await pool.query(`update clientes set tipo_doc=$3,nro_doc=$4,nombres=$5,telefono=$6,email=$7,direccion=$8,updated_at=now() where id=$1 and empresa_id=$2 returning *`,[req.params.id,req.user.empresa_id,b.tipo_doc||null,b.nro_doc||null,b.nombres,b.telefono||null,b.email||null,b.direccion||null]);}else q=await pool.query(`update proveedores set ruc=$3,razon_social=$4,contacto=$5,telefono=$6,email=$7,direccion=$8,updated_at=now() where id=$1 and empresa_id=$2 returning *`,[req.params.id,req.user.empresa_id,b.ruc||null,b.razon_social,b.contacto||null,b.telefono||null,b.email||null,b.direccion||null]);if(!q.rows[0])throw new Error('Registro no encontrado.');await writeAudit(pool,req.user,'EDITAR_'+cfg.table.toUpperCase(),cfg.table,req.params.id,{});res.json(q.rows[0]);}catch(error){res.status(error.status||400).json({error:error.message});}});
}

// Baja lógica: conserva las referencias de compras, órdenes y cualquier otro historial.
app.delete('/api/admin/suppliers/:id',requireAuth,async(req,res)=>{
  try {
    await requireAnyBranchRole(pool,req.user,['Administrador','Almacén']);
    if(!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(req.params.id))return res.status(400).json({error:'Proveedor inválido.'});
    const supplier=await tx(async db=>{
      const {rows}=await db.query(`update proveedores set activo=false,updated_at=now() where id=$1 and empresa_id=$2 and activo=true returning id,razon_social,activo`,[req.params.id,req.user.empresa_id]);
      if(!rows[0])throw Object.assign(new Error('Proveedor no encontrado o ya inactivo.'),{status:404});
      await writeAudit(db,req.user,'DESACTIVAR_PROVEEDORES','proveedores',rows[0].id,{activo:false});
      return rows[0];
    });
    res.json({...supplier,message:'Proveedor dado de baja. Sus compras y órdenes históricas se conservan.'});
  } catch(error){res.status(error.status||400).json({error:error.message});}
});

app.get('/api/inventory/summary',requireAuth,async(req,res)=>{
  try{const branch=req.query.sucursal_id;await ensureBranchAccess(pool,req.user,branch);
    res.json(await inventorySummary(pool,req.user.empresa_id,branch));
  }catch(error){res.status(error.status||400).json({error:error.message});}
});

app.get('/api/inventory/export.xlsx',requireAuth,async(req,res)=>{
  try{const branch=req.query.sucursal_id;await ensureBranchAccess(pool,req.user,branch);
    const data=await inventoryWorkbook(pool,req.user.empresa_id,branch);
    res.setHeader('Content-Type','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition','attachment; filename="Inventario_'+branch+'.xlsx"');res.send(data);
  }catch(error){res.status(error.status||400).json({error:error.message});}
});

app.get('/api/inventory/lots',requireAuth,async(req,res)=>{
  const branch=req.query.sucursal_id;try{await ensureBranchAccess(pool,req.user,branch);}catch(error){return res.status(error.status||400).json({error:error.message});}
  const days=Math.max(1,Math.min(365,Number(req.query.days||90)));
  const {rows}=await pool.query(`select l.id,p.codigo_interno,p.nombre,l.numero_lote,l.fecha_vencimiento,l.cantidad_disponible,l.costo_unitario,
    case when l.fecha_vencimiento is null then null else (l.fecha_vencimiento-current_date) end dias_para_vencer
    from lotes l join productos p on p.id=l.producto_id where l.sucursal_id=$1 and p.empresa_id=$2 and l.cantidad_disponible>0
      and (l.fecha_vencimiento is null or l.fecha_vencimiento<=current_date+($3::int*interval '1 day')) order by l.fecha_vencimiento nulls last,p.nombre`,[branch,req.user.empresa_id,days]);res.json(rows);
});

app.get('/api/inventory/alerts',requireAuth,async(req,res)=>{
  try{
    const branch=req.query.sucursal_id;await ensureBranchAccess(pool,req.user,branch);
    const days=Math.max(1,Math.min(365,Number(req.query.days||90)));
    const q=String(req.query.q||'').trim();
    const low=await pool.query(`select p.id,p.codigo_interno,p.nombre,coalesce((select ps.stock_minimo from producto_sucursal ps where ps.producto_id=p.id and ps.sucursal_id=$2),p.stock_minimo) stock_minimo,coalesce(sum(l.cantidad_disponible),0)::numeric(14,3) stock,
      greatest(coalesce((select ps.stock_minimo from producto_sucursal ps where ps.producto_id=p.id and ps.sucursal_id=$2),p.stock_minimo)*2-coalesce(sum(l.cantidad_disponible),0),0)::numeric(14,3) sugerido
      from productos p left join lotes l on l.producto_id=p.id and l.sucursal_id=$2
      where ($2::uuid is null or exists(select 1 from producto_sucursal ps where ps.producto_id=p.id and ps.sucursal_id=$2 and ps.activo=true)) and p.empresa_id=$1 and ($2::uuid is not null or p.activo=true) and coalesce((select ps.stock_minimo from producto_sucursal ps where ps.producto_id=p.id and ps.sucursal_id=$2),p.stock_minimo)>0
      group by p.id having coalesce(sum(l.cantidad_disponible),0)<=coalesce((select ps.stock_minimo from producto_sucursal ps where ps.producto_id=p.id and ps.sucursal_id=$2),p.stock_minimo) order by stock,p.nombre limit 200`,[req.user.empresa_id,branch]);
    const exp=await pool.query(`select l.id,p.codigo_interno,p.nombre,l.numero_lote,l.fecha_vencimiento,l.cantidad_disponible,(l.fecha_vencimiento-current_date)::int dias_para_vencer
      from lotes l join productos p on p.id=l.producto_id
      where ($2::uuid is null or exists(select 1 from producto_sucursal ps where ps.producto_id=p.id and ps.sucursal_id=$2 and ps.activo=true)) and p.empresa_id=$1 and l.sucursal_id=$2 and p.activo=true and l.cantidad_disponible>0 and l.fecha_vencimiento is not null
        and l.fecha_vencimiento<=current_date+($3::int*interval '1 day')
        and ($4='' or p.nombre ilike '%'||$4||'%' or p.codigo_interno ilike '%'||$4||'%' or coalesce(l.numero_lote,'') ilike '%'||$4||'%')
      order by l.fecha_vencimiento,p.nombre limit 500`,[req.user.empresa_id,branch,days,q]);
    const meta=await pool.query(`select
      count(*) filter(where coalesce((select ps.stock_minimo from producto_sucursal ps where ps.producto_id=p.id and ps.sucursal_id=$2),p.stock_minimo)>0)::int productos_con_minimo,
      count(*) filter(where coalesce(trim(p.unidad_medida),'')='')::int unidades_vacias
      from productos p where ($2::uuid is null or exists(select 1 from producto_sucursal ps where ps.producto_id=p.id and ps.sucursal_id=$2 and ps.activo=true)) and p.empresa_id=$1 and ($2::uuid is not null or p.activo=true)`,[req.user.empresa_id,branch]);
    const lots=await pool.query(`select
      count(*) filter(where l.fecha_vencimiento is not null)::int lotes_con_fecha,
      count(*) filter(where l.fecha_vencimiento is not null and l.cantidad_disponible>0)::int lotes_con_fecha_y_stock,
      count(*) filter(where l.numero_lote='AJUSTE-EXCEL' and l.cantidad_disponible>0)::int lotes_ajuste_excel
      from lotes l join productos p on p.id=l.producto_id where ($2::uuid is null or exists(select 1 from producto_sucursal ps where ps.producto_id=p.id and ps.sucursal_id=$2 and ps.activo=true)) and p.empresa_id=$1 and l.sucursal_id=$2`,[req.user.empresa_id,branch]);
    res.json({stock_bajo:low.rows,por_vencer:exp.rows,dias:days,diagnostico:{...meta.rows[0],...lots.rows[0]}});
  }catch(error){res.status(error.status||400).json({error:'Alertas: '+error.message});}
});

// v23.4: diagnóstico y reparación conservadora de metadatos de inventario.
// NO cambia el stock total de ningún producto ni ventas históricas.
app.get('/api/inventory/repair-preview',requireAuth,async(req,res)=>{
  try{
    const branch=req.query.sucursal_id;await ensureBranchAccess(pool,req.user,branch);await requireAnyBranchRole(pool,req.user,['Administrador','Almacén']);
    const units=await pool.query(`select count(*)::int cantidad from productos where empresa_id=$1 and activo=true and coalesce(trim(unidad_medida),'')=''`,[req.user.empresa_id]);
    const recover=await pool.query(`with reducciones as (
        select mi.producto_id,mi.lote_id,sum(-mi.cantidad)::numeric recuperable
        from movimientos_inventario mi join lotes l on l.id=mi.lote_id
        join productos p on p.id=mi.producto_id
        where p.empresa_id=$1 and mi.sucursal_id=$2 and mi.tipo='AJUSTE_EXCEL_STOCK' and mi.cantidad<0 and l.fecha_vencimiento is not null
        group by mi.producto_id,mi.lote_id
      ), donors as (
        select producto_id,sum(cantidad_disponible)::numeric disponible from lotes
        where sucursal_id=$2 and numero_lote='AJUSTE-EXCEL' and cantidad_disponible>0 group by producto_id
      )
      select count(distinct r.producto_id)::int productos,coalesce(sum(least(r.recuperable,d.disponible)),0)::numeric unidades_posibles
      from reducciones r join donors d on d.producto_id=r.producto_id`,[req.user.empresa_id,branch]);
    const min=await pool.query(`select count(*) filter(where stock_minimo>0)::int configurados,count(*) filter(where stock_minimo=0)::int en_cero from productos where empresa_id=$1 and activo=true`,[req.user.empresa_id]);
    res.json({unidades_vacias:units.rows[0].cantidad,productos_vencimiento_recuperable:recover.rows[0].productos,unidades_vencimiento_recuperables:Number(recover.rows[0].unidades_posibles||0),stock_minimo:min.rows[0]});
  }catch(error){res.status(error.status||400).json({error:error.message});}
});

app.post('/api/inventory/repair-metadata',requireAuth,async(req,res)=>{
  try{
    const branch=req.body?.sucursal_id;await ensureBranchAccess(pool,req.user,branch);await requireAnyBranchRole(pool,req.user,['Administrador','Almacén']);
    const result=await tx(async c=>{
      await c.query(`select pg_advisory_xact_lock(hashtext($1::text),91024)`,[req.user.empresa_id]);
      // 1) Solo completa unidades vacías; nunca reemplaza una unidad existente.
      const unitFix=await c.query(`update productos p set unidad_medida=coalesce((
          select upper(pp.tipo) from precios_producto pp where pp.producto_id=p.id and pp.factor_unidades=1 and pp.vigente_hasta is null
          order by pp.vigente_desde desc limit 1),'UNIDAD'),updated_at=now()
        where p.empresa_id=$1 and p.activo=true and coalesce(trim(p.unidad_medida),'')='' returning p.id`,[req.user.empresa_id]);
      // 2) Recupera solamente cantidades de lotes con vencimiento que fueron reducidas por AJUSTE_EXCEL_STOCK,
      // tomando unidades del lote AJUSTE-EXCEL del MISMO producto. El total del producto permanece idéntico.
      const products=await c.query(`select distinct mi.producto_id from movimientos_inventario mi join lotes l on l.id=mi.lote_id join productos p on p.id=mi.producto_id
        where p.empresa_id=$1 and mi.sucursal_id=$2 and mi.tipo='AJUSTE_EXCEL_STOCK' and mi.cantidad<0 and l.fecha_vencimiento is not null`,[req.user.empresa_id,branch]);
      let productsFixed=0,qtyMoved=0;
      for(const pr of products.rows){
        const donorQ=await c.query(`select id,cantidad_disponible,costo_unitario from lotes where producto_id=$1 and sucursal_id=$2 and numero_lote='AJUSTE-EXCEL' and cantidad_disponible>0 for update`,[pr.producto_id,branch]);
        let donor=donorQ.rows[0];if(!donor)continue;let available=Number(donor.cantidad_disponible||0),movedProduct=0;
        const targets=await c.query(`select l.id,l.costo_unitario,l.cantidad_disponible,l.fecha_vencimiento,coalesce(sum(-mi.cantidad),0)::numeric recuperable
          from lotes l join movimientos_inventario mi on mi.lote_id=l.id and mi.producto_id=l.producto_id and mi.sucursal_id=l.sucursal_id
          where l.producto_id=$1 and l.sucursal_id=$2 and l.fecha_vencimiento is not null and mi.tipo='AJUSTE_EXCEL_STOCK' and mi.cantidad<0
          group by l.id order by l.fecha_vencimiento asc,l.id`,[pr.producto_id,branch]);
        for(const t of targets.rows){if(available<=0.0001)break;const q=Math.min(available,Number(t.recuperable||0));if(q<=0)continue;
          await c.query(`update lotes set cantidad_disponible=cantidad_disponible+$2 where id=$1`,[t.id,q]);
          await c.query(`update lotes set cantidad_disponible=cantidad_disponible-$2 where id=$1`,[donor.id,q]);
          await c.query(`insert into movimientos_inventario(empresa_id,sucursal_id,producto_id,lote_id,tipo,cantidad,costo_unitario,referencia_tipo,usuario_id) values($1,$2,$3,$4,'REASIGNACION_METADATOS',$5,$6,'REPARACION_V23_4',$7)`,[req.user.empresa_id,branch,pr.producto_id,t.id,q,t.costo_unitario||donor.costo_unitario||0,req.user.sub]);
          await c.query(`insert into movimientos_inventario(empresa_id,sucursal_id,producto_id,lote_id,tipo,cantidad,costo_unitario,referencia_tipo,usuario_id) values($1,$2,$3,$4,'REASIGNACION_METADATOS',$5,$6,'REPARACION_V23_4',$7)`,[req.user.empresa_id,branch,pr.producto_id,donor.id,-q,donor.costo_unitario||0,req.user.sub]);
          available-=q;movedProduct+=q;qtyMoved+=q;
        }
        if(movedProduct>0)productsFixed++;
      }
      await writeAudit(c,req.user,'REPARAR_METADATOS_INVENTARIO','lotes',null,{sucursal_id:branch,unidades_completadas:unitFix.rowCount,productos_vencimientos:productsFixed,unidades_reasignadas:Number(qtyMoved.toFixed(3))});
      return {unidades_medida_completadas:unitFix.rowCount,productos_vencimiento_recuperados:productsFixed,unidades_reasignadas:Number(qtyMoved.toFixed(3))};
    });
    res.json(result);
  }catch(error){res.status(error.status||400).json({error:error.message});}
});



// ===== v6: Órdenes de compra, costos y reposición inteligente =====
registerPurchaseRequirements(app,{db:pool,auth:requireAuth,branchAccess:ensureBranchAccess});

app.get('/api/purchasing/replenishment', requireAuth, async (req,res)=>{
  const branch=req.query.sucursal_id; const coverage=Math.max(1,Math.min(90,Number(req.query.coverage_days||14)));
  try{await ensureBranchAccess(pool,req.user,branch);}catch(error){return res.status(error.status||400).json({error:error.message});}
  const {rows}=await pool.query(`
    with stock as (
      select p.id producto_id,coalesce(sum(l.cantidad_disponible),0)::numeric stock
      from productos p left join lotes l on l.producto_id=p.id and l.sucursal_id=$2
      where ($2::uuid is null or exists(select 1 from producto_sucursal ps where ps.producto_id=p.id and ps.sucursal_id=$2 and ps.activo=true)) and p.empresa_id=$1 and ($2::uuid is not null or p.activo=true) group by p.id
    ), sales30 as (
      select vd.producto_id,coalesce(sum(vd.cantidad),0)::numeric unidades
      from venta_detalles vd join ventas v on v.id=vd.venta_id
      where v.empresa_id=$1 and v.sucursal_id=$2 and v.estado='EMITIDA' and v.created_at>=now()-interval '30 days'
      group by vd.producto_id
    ), pending as (
      select d.producto_id,coalesce(sum(d.cantidad),0)::numeric cantidad
      from orden_compra_detalles d join ordenes_compra o on o.id=d.orden_compra_id
      where o.empresa_id=$1 and o.sucursal_id=$2 and o.estado in ('BORRADOR','ENVIADA') group by d.producto_id
    )
    select p.id,p.codigo_interno,p.nombre,coalesce((select ps.stock_minimo from producto_sucursal ps where ps.producto_id=p.id and ps.sucursal_id=$2),p.stock_minimo) stock_minimo,coalesce(s.stock,0)::numeric(14,3) stock,
      coalesce(v.unidades,0)::numeric(14,3) venta_30d,
      round(coalesce(v.unidades,0)/30.0,3) promedio_diario,
      coalesce(pn.cantidad,0)::numeric(14,3) pedido_pendiente,
      greatest(ceil(greatest(coalesce((select ps.stock_minimo from producto_sucursal ps where ps.producto_id=p.id and ps.sucursal_id=$2),p.stock_minimo)*2,(coalesce(v.unidades,0)/30.0)*$3)-coalesce(s.stock,0)-coalesce(pn.cantidad,0)),0)::numeric(14,3) sugerido,
      coalesce((select cd.costo_unitario from compra_detalles cd join compras c on c.id=cd.compra_id where cd.producto_id=p.id and c.sucursal_id=$2 order by c.fecha desc,c.created_at desc limit 1),0)::numeric(14,4) ultimo_costo,
      coalesce((select cd.costo_unitario from compra_detalles cd join compras c on c.id=cd.compra_id where cd.producto_id=p.id and c.sucursal_id=$2 order by c.fecha desc,c.created_at desc offset 1 limit 1),0)::numeric(14,4) costo_anterior,
      coalesce((select pp.precio_venta from precios_producto pp where pp.producto_id=p.id and (pp.sucursal_id=$2 or pp.sucursal_id is null) and pp.vigente_hasta is null and pp.factor_unidades=1 order by pp.sucursal_id nulls last,pp.vigente_desde desc,pp.id desc limit 1),0)::numeric(14,2) precio_venta
    from productos p left join stock s on s.producto_id=p.id left join sales30 v on v.producto_id=p.id left join pending pn on pn.producto_id=p.id
    where ($2::uuid is null or exists(select 1 from producto_sucursal ps where ps.producto_id=p.id and ps.sucursal_id=$2 and ps.activo=true)) and p.empresa_id=$1 and ($2::uuid is not null or p.activo=true)
    order by sugerido desc,venta_30d desc,p.nombre limit 500`,[req.user.empresa_id,branch,coverage]);
  res.json(rows.map(r=>({...r,margen_pct:Number(r.precio_venta)>0?money((Number(r.precio_venta)-Number(r.ultimo_costo))/Number(r.precio_venta)*100):0,variacion_costo_pct:Number(r.costo_anterior)>0?money((Number(r.ultimo_costo)-Number(r.costo_anterior))/Number(r.costo_anterior)*100):0,cobertura_dias:coverage})));
});

app.get('/api/purchasing/no-movement', requireAuth, async (req,res)=>{
  const branch=req.query.sucursal_id; const days=Math.max(30,Math.min(365,Number(req.query.days||60)));
  try{await ensureBranchAccess(pool,req.user,branch);}catch(error){return res.status(error.status||400).json({error:error.message});}
  const {rows}=await pool.query(`with stock as (select producto_id,sum(cantidad_disponible)::numeric(14,3) stock from lotes where sucursal_id=$2 group by producto_id), last_sale as (select vd.producto_id,max(v.created_at) ultima_venta from venta_detalles vd join ventas v on v.id=vd.venta_id where v.empresa_id=$1 and v.sucursal_id=$2 and v.estado='EMITIDA' group by vd.producto_id) select p.id,p.codigo_interno,p.nombre,coalesce(s.stock,0)::numeric(14,3) stock,ls.ultima_venta,coalesce((current_date-ls.ultima_venta::date),$3)::int dias_sin_venta from productos p left join stock s on s.producto_id=p.id left join last_sale ls on ls.producto_id=p.id where ($2::uuid is null or exists(select 1 from producto_sucursal ps where ps.producto_id=p.id and ps.sucursal_id=$2 and ps.activo=true)) and p.empresa_id=$1 and ($2::uuid is not null or p.activo=true) and coalesce(s.stock,0)>0 and (ls.ultima_venta is null or ls.ultima_venta<now()-($3::int*interval '1 day')) order by dias_sin_venta desc,p.nombre limit 300`,[req.user.empresa_id,branch,days]); res.json(rows);
});

app.get('/api/purchasing/supplier-history', requireAuth, async (req,res)=>{
  const branch=req.query.sucursal_id; const supplier=req.query.proveedor_id||null;
  try{await ensureBranchAccess(pool,req.user,branch);}catch(error){return res.status(error.status||400).json({error:error.message});}
  const {rows}=await pool.query(`select c.id,c.fecha,c.tipo_documento,c.serie,c.numero,c.total,p.razon_social proveedor,count(cd.id)::int items
    from compras c left join proveedores p on p.id=c.proveedor_id left join compra_detalles cd on cd.compra_id=c.id
    where c.empresa_id=$1 and c.sucursal_id=$2 and ($3::uuid is null or c.proveedor_id=$3)
    group by c.id,p.razon_social order by c.fecha desc,c.created_at desc limit 100`,[req.user.empresa_id,branch,supplier]); res.json(rows);
});

app.get('/api/purchasing/cost-history/:productId', requireAuth, async (req,res)=>{
  const branch=req.query.sucursal_id; try{await ensureBranchAccess(pool,req.user,branch);}catch(error){return res.status(error.status||400).json({error:error.message});}
  const {rows}=await pool.query(`select c.fecha,p.razon_social proveedor,cd.costo_unitario,cd.cantidad
    from compra_detalles cd join compras c on c.id=cd.compra_id left join proveedores p on p.id=c.proveedor_id
    where c.empresa_id=$1 and c.sucursal_id=$2 and cd.producto_id=$3 order by c.fecha desc,c.created_at desc limit 20`,[req.user.empresa_id,branch,req.params.productId]); res.json(rows);
});

app.get('/api/purchase-orders', requireAuth, async (req,res)=>{
  const branch=req.query.sucursal_id; try{await ensureBranchAccess(pool,req.user,branch);}catch(error){return res.status(error.status||400).json({error:error.message});}
  const {rows}=await pool.query(`select o.id,o.fecha,o.estado,o.observaciones,o.total_estimado,o.created_at,p.razon_social proveedor,count(d.id)::int items
    from ordenes_compra o left join proveedores p on p.id=o.proveedor_id left join orden_compra_detalles d on d.orden_compra_id=o.id
    where o.empresa_id=$1 and o.sucursal_id=$2 group by o.id,p.razon_social order by o.created_at desc limit 100`,[req.user.empresa_id,branch]); res.json(rows);
});

app.post('/api/purchase-orders', requireAuth, async (req,res)=>{
  try{const {sucursal_id,proveedor_id=null,fecha=null,observaciones=null,items=[]}=req.body||{}; await ensureBranchAccess(pool,req.user,sucursal_id); await requireAnyBranchRole(pool,req.user,['Administrador','Almacén']); if(!Array.isArray(items)||!items.length)throw new Error('La orden requiere al menos un producto.');
    const normalized=items.map(i=>{const cantidad=numeric(i.cantidad,'Cantidad'),costo=numeric(i.costo_referencia??0,'Costo referencia');if(!i.producto_id||cantidad<=0||costo<0)throw new Error('Item de orden inválido.');return {...i,cantidad,costo};});
    const result=await tx(async c=>{if(proveedor_id){const pr=await c.query(`select id from proveedores where id=$1 and empresa_id=$2 and activo=true`,[proveedor_id,req.user.empresa_id]);if(!pr.rows[0])throw new Error('Proveedor inválido.');}
      const total=money(normalized.reduce((s,i)=>s+i.cantidad*i.costo,0)); const q=await c.query(`insert into ordenes_compra(empresa_id,sucursal_id,proveedor_id,fecha,observaciones,total_estimado,usuario_id) values($1,$2,$3,coalesce($4::date,current_date),$5,$6,$7) returning *`,[req.user.empresa_id,sucursal_id,proveedor_id,fecha,observaciones,total,req.user.sub]);
      for(const i of normalized){await ensureCompanyProduct(c,req.user,i.producto_id);await c.query(`insert into orden_compra_detalles(orden_compra_id,producto_id,cantidad,costo_referencia,total_estimado) values($1,$2,$3,$4,$5)`,[q.rows[0].id,i.producto_id,i.cantidad,i.costo,money(i.cantidad*i.costo)]);}
      await writeAudit(c,req.user,'CREAR_ORDEN_COMPRA','ordenes_compra',q.rows[0].id,{total,items:normalized.length}); return q.rows[0];}); res.status(201).json(result);
  }catch(error){res.status(error.status||400).json({error:error.message});}
});

app.patch('/api/purchase-orders/:id/status', requireAuth, async (req,res)=>{
  try{await requireAnyBranchRole(pool,req.user,['Administrador','Almacén']); const status=String(req.body?.estado||'').toUpperCase(); if(!['BORRADOR','ENVIADA','RECIBIDA','CANCELADA'].includes(status))throw new Error('Estado inválido.');
    const current=await pool.query(`select * from ordenes_compra where id=$1 and empresa_id=$2`,[req.params.id,req.user.empresa_id]); if(!current.rows[0])throw new Error('Orden no encontrada.'); await ensureBranchAccess(pool,req.user,current.rows[0].sucursal_id);
    const q=await pool.query(`update ordenes_compra set estado=$3,updated_at=now() where id=$1 and empresa_id=$2 returning *`,[req.params.id,req.user.empresa_id,status]); await writeAudit(pool,req.user,'CAMBIAR_ESTADO_ORDEN','ordenes_compra',req.params.id,{estado:status}); res.json(q.rows[0]);
  }catch(error){res.status(error.status||400).json({error:error.message});}
});



// ===== BoticaWeb 1.0: multi-sucursal, usuarios, reportes y operación final =====
async function requireAdmin(db,user){ return requireAnyBranchRole(db,user,['Administrador']); }

app.get('/api/admin/branches', requireAuth, async (req,res)=>{
  const {rows}=await pool.query(`select s.id,s.codigo,s.nombre,s.direccion,s.telefono,s.activo,
    count(distinct us.usuario_id)::int usuarios,count(distinct c.id)::int cajas
    from sucursales s left join usuario_sucursal us on us.sucursal_id=s.id left join cajas c on c.sucursal_id=s.id and c.activo=true
    where s.empresa_id=$1 group by s.id order by s.nombre`,[req.user.empresa_id]); res.json(rows);
});
app.post('/api/admin/branches', requireAuth, async (req,res)=>{
  try{await requireAdmin(pool,req.user);const b=req.body||{};if(!b.codigo||!b.nombre)throw new Error('Código y nombre son obligatorios.');
    const result=await tx(async c=>{const q=await c.query(`insert into sucursales(empresa_id,codigo,nombre,direccion,telefono) values($1,$2,$3,$4,$5) returning *`,[req.user.empresa_id,String(b.codigo).trim(),String(b.nombre).trim(),b.direccion||null,b.telefono||null]);await c.query(`insert into cajas(sucursal_id,nombre) values($1,'Caja 1')`,[q.rows[0].id]);await writeAudit(c,req.user,'CREAR_SUCURSAL','sucursales',q.rows[0].id,{codigo:b.codigo,nombre:b.nombre});return q.rows[0];});res.status(201).json(result);
  }catch(error){res.status(error.status||400).json({error:error.message});}
});
installBranchAdmin(app,{pool,tx,requireAuth,requireAdmin,ensureBranchAccess,writeAudit});

app.get('/api/admin/users/:id/permissions', requireAuth, async (req,res)=>{
  try{
    await requireAdmin(pool,req.user); await ensureUserPermissions(pool);
    const u=await pool.query(`select id,nombre,usuario from usuarios where id=$1 and empresa_id=$2`,[req.params.id,req.user.empresa_id]);
    if(!u.rows[0])return res.status(404).json({error:'Usuario no encontrado.'});
    const is_admin=await isAdminUser(pool,req.params.id);
    if(is_admin)return res.json({user:u.rows[0],is_admin:true,permissions:allPermissions(true)});
    const rows=await pool.query(`select modulo,puede_ver,puede_crear,puede_editar,puede_eliminar from usuario_permisos where usuario_id=$1`,[req.params.id]);
    let permissions;
    if(rows.rows.length){permissions=allPermissions(false);for(const r of rows.rows)if(permissions[r.modulo])permissions[r.modulo]={ver:r.puede_ver,crear:r.puede_crear,editar:r.puede_editar,eliminar:r.puede_eliminar};}
    else {permissions=allPermissions(false);for(const m of ['dashboard','sales','productsAdmin','inventory','customers','cash','alerts','reports'])permissions[m].ver=true;permissions.sales.crear=true;permissions.customers.crear=true;permissions.customers.editar=true;permissions.cash.crear=true;permissions.cash.editar=true;}
    res.json({user:u.rows[0],is_admin:false,permissions});
  }catch(error){res.status(error.status||400).json({error:error.message});}
});
app.put('/api/admin/users/:id/permissions', requireAuth, async (req,res)=>{
  try{
    await requireAdmin(pool,req.user); await ensureUserPermissions(pool);
    const u=await pool.query(`select id from usuarios where id=$1 and empresa_id=$2`,[req.params.id,req.user.empresa_id]);
    if(!u.rows[0])return res.status(404).json({error:'Usuario no encontrado.'});
    if(await isAdminUser(pool,req.params.id))return res.status(400).json({error:'Los permisos del Administrador son acceso total y no se pueden restringir.'});
    const permissions=req.body?.permissions||{};
    await tx(async c=>{
      await ensureUserPermissions(c);
      await c.query(`delete from usuario_permisos where usuario_id=$1`,[req.params.id]);
      for(const modulo of PERMISSION_MODULES){const x=permissions[modulo]||{};await c.query(`insert into usuario_permisos(usuario_id,modulo,puede_ver,puede_crear,puede_editar,puede_eliminar) values($1,$2,$3,$4,$5,$6)`,[req.params.id,modulo,!!x.ver,!!x.crear,!!x.editar,!!x.eliminar]);}
      await writeAudit(c,req.user,'ACTUALIZAR_PERMISOS','usuarios',req.params.id,{modulos:PERMISSION_MODULES.length});
    });
    res.json({ok:true});
  }catch(error){res.status(error.status||400).json({error:error.message});}
});

app.get('/api/admin/users', requireAuth, async (req,res)=>{
  try{
    await requireAdmin(pool,req.user);
    // Compatibilidad con bases existentes: la v19 no requiere usuarios.created_at.
    const {rows}=await pool.query(`select u.id,u.nombre,u.usuario,u.email,u.activo,
      coalesce(json_agg(json_build_object('sucursal_id',s.id,'sucursal',s.nombre,'rol_id',r.id,'rol',r.nombre)) filter(where s.id is not null),'[]') asignaciones
      from usuarios u
      left join usuario_sucursal us on us.usuario_id=u.id
      left join sucursales s on s.id=us.sucursal_id and s.empresa_id=u.empresa_id
      left join roles r on r.id=us.rol_id
      where u.empresa_id=$1
      group by u.id,u.nombre,u.usuario,u.email,u.activo
      order by u.nombre`,[req.user.empresa_id]);
    res.json(rows);
  }catch(error){res.status(error.status||400).json({error:error.message});}
});
app.get('/api/admin/roles', requireAuth, async (req,res)=>{try{await requireAdmin(pool,req.user);const {rows}=await pool.query(`select id,nombre from roles order by nombre`);res.json(rows);}catch(error){res.status(error.status||400).json({error:error.message});}});
app.post('/api/admin/users', requireAuth, async (req,res)=>{
  try{
    await requireAdmin(pool,req.user);
    const b=req.body||{};
    const nombre=String(b.nombre||'').trim();
    const usuario=String(b.usuario||'').trim();
    const password=String(b.password||'');
    if(!nombre||!usuario||!password||!Array.isArray(b.asignaciones)||!b.asignaciones.length)throw new Error('Nombre, usuario, contraseña y al menos una sucursal son obligatorios.');
    if(password.length<8)throw new Error('La contraseña temporal debe tener al menos 8 caracteres.');
    if(!/^[A-Za-z0-9._-]{3,40}$/.test(usuario))throw new Error('El usuario debe tener entre 3 y 40 caracteres y usar solo letras, números, punto, guion o guion bajo.');
    const result=await tx(async c=>{
      const dup=await c.query(`select id from usuarios where empresa_id=$1 and lower(usuario)=lower($2) limit 1`,[req.user.empresa_id,usuario]);
      if(dup.rows[0])throw new Error('Ese nombre de usuario ya existe.');
      const hash=await bcrypt.hash(password,12);
      const q=await c.query(`insert into usuarios(empresa_id,nombre,usuario,email,password_hash,activo) values($1,$2,$3,$4,$5,true) returning id,nombre,usuario,email,activo`,[req.user.empresa_id,nombre,usuario,b.email||null,hash]);
      for(const a of b.asignaciones){
        const chk=await c.query(`select s.id,r.id rol_id,r.nombre rol from sucursales s cross join roles r where s.id=$1 and s.empresa_id=$2 and s.activo=true and r.id=$3 limit 1`,[a.sucursal_id,req.user.empresa_id,a.rol_id]);
        if(!chk.rows[0])throw new Error('Sucursal o rol inválido.');
        await c.query(`insert into usuario_sucursal(usuario_id,sucursal_id,rol_id) values($1,$2,$3)`,[q.rows[0].id,a.sucursal_id,a.rol_id]);
      }
      await writeAudit(c,req.user,'CREAR_USUARIO','usuarios',q.rows[0].id,{usuario,asignaciones:b.asignaciones.length});
      return q.rows[0];
    });
    res.status(201).json(result);
  }catch(error){
    if(error?.code==='23505')return res.status(409).json({error:'Ese nombre de usuario ya existe.'});
    res.status(error.status||400).json({error:error.message});
  }
});
app.put('/api/admin/users/:id', requireAuth, async (req,res)=>{
  try{
    await requireAdmin(pool,req.user); const b=req.body||{};
    const nombre=String(b.nombre||'').trim(), usuario=String(b.usuario||'').trim(), password=String(b.password||'');
    if(!nombre||!usuario)throw new Error('Nombre y usuario son obligatorios.');
    if(!/^[A-Za-z0-9._-]{3,40}$/.test(usuario))throw new Error('El usuario debe tener entre 3 y 40 caracteres y usar solo letras, números, punto, guion o guion bajo.');
    if(password && password.length<8)throw new Error('La nueva contraseña debe tener al menos 8 caracteres.');
    if(!Array.isArray(b.asignaciones)||!b.asignaciones.length)throw new Error('Debe existir al menos una asignación.');
    const result=await tx(async c=>{
      const current=await c.query(`select id from usuarios where id=$1 and empresa_id=$2`,[req.params.id,req.user.empresa_id]); if(!current.rows[0])throw new Error('Usuario no encontrado.');
      const dup=await c.query(`select id from usuarios where empresa_id=$1 and lower(usuario)=lower($2) and id<>$3 limit 1`,[req.user.empresa_id,usuario,req.params.id]); if(dup.rows[0])throw new Error('Ese nombre de usuario ya existe.');
      if(password){const hash=await bcrypt.hash(password,12);await c.query(`update usuarios set nombre=$3,usuario=$4,email=$5,password_hash=$6,activo=$7,updated_at=now() where id=$1 and empresa_id=$2`,[req.params.id,req.user.empresa_id,nombre,usuario,b.email||null,hash,b.activo!==false]);}
      else await c.query(`update usuarios set nombre=$3,usuario=$4,email=$5,activo=$6,updated_at=now() where id=$1 and empresa_id=$2`,[req.params.id,req.user.empresa_id,nombre,usuario,b.email||null,b.activo!==false]);
      await c.query(`delete from usuario_sucursal where usuario_id=$1`,[req.params.id]);
      for(const a of b.asignaciones){const chk=await c.query(`select s.id from sucursales s cross join roles r where s.id=$1 and s.empresa_id=$2 and s.activo=true and r.id=$3 limit 1`,[a.sucursal_id,req.user.empresa_id,a.rol_id]);if(!chk.rows[0])throw new Error('Sucursal o rol inválido.');await c.query(`insert into usuario_sucursal(usuario_id,sucursal_id,rol_id) values($1,$2,$3)`,[req.params.id,a.sucursal_id,a.rol_id]);}
      await writeAudit(c,req.user,'EDITAR_USUARIO','usuarios',req.params.id,{usuario}); return {id:req.params.id,nombre,usuario,email:b.email||null,activo:b.activo!==false};
    }); res.json(result);
  }catch(error){if(error?.code==='23505')return res.status(409).json({error:'Ese nombre de usuario ya existe.'});res.status(error.status||400).json({error:error.message});}
});
app.patch('/api/admin/users/:id/status', requireAuth, async (req,res)=>{try{await requireAdmin(pool,req.user);if(req.params.id===req.user.sub && req.body?.activo===false)throw new Error('No puedes desactivar tu propia sesión.');const q=await pool.query(`update usuarios set activo=$3,updated_at=now() where id=$1 and empresa_id=$2 returning id,activo`,[req.params.id,req.user.empresa_id,!!req.body?.activo]);if(!q.rows[0])throw new Error('Usuario no encontrado.');await writeAudit(pool,req.user,q.rows[0].activo?'ACTIVAR_USUARIO':'DESACTIVAR_USUARIO','usuarios',req.params.id,{});res.json(q.rows[0]);}catch(error){res.status(error.status||400).json({error:error.message});}});
app.put('/api/admin/users/:id/assignments', requireAuth, async (req,res)=>{try{await requireAdmin(pool,req.user);const a=req.body?.asignaciones;if(!Array.isArray(a)||!a.length)throw new Error('Debe existir al menos una asignación.');await tx(async c=>{const u=await c.query(`select id from usuarios where id=$1 and empresa_id=$2`,[req.params.id,req.user.empresa_id]);if(!u.rows[0])throw new Error('Usuario no encontrado.');await c.query(`delete from usuario_sucursal where usuario_id=$1`,[req.params.id]);for(const x of a){await ensureBranchAccess(c,req.user,x.sucursal_id);const inserted=await c.query(`insert into usuario_sucursal(usuario_id,sucursal_id,rol_id) select $1,s.id,$3 from sucursales s where s.id=$2 and s.empresa_id=$4 and s.activo=true`,[req.params.id,x.sucursal_id,x.rol_id,req.user.empresa_id]);if(!inserted.rowCount)throw new Error('Sucursal inactiva o inválida.');}await writeAudit(c,req.user,'ASIGNAR_SUCURSALES','usuarios',req.params.id,{cantidad:a.length});});res.json({ok:true});}catch(error){res.status(error.status||400).json({error:error.message});}});

app.post('/api/inventory/adjustments', requireAuth, async (req,res)=>{
  try{const {sucursal_id,producto_id,lote_id,diferencia,motivo}=req.body||{};await ensureBranchAccess(pool,req.user,sucursal_id);await requireAnyBranchRole(pool,req.user,['Administrador','Almacén']);const diff=numeric(diferencia,'Diferencia');if(!producto_id||!lote_id||!motivo||Math.abs(diff)<0.0001)throw new Error('Producto, lote, diferencia y motivo son obligatorios.');
    const result=await tx(async c=>{const l=await c.query(`select l.*,p.empresa_id from lotes l join productos p on p.id=l.producto_id where l.id=$1 and l.producto_id=$2 and l.sucursal_id=$3 and p.empresa_id=$4 for update`,[lote_id,producto_id,sucursal_id,req.user.empresa_id]);if(!l.rows[0])throw new Error('Lote inválido.');const next=Number(l.rows[0].cantidad_disponible)+diff;if(diff<0&&next<0)throw new Error('El ajuste dejaría el lote con stock negativo.');const q=await c.query(`insert into ajustes_inventario(empresa_id,sucursal_id,producto_id,lote_id,diferencia,motivo,usuario_id) values($1,$2,$3,$4,$5,$6,$7) returning *`,[req.user.empresa_id,sucursal_id,producto_id,lote_id,diff,String(motivo).trim(),req.user.sub]);if(diff>0)await applyPositiveStockEntry(c,{empresaId:req.user.empresa_id,sucursalId:sucursal_id,productoId:producto_id,loteId:lote_id,cantidad:diff,costoUnitario:l.rows[0].costo_unitario,tipo:'AJUSTE',referenciaTipo:'AJUSTE',referenciaId:q.rows[0].id,usuarioId:req.user.sub});else{await c.query(`update lotes set cantidad_disponible=$2 where id=$1`,[lote_id,next]);await c.query(`insert into movimientos_inventario(empresa_id,sucursal_id,producto_id,lote_id,tipo,cantidad,costo_unitario,referencia_tipo,referencia_id,usuario_id) values($1,$2,$3,$4,'AJUSTE',$5,$6,'AJUSTE',$7,$8)`,[req.user.empresa_id,sucursal_id,producto_id,lote_id,diff,l.rows[0].costo_unitario,q.rows[0].id,req.user.sub]);}await writeAudit(c,req.user,'AJUSTE_INVENTARIO','ajustes_inventario',q.rows[0].id,{diferencia:diff,motivo});return q.rows[0];});res.status(201).json(result);
  }catch(error){res.status(error.status||400).json({error:error.message});}
});


// Ajuste rápido del stock total de un producto. El cambio siempre queda auditado en Kardex.
app.post('/api/inventory/set-stock', requireAuth, async (req,res)=>{
  try{
    const {sucursal_id,producto_id,stock_objetivo,motivo}=req.body||{};
    await ensureBranchAccess(pool,req.user,sucursal_id);
    await requireAnyBranchRole(pool,req.user,['Administrador','Almacén']);
    const target=numeric(stock_objetivo,'Stock objetivo');
    if(!producto_id||target<0)throw new Error('Producto y stock objetivo válido son obligatorios.');
    const reason=String(motivo||'Corrección manual de stock').trim()||'Corrección manual de stock';
    const result=await tx(async c=>{
      const prod=await c.query(`select id,nombre from productos where id=$1 and empresa_id=$2 and activo=true`,[producto_id,req.user.empresa_id]);
      if(!prod.rows[0])throw new Error('Producto no encontrado.');
      const lots=await c.query(`select id,numero_lote,fecha_vencimiento,costo_unitario,cantidad_disponible from lotes where producto_id=$1 and sucursal_id=$2 order by fecha_vencimiento asc nulls last,id for update`,[producto_id,sucursal_id]);
      const current=lots.rows.reduce((sum,l)=>sum+Number(l.cantidad_disponible),0);
      const diff=Number((target-current).toFixed(3));
      if(Math.abs(diff)<0.0001)return {producto_id,stock_anterior:current,stock_nuevo:target,diferencia:0};

      if(diff>0){
        let manual=lots.rows.find(l=>l.numero_lote==='AJUSTE-MANUAL');
        if(!manual){
          const q=await c.query(`insert into lotes(producto_id,sucursal_id,numero_lote,fecha_vencimiento,costo_unitario,cantidad_inicial,cantidad_disponible) values($1,$2,'AJUSTE-MANUAL',null,0,0,0) on conflict(producto_id,sucursal_id,numero_lote) do update set numero_lote=excluded.numero_lote returning id,numero_lote,costo_unitario,cantidad_disponible`,[producto_id,sucursal_id]);
          manual=q.rows[0];
        }
        const a=await c.query(`insert into ajustes_inventario(empresa_id,sucursal_id,producto_id,lote_id,diferencia,motivo,usuario_id) values($1,$2,$3,$4,$5,$6,$7) returning id`,[req.user.empresa_id,sucursal_id,producto_id,manual.id,diff,reason,req.user.sub]);
        await applyPositiveStockEntry(c,{empresaId:req.user.empresa_id,sucursalId:sucursal_id,productoId:producto_id,loteId:manual.id,cantidad:diff,costoUnitario:manual.costo_unitario||0,tipo:'AJUSTE',referenciaTipo:'AJUSTE',referenciaId:a.rows[0].id,usuarioId:req.user.sub,increaseInitial:true});
      }else{
        let remaining=Math.abs(diff);
        for(const lot of lots.rows){
          if(remaining<=0)break;
          const available=Number(lot.cantidad_disponible);
          if(available<=0)continue;
          const take=Math.min(remaining,available);
          await c.query(`update lotes set cantidad_disponible=cantidad_disponible-$2 where id=$1`,[lot.id,take]);
          const a=await c.query(`insert into ajustes_inventario(empresa_id,sucursal_id,producto_id,lote_id,diferencia,motivo,usuario_id) values($1,$2,$3,$4,$5,$6,$7) returning id`,[req.user.empresa_id,sucursal_id,producto_id,lot.id,-take,reason,req.user.sub]);
          await c.query(`insert into movimientos_inventario(empresa_id,sucursal_id,producto_id,lote_id,tipo,cantidad,costo_unitario,referencia_tipo,referencia_id,usuario_id) values($1,$2,$3,$4,'AJUSTE',$5,$6,'AJUSTE',$7,$8)`,[req.user.empresa_id,sucursal_id,producto_id,lot.id,-take,lot.costo_unitario||0,a.rows[0].id,req.user.sub]);
          remaining=Number((remaining-take).toFixed(3));
        }
        if(remaining>0.0001)throw new Error('No se pudo reducir el stock hasta el valor solicitado.');
      }
      await writeAudit(c,req.user,'AJUSTAR_STOCK_TOTAL','productos',producto_id,{stock_anterior:current,stock_nuevo:target,diferencia:diff,motivo:reason,sucursal_id});
      return {producto_id,stock_anterior:current,stock_nuevo:target,diferencia:diff};
    });
    res.status(201).json(result);
  }catch(error){res.status(error.status||400).json({error:error.message});}
});

app.get('/api/internal-requests', requireAuth, async (req,res)=>{
  const branch=req.query.sucursal_id;try{await ensureBranchAccess(pool,req.user,branch);}catch(error){return res.status(error.status||400).json({error:error.message});}
  const {rows}=await pool.query(`select si.id,si.estado,si.observaciones,si.created_at,ss.nombre solicitante,so.nombre origen,u.nombre usuario,
    coalesce(json_agg(json_build_object('producto_id',p.id,'producto',p.nombre,'cantidad',d.cantidad,'atendida',d.cantidad_atendida)) filter(where d.id is not null),'[]') items
    from solicitudes_internas si join sucursales ss on ss.id=si.sucursal_solicitante_id left join sucursales so on so.id=si.sucursal_origen_id left join usuarios u on u.id=si.usuario_solicita_id
    left join solicitud_interna_detalles d on d.solicitud_id=si.id left join productos p on p.id=d.producto_id
    where si.empresa_id=$1 and (si.sucursal_solicitante_id=$2 or si.sucursal_origen_id=$2) group by si.id,ss.nombre,so.nombre,u.nombre order by si.created_at desc limit 100`,[req.user.empresa_id,branch]);res.json(rows);
});
app.post('/api/internal-requests', requireAuth, async (req,res)=>{
  try{const {sucursal_solicitante_id,sucursal_origen_id=null,observaciones=null,items=[]}=req.body||{};await ensureBranchAccess(pool,req.user,sucursal_solicitante_id);if(sucursal_origen_id){const q=await pool.query(`select id from sucursales where id=$1 and empresa_id=$2 and activo=true`,[sucursal_origen_id,req.user.empresa_id]);if(!q.rows[0])throw new Error('Sucursal origen inválida.');}if(!Array.isArray(items)||!items.length)throw new Error('Agrega al menos un producto.');const result=await tx(async c=>{const q=await c.query(`insert into solicitudes_internas(empresa_id,sucursal_solicitante_id,sucursal_origen_id,observaciones,usuario_solicita_id) values($1,$2,$3,$4,$5) returning *`,[req.user.empresa_id,sucursal_solicitante_id,sucursal_origen_id,observaciones,req.user.sub]);for(const i of items){const qty=numeric(i.cantidad,'Cantidad');if(!i.producto_id||qty<=0)throw new Error('Item inválido.');await ensureCompanyProduct(c,req.user,i.producto_id);await c.query(`insert into solicitud_interna_detalles(solicitud_id,producto_id,cantidad) values($1,$2,$3)`,[q.rows[0].id,i.producto_id,qty]);}await writeAudit(c,req.user,'SOLICITUD_INTERNA','solicitudes_internas',q.rows[0].id,{items:items.length});return q.rows[0];});res.status(201).json(result);}catch(error){res.status(error.status||400).json({error:error.message});}
});

app.get('/api/transfers', requireAuth, async (req,res)=>{
  const branch=req.query.sucursal_id;try{await ensureBranchAccess(pool,req.user,branch);}catch(error){return res.status(error.status||400).json({error:error.message});}
  const {rows}=await pool.query(`select t.id,t.estado,t.observaciones,t.created_at,so.nombre origen,sd.nombre destino,u.nombre usuario,
    count(d.id)::int items,coalesce(sum(d.cantidad),0)::numeric(14,3) unidades
    from transferencias t join sucursales so on so.id=t.sucursal_origen_id join sucursales sd on sd.id=t.sucursal_destino_id left join usuarios u on u.id=t.usuario_id left join transferencia_detalles d on d.transferencia_id=t.id
    where t.empresa_id=$1 and (t.sucursal_origen_id=$2 or t.sucursal_destino_id=$2) group by t.id,so.nombre,sd.nombre,u.nombre order by t.created_at desc limit 100`,[req.user.empresa_id,branch]);res.json(rows);
});
app.post('/api/transfers', requireAuth, async (req,res)=>{
  try{const {sucursal_origen_id,sucursal_destino_id,solicitud_id=null,observaciones=null,items=[]}=req.body||{};await ensureBranchAccess(pool,req.user,sucursal_origen_id);await requireAnyBranchRole(pool,req.user,['Administrador','Almacén']);if(!sucursal_destino_id||sucursal_destino_id===sucursal_origen_id)throw new Error('Selecciona una sucursal destino diferente.');const dest=await pool.query(`select id from sucursales where id=$1 and empresa_id=$2 and activo=true`,[sucursal_destino_id,req.user.empresa_id]);if(!dest.rows[0])throw new Error('Sucursal destino inválida.');if(!Array.isArray(items)||!items.length)throw new Error('Agrega productos a la transferencia.');
    const result=await tx(async c=>{for(const id of [sucursal_origen_id,sucursal_destino_id].sort()){const active=await c.query('select id from sucursales where id=$1 and empresa_id=$2 and activo=true for share',[id,req.user.empresa_id]);if(!active.rowCount)throw new Error('Sucursal inactiva o inválida.');}if(solicitud_id)await ensureCompanyRequest(c,req.user,solicitud_id,sucursal_origen_id,sucursal_destino_id);const t=await c.query(`insert into transferencias(empresa_id,sucursal_origen_id,sucursal_destino_id,solicitud_id,observaciones,usuario_id) values($1,$2,$3,$4,$5,$6) returning *`,[req.user.empresa_id,sucursal_origen_id,sucursal_destino_id,solicitud_id,observaciones,req.user.sub]);for(const i of items){let remaining=numeric(i.cantidad,'Cantidad');if(!i.producto_id||remaining<=0)throw new Error('Producto/cantidad inválidos.');await ensureCompanyProduct(c,req.user,i.producto_id);const lots=await c.query(`select id,numero_lote,fecha_vencimiento,costo_unitario,cantidad_disponible from lotes where producto_id=$1 and sucursal_id=$2 and cantidad_disponible>0 order by fecha_vencimiento asc nulls last,id for update`,[i.producto_id,sucursal_origen_id]);const available=lots.rows.reduce((s,l)=>s+Number(l.cantidad_disponible),0);if(available+1e-9<remaining)throw new Error(`Stock insuficiente para transferencia. Disponible: ${available}`);for(const lot of lots.rows){if(remaining<=0)break;const take=Math.min(remaining,Number(lot.cantidad_disponible));await c.query(`update lotes set cantidad_disponible=cantidad_disponible-$2 where id=$1`,[lot.id,take]);const dl=await c.query(`insert into lotes(producto_id,sucursal_id,numero_lote,fecha_vencimiento,costo_unitario,cantidad_inicial,cantidad_disponible) values($1,$2,$3,$4,$5,0,0) on conflict(producto_id,sucursal_id,numero_lote) do update set fecha_vencimiento=coalesce(excluded.fecha_vencimiento,lotes.fecha_vencimiento) returning id`,[i.producto_id,sucursal_destino_id,lot.numero_lote,lot.fecha_vencimiento,lot.costo_unitario]);await c.query(`insert into transferencia_detalles(transferencia_id,producto_id,lote_origen_id,lote_destino_id,cantidad,costo_unitario) values($1,$2,$3,$4,$5,$6)`,[t.rows[0].id,i.producto_id,lot.id,dl.rows[0].id,take,lot.costo_unitario]);await c.query(`insert into movimientos_inventario(empresa_id,sucursal_id,producto_id,lote_id,tipo,cantidad,costo_unitario,referencia_tipo,referencia_id,usuario_id) values($1,$2,$3,$4,'TRANSFERENCIA_SALIDA',$5,$6,'TRANSFERENCIA',$7,$8)`,[req.user.empresa_id,sucursal_origen_id,i.producto_id,lot.id,-take,lot.costo_unitario,t.rows[0].id,req.user.sub]);await applyPositiveStockEntry(c,{empresaId:req.user.empresa_id,sucursalId:sucursal_destino_id,productoId:i.producto_id,loteId:dl.rows[0].id,cantidad:take,costoUnitario:lot.costo_unitario,tipo:'TRANSFERENCIA_ENTRADA',referenciaTipo:'TRANSFERENCIA',referenciaId:t.rows[0].id,usuarioId:req.user.sub,increaseInitial:true});remaining=Number((remaining-take).toFixed(3));}}
      if(solicitud_id){const parent=await c.query(`update solicitudes_internas set estado='ATENDIDA',usuario_resuelve_id=$2,resolved_at=now() where id=$1 and empresa_id=$3 and sucursal_solicitante_id=$4 returning id`,[solicitud_id,req.user.sub,req.user.empresa_id,sucursal_destino_id]);if(!parent.rowCount)throw new Error('Solicitud no disponible para esta empresa.');await c.query(`update solicitud_interna_detalles d set cantidad_atendida=d.cantidad from solicitudes_internas s where d.solicitud_id=s.id and s.id=$1 and s.empresa_id=$2 and s.sucursal_solicitante_id=$3`,[solicitud_id,req.user.empresa_id,sucursal_destino_id]);}
      await writeAudit(c,req.user,'TRANSFERENCIA','transferencias',t.rows[0].id,{origen:sucursal_origen_id,destino:sucursal_destino_id});return t.rows[0];});res.status(201).json(result);
  }catch(error){res.status(error.status||400).json({error:error.message});}
});



const INVENTORY_UNITS = ['UNIDAD','BLISTER','CAJA','PAQUETE','DOCENA','FRASCO','BOTELLA','SOBRE','TUBO','AMPOLLA','VIAL','BOLSA','TABLETA','CAPSULA','GRAMO','MILILITRO'];
const normalizeInventoryUnit = value => {
  const raw=String(value??'').trim().toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
  if(!raw)return 'UNIDAD';
  const aliases={UND:'UNIDAD',UN:'UNIDAD',UNID:'UNIDAD',UNIDAD:'UNIDAD',BL:'BLISTER',BLIS:'BLISTER',BLISTER:'BLISTER',CAJ:'CAJA',CAJA:'CAJA',PAQ:'PAQUETE',PAQUETE:'PAQUETE',DOC:'DOCENA',DOCENA:'DOCENA',FCO:'FRASCO',FRASCO:'FRASCO',BOT:'BOTELLA',BOTELLA:'BOTELLA',SOB:'SOBRE',SOBRE:'SOBRE',TUB:'TUBO',TUBO:'TUBO',AMP:'AMPOLLA',AMPOLLA:'AMPOLLA',VIAL:'VIAL',BOL:'BOLSA',BOLSA:'BOLSA',TAB:'TABLETA',TABLETA:'TABLETA',CAP:'CAPSULA',CAPSULA:'CAPSULA',GR:'GRAMO',G:'GRAMO',GRAMO:'GRAMO',ML:'MILILITRO',MILILITRO:'MILILITRO'};
  return aliases[raw]||raw;
};
const excelHeaderKey = value => String(value??'').trim().toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^A-Z0-9]+/g,'_').replace(/^_+|_+$/g,'');
const INVENTORY_HEADER_ALIASES={
  codigo_interno:['CODIGO_INTERNO','COD_INTERNO','CODIGO_BOTICAWEB'],
  nombre:['PRODUCTO','NOMBRE','DESCRIPCION','MEDICAMENTO','NOMBRE_PRODUCTO','DESCRIPCION_PRODUCTO'],
  codigo_anterior:['CODIGO','CODIGO_ANTERIOR','CODIGO_LEGACY','CODIGO_PRODUCTO'],
  codigo_barras:['CODIGO_BARRAS','COD_BARRAS','CODIGOBARRAS','BARCODE','EAN','CODIGO_DE_BARRAS'],
  principio_activo:['PRINCIPIO_ACTIVO','PRINCIPIO','ACTIVO'],
  concentracion:['CONCENTRACION','DOSIS'],
  presentacion:['PRESENTACION','FORMA','FORMA_FARMACEUTICA','TIPO'],
  unidad_medida:['UNIDAD_MEDIDA','UNIDAD','U_M','UM','UNIDAD_MEDIDA_VENTA'],
  categoria:['CATEGORIA','RUBRO'],
  laboratorio:['LABORATORIO','MARCA','FABRICANTE','SUBTIPO'],
  stock_minimo:['STOCK_MINIMO','MINIMO','STOCKMINIMO','STOCK_MIN'],
  stock_maximo:['STOCK_MAXIMO','MAXIMO','STOCKMAXIMO','STOCK_MAX'],
  precio:['PRECIO_VENTA','PRECIO','PVP','PRECIO_UNITARIO','PRECIOVENTA','PRECIO_DE_VENTA_SOLES','PRECIO_VENTA_SOLES'],
  precio_dolares:['PRECIO_DE_VENTA_DOLARES','PRECIO_VENTA_DOLARES','PRECIO_DOLARES'],
  stock:['STOCK_ACTUAL','STOCK','CANTIDAD','EXISTENCIA','SALDO','STOCKACTUAL'],
  lote:['LOTE','NUMERO_LOTE','NRO_LOTE','LOTE_NUMERO'],
  vencimiento:['FECHA_VENCIMIENTO','VENCIMIENTO','FEC_VCTO','FECHA_VCTO','VENCE'],
  costo:['COSTO_UNITARIO','COSTO','PRECIO_COMPRA','COSTO_COMPRA','PRECIO_COMPRA_S'],
  recargo_propina:['RECARGO_PROPINA','PORCENTAJE_RECARGO_PROPINA'],
  afectacion_igv:['TIPO_AFECTACION_IGV','AFECTACION_IGV'],
  favorito:['FAVORITO'],
  valido:['VALIDO','ACTIVO_VALIDO']
};
function inventoryHeaderMatches(field,key){
  if((INVENTORY_HEADER_ALIASES[field]||[]).includes(key))return true;
  if(field==='afectacion_igv'&&key.startsWith('TIPO_AFECTACION_IGV'))return true;
  if(field==='recargo_propina'&&key.includes('RECARGO_PROPINA'))return true;
  return false;
}
function excelCellPrimitive(cell){
  let v=cell?.value;
  if(v&&typeof v==='object'){
    if(v.result!==undefined)v=v.result;
    else if(v.text!==undefined)v=v.text;
    else if(Array.isArray(v.richText))v=v.richText.map(x=>x.text||'').join('');
  }
  return v;
}
function excelText(cell){const v=excelCellPrimitive(cell);return v==null?'':String(v).trim();}
function excelNumber(cell, fallback=0){
  const v=excelCellPrimitive(cell);if(v==null||v==='')return fallback;
  if(typeof v==='number'&&Number.isFinite(v))return v;
  const n=Number(String(v).trim().replace(/\s/g,'').replace(',','.'));return Number.isFinite(n)?n:NaN;
}
function excelDate(cell){
  const v=excelCellPrimitive(cell);if(v==null||v==='')return null;
  if(v instanceof Date&&!Number.isNaN(v.getTime()))return v.toISOString().slice(0,10);
  if(typeof v==='number'&&Number.isFinite(v)){
    const d=new Date(Date.UTC(1899,11,30)+Math.round(v*86400000));return Number.isNaN(d.getTime())?null:d.toISOString().slice(0,10);
  }
  const text=String(v).trim();
  if(/^\d{4}-\d{2}-\d{2}$/.test(text))return text;
  const m=text.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})$/);if(m){let y=Number(m[3]);if(y<100)y+=2000;const d=new Date(Date.UTC(y,Number(m[2])-1,Number(m[1])));if(!Number.isNaN(d.getTime()))return d.toISOString().slice(0,10);}
  const d=new Date(text);return Number.isNaN(d.getTime())?null:d.toISOString().slice(0,10);
}
async function parseInventoryWorkbook(base64){
  if(!base64)throw new Error('Selecciona un archivo Excel.');
  let buffer;try{buffer=Buffer.from(String(base64).replace(/^data:.*?;base64,/,''),'base64');}catch{throw new Error('No se pudo leer el archivo Excel.');}
  if(buffer.length>20*1024*1024)throw new Error('El archivo supera 20 MB. Divide el inventario en archivos más pequeños.');
  const wb=new ExcelJS.Workbook();
  try{await wb.xlsx.load(buffer);}catch{throw new Error('El archivo debe ser Excel .xlsx válido. Los archivos .xls antiguos deben guardarse primero como .xlsx.');}
  const ws=wb.worksheets.find(x=>x.actualRowCount>0)||wb.worksheets[0];if(!ws)throw new Error('El Excel no contiene hojas con datos.');
  let headerRow=0,map={};
  for(let r=1;r<=Math.min(15,ws.rowCount);r++){
    const row=ws.getRow(r);const keys=[];row.eachCell({includeEmpty:false},c=>keys.push(excelHeaderKey(excelText(c))));
    const nameAliases=new Set(INVENTORY_HEADER_ALIASES.nombre);if(keys.some(k=>nameAliases.has(k))){headerRow=r;break;}
  }
  if(!headerRow)throw new Error('No encontré una columna Producto/Nombre. Usa la plantilla de BoticaWeb o revisa los encabezados.');
  const header=ws.getRow(headerRow);header.eachCell({includeEmpty:true},(c,col)=>{const key=excelHeaderKey(excelText(c));for(const field of Object.keys(INVENTORY_HEADER_ALIASES)){if(inventoryHeaderMatches(field,key)&&map[field]==null)map[field]=col;}});
  if(!map.nombre)throw new Error('La columna Producto/Nombre es obligatoria.');
  if(!map.stock)throw new Error('La columna Stock/Cantidad es obligatoria.');
  if(ws.rowCount-headerRow>20000)throw new Error('La hoja tiene demasiadas filas. Elimina filas vacías/formateadas y deja un máximo de 5,000 registros.');
  const rows=[];const errors=[];const warnings=[];
  for(let r=headerRow+1;r<=ws.rowCount;r++){
    const row=ws.getRow(r);const name=excelText(row.getCell(map.nombre));
    const hasAny=Object.values(map).some(col=>excelText(row.getCell(col))!=='');if(!hasAny)continue;
    if(rows.length>=5000)throw new Error('El importador admite hasta 5,000 filas por archivo.');
    const stockRaw=excelNumber(row.getCell(map.stock),NaN),stock=Number.isFinite(stockRaw)&&stockRaw<0?0:stockRaw,price=map.precio?excelNumber(row.getCell(map.precio),0):0,min=map.stock_minimo?excelNumber(row.getCell(map.stock_minimo),0):0,max=map.stock_maximo?excelNumber(row.getCell(map.stock_maximo),0):0,cost=map.costo?excelNumber(row.getCell(map.costo),0):0,usd=map.precio_dolares?excelNumber(row.getCell(map.precio_dolares),0):0,recargo=map.recargo_propina?excelNumber(row.getCell(map.recargo_propina),0):0;
    const unitRaw=map.unidad_medida?excelText(row.getCell(map.unidad_medida)):'';
    const codigoAnterior=map.codigo_anterior?excelText(row.getCell(map.codigo_anterior)):'';
    const rawBarcode=map.codigo_barras?excelText(row.getCell(map.codigo_barras)):'';
    const validBarcode=/^\d{8,14}$/.test(rawBarcode)?rawBarcode:'';
    const favoritoRaw=map.favorito?excelText(row.getCell(map.favorito)).toUpperCase():'';
    const validoRaw=map.valido?excelText(row.getCell(map.valido)).toUpperCase():'';
    const item={row:r,nombre:name,codigo_anterior:codigoAnterior,codigo_barras:validBarcode,codigo_barras_original:rawBarcode,principio_activo:map.principio_activo?excelText(row.getCell(map.principio_activo)):'',concentracion:map.concentracion?excelText(row.getCell(map.concentracion)):'',presentacion:map.presentacion?excelText(row.getCell(map.presentacion)):'',unidad_medida:normalizeInventoryUnit(unitRaw||'UNIDAD'),unidad_informada:!!unitRaw,categoria:map.categoria?excelText(row.getCell(map.categoria)):'',laboratorio:map.laboratorio?excelText(row.getCell(map.laboratorio)):'',stock_minimo:min,stock_minimo_informado:!!map.stock_minimo&&excelText(row.getCell(map.stock_minimo))!=='',stock_maximo:max,stock_maximo_informado:!!map.stock_maximo&&excelText(row.getCell(map.stock_maximo))!=='',precio:price,precio_informado:!!map.precio&&excelText(row.getCell(map.precio))!=='',precio_dolares:usd,precio_dolares_informado:!!map.precio_dolares&&excelText(row.getCell(map.precio_dolares))!=='',recargo_propina:recargo,recargo_propina_informado:!!map.recargo_propina&&excelText(row.getCell(map.recargo_propina))!=='',afectacion_igv:map.afectacion_igv?excelText(row.getCell(map.afectacion_igv)):'',afectacion_igv_informado:!!map.afectacion_igv&&excelText(row.getCell(map.afectacion_igv))!=='',favorito:['SI','SÍ','YES','TRUE','1'].includes(favoritoRaw),favorito_informado:!!map.favorito&&favoritoRaw!=='',activo:!['NO','FALSE','0','INACTIVO'].includes(validoRaw),activo_informado:!!map.valido&&validoRaw!=='',stock,costo:cost,lote:map.lote?excelText(row.getCell(map.lote)):'',vencimiento:map.vencimiento?excelDate(row.getCell(map.vencimiento)):null};
    const rowErrors=[];const rowWarnings=[];
    if(!name)rowErrors.push('Producto vacío');
    if(!Number.isFinite(stockRaw))rowErrors.push('Stock inválido');
    if(Number.isFinite(stockRaw)&&stockRaw<0)rowWarnings.push(`Stock negativo (${stockRaw}) normalizado a 0 para inventario físico`);
    if(!Number.isFinite(price)||price<0)rowErrors.push('Precio inválido');
    if(!Number.isFinite(min)||min<0)rowErrors.push('Stock mínimo inválido');
    if(!Number.isFinite(max)||max<0)rowErrors.push('Stock máximo inválido');
    if(!Number.isFinite(cost)||cost<0)rowErrors.push('Costo inválido');
    if(!Number.isFinite(usd)||usd<0)rowErrors.push('Precio en dólares inválido');
    if(!Number.isFinite(recargo)||recargo<0)rowErrors.push('Recargo/propina inválido');
    if(!INVENTORY_UNITS.includes(item.unidad_medida)){rowWarnings.push(`Unidad "${item.unidad_medida}" no estándar; se conservará tal como está`);}
    if(map.vencimiento&&excelText(row.getCell(map.vencimiento))&&!item.vencimiento)rowErrors.push('Fecha de vencimiento inválida');
    if(rawBarcode&&/[Ee]\+\d+/.test(rawBarcode))rowWarnings.push('El código de barras parece estar en notación científica; en Excel conviene formatearlo como Texto');
    if(rawBarcode&&!validBarcode){
      if(codigoAnterior&&rawBarcode.toUpperCase()===codigoAnterior.toUpperCase())rowWarnings.push('El valor de Código Barras es el código anterior; se conservará como referencia y no como código de barras');
      else rowWarnings.push(`Código de barras "${rawBarcode}" no válido como EAN/UPC; se dejará vacío`);
    }
    item.errors=rowErrors;item.warnings=rowWarnings;rows.push(item);if(rowErrors.length)errors.push({row:r,message:rowErrors.join(', ')});if(rowWarnings.length)warnings.push({row:r,message:rowWarnings.join(', ')});
  }
  if(!rows.length)throw new Error('No encontré filas de inventario debajo de los encabezados.');
  const sourceFormat=map.codigo_anterior&&map.nombre&&map.stock&&map.precio&&map.costo&&map.presentacion&&map.laboratorio?'FORMATO_INVENTARIO_USUARIO':'GENERICO';
  return {sheet:ws.name,headerRow,map,sourceFormat,rows,errors,warnings};
}
async function findInventoryProduct(db,empresaId,item){
  const identity=await productIdentityMatches(db,empresaId,item);
  if(identity.barcode&&normalizeProductName(identity.barcode.nombre).toLowerCase()!==identity.cleanName.toLowerCase())throw productDuplicateError('barcode',identity.barcode);
  if(identity.name&&identity.cleanBarcode&&normalizeProductBarcode(identity.name.codigo_barras)!==identity.cleanBarcode)throw productDuplicateError('name',identity.name);
  if(identity.barcode&&identity.name&&identity.barcode.id!==identity.name.id)throw new Error(`El código de barras corresponde a ${identity.barcode.nombre}, pero el nombre corresponde a ${identity.name.nombre}.`);
  const byIdentity=identity.barcode||identity.name;if(byIdentity)return byIdentity;
  if(item.codigo_anterior){const q=await db.query(`select id,codigo_interno,codigo_barras,nombre from productos where empresa_id=$1 and codigo_anterior=$2 order by created_at limit 2`,[empresaId,String(item.codigo_anterior).trim()]);if(q.rows.length===1)return q.rows[0];if(q.rows.length>1)throw new Error(`Código anterior duplicado en la base: ${item.codigo_anterior}`);}
  return null;
}
function validateIncomingProductIdentities(rows){
  const names=new Map(),barcodes=new Map();
  for(const item of rows){
    if(item.errors?.length)continue;
    const name=normalizeProductName(item.nombre).toLowerCase(),barcode=normalizeProductBarcode(item.codigo_barras);
    const nameSeen=names.get(name),barcodeSeen=barcode&&barcodes.get(barcode);
    let message='';
    if(nameSeen&&nameSeen.barcode!==barcode)message=`Nombre duplicado dentro del Excel; conflicto con la fila ${nameSeen.row}: ${item.nombre}`;
    else if(barcodeSeen&&barcodeSeen.name!==name)message=`Código de barras duplicado dentro del Excel; conflicto con la fila ${barcodeSeen.row}: ${item.codigo_barras}`;
    if(message){item.errors.push(message);continue;}
    names.set(name,{row:item.row,barcode});if(barcode)barcodes.set(barcode,{row:item.row,name});
  }
}
async function getOrCreateCatalog(db,table,empresaId,name){
  const clean=String(name||'').trim();if(!clean)return null;
  const q=await db.query(`select id from ${table} where empresa_id=$1 and lower(trim(nombre))=lower(trim($2)) order by id limit 1`,[empresaId,clean]);if(q.rows[0])return q.rows[0].id;
  const i=await db.query(`insert into ${table}(empresa_id,nombre) values($1,$2) returning id`,[empresaId,clean]);return i.rows[0].id;
}
async function recordInventoryDiff(c,user,branchId,productId,lotId,diff,cost,reason,{applyPositive=false,increaseInitial=false}={}){
  if(Math.abs(diff)<0.0001)return;
  const a=await c.query(`insert into ajustes_inventario(empresa_id,sucursal_id,producto_id,lote_id,diferencia,motivo,usuario_id) values($1,$2,$3,$4,$5,$6,$7) returning id`,[user.empresa_id,branchId,productId,lotId,diff,reason,user.sub]);
  if(applyPositive&&diff>0)await applyPositiveStockEntry(c,{empresaId:user.empresa_id,sucursalId:branchId,productoId:productId,loteId:lotId,cantidad:diff,costoUnitario:cost||0,tipo:'IMPORTACION_EXCEL',referenciaTipo:'IMPORTACION_EXCEL',referenciaId:a.rows[0].id,usuarioId:user.sub,increaseInitial});
  else await c.query(`insert into movimientos_inventario(empresa_id,sucursal_id,producto_id,lote_id,tipo,cantidad,costo_unitario,referencia_tipo,referencia_id,usuario_id) values($1,$2,$3,$4,'IMPORTACION_EXCEL',$5,$6,'IMPORTACION_EXCEL',$7,$8)`,[user.empresa_id,branchId,productId,lotId,diff,cost||0,a.rows[0].id,user.sub]);
}

registerInitialInventory(app,{pool,tx,auth:requireAuth,branchAccess:ensureBranchAccess,catalog:getOrCreateCatalog,audit:writeAudit});

// ===== v22: Actualización EXCLUSIVA de stock desde Excel =====
// No crea productos, no cambia precios/costos/maestros y no modifica ventas históricas.
async function parseStockOnlyWorkbook(base64,branchId){
  if(!base64)throw new Error('Selecciona un archivo Excel.');
  const buffer=Buffer.from(String(base64).replace(/^data:.*?;base64,/,''),'base64');
  if(buffer.length>20*1024*1024)throw new Error('El archivo supera 20 MB.');
  const wb=new ExcelJS.Workbook();await wb.xlsx.load(buffer);
  const ws=wb.getWorksheet('Conteo físico'),info=wb.getWorksheet('Información');
  if(!ws||info?.getCell('B1').value!=='EDUXFAC_CONTEO_V1')throw new Error('Descargue el Excel para conteo físico. La plantilla anterior no permite validar stock ni sucursal.');
  if(String(info.getCell('B2').value)!==String(branchId))throw new Error('El Excel pertenece a otra sucursal.');
  const headers=['Código interno','Código de barras','Producto','Stock del sistema','Stock físico'];
  headers.forEach((h,i)=>{if(excelText(ws.getRow(1).getCell(i+1))!==h)throw new Error('No modifique los encabezados del conteo.');});
  const rows=[],seen=new Set();
  for(let r=2;r<=ws.rowCount;r++){
    const row=ws.getRow(r);if(excelText(row.getCell(5))==='')continue;
    const item={row:r,codigo_interno:excelText(row.getCell(1)),codigo_barras:excelText(row.getCell(2)),nombre:excelText(row.getCell(3)),stock:excelNumber(row.getCell(5),NaN),stock_exportado:excelNumber(row.getCell(4),NaN),errors:[]};
    if(!item.codigo_interno)item.errors.push('Código interno obligatorio.');
    if(seen.has(item.codigo_interno))throw new Error('Producto repetido en el Excel: '+item.codigo_interno);
    seen.add(item.codigo_interno);
    if(row.getCell(5).type===ExcelJS.ValueType.Formula||!Number.isFinite(item.stock)||item.stock<0)item.errors.push('Stock físico inválido; escriba un número no negativo, sin fórmulas.');
    if(!Number.isFinite(item.stock_exportado))item.errors.push('Stock del sistema inválido.');
    rows.push(item);
  }
  if(!rows.length)throw new Error('Complete Stock físico en al menos una fila. Las celdas vacías se omiten.');
  return {sheet:ws.name,rows};
}
async function findStockOnlyProduct(db,empresaId,item,branchId){
  const q=await db.query(`select p.id,p.codigo_interno,p.nombre from productos p join producto_sucursal ps on ps.producto_id=p.id
    where p.empresa_id=$1 and p.codigo_interno=$2 and ps.sucursal_id=$3 and ps.activo`,[empresaId,item.codigo_interno,branchId]);
  if(q.rows.length!==1)throw new Error('Producto no encontrado de forma única en esta sucursal.');
  return q.rows[0];
}
async function currentProductStock(db,productId,branchId,lock=false){
  const suffix=lock?' for update':'';
  const q=await db.query(`select id,numero_lote,fecha_vencimiento,costo_unitario,cantidad_inicial,cantidad_disponible from lotes where producto_id=$1 and sucursal_id=$2 order by id${suffix}`,[productId,branchId]);
  return {lots:q.rows,total:q.rows.reduce((s,l)=>s+Number(l.cantidad_disponible||0),0)};
}
async function applyStockOnlyTarget(c,user,branchId,product,target,reason,baseline){
  const inv=await currentProductStock(c,product.id,branchId,true);
  const plan=await countPlan(c,product.id,branchId,inv,target,baseline);
  if(plan.diff===0)return {stock_anterior:inv.total,stock_nuevo:target,diferencia:0,movimientos:0};
  for(const allocation of plan.allocations){
    let lot=allocation.lot;
    if(!lot){
      // A balance record without batch identity. The stock engine already sums these records.
      lot=(await c.query(`insert into lotes(producto_id,sucursal_id,numero_lote,fecha_vencimiento,costo_unitario,cantidad_inicial,cantidad_disponible)
        values($1,$2,null,null,0,0,0) on conflict(producto_id,sucursal_id,numero_lote)
        do update set cantidad_disponible=lotes.cantidad_disponible returning *`,[product.id,branchId])).rows[0];
    }
    const quantity=allocation.quantity;
    const a=await c.query(`insert into ajustes_inventario(empresa_id,sucursal_id,producto_id,lote_id,diferencia,motivo,usuario_id) values($1,$2,$3,$4,$5,$6,$7) returning id`,[user.empresa_id,branchId,product.id,lot.id,quantity,reason+(lot.numero_lote===null?' / STOCK SIN LOTE':''),user.sub]);
    if(quantity>0)await applyPositiveStockEntry(c,{empresaId:user.empresa_id,sucursalId:branchId,productoId:product.id,loteId:lot.id,cantidad:quantity,costoUnitario:lot.costo_unitario,tipo:'AJUSTE_EXCEL_STOCK',referenciaTipo:'CONTEO_FISICO',referenciaId:a.rows[0].id,usuarioId:user.sub});
    else{const updated=await c.query('update lotes set cantidad_disponible=cantidad_disponible+$2 where id=$1 and producto_id=$3 and sucursal_id=$4 and cantidad_disponible+$2>=0 returning id',[lot.id,quantity,product.id,branchId]);if(updated.rowCount!==1)throw new Error('El saldo cambió o no pertenece al producto y sucursal seleccionados.');await c.query(`insert into movimientos_inventario(empresa_id,sucursal_id,producto_id,lote_id,tipo,cantidad,costo_unitario,referencia_tipo,referencia_id,usuario_id) values($1,$2,$3,$4,'AJUSTE_EXCEL_STOCK',$5,$6,'CONTEO_FISICO',$7,$8)`,[user.empresa_id,branchId,product.id,lot.id,quantity,lot.costo_unitario,a.rows[0].id,user.sub]);}
  }
  const final=(await c.query('select coalesce(sum(cantidad_disponible),0)=$3::numeric exacto from lotes where producto_id=$1 and sucursal_id=$2',[product.id,branchId,target])).rows[0];
  if(!final.exacto)throw new Error('El stock final no coincide con el conteo físico. Se cancela el archivo.');
  return {stock_anterior:inv.total,stock_nuevo:target,diferencia:plan.diff,movimientos:plan.allocations.length};
}
app.get('/api/import/stock-only/template',requireAuth,async(req,res)=>{
  try{const branch=req.query.sucursal_id;await ensureBranchAccess(pool,req.user,branch);
    const b=await countWorkbook(pool,req.user.empresa_id,branch);
    res.setHeader('Content-Type','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition','attachment; filename="Conteo_Fisico.xlsx"');res.send(b);
  }catch(error){res.status(error.status||400).json({error:error.message});}
});
app.post('/api/import/stock-only/preview',requireAuth,async(req,res)=>{
  try{const {sucursal_id,file_base64}=req.body||{};await ensureBranchAccess(pool,req.user,sucursal_id);await requireAnyBranchRole(pool,req.user,['Administrador','Almacén']);const parsed=await parseStockOnlyWorkbook(file_base64,sucursal_id);const seen=new Set();let changes=0,same=0,errors=0;
    for(const item of parsed.rows){if(item.errors.length){errors++;continue;}try{const p=await findStockOnlyProduct(pool,req.user.empresa_id,item,sucursal_id);if(!p){item.errors.push('Producto no encontrado; esta función NO crea productos');errors++;continue;}if(seen.has(p.id)){item.errors.push('Producto repetido en el Excel');errors++;continue;}seen.add(p.id);const inv=await currentProductStock(pool,p.id,sucursal_id,false);item.producto_id=p.id;item.codigo_interno=p.codigo_interno;item.nombre_base=p.nombre;item.stock_sistema=Number(inv.total.toFixed(3));item.diferencia=Number((Number(item.stock)-item.stock_sistema).toFixed(3));const plan=await countPlan(pool,p.id,sucursal_id,inv,Number(item.stock),item.stock_exportado);item.observacion=plan.observation;item.lote_destino=plan.lot?.id||null;item.action=Math.abs(item.diferencia)<0.0001?'SIN CAMBIO':'AJUSTAR';Math.abs(item.diferencia)<0.0001?same++:changes++;}catch(e){item.errors.push(e.message);errors++;}}
    res.json({sheet:parsed.sheet,total:parsed.rows.length,cambios:changes,sin_cambio:same,errores:errors,rows:[...parsed.rows].sort((a,b)=>Number(!!b.errors.length)-Number(!!a.errors.length)).slice(0,500)});
  }catch(error){res.status(error.status||400).json({error:error.message});}
});
app.post('/api/import/stock-only/commit',requireAuth,async(req,res)=>{
  try{
    const {sucursal_id,file_base64}=req.body||{};
    await ensureBranchAccess(pool,req.user,sucursal_id);
    await requireAnyBranchRole(pool,req.user,['Administrador','Almacén']);
    const parsed=await parseStockOnlyWorkbook(file_base64,sucursal_id);
    const result=await tx(async c=>{
      await c.query(`select pg_advisory_xact_lock(hashtext($1::text),91022)`,[req.user.empresa_id]);
      await c.query('lock table lotes in share row exclusive mode');
      await ensureBranchAccess(c,req.user,sucursal_id);
      const seen=new Set();
      const valid=[];
      const omitted=[];
      for(const item of parsed.rows){
        if(item.errors?.length){omitted.push({row:item.row,error:item.errors.join('; ')});continue;}
        try{
          const p=await findStockOnlyProduct(c,req.user.empresa_id,item,sucursal_id);
          if(!p){omitted.push({row:item.row,error:'Producto no encontrado; esta función no crea productos.'});continue;}
          if(seen.has(p.id)){omitted.push({row:item.row,error:`Producto repetido en el Excel: ${p.nombre}`});continue;}
          seen.add(p.id);
          valid.push({item,p});
        }catch(e){
          omitted.push({row:item.row,error:e.message||String(e)});
        }
      }
      if(omitted.length)throw new Error('Conteo cancelado sin cambios: '+omitted.map(x=>'Fila '+x.row+': '+x.error).join('; '));
      if(!valid.length)throw new Error('No hay filas válidas para actualizar.');
      let changed=0,same=0,movements=0,net=0;
      for(const {item,p} of valid){
        const r=await applyStockOnlyTarget(c,req.user,sucursal_id,p,Number(item.stock),'AJUSTE DE INVENTARIO / CONTEO FÍSICO',item.stock_exportado);
        movements+=r.movimientos;net+=r.diferencia;
        Math.abs(r.diferencia)<0.0001?same++:changed++;
      }
      if(changed>0)await writeAudit(c,req.user,'ACTUALIZAR_SOLO_STOCK_EXCEL','productos',null,{sucursal_id,filas:parsed.rows.length,filas_validas:valid.length,omitidos:omitted.length,productos_ajustados:changed,sin_cambio:same,movimientos:movements,unidades_netas:Number(net.toFixed(3)),errores_omitidos:omitted.slice(0,20)});
      return {filas:parsed.rows.length,filas_validas:valid.length,omitidos:omitted.length,errores_omitidos:omitted.slice(0,20),productos_ajustados:changed,sin_cambio:same,movimientos:movements,unidades_netas:Number(net.toFixed(3))};
    });
    res.status(201).json(result);
  }catch(error){res.status(error.status||400).json({error:error.message});}
});

// v31.0 - Exportación PDF universal corregida
app.post('/api/export/pdf', requireAuth, async (req,res)=>{
 try{
  const {filename='EDUXFAC_reporte.pdf',title='EDUXFAC - Reporte',subtitle='',kpis=[],headers=[],rows=[]}=req.body||{};
  const clean=v=>String(v??'').replace(/[\r\n\t]+/g,' ').replace(/[^\x20-\x7E\xA0-\xFF]/g,'?').trim();
  const esc=v=>clean(v).replace(/\\/g,'\\\\').replace(/\(/g,'\\(').replace(/\)/g,'\\)');
  const fit=(v,n)=>{v=clean(v);return v.length>n?v.slice(0,Math.max(1,n-3))+'...':v};
  const cols=Math.max(1,(headers||[]).length), per=Math.max(7,Math.floor(115/cols));
  const lineFor=r=>(r||[]).map(x=>fit(x,per).padEnd(per)).join(' ');
  const lines=[clean(title)]; if(subtitle)lines.push(clean(subtitle)); lines.push('');
  (kpis||[]).forEach(x=>lines.push(clean(x?.[0])+': '+clean(x?.[1]))); lines.push('');
  if((headers||[]).length){lines.push(lineFor(headers));lines.push('-'.repeat(Math.min(150,cols*(per+1))));}
  (rows||[]).forEach(r=>lines.push(lineFor(Array.isArray(r)?r:[r])));
  if(!(rows||[]).length)lines.push('Sin registros para los filtros seleccionados.');
  const chunks=[]; for(let i=0;i<lines.length;i+=46)chunks.push(lines.slice(i,i+46));
  const objs=[]; const add=x=>{objs.push(Buffer.isBuffer(x)?x:Buffer.from(x,'latin1'));return objs.length};
  const catalog=add(''), pagesId=add(''), font=add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
  const pageIds=[];
  for(const pageLines of chunks){
    let content='BT\n';
    pageLines.forEach((ln,i)=>{const y=560-i*11, size=i===0?12:7;content+=`/F1 ${size} Tf 1 0 0 1 28 ${y} Tm (${esc(ln)}) Tj\n`;});
    content+='ET\n';
    const stream=Buffer.from(content,'latin1');
    const cid=add(Buffer.concat([Buffer.from(`<< /Length ${stream.length} >>\nstream\n`,'latin1'),stream,Buffer.from('endstream','latin1')]));
    pageIds.push(add(`<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 842 595] /Resources << /Font << /F1 ${font} 0 R >> >> /Contents ${cid} 0 R >>`));
  }
  objs[catalog-1]=Buffer.from(`<< /Type /Catalog /Pages ${pagesId} 0 R >>`,'latin1');
  objs[pagesId-1]=Buffer.from(`<< /Type /Pages /Kids [${pageIds.map(id=>id+' 0 R').join(' ')}] /Count ${pageIds.length} >>`,'latin1');
  const out=[Buffer.from('%PDF-1.4\n','latin1')], offsets=[0]; let pos=out[0].length;
  objs.forEach((obj,i)=>{offsets.push(pos);const h=Buffer.from(`${i+1} 0 obj\n`,'latin1'),t=Buffer.from('\nendobj\n','latin1');out.push(h,obj,t);pos+=h.length+obj.length+t.length;});
  const xrefPos=pos; let xref=`xref\n0 ${objs.length+1}\n0000000000 65535 f \n`;
  for(let i=1;i<offsets.length;i++)xref+=String(offsets[i]).padStart(10,'0')+' 00000 n \n';
  xref+=`trailer\n<< /Size ${objs.length+1} /Root ${catalog} 0 R >>\nstartxref\n${xrefPos}\n%%EOF`;
  out.push(Buffer.from(xref,'latin1')); const pdf=Buffer.concat(out);
  res.setHeader('Content-Type','application/pdf');res.setHeader('Content-Disposition',`attachment; filename="${clean(filename).replace(/[^A-Za-z0-9._-]/g,'_')}"`);res.send(pdf);
 }catch(e){console.error('PDF export error',e);res.status(500).json({error:'No se pudo generar el PDF.'})}
});

app.post('/api/export/xlsx', requireAuth, exportXlsx);


app.get('/api/sales/recent', requireAuth, async (req,res)=>{
  try{
    const branch=req.query.sucursal_id; if(!branch) throw new Error('sucursal_id es obligatorio.');
    await ensureBranchAccess(pool,req.user,branch);
    const limit=Math.max(1,Math.min(Number.parseInt(req.query.limit||'5',10)||5,20));
    const {rows}=await pool.query(`select v.id,v.created_at,v.total,coalesce(c.nombres,'Público en general') cliente from ventas v left join clientes c on c.id=v.cliente_id where v.empresa_id=$1 and v.sucursal_id=$2 and v.estado='EMITIDA' order by v.created_at desc limit $3`,[req.user.empresa_id,branch,limit]);
    res.json(rows);
  }catch(error){res.status(error.status||400).json({error:error.message});}
});



// ===== v19: Detalle de ventas con filtros por periodo =====
// Opciones livianas para filtros del reporte: no carga ventas.
app.get('/api/reports/sales-options', requireAuth, async (req,res)=>{
  try{
    const branch=String(req.query.sucursal_id||'').trim()||null;
    if(branch) await ensureBranchAccess(pool,req.user,branch);
    const {rows}=await pool.query(`select u.id,u.nombre from usuarios u where u.empresa_id=$1 and (exists(select 1 from usuario_sucursal us join sucursales s on s.id=us.sucursal_id where us.usuario_id=u.id and s.activo=true and s.empresa_id=$1 and ($2::uuid is null or s.id=$2)) or exists(select 1 from ventas v where v.usuario_id=u.id and v.empresa_id=$1 and ($2::uuid is null or v.sucursal_id=$2))) order by u.nombre,u.id`,[req.user.empresa_id,branch]);
    res.json({usuarios:rows});
  }catch(error){res.status(error.status||400).json({error:error.message});}
});

app.get('/api/reports/sales-detail', requireAuth, async (req,res)=>{
  try{
    const branch=String(req.query.sucursal_id||'').trim()||null;
    const from=String(req.query.desde||new Date().toISOString().slice(0,10));
    const to=String(req.query.hasta||from);
    const q=String(req.query.q||'').trim();
    const method=String(req.query.metodo||'').trim();
    const userId=String(req.query.usuario_id||'').trim()||null;
    const docType=String(req.query.tipo_comprobante||'').trim();
    if(branch) await ensureBranchAccess(pool,req.user,branch);
    if(!/^\d{4}-\d{2}-\d{2}$/.test(from)||!/^\d{4}-\d{2}-\d{2}$/.test(to)) throw new Error('Fechas inválidas.');
    if(from>to) throw new Error('La fecha inicio no puede ser posterior a la fecha fin.');
    const params=[req.user.empresa_id,branch,from,to,q,method,userId,docType];
    const where=`v.empresa_id=$1 and ($2::uuid is null or v.sucursal_id=$2)
      and (v.created_at at time zone 'America/Lima')::date between $3::date and $4::date
      and ($5='' or coalesce(c.nombres,'') ilike '%'||$5||'%' or coalesce(c.nro_doc,'') ilike '%'||$5||'%'
        or coalesce(v.numero,'') ilike '%'||$5||'%' or v.id::text ilike '%'||$5||'%'
        or exists(select 1 from reporte_detalles_netos vdx join productos px on px.id=vdx.producto_id where vdx.venta_id=v.id and (px.nombre ilike '%'||$5||'%' or px.codigo_interno ilike '%'||$5||'%' or coalesce(px.codigo_barras,'') ilike '%'||$5||'%')))
      and ($6='' or exists(select 1 from reporte_pagos_netos vpx where vpx.venta_id=v.id and lower(vpx.metodo)=lower($6)))
      and ($7::uuid is null or v.usuario_id=$7)
      and ($8='' or upper(coalesce(v.tipo_comprobante,''))=upper($8))`;
    const base=`from reporte_ventas_netas v
      join sucursales s on s.id=v.sucursal_id
      join usuarios u on u.id=v.usuario_id
      left join clientes c on c.id=v.cliente_id
      left join lateral (select count(*)::int lineas,coalesce(sum(vd.cantidad),0)::numeric(14,3) unidades,
        coalesce(sum(vd.cantidad*(case when vd.costo_snapshot>0 then vd.costo_snapshot else coalesce(nullif(vd.factor_unidades,0),1)*coalesce(
          (select mi0.costo_unitario from movimientos_inventario mi0 where mi0.referencia_tipo='VENTA' and mi0.referencia_id=v.id and mi0.producto_id=vd.producto_id and (vd.lote_id is null or mi0.lote_id=vd.lote_id) and mi0.costo_unitario>0 order by mi0.id desc limit 1),
          (select cd.costo_unitario from compra_detalles cd join compras c2 on c2.id=cd.compra_id where cd.producto_id=vd.producto_id and c2.sucursal_id=v.sucursal_id and cd.costo_unitario>0 and c2.created_at<=v.created_at order by c2.fecha desc,c2.created_at desc,cd.id desc limit 1),
          (select mi.costo_unitario from movimientos_inventario mi where mi.producto_id=vd.producto_id and mi.sucursal_id=v.sucursal_id and mi.costo_unitario>0 and mi.created_at<=v.created_at and mi.tipo not in ('VENTA','AJUSTE_EXCEL_STOCK') order by mi.created_at desc,mi.id desc limit 1),
          (select l2.costo_unitario from lotes l2 where l2.producto_id=vd.producto_id and l2.sucursal_id=v.sucursal_id and l2.costo_unitario>0 order by case when l2.numero_lote='AJUSTE-EXCEL' then 1 else 0 end,l2.id desc limit 1),0) end)),0)::numeric(14,2) costo
        from reporte_detalles_netos vd where vd.venta_id=v.id) det on true
      left join lateral (select string_agg(metodo, ', ' order by metodo) metodo_pago from reporte_pagos_netos where venta_id=v.id) pay on true
      where ${where}`;
    const [list,summary,users]=await Promise.all([
      pool.query(`select v.id,v.created_at,v.tipo_comprobante,v.serie,v.numero,v.subtotal,v.descuento,v.total,v.estado,
        s.nombre sucursal,coalesce(c.nombres,'Público en general') cliente,coalesce(c.nro_doc,'') nro_doc,u.nombre cajero,
        coalesce(pay.metodo_pago,'') metodo_pago,coalesce(det.lineas,0)::int lineas,coalesce(det.unidades,0)::numeric(14,3) unidades,
        coalesce(det.costo,0)::numeric(14,2) costo,(v.total-coalesce(det.costo,0))::numeric(14,2) utilidad
        ${base} order by v.created_at desc limit 1000`,params),
      pool.query(`select count(*) filter(where v.estado IN ('EMITIDA','DEVOLUCION_PARCIAL'))::int tickets,
        coalesce(sum(v.total) filter(where v.estado IN ('EMITIDA','DEVOLUCION_PARCIAL')),0)::numeric(14,2) ventas,
        coalesce(sum(coalesce(det.costo,0)) filter(where v.estado IN ('EMITIDA','DEVOLUCION_PARCIAL')),0)::numeric(14,2) costo,
        coalesce(sum(v.total-coalesce(det.costo,0)) filter(where v.estado IN ('EMITIDA','DEVOLUCION_PARCIAL')),0)::numeric(14,2) utilidad,
        coalesce(avg(v.total) filter(where v.estado IN ('EMITIDA','DEVOLUCION_PARCIAL')),0)::numeric(14,2) ticket_promedio,
        coalesce(sum(coalesce(det.unidades,0)) filter(where v.estado IN ('EMITIDA','DEVOLUCION_PARCIAL')),0)::numeric(14,3) unidades
        ${base}`,params),
      pool.query(`select distinct u.id,u.nombre from usuarios u join usuario_sucursal us on us.usuario_id=u.id join sucursales s on s.id=us.sucursal_id
        where u.empresa_id=$1 and u.activo=true and ($2::uuid is null or s.id=$2) order by u.nombre`,[req.user.empresa_id,branch])
    ]);
    res.json({desde:from,hasta:to,rows:list.rows,summary:summary.rows[0],usuarios:users.rows,limit:1000});
  }catch(error){res.status(error.status||400).json({error:error.message});}
});

// ===== v24 Centro de Reportes =====
app.get('/api/reports/:documentType/:id/detail', requireAuth, async (req,res)=>{
  try {res.json(await readReportDocument(pool,req.user,req.params.documentType,req.params.id));}
  catch(error){res.status(error.status||500).json({error:error.status?error.message:'No se pudo consultar el detalle del documento.'});}
});

app.get('/api/reports/center/:type', requireAuth, async (req,res)=>{
  try{
    const type=String(req.params.type||'').toLowerCase();
    const branch=req.query.sucursal_id||null;
    const from=req.query.desde||new Date(Date.now()-29*86400000).toISOString().slice(0,10);
    const to=req.query.hasta||new Date().toISOString().slice(0,10);
    const q=String(req.query.q||'').trim();
    const top=Math.min(200,Math.max(1,Number(req.query.top||20)||20));
    const days=Math.min(3650,Math.max(1,Number(req.query.dias||90)||90));
    const orderKey=['unidades','ventas','utilidad'].includes(String(req.query.orden||''))?String(req.query.orden):'unidades';
    if(!/^\d{4}-\d{2}-\d{2}$/.test(from)||!/^\d{4}-\d{2}-\d{2}$/.test(to)) throw new Error('Fechas inválidas.');
    if(from>to) throw new Error('La fecha inicio no puede ser posterior a la fecha fin.');
    if(branch) await ensureBranchAccess(pool,req.user,branch);
    const empresa=req.user.empresa_id;
    const saleDate=`(v.created_at at time zone 'America/Lima')::date between $3::date and $4::date`;
    // Mismo respaldo de costo que el modal Detalle; el lote vinculado puede tener costo cero.
    // costo_snapshot es por presentación: multiplicar por cantidad neta, sin repetir el factor.
    const costExpr=`(case when vd.costo_snapshot>0 then vd.costo_snapshot else coalesce(nullif(vd.factor_unidades,0),1)*coalesce((select mi0.costo_unitario from movimientos_inventario mi0 where mi0.referencia_tipo='VENTA' and mi0.referencia_id=v.id and mi0.producto_id=vd.producto_id and (vd.lote_id is null or mi0.lote_id=vd.lote_id) and mi0.costo_unitario>0 order by mi0.id desc limit 1),(select cd.costo_unitario from compra_detalles cd join compras c2 on c2.id=cd.compra_id where cd.producto_id=vd.producto_id and c2.sucursal_id=v.sucursal_id and cd.costo_unitario>0 and c2.created_at<=v.created_at order by c2.fecha desc,c2.created_at desc,cd.id desc limit 1),(select mi.costo_unitario from movimientos_inventario mi where mi.producto_id=vd.producto_id and mi.sucursal_id=v.sucursal_id and mi.costo_unitario>0 and mi.created_at<=v.created_at and mi.tipo not in ('VENTA','AJUSTE_EXCEL_STOCK') order by mi.created_at desc,mi.id desc limit 1),(select l2.costo_unitario from lotes l2 where l2.producto_id=vd.producto_id and l2.sucursal_id=v.sucursal_id and l2.costo_unitario>0 order by case when l2.numero_lote='AJUSTE-EXCEL' then 1 else 0 end,l2.id desc limit 1),0) end)`;

    if(type==='sales'){
      const seller=req.query.usuario_id||null;
      if(seller && (typeof seller!=='string'||!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(seller))) throw new Error('Vendedor inválido.');
      const params=[empresa,branch,from,to,q,seller];
      const where=`v.empresa_id=$1 and v.estado IN ('EMITIDA','DEVOLUCION_PARCIAL') and ($2::uuid is null or v.sucursal_id=$2) and ${saleDate} and ($6::uuid is null or v.usuario_id=$6)
        and ($5='' or coalesce(c.nombres,'') ilike '%'||$5||'%' or coalesce(c.nro_doc,'') ilike '%'||$5||'%' or coalesce(v.numero,'') ilike '%'||$5||'%' or exists(select 1 from reporte_detalles_netos vdx join productos px on px.id=vdx.producto_id where vdx.venta_id=v.id and (px.nombre ilike '%'||$5||'%' or px.codigo_interno ilike '%'||$5||'%')))`;
      const base=`from reporte_ventas_netas v left join clientes c on c.id=v.cliente_id join usuarios u on u.id=v.usuario_id
        left join lateral (select coalesce(sum(vd.cantidad),0) unidades,coalesce(sum(vd.cantidad*${costExpr}),0) costo from reporte_detalles_netos vd left join lotes lv on lv.id=vd.lote_id where vd.venta_id=v.id) d on true
        left join lateral (select string_agg(metodo,', ' order by metodo) metodo_pago from reporte_pagos_netos where venta_id=v.id) pay on true where ${where}`;
      const [list,sum,detail]=await Promise.all([
        pool.query(`select v.id,to_char(v.created_at at time zone 'America/Lima','DD/MM/YYYY HH24:MI') fecha,coalesce(v.numero,'') numero,coalesce(c.nombres,'Público en general') cliente,u.nombre cajero,coalesce(pay.metodo_pago,'') metodo_pago,coalesce(d.unidades,0)::numeric(14,3) unidades,coalesce(d.costo,0)::numeric(14,2) costo,v.total::numeric(14,2) total,(v.total-coalesce(d.costo,0))::numeric(14,2) utilidad ${base} order by v.created_at desc${req.query.orden_recientes==='desc'?',v.id desc':''} limit 1000`,params),
        pool.query(`select count(*)::int tickets,coalesce(sum(v.total),0)::numeric(14,2) ventas,coalesce(sum(d.unidades),0)::numeric(14,3) unidades,coalesce(sum(d.costo),0)::numeric(14,2) costo,coalesce(sum(v.total-d.costo),0)::numeric(14,2) utilidad ${base}`,params),
        pool.query(`select v.id venta_id,to_char(v.created_at at time zone 'America/Lima','DD/MM/YYYY HH24:MI') fecha,coalesce(v.numero,'') numero,coalesce(c.nombres,'Público en general') cliente,p.codigo_interno,p.nombre producto,coalesce(vd.presentacion_venta,p.unidad_medida,'UNIDAD') unidad_medida,coalesce(sum(vd.cantidad),0)::numeric(14,3) cantidad,vd.precio_unitario::numeric(14,2) precio_unitario,coalesce(sum(vd.total),0)::numeric(14,2) total,
          coalesce(sum(vd.cantidad*${costExpr}),0)::numeric(14,2) costo_total,
          case when coalesce(sum(vd.cantidad),0)>0 then (sum(vd.cantidad*${costExpr})/sum(vd.cantidad)) else 0 end::numeric(14,4) costo_unitario,
          (coalesce(sum(vd.total),0)-coalesce(sum(vd.cantidad*${costExpr}),0))::numeric(14,2) utilidad
          from reporte_ventas_netas v left join clientes c on c.id=v.cliente_id join reporte_detalles_netos vd on vd.venta_id=v.id join productos p on p.id=vd.producto_id left join lotes lv on lv.id=vd.lote_id
          where ${where}
          group by v.id,v.created_at,v.numero,c.nombres,p.id,p.codigo_interno,p.nombre,p.unidad_medida,vd.presentacion_venta,vd.precio_unitario
          order by v.created_at desc,v.id,p.nombre`,params)
      ]);
      return res.json({descripcion:'Ventas netas de devoluciones, atribuidas a la fecha de venta',summary:sum.rows[0],rows:list.rows,details:detail.rows});
    }

    if(type==='cancellations'){
      await ensureReturnsSchema(pool);
      const p=[empresa,branch,from,to,q];
      const where=`dv.empresa_id=$1 and dv.tipo='TOTAL' and ($2::uuid is null or dv.sucursal_id=$2) and (dv.created_at at time zone 'America/Lima')::date between $3::date and $4::date
        and ($5='' or coalesce(dv.motivo,'') ilike '%'||$5||'%' or coalesce(u.nombre,'') ilike '%'||$5||'%' or coalesce(v.numero,'') ilike '%'||$5||'%' or coalesce(s.nombre,'') ilike '%'||$5||'%' or exists(select 1 from devolucion_venta_detalles ddx join reporte_detalles_netos vdx on vdx.id=ddx.venta_detalle_id join productos px on px.id=vdx.producto_id where ddx.devolucion_id=dv.id and (px.nombre ilike '%'||$5||'%' or px.codigo_interno ilike '%'||$5||'%'))) `;
      const base=`from devoluciones_venta dv join reporte_ventas_netas v on v.id=dv.venta_id join sucursales s on s.id=dv.sucursal_id left join usuarios u on u.id=dv.usuario_id where ${where}`;
      const [list,sum]=await Promise.all([
        pool.query(`select dv.id,to_char(dv.created_at at time zone 'America/Lima','DD/MM/YYYY HH24:MI') fecha_anulacion,to_char(v.created_at at time zone 'America/Lima','DD/MM/YYYY HH24:MI') fecha_venta,coalesce(v.numero,'') numero,s.nombre sucursal,coalesce(u.nombre,'—') usuario,dv.motivo,dv.metodo_reembolso,dv.monto::numeric(14,2) monto,(select coalesce(sum(dd.cantidad),0) from devolucion_venta_detalles dd where dd.devolucion_id=dv.id)::numeric(14,3) unidades,(select count(*) from devolucion_venta_detalles dd where dd.devolucion_id=dv.id)::int productos ${base} order by dv.created_at desc limit 1000`,p),
        pool.query(`select count(*)::int anulaciones,coalesce(sum(dv.monto),0)::numeric(14,2) total_reembolsado,count(distinct dv.usuario_id)::int usuarios,count(distinct dv.sucursal_id)::int sucursales,coalesce(sum((select sum(dd.cantidad) from devolucion_venta_detalles dd where dd.devolucion_id=dv.id)),0)::numeric(14,3) unidades ${base}`,p)
      ]);
      return res.json({descripcion:'Anulaciones totales realizadas en el periodo seleccionado',summary:sum.rows[0],rows:list.rows});
    }

    if(type==='purchases'){
      const p=[empresa,branch,from,to,q];
      const where=`c.empresa_id=$1 and ($2::uuid is null or c.sucursal_id=$2) and c.fecha between $3::date and $4::date and ($5='' or coalesce(pr.razon_social,'') ilike '%'||$5||'%' or coalesce(c.numero,'') ilike '%'||$5||'%' or exists(select 1 from compra_detalles cdx join productos px on px.id=cdx.producto_id where cdx.compra_id=c.id and (px.nombre ilike '%'||$5||'%' or px.codigo_interno ilike '%'||$5||'%')))`;
      const base=`from compras c left join proveedores pr on pr.id=c.proveedor_id left join usuarios u on u.id=c.usuario_id left join lateral (select count(*)::int items,coalesce(sum(cantidad),0) unidades from compra_detalles where compra_id=c.id) d on true where ${where}`;
      const [list,sum]=await Promise.all([
        pool.query(`select c.id,c.fecha::text fecha,coalesce(pr.razon_social,'Sin proveedor') proveedor,c.tipo_documento,c.serie,c.numero,coalesce(u.nombre,'—') usuario,coalesce(d.items,0) items,coalesce(d.unidades,0)::numeric(14,3) unidades,c.total::numeric(14,2) total ${base} order by c.fecha desc,c.created_at desc limit 1000`,p),
        pool.query(`select count(*)::int documentos,coalesce(sum(c.total),0)::numeric(14,2) total,coalesce(sum(d.unidades),0)::numeric(14,3) unidades,count(distinct c.proveedor_id)::int proveedores,coalesce(avg(c.total),0)::numeric(14,2) promedio ${base}`,p)
      ]);
      return res.json({descripcion:'Compras registradas en el periodo seleccionado',summary:sum.rows[0],rows:list.rows});
    }

    if(type==='expiry'){
      if(!req.query.desde||!req.query.hasta)throw new Error('Seleccione Fecha inicio y Fecha fin.');
      const p=[empresa,branch,from,to];
      const where=`p.empresa_id=$1 and ($2::uuid is null or l.sucursal_id=$2) and l.cantidad_disponible>0 and l.fecha_vencimiento is not null and l.fecha_vencimiento between $3::date and $4::date`;
      const [list,sum]=await Promise.all([
        pool.query(`select p.codigo_interno,p.nombre,l.numero_lote,l.fecha_vencimiento::text fecha_vencimiento,(l.fecha_vencimiento-current_date)::int dias,l.cantidad_disponible::numeric(14,3) stock,l.costo_unitario::numeric(14,4) costo_unitario,(l.cantidad_disponible*l.costo_unitario)::numeric(14,2) valor,case when l.fecha_vencimiento<current_date then 'VENCIDO' when l.fecha_vencimiento<=current_date+30 then 'CRÍTICO' else 'PRÓXIMO' end estado from lotes l join productos p on p.id=l.producto_id where ${where} order by l.fecha_vencimiento,p.nombre limit 1000`,p),
        pool.query(`select count(*)::int lotes,count(*) filter(where l.fecha_vencimiento<current_date)::int vencidos,count(*) filter(where l.fecha_vencimiento>=current_date and l.fecha_vencimiento<=current_date+30)::int criticos,coalesce(sum(l.cantidad_disponible),0)::numeric(14,3) unidades,coalesce(sum(l.cantidad_disponible*l.costo_unitario),0)::numeric(14,2) valor from lotes l join productos p on p.id=l.producto_id where ${where}`,p)
      ]);
      return res.json({descripcion:`Lotes con vencimiento entre ${from} y ${to} (inclusive)`,summary:sum.rows[0],rows:list.rows});
    }

    if(type==='top-products'||type==='low-products'){
      const p=[empresa,branch,from,to,q,top];
      const order=type==='top-products'?'desc':'asc';
      const metric=orderKey==='ventas'?'ventas':orderKey==='utilidad'?'utilidad':'unidades';
      const sql=`with st as (select producto_id,sum(cantidad_disponible) stock from lotes where ($2::uuid is null or sucursal_id=$2) group by producto_id), agg as (
        select p.id,p.codigo_interno,p.nombre,coalesce(st.stock,0)::numeric(14,3) stock,coalesce(sum(vd.cantidad) filter(where v.id is not null),0)::numeric(14,3) unidades,coalesce(sum(vd.total) filter(where v.id is not null),0)::numeric(14,2) ventas,
        coalesce(sum(vd.total-vd.cantidad*${costExpr}) filter(where v.id is not null),0)::numeric(14,2) utilidad,to_char(max(v.created_at) at time zone 'America/Lima','DD/MM/YYYY HH24:MI') ultima_venta
        from productos p left join st on st.producto_id=p.id left join reporte_detalles_netos vd on vd.producto_id=p.id left join reporte_ventas_netas v on v.id=vd.venta_id and v.estado IN ('EMITIDA','DEVOLUCION_PARCIAL') and ($2::uuid is null or v.sucursal_id=$2) and (v.created_at at time zone 'America/Lima')::date between $3::date and $4::date left join lotes lv on lv.id=vd.lote_id
        where ($2::uuid is null or exists(select 1 from producto_sucursal ps where ps.producto_id=p.id and ps.sucursal_id=$2 and ps.activo)) and p.empresa_id=$1 and ($2::uuid is not null or p.activo=true) and ($5='' or p.nombre ilike '%'||$5||'%' or p.codigo_interno ilike '%'||$5||'%') group by p.id,st.stock)
        select row_number() over(order by ${metric} ${order},nombre)::int ranking,* from agg order by ${metric} ${order},nombre limit $6`;
      const list=await pool.query(sql,p);
      const sum=await pool.query(`with agg as (select p.id,coalesce(sum(vd.cantidad) filter(where v.id is not null),0) unidades,coalesce(sum(vd.total) filter(where v.id is not null),0) ventas,coalesce(sum(vd.total-vd.cantidad*${costExpr}) filter(where v.id is not null),0) utilidad from productos p left join reporte_detalles_netos vd on vd.producto_id=p.id left join reporte_ventas_netas v on v.id=vd.venta_id and v.estado IN ('EMITIDA','DEVOLUCION_PARCIAL') and ($2::uuid is null or v.sucursal_id=$2) and (v.created_at at time zone 'America/Lima')::date between $3::date and $4::date left join lotes lv on lv.id=vd.lote_id where ($2::uuid is null or exists(select 1 from producto_sucursal ps where ps.producto_id=p.id and ps.sucursal_id=$2 and ps.activo)) and p.empresa_id=$1 and ($2::uuid is not null or p.activo=true) and ($5='' or p.nombre ilike '%'||$5||'%' or p.codigo_interno ilike '%'||$5||'%') group by p.id) select count(*)::int productos,coalesce(sum(unidades),0)::numeric(14,3) unidades,coalesce(sum(ventas),0)::numeric(14,2) ventas,coalesce(sum(utilidad),0)::numeric(14,2) utilidad,count(*) filter(where unidades=0)::int sin_ventas from agg`,[empresa,branch,from,to,q]);
      return res.json({descripcion:type==='top-products'?'Ranking de productos más vendidos':'Ranking de productos menos vendidos, incluyendo productos sin ventas',summary:sum.rows[0],rows:list.rows});
    }

    if(type==='users'){
      const p=[empresa,branch,from,to,q];
      const base=`from usuarios u join reporte_ventas_netas v on v.usuario_id=u.id and v.estado IN ('EMITIDA','DEVOLUCION_PARCIAL') left join reporte_detalles_netos vd on vd.venta_id=v.id left join lotes lv on lv.id=vd.lote_id where u.empresa_id=$1 and ($2::uuid is null or v.sucursal_id=$2) and (v.created_at at time zone 'America/Lima')::date between $3::date and $4::date and ($5='' or u.nombre ilike '%'||$5||'%' or u.usuario ilike '%'||$5||'%')`;
      const list=await pool.query(`select u.id,u.nombre usuario,count(distinct v.id)::int tickets,coalesce(sum(vd.cantidad),0)::numeric(14,3) unidades,coalesce(sum(vd.total),0)::numeric(14,2) ventas,coalesce(sum(vd.cantidad*${costExpr}),0)::numeric(14,2) costo,coalesce(sum(vd.total-vd.cantidad*${costExpr}),0)::numeric(14,2) utilidad,coalesce(sum(vd.total)/nullif(count(distinct v.id),0),0)::numeric(14,2) ticket_promedio ${base} group by u.id order by ventas desc`,p);
      const sum=await pool.query(`select count(distinct u.id)::int usuarios,count(distinct v.id)::int tickets,coalesce(sum(vd.cantidad),0)::numeric(14,3) unidades,coalesce(sum(vd.total),0)::numeric(14,2) ventas,coalesce(sum(vd.total-vd.cantidad*${costExpr}),0)::numeric(14,2) utilidad ${base}`,p);
      return res.json({descripcion:'Ventas y utilidad generada por usuario',summary:sum.rows[0],rows:list.rows});
    }

    if(type==='inventory'){
      const p=[empresa,branch,q];
      const base=`from productos p left join lateral (select coalesce(sum(cantidad_disponible),0) stock,coalesce(sum(cantidad_disponible*costo_unitario),0) valor,coalesce(sum(cantidad_disponible*costo_unitario)/nullif(sum(cantidad_disponible),0),0) costo from lotes where producto_id=p.id and ($2::uuid is null or sucursal_id=$2)) st on true left join (select distinct on (pp.producto_id) pp.producto_id,pp.precio_venta from precios_producto pp where (pp.sucursal_id=$2 or pp.sucursal_id is null) and pp.vigente_hasta is null order by pp.producto_id,(pp.sucursal_id is not null) desc,pp.vigente_desde desc) pr on pr.producto_id=p.id where ($2::uuid is null or exists(select 1 from producto_sucursal ps where ps.producto_id=p.id and ps.sucursal_id=$2 and ps.activo=true)) and p.empresa_id=$1 and ($2::uuid is not null or p.activo=true) and ($3='' or p.nombre ilike '%'||$3||'%' or p.codigo_interno ilike '%'||$3||'%')`;
      const list=await pool.query(`select p.codigo_interno,p.nombre,p.unidad_medida,coalesce((select ps.stock_minimo from producto_sucursal ps where ps.producto_id=p.id and ps.sucursal_id=$2),p.stock_minimo) stock_minimo,coalesce(st.stock,0)::numeric(14,3) stock,coalesce(st.costo,0)::numeric(14,4) costo,coalesce(pr.precio_venta,0)::numeric(14,2) precio,coalesce(st.valor,0)::numeric(14,2) valor ${base} order by p.nombre limit 2000`,p);
      const sum=await pool.query(`select count(*)::int productos,coalesce(sum(st.stock),0)::numeric(14,3) unidades,count(*) filter(where coalesce(st.stock,0)<=0)::int sin_stock,count(*) filter(where coalesce((select ps.stock_minimo from producto_sucursal ps where ps.producto_id=p.id and ps.sucursal_id=$2),p.stock_minimo)>0 and coalesce(st.stock,0)<=coalesce((select ps.stock_minimo from producto_sucursal ps where ps.producto_id=p.id and ps.sucursal_id=$2),p.stock_minimo))::int stock_bajo,coalesce(sum(st.valor),0)::numeric(14,2) valor ${base}`,p);
      return res.json({descripcion:'Inventario actual y valorización de stock',summary:sum.rows[0],rows:list.rows});
    }

    if(type==='payments'){
      const p=[empresa,branch,from,to];
      const list=await pool.query(`with x as (select vp.metodo,count(*)::int operaciones,sum(vp.monto)::numeric(14,2) total from reporte_pagos_netos vp join reporte_ventas_netas v on v.id=vp.venta_id where v.empresa_id=$1 and v.estado IN ('EMITIDA','DEVOLUCION_PARCIAL') and ($2::uuid is null or v.sucursal_id=$2) and (v.created_at at time zone 'America/Lima')::date between $3::date and $4::date group by vp.metodo), t as (select coalesce(sum(total),0) total from x) select x.*,case when t.total>0 then round(x.total*100/t.total,2) else 0 end porcentaje from x cross join t order by x.total desc`,p);
      const total=list.rows.reduce((a,r)=>a+Number(r.total||0),0), ops=list.rows.reduce((a,r)=>a+Number(r.operaciones||0),0), efectivo=list.rows.filter(r=>String(r.metodo).toLowerCase()==='efectivo').reduce((a,r)=>a+Number(r.total||0),0);
      return res.json({descripcion:'Cobros agrupados por método de pago',summary:{total,operaciones:ops,metodos:list.rows.length,efectivo,otros:total-efectivo},rows:list.rows});
    }

    if(type==='suppliers'){
      const p=[empresa,branch,from,to,q];
      const list=await pool.query(`select coalesce(pr.razon_social,'Sin proveedor') proveedor,count(distinct c.id)::int documentos,coalesce(sum(cd.cantidad),0)::numeric(14,3) unidades,coalesce(sum(cd.total),0)::numeric(14,2) total,max(c.fecha)::text ultima_compra from compras c left join proveedores pr on pr.id=c.proveedor_id left join compra_detalles cd on cd.compra_id=c.id where c.empresa_id=$1 and ($2::uuid is null or c.sucursal_id=$2) and c.fecha between $3::date and $4::date and ($5='' or coalesce(pr.razon_social,'Sin proveedor') ilike '%'||$5||'%') group by pr.id,pr.razon_social order by total desc`,p);
      const total=list.rows.reduce((a,r)=>a+Number(r.total||0),0), docs=list.rows.reduce((a,r)=>a+Number(r.documentos||0),0), units=list.rows.reduce((a,r)=>a+Number(r.unidades||0),0);
      return res.json({descripcion:'Compras acumuladas por proveedor',summary:{proveedores:list.rows.length,total,documentos:docs,unidades:units,promedio:docs?total/docs:0},rows:list.rows});
    }

    if(type==='management'){
      const p=[empresa,branch,from,to];
      const sales=await pool.query(`select coalesce(sum(vd.total),0)::numeric(14,2) ventas,count(distinct v.id)::int tickets,coalesce(sum(vd.cantidad),0)::numeric(14,3) unidades,coalesce(sum(vd.cantidad*${costExpr}),0)::numeric(14,2) costo,coalesce(sum(vd.total-vd.cantidad*${costExpr}),0)::numeric(14,2) utilidad from reporte_ventas_netas v left join reporte_detalles_netos vd on vd.venta_id=v.id left join lotes lv on lv.id=vd.lote_id where v.empresa_id=$1 and v.estado IN ('EMITIDA','DEVOLUCION_PARCIAL') and ($2::uuid is null or v.sucursal_id=$2) and ${saleDate}`,p);
      const purchases=await pool.query(`select coalesce(sum(total),0)::numeric(14,2) compras from compras where empresa_id=$1 and ($2::uuid is null or sucursal_id=$2) and fecha between $3::date and $4::date`,p);
      const rows=await pool.query(`select s.nombre sucursal,coalesce(sum(vd.total),0)::numeric(14,2) ventas,count(distinct v.id)::int tickets,coalesce(sum(vd.cantidad),0)::numeric(14,3) unidades,coalesce(sum(vd.cantidad*${costExpr}),0)::numeric(14,2) costo,coalesce(sum(vd.total-vd.cantidad*${costExpr}),0)::numeric(14,2) utilidad from sucursales s left join reporte_ventas_netas v on v.sucursal_id=s.id and v.estado IN ('EMITIDA','DEVOLUCION_PARCIAL') and (v.created_at at time zone 'America/Lima')::date between $3::date and $4::date left join reporte_detalles_netos vd on vd.venta_id=v.id left join lotes lv on lv.id=vd.lote_id where s.empresa_id=$1 and ($2::uuid is null or s.id=$2) group by s.id order by ventas desc`,p);
      const sm=sales.rows[0];
      return res.json({descripcion:'Resumen gerencial del periodo seleccionado',summary:{ventas:sm.ventas,compras:purchases.rows[0].compras,utilidad:sm.utilidad,tickets:sm.tickets,ticket_promedio:Number(sm.tickets)?Number(sm.ventas)/Number(sm.tickets):0},rows:rows.rows});
    }

    throw new Error('Tipo de reporte no reconocido.');
  }catch(error){res.status(error.status||400).json({error:error.message});}
});

app.get('/api/reports/summary', requireAuth, async (req,res)=>{
  const branch=req.query.sucursal_id||null;const from=req.query.desde||new Date(Date.now()-29*86400000).toISOString().slice(0,10);const to=req.query.hasta||new Date().toISOString().slice(0,10);if(branch){try{await ensureBranchAccess(pool,req.user,branch);}catch(error){return res.status(error.status||400).json({error:error.message});}}
  const p=[req.user.empresa_id,branch,from,to];
  const [sales,purchases,profit,methods,top,branches]=await Promise.all([
    pool.query(`select coalesce(sum(total),0)::numeric(14,2) total,count(*)::int tickets,coalesce(avg(total),0)::numeric(14,2) ticket_promedio from reporte_ventas_netas where empresa_id=$1 and estado IN ('EMITIDA','DEVOLUCION_PARCIAL') and ($2::uuid is null or sucursal_id=$2) and (created_at at time zone 'America/Lima')::date between $3::date and $4::date`,p),
    pool.query(`select coalesce(sum(total),0)::numeric(14,2) total,count(*)::int documentos from compras where empresa_id=$1 and ($2::uuid is null or sucursal_id=$2) and fecha between $3::date and $4::date`,p),
    pool.query(`select coalesce(sum(vd.total-vd.cantidad*(case when vd.costo_snapshot>0 then vd.costo_snapshot else coalesce(
      (select cd.costo_unitario from compra_detalles cd join compras c2 on c2.id=cd.compra_id where cd.producto_id=vd.producto_id and c2.sucursal_id=v.sucursal_id and cd.costo_unitario>0 and c2.created_at<=v.created_at order by c2.fecha desc,c2.created_at desc,cd.id desc limit 1),
      (select mi.costo_unitario from movimientos_inventario mi where mi.producto_id=vd.producto_id and mi.sucursal_id=v.sucursal_id and mi.costo_unitario>0 and mi.created_at<=v.created_at and mi.tipo not in ('VENTA','AJUSTE_EXCEL_STOCK') order by mi.created_at desc,mi.id desc limit 1),
      (select l2.costo_unitario from lotes l2 where l2.producto_id=vd.producto_id and l2.sucursal_id=v.sucursal_id and l2.costo_unitario>0 order by case when l2.numero_lote='AJUSTE-EXCEL' then 1 else 0 end,l2.id desc limit 1),0) end)),0)::numeric(14,2) utilidad from reporte_detalles_netos vd join reporte_ventas_netas v on v.id=vd.venta_id where v.empresa_id=$1 and v.estado IN ('EMITIDA','DEVOLUCION_PARCIAL') and ($2::uuid is null or v.sucursal_id=$2) and (v.created_at at time zone 'America/Lima')::date between $3::date and $4::date`,p),
    pool.query(`select vp.metodo,coalesce(sum(vp.monto),0)::numeric(14,2) total from reporte_pagos_netos vp join reporte_ventas_netas v on v.id=vp.venta_id where v.empresa_id=$1 and v.estado IN ('EMITIDA','DEVOLUCION_PARCIAL') and ($2::uuid is null or v.sucursal_id=$2) and (v.created_at at time zone 'America/Lima')::date between $3::date and $4::date group by vp.metodo order by total desc`,p),
    pool.query(`select p.nombre,sum(vd.cantidad)::numeric(14,3) unidades,sum(vd.total)::numeric(14,2) ventas,
      sum(vd.total-vd.cantidad*(case when vd.costo_snapshot>0 then vd.costo_snapshot else coalesce(
        (select mi0.costo_unitario from movimientos_inventario mi0 where mi0.referencia_tipo='VENTA' and mi0.referencia_id=v.id and mi0.producto_id=vd.producto_id and (vd.lote_id is null or mi0.lote_id=vd.lote_id) and mi0.costo_unitario>0 order by mi0.id desc limit 1),
        (select cd.costo_unitario from compra_detalles cd join compras c2 on c2.id=cd.compra_id where cd.producto_id=vd.producto_id and c2.sucursal_id=v.sucursal_id and cd.costo_unitario>0 and c2.created_at<=v.created_at order by c2.fecha desc,c2.created_at desc,cd.id desc limit 1),
        (select mi.costo_unitario from movimientos_inventario mi where mi.producto_id=vd.producto_id and mi.sucursal_id=v.sucursal_id and mi.costo_unitario>0 and mi.created_at<=v.created_at and mi.tipo not in ('VENTA','AJUSTE_EXCEL_STOCK') order by mi.created_at desc,mi.id desc limit 1),
        (select l2.costo_unitario from lotes l2 where l2.producto_id=vd.producto_id and l2.sucursal_id=v.sucursal_id and l2.costo_unitario>0 order by case when l2.numero_lote='AJUSTE-EXCEL' then 1 else 0 end,l2.id desc limit 1),0) end))::numeric(14,2) utilidad
      from reporte_detalles_netos vd join reporte_ventas_netas v on v.id=vd.venta_id join productos p on p.id=vd.producto_id where v.empresa_id=$1 and v.estado IN ('EMITIDA','DEVOLUCION_PARCIAL') and ($2::uuid is null or v.sucursal_id=$2) and (v.created_at at time zone 'America/Lima')::date between $3::date and $4::date group by p.id order by ventas desc limit 20`,p),
    pool.query(`select s.id,s.nombre,coalesce(sum(v.total),0)::numeric(14,2) ventas,count(v.id)::int tickets from sucursales s left join reporte_ventas_netas v on v.sucursal_id=s.id and v.estado IN ('EMITIDA','DEVOLUCION_PARCIAL') and (v.created_at at time zone 'America/Lima')::date between $3::date and $4::date where s.empresa_id=$1 and ($2::uuid is null or s.id=$2) group by s.id order by ventas desc`,p)
  ]);res.json({desde:from,hasta:to,ventas:sales.rows[0],compras:purchases.rows[0],utilidad:profit.rows[0].utilidad,metodos_pago:methods.rows,top_productos:top.rows,sucursales:branches.rows});
});
app.get('/api/reports/kardex', requireAuth, async (req,res)=>{const branch=req.query.sucursal_id;try{await ensureBranchAccess(pool,req.user,branch);}catch(error){return res.status(error.status||400).json({error:error.message});}const {rows}=await pool.query(`select mi.created_at,p.codigo_interno,p.nombre,mi.tipo,mi.cantidad,mi.costo_unitario,l.numero_lote,u.nombre usuario,mi.referencia_tipo from movimientos_inventario mi join productos p on p.id=mi.producto_id left join lotes l on l.id=mi.lote_id left join usuarios u on u.id=mi.usuario_id where mi.empresa_id=$1 and mi.sucursal_id=$2 and ($3::uuid is null or mi.producto_id=$3) order by mi.created_at desc limit 1000`,[req.user.empresa_id,branch,req.query.producto_id||null]);res.json(rows);});
app.get('/api/reports/audit', requireAuth, async (req,res)=>{try{await requireAdmin(pool,req.user);const {rows}=await pool.query(`select a.id,a.created_at,a.accion,a.entidad,a.detalle,u.nombre usuario from auditoria a left join usuarios u on u.id=a.usuario_id where a.empresa_id=$1 order by a.created_at desc limit 500`,[req.user.empresa_id]);res.json(rows);}catch(error){res.status(error.status||400).json({error:error.message});}});

app.get('/{*splat}', (_req,res)=>res.sendFile(path.join(publicDir,'index.html')));

const port=Number(process.env.PORT||3000);
export async function initializeDatabase({migrate=true}={}) {
  assertOperationalProfile();
  // Cada inicialización explícita verifica su propia base, sin reutilizar la caché de otra.
  runtimeSchemaReady=false;
  if(!migrate) {
    const q=await pool.query(`select to_regclass('public.usuario_permisos') is not null
      and to_regclass('public.producto_sucursal') is not null
      and to_regclass('public.empresa_config_avanzada') is not null
      and to_regclass('public.reporte_ventas_netas') is not null
      and to_regclass('public.reporte_detalles_netos') is not null
      and to_regclass('public.reporte_pagos_netos') is not null
      and to_regclass('public.uq_productos_empresa_codigo_interno_normalizado') is not null
      and to_regclass('public.uq_productos_empresa_barcode_normalizado') is not null
      and to_regclass('public.uq_productos_empresa_nombre_normalizado') is not null
      and exists(select 1 from pg_attribute where attrelid='public.lotes'::regclass and attname='numero_lote' and not attnotnull)
      and exists(select 1 from pg_attribute where attrelid='public.lotes'::regclass and attname='valor_base_costos' and not attisdropped)
      and exists(select 1 from pg_attribute where attrelid='public.venta_detalles'::regclass and attname='costo_snapshot' and atttypmod=-1) as ready`);
    if(!q.rows[0]?.ready) throw new Error('Falta el esquema actualizado de EDUXFAC. Inicio sin migraciones cancelado.');
    if(process.env.WEB_RLS_PROFILE==='global'){assertPilotConfiguration();await verifyGlobalRoleProfiles();const protectedTables=await pool.query("SELECT count(*)::int n FROM pg_class c WHERE c.relnamespace='public'::regnamespace AND c.relkind='r' AND c.relname NOT IN ('roles','permisos','rol_permisos','eduxfac_migraciones','web_schema_migrations') AND (NOT c.relrowsecurity OR NOT c.relforcerowsecurity OR NOT EXISTS(SELECT 1 FROM pg_policy p WHERE p.polrelid=c.oid AND p.polname='f10_migrator'))");if(protectedTables.rows[0].n)throw Error('RLS_GLOBAL_PENDIENTE');}
    runtimeSchemaReady=true;
    return;
  }
  const base=await pool.query("select to_regclass('public.empresas') is not null as exists");
  if(!base.rows[0].exists){
    const schema=await readFile(path.resolve(here,'../../database/schema.sql'),'utf8');
    await pool.query(schema);
  }
  await ensureReturnsSchema(pool);
  await ensureAdvancedSettings(pool);
  await ensureUserPermissions(pool);
  await pool.query(await readFile(path.resolve(here,'../../database/upgrade_v44_4.sql'),'utf8'));
  await pool.query(await readFile(path.resolve(here,'../../database/upgrade_ticket_print_width.sql'),'utf8'));
  await pool.query(await readFile(path.resolve(here,'../../database/upgrade_branch_catalog.sql'),'utf8'));
  await pool.query(await readFile(path.resolve(here,'../../database/upgrade_count_unlotted.sql'),'utf8'));
  await pool.query(await readFile(path.resolve(here,'../../database/upgrade_product_identity.sql'),'utf8'));
  await pool.query(await readFile(path.resolve(here,'../../database/migrations/007_consistencia_costos.sql'),'utf8'));
  runtimeSchemaReady=true;
}
app.use((error,_req,res,_next)=>{console.error('WEB_REQUEST_ERROR',/^[A-Z0-9_]{1,40}$/.test(error.code||'')?error.code:'CONTROLLED');if(!res.headersSent)res.status(503).json({error:'Servicio temporalmente no disponible.',code:'SERVICIO_NO_DISPONIBLE'});});
export { app };
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await initializeDatabase({migrate:process.env.NODE_ENV!=='production'&&!rlsEnabled()&&!process.argv.includes('--no-migrate')});
  app.listen(port,'127.0.0.1',()=>console.log(`EDUXFAC activo en http://127.0.0.1:${port}`));
}
