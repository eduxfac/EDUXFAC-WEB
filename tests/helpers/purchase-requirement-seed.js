import {randomUUID} from 'node:crypto';
export async function seedRequirement(f,ids){
 const products={},cases={above:[5,2],equal:[2,2],below:[1,2],zero:[0,2],negative:[-3,2],minzero:[0,0],nohistory:[1,2],decimal:[0.125,0.5],inactive:[0,2]};
 const role=(await f.query("select id from roles where nombre='Administrador'")).rows[0].id;
 if(!ids.sucursalA2){ids.sucursalA2=randomUUID();await f.query("insert into sucursales(id,empresa_id,codigo,nombre) values($1,$2,'SEGUNDA','Sucursal A2')",[ids.sucursalA2,ids.empresaA]);await f.query('insert into usuario_sucursal(usuario_id,sucursal_id,rol_id) values($1,$2,$3)',[ids.usuarioA,ids.sucursalA2,role]);}
 for(const[name,[stock,min]]of Object.entries(cases)){
  const id=randomUUID(),lot=randomUUID();products[name]=id;
  await f.query("insert into productos(id,empresa_id,codigo_interno,nombre,unidad_medida) values($1,$2,$3,$4,'UNIDAD')",[id,ids.empresaA,'RQ-'+name,'Requerimiento '+name]);
  await f.query("insert into producto_sucursal(producto_id,sucursal_id,stock_minimo,activo,origen) values($1,$2,$3,$4,'operacion')",[id,ids.sucursalA,min,name!=='inactive']);
  await f.query("insert into lotes(id,producto_id,sucursal_id,numero_lote,cantidad_inicial,cantidad_disponible,costo_unitario) values($1,$2,$3,'FICTICIO',0,$4,1.57)",[lot,id,ids.sucursalA,stock]);
 }
 await f.query("insert into producto_sucursal(producto_id,sucursal_id,stock_minimo,origen) values($1,$2,2,'operacion')",[products.equal,ids.sucursalA2]);
 await f.query("insert into lotes(producto_id,sucursal_id,numero_lote,cantidad_inicial,cantidad_disponible,costo_unitario) values($1,$2,'OTRA_SUCURSAL',10,10,99)",[products.equal,ids.sucursalA2]);
 await f.query('update producto_sucursal set stock_minimo=20 where producto_id=$1 and sucursal_id=$2',[ids.productoB,ids.sucursalB]).catch(()=>{});
 const supplier=randomUUID(),oldSupplier=randomUUID();
 for(const[id,name]of [[supplier,'Proveedor reciente'],[oldSupplier,'Proveedor anterior']])await f.query('insert into proveedores(id,empresa_id,razon_social,ruc) values($1,$2,$3,$4)',[id,ids.empresaA,name,'20123456789']);
 async function buy(product,branch,cost,date,supplierId){const id=randomUUID();await f.query("insert into compras(id,empresa_id,sucursal_id,proveedor_id,fecha,moneda,total,usuario_id) values($1,$2,$3,$4,$5,'PEN',$6,$7)",[id,ids.empresaA,branch,supplierId,date,cost,ids.usuarioA]);await f.query('insert into compra_detalles(compra_id,producto_id,cantidad,costo_unitario,total) values($1,$2,1,$3,$3)',[id,product,cost]);}
 await buy(products.equal,ids.sucursalA,1.1,'2024-01-01',oldSupplier);
 await buy(products.equal,ids.sucursalA,3.3,'2025-01-01',supplier);
 await buy(products.equal,ids.sucursalA,4.4,'2026-01-01',null);
 await buy(products.equal,ids.sucursalA2,99,'2026-10-01',supplier);
 const sale=randomUUID();await f.query("insert into ventas(id,empresa_id,sucursal_id,subtotal,total,usuario_id,estado) values($1,$2,$3,5,5,$4,'ANULADA')",[sale,ids.empresaA,ids.sucursalA,ids.usuarioA]);await f.query('insert into venta_detalles(venta_id,producto_id,cantidad,precio_unitario,costo_snapshot,total) values($1,$2,1,5,1.57,5)',[sale,products.equal]);
 return {products,supplier,buy};
}
