// Same net-sales view, states and Lima sale date as Reportes > Ventas.
// Half-open timestamp bounds keep the existing sales/date index usable.
export const MONTHLY_SALES_SQL=String.raw`
 with selection as (
  select coalesce($3::int,extract(year from now() at time zone 'America/Lima')::int) AS sales_year,
   extract(year from now() at time zone 'America/Lima')::int current_year
 ), available as (
  select distinct extract(year from v.created_at at time zone 'America/Lima')::int AS sales_year
  from ventas v where v.empresa_id=$1 and ($2::uuid is null or v.sucursal_id=$2)
 ), monthly as (
  select extract(month from v.created_at at time zone 'America/Lima')::int AS month_number,sum(v.total) total
  from reporte_ventas_netas v cross join selection s
  where v.empresa_id=$1 and ($2::uuid is null or v.sucursal_id=$2)
   and v.estado in ('EMITIDA','DEVOLUCION_PARCIAL')
   and v.created_at >= (make_date(s.sales_year,1,1)::timestamp at time zone 'America/Lima')
   and v.created_at < (make_date(s.sales_year+1,1,1)::timestamp at time zone 'America/Lima')
  group by extract(month from v.created_at at time zone 'America/Lima')
 ), months as (
  select m.month_number,coalesce(t.total,0)::numeric total from generate_series(1,12) m(month_number) left join monthly t using(month_number)
 )select s.sales_year AS "year",
  (select array_agg(sales_year order by sales_year desc) from (select sales_year from available where sales_year between 1900 and 9998 union select current_year from selection) y) years,
  jsonb_agg(jsonb_build_object('month',m.month_number,'total',m.total::text) order by m.month_number) months,
  sum(m.total)::text total_year
 from selection s cross join months m group by s.sales_year
`;
export async function monthlySales(db,company,branch,year){
 if(year!==undefined&&(typeof year!=='string'||!/^\d{4}$/.test(year)||Number(year)<1900||Number(year)>9998))throw Object.assign(Error('Año inválido (1900 a 9998).'),{status:400});
 const r=await db.query(MONTHLY_SALES_SQL,[company,branch||null,year===undefined?null:Number(year)]);
 return {...r.rows[0],timezone:'America/Lima',definition:'Ventas netas de devoluciones, atribuidas a la fecha de venta'};
}
