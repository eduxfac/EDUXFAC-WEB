export function createResetLimiter({now=()=>Date.now(),max=5,windowMs=900000}={}){
 const counts=new Map();
 return (req,res,next)=>{
  const time=now();for(const [key,value] of counts)if(value.until<=time)counts.delete(key);
  const key=req.params.company+':'+String(req.body?.actor||'');
  const entry=counts.get(key)||{until:time+windowMs,count:0};
  if(entry.count>=max||(!counts.has(key)&&counts.size>=1000))return res.status(429).json({code:'RESET_RATE_LIMIT',error:'Demasiados restablecimientos.'});
  entry.count++;counts.set(key,entry);next();
 };
}
