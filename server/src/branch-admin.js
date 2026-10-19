const quote = value => '"' + value.replaceAll('"', '""') + '"';
const blocked = 'No se puede eliminar esta sucursal porque tiene información o movimientos registrados. Puedes desactivarla para conservar su historial.';

// Discover all direct foreign keys, including cascading ones. Their parent rows
// also protect dependent details/payments. Include legacy branch columns without FK.
export async function branchRelations(db, id) {
  const {rows} = await db.query(`select distinct n.nspname schema, c.relname tabla, a.attname columna
    from pg_constraint fk join pg_class c on c.oid=fk.conrelid
    join pg_namespace n on n.oid=c.relnamespace
    join pg_attribute a on a.attrelid=c.oid and a.attnum=any(fk.conkey)
    where fk.contype='f' and fk.confrelid='public.sucursales'::regclass
    union select table_schema,table_name,column_name from information_schema.columns
    where table_schema='public' and table_name<>'sucursales'
      and column_name ~ '^sucursal(_.*)?_id$' and udt_name='uuid'`);
  const related=[];
  for(const r of rows) {
    const q=await db.query(`select 1 from ${quote(r.schema)}.${quote(r.tabla)} where ${quote(r.columna)}=$1 limit 1`,[id]);
    if(q.rowCount) related.push(r.tabla);
  }
  const audit=await db.query("select 1 from auditoria where entidad='sucursales' and entidad_id=$1 limit 1",[id]);
  if(audit.rowCount) related.push('auditoria');
  return [...new Set(related)];
}

export function installBranchAdmin(app,{pool,tx,requireAuth,requireAdmin,ensureBranchAccess,writeAudit}) {
  const handle=fn=>async(req,res)=>{try{await requireAdmin(pool,req.user);await fn(req,res);}catch(e){res.status(e.status||400).json({error:e.code==='23503'?blocked:e.message});}};
  const lock=async(c,req)=>{
    // Serialize state changes so two administrators cannot deactivate the last branches.
    await c.query('select empresa_id from empresa_acceso where empresa_id=$1 for update',[req.user.empresa_id]);
    const q=await c.query('select * from sucursales where id=$1 and empresa_id=$2 for update',[req.params.id,req.user.empresa_id]);
    if(!q.rows[0])throw new Error('Sucursal no encontrada.');
    return q.rows[0];
  };
  const protectCurrent=async(c,req)=>{
    const current=req.body?.sucursal_actual_id;
    if(!current)throw new Error('Selecciona la sucursal actual antes de continuar.');
    await ensureBranchAccess(c,req.user,current);
    if(current===req.params.id)throw new Error('No puedes desactivar ni eliminar la sucursal que estás utilizando. Cambia primero a otra sucursal activa.');
  };
  app.get('/api/admin/branches/:id/usage',requireAuth,handle(async(req,res)=>{
    const q=await pool.query('select id from sucursales where id=$1 and empresa_id=$2',[req.params.id,req.user.empresa_id]);
    if(!q.rowCount)throw new Error('Sucursal no encontrada.');
    const relations=await branchRelations(pool,req.params.id);
    res.json({can_delete:relations.length===0,relations,message:relations.length?blocked:''});
  }));
  app.put('/api/admin/branches/:id',requireAuth,handle(async(req,res)=>{
    const b=req.body||{},nombre=String(b.nombre||'').trim(),direccion=String(b.direccion||'').trim(),telefono=String(b.telefono||'').trim();
    if(!nombre)throw new Error('El nombre de la sucursal es obligatorio.');
    if(nombre.length>120||direccion.length>220||telefono.length>40)throw new Error('Nombre, dirección o teléfono exceden la longitud permitida.');
    const result=await tx(async c=>{
      const old=await lock(c,req);
      if(b.codigo!==undefined&&b.codigo!==old.codigo)throw new Error('El código interno de la sucursal no se puede modificar.');
      if(b.activo!==undefined&&b.activo!==old.activo)throw new Error('Utiliza Desactivar o Reactivar para cambiar el estado.');
      const q=await c.query('update sucursales set nombre=$3,direccion=$4,telefono=$5 where id=$1 and empresa_id=$2 returning *',[req.params.id,req.user.empresa_id,nombre,direccion||null,telefono||null]);
      await writeAudit(c,req.user,'EDITAR_SUCURSAL','sucursales',req.params.id,{nombre,direccion,telefono});
      return q.rows[0];
    });res.json(result);
  }));
  app.patch('/api/admin/branches/:id/status',requireAuth,handle(async(req,res)=>{
    if(typeof req.body?.activo!=='boolean')throw new Error('Estado de sucursal inválido.');
    const result=await tx(async c=>{
      await lock(c,req);
      if(!req.body.activo){
        const count=await c.query('select count(*)::int n from sucursales where empresa_id=$1 and activo=true',[req.user.empresa_id]);
        if(count.rows[0].n<=1)throw new Error('No puedes desactivar la única sucursal activa. EDUXFAC necesita una sucursal activa.');
        await protectCurrent(c,req);
      }
      const q=await c.query('update sucursales set activo=$3 where id=$1 and empresa_id=$2 returning *',[req.params.id,req.user.empresa_id,req.body.activo]);
      await writeAudit(c,req.user,req.body.activo?'REACTIVAR_SUCURSAL':'DESACTIVAR_SUCURSAL','sucursales',req.params.id,{});
      return q.rows[0];
    });res.json(result);
  }));
  app.delete('/api/admin/branches/:id',requireAuth,handle(async(req,res)=>{
    await tx(async c=>{
      await lock(c,req);await protectCurrent(c,req);
      if((await branchRelations(c,req.params.id)).length)throw new Error(blocked);
      await c.query('delete from sucursales where id=$1 and empresa_id=$2',[req.params.id,req.user.empresa_id]);
      await writeAudit(c,req.user,'ELIMINAR_SUCURSAL','sucursales',req.params.id,{});
    });res.json({ok:true});
  }));
}
