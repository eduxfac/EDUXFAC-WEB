export function validateSchedule(body){
 if(!['inmediato','programado','manual'].includes(body.modo)||!/^([01]\d|2[0-3]):[0-5]\d$/.test(body.hora||''))throw Object.assign(Error('Selecciona modalidad y hora válidas (America/Lima).'),{status:400});
 return {modo:body.modo,hora:body.hora};
}
export function createSunatScheduler({pool,processJob,serviceContext,interval=60000,logger=console}={}){
 let timer,busy=false,stopping=false,pending;
 function tick(){if(stopping)return Promise.resolve();if(busy)return pending;busy=true;pending=(async()=>{try{await serviceContext(async()=>{
 const jobs=(await pool.query(`SELECT o.id,o.empresa_id FROM sunat_outbox o JOIN sunat_sucursales c ON c.empresa_id=o.empresa_id AND c.sucursal_id=o.sucursal_id JOIN ventas v ON v.id=o.venta_id AND v.empresa_id=o.empresa_id
 WHERE v.estado='EMITIDA' AND c.habilitado AND c.ambiente=o.payload_json->>'environment'
 AND o.estado IN ('PENDIENTE','PREPARADO','FIRMADO','NO_RECIBIDO') AND o.intentos<20
 AND (o.intentos=0 OR o.updated_at<now()-interval '5 minutes')
 AND (COALESCE(c.envio_modo,CASE WHEN c.envio_automatico THEN 'inmediato' ELSE 'manual' END)='inmediato'
 OR (c.envio_modo='programado' AND
 ((o.created_at AT TIME ZONE 'America/Lima')::date + c.envio_hora + CASE WHEN (o.created_at AT TIME ZONE 'America/Lima')::time >= c.envio_hora THEN interval '1 day' ELSE interval '0 day' END) <= now() AT TIME ZONE 'America/Lima'))
 ORDER BY o.created_at LIMIT 20`)).rows;
 for(const job of jobs){if(stopping)break;try{await processJob(job.empresa_id,job.id);}catch{logger.error('CPE_PROGRAMADO_NO_CONFIRMADO',job.id);}}
 });}catch{logger.error('CPE_PROGRAMADOR_ERROR');}finally{busy=false;}})();return pending;}
 return {tick,start(){if(timer)return;pending=tick();timer=setInterval(()=>{pending=tick();},interval);timer.unref?.();},async stop(){stopping=true;clearInterval(timer);await pending;}};
}
