-- Solo lectura. Para comparar igualdad, detener escrituras o utilizar una copia restaurada.
BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;
SELECT current_database() AS base,now() AS instante;
SELECT 'empresas' AS tabla,count(*) AS filas FROM public.empresas
UNION ALL SELECT 'clientes',count(*) FROM public.clientes
UNION ALL SELECT 'productos',count(*) FROM public.productos
UNION ALL SELECT 'ventas',count(*) FROM public.ventas
UNION ALL SELECT 'venta_detalles',count(*) FROM public.venta_detalles
UNION ALL SELECT 'lotes',count(*) FROM public.lotes;
SELECT p.empresa_id,l.sucursal_id,count(*) AS lotes,sum(l.cantidad_disponible) AS unidades
FROM public.lotes l JOIN public.productos p ON p.id=l.producto_id
GROUP BY p.empresa_id,l.sucursal_id ORDER BY p.empresa_id,l.sucursal_id;
COMMIT;
