import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import pg from 'pg';
import {planIndexes,applyIndexes,validateIndexManifest} from '../server/src/online-indexes.js';

const url=process.env.EDUXFAC_INDEX_TEST_DATABASE_URL;
const web=JSON.parse(readFileSync(new URL('../database/online-indexes/20261031.json',import.meta.url),'utf8'));
const cpe=JSON.parse(readFileSync(new URL('../../EDUX-GREENTER/database/online-indexes/20261031.json',import.meta.url),'utf8'));
test('El manifiesto solo permite índices declarados, sin sentencias adicionales',()=>{
 assert.equal(validateIndexManifest(web),web);
 assert.throws(()=>validateIndexManifest({...web,indexes:[{...web.indexes[0],keys:['empresa_id; DROP TABLE ventas']}]}),e=>e.code==='MANIFEST_INVALID');
});

test('Índices concurrentes: preservación de filas, planes reales, repetición y preflight',{skip:!url},async t=>{
 const dbname=new URL(url).pathname.slice(1);
 assert.match(dbname,/^edux_index_test_[a-z0-9_]+$/,'Solo una base temporal con prefijo de pruebas');
 const db=new pg.Client({connectionString:url});await db.connect();
 try{
  const empty=await db.query("SELECT count(*)::int n FROM pg_tables WHERE schemaname='public'");assert.equal(empty.rows[0].n,0,'La base de prueba debe estar vacía');
  const definitions={
   ventas:'id uuid PRIMARY KEY,empresa_id uuid,sucursal_id uuid,created_at timestamptz,total numeric',
   venta_detalles:'id uuid PRIMARY KEY,venta_id uuid,cantidad numeric,total numeric',
   venta_pagos:'id uuid PRIMARY KEY,venta_id uuid,monto numeric',
   devoluciones_venta:'id uuid PRIMARY KEY,venta_id uuid,created_at timestamptz',
   devolucion_venta_detalles:'id uuid PRIMARY KEY,venta_detalle_id uuid',
   movimientos_inventario:'id uuid PRIMARY KEY,lote_id uuid,producto_id uuid,sucursal_id uuid,referencia_tipo text,referencia_id uuid,cantidad numeric',
   clientes:'id uuid PRIMARY KEY,empresa_id uuid,nro_doc text,updated_at timestamptz,activo boolean',
   precios_producto:'id uuid PRIMARY KEY,producto_id uuid,sucursal_id uuid,vigente_desde timestamptz,vigente_hasta timestamptz',
   lotes:'id uuid PRIMARY KEY,producto_id uuid,sucursal_id uuid,fecha_vencimiento date,cantidad_disponible numeric',
   compra_detalles:'id uuid PRIMARY KEY,compra_id uuid,producto_id uuid',
   compras:'id uuid PRIMARY KEY,empresa_id uuid,sucursal_id uuid,created_at timestamptz',
   sunat_outbox:'id uuid PRIMARY KEY,empresa_id uuid,documento_id uuid,created_at timestamptz,estado text,intentos integer',
   movimientos_caja:'id uuid PRIMARY KEY,sesion_caja_id uuid,created_at timestamptz',
   cpe_documents:'id text PRIMARY KEY,tenant_id text,branch_id text,environment text,created_at timestamptz,doc_type text,state text',
   cpe_events:'id bigint PRIMARY KEY,tenant_id text,document_id text',
   cpe_batches:'id text PRIMARY KEY,tenant_id text,branch_id text,environment text,created_at timestamptz'
  };
  for(const [table,columns]of Object.entries(definitions))await db.query('CREATE TABLE '+table+'('+columns+')');
  await db.query('CREATE INDEX idx_ventas_empresa_sucursal_fecha ON ventas(empresa_id,sucursal_id,created_at DESC)');
  await db.query('CREATE INDEX idx_devoluciones_venta ON devoluciones_venta(venta_id,created_at)');
  await db.query("INSERT INTO ventas SELECT md5(g::text)::uuid,md5((g%15)::text)::uuid,md5((g%30)::text)::uuid,'2026-01-01'::timestamptz+g*interval '1 minute',10 FROM generate_series(1,25000) g");
  await db.query("INSERT INTO venta_detalles SELECT md5(('d'||g)::text)::uuid,md5(((g-1)/4+1)::text)::uuid,1,2.50 FROM generate_series(1,100000) g");
  await db.query("INSERT INTO lotes SELECT md5(('lot'||g)::text)::uuid,md5(g::text)::uuid,md5((g%30)::text)::uuid,'2027-01-01',g FROM generate_series(1,100) g");
  await db.query('ANALYZE ventas');await db.query('ANALYZE venta_detalles');
  const fingerprint=async()=>{const out={};for(const table of Object.keys(definitions)){const r=await db.query('SELECT count(*)::int n,md5(coalesce(string_agg(md5(row_to_json(t)::text),\'\' ORDER BY id),\'\')) hash FROM '+table+' t');out[table]=r.rows[0];}return out;};
  const before=await fingerprint();
  await t.test('Base equivocada rechazada antes de crear índices',async()=>{await assert.rejects(planIndexes(db,web,'otra_base'),e=>e.code==='DATABASE_MISMATCH');});
  await t.test('Esquema incompleto detiene todo el plan antes del primer CREATE',async()=>{
   await assert.rejects(applyIndexes(db,{...web,indexes:[...web.indexes,{name:'edx_missing',table:'tabla_ausente',keys:['id'],columns:['id']}]},dbname),e=>e.code==='SCHEMA_REVIEW_REQUIRED');
   assert.equal((await db.query("SELECT count(*)::int n FROM pg_class WHERE relname LIKE 'edx_perf_%'")).rows[0].n,0);
  });
  const explain=()=>db.query("EXPLAIN (ANALYZE,BUFFERS,FORMAT JSON) SELECT * FROM venta_detalles WHERE venta_id=md5('1000')::uuid");
  const beforePlan=(await explain()).rows[0]['QUERY PLAN'][0];
  const applied=await applyIndexes(db,web,dbname);
  await t.test('Reutiliza índices previos y conserva todas las filas/stock',async()=>{
   assert.ok(applied.indexes.every(i=>i.status==='covered'));
   assert.equal(applied.indexes.find(i=>i.table==='ventas'&&i.keys.includes('sucursal_id')&&i.keys.length===3).covered_by,'idx_ventas_empresa_sucursal_fecha');
   assert.deepEqual(await fingerprint(),before);
  });
  await t.test('Una segunda aplicación no crea índices adicionales',async()=>{assert.deepEqual((await applyIndexes(db,web,dbname)).created,[]);});
  const afterPlan=(await explain()).rows[0]['QUERY PLAN'][0];
  await t.test('PostgreSQL usa el índice en lugar del escaneo completo del detalle',()=>{
   assert.match(JSON.stringify(afterPlan),/edx_perf_detalles_venta/);
   console.log(JSON.stringify({rows:100000,before:beforePlan.Plan['Node Type'],after:afterPlan.Plan['Node Type'],before_ms:beforePlan['Execution Time'],after_ms:afterPlan['Execution Time']}));
  });
  await t.test('Greenter recibe sus índices sin modificar comprobantes',async()=>{const r=await applyIndexes(db,cpe,dbname);assert.equal(r.created.length,4);assert.deepEqual(await fingerprint(),before);});
  await t.test('Nombre existente con otra definición exige revisión',async()=>{
   await db.query('CREATE INDEX edx_collision ON ventas(total)');
   await assert.rejects(planIndexes(db,{...web,indexes:[{...web.indexes[0],name:'edx_collision'}]},dbname),e=>e.code==='INDEX_REVIEW_REQUIRED');
  });
  await t.test('Un índice inválido no se omite ni se elimina automáticamente',async()=>{
   await assert.rejects(db.query('CREATE UNIQUE INDEX CONCURRENTLY edx_invalid ON ventas(total)'));
   await assert.rejects(planIndexes(db,{...web,indexes:[{name:'edx_invalid',table:'ventas',keys:['total'],columns:['total']}]},dbname),e=>e.code==='INDEX_REVIEW_REQUIRED');
   assert.equal((await db.query("SELECT indisvalid FROM pg_index WHERE indexrelid='edx_invalid'::regclass")).rows[0].indisvalid,false);
  });
 }finally{await db.end();}
});
