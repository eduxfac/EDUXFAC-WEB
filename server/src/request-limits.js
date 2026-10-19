export function requestLimits({windowMs=60000,max=60,keyOf=null,buckets=new Map()}={}){
 return (req,res,next)=>{const now=Date.now(),key=keyOf?keyOf(req):(req.socket.remoteAddress||'unknown');let b=buckets.get(key);if(!b||now-b.at>=windowMs){if(buckets.size>5000)buckets.clear();b={at:now,n:0};buckets.set(key,b);}if(++b.n>max){res.setHeader('Retry-After',String(Math.ceil((windowMs-now+b.at)/1000)));return res.status(429).json({error:'Demasiadas solicitudes. Reintenta más tarde.',code:'RATE_LIMIT'});}return next();};
}
