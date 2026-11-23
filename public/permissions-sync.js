(()=>{
 let pending=null;
 window.refreshSelfPermissions=()=>{
  if(!state.user||!state.token)return Promise.resolve();
  if(pending)return pending;
  pending=api('/api/auth/permissions').then(result=>{
   if(!result?.permissions)throw Error('No se pudieron actualizar los permisos.');
   state.permissions=result.permissions;
   window.applyMyPermissions?.();
   window.dispatchEvent(new Event('eduxfac-permissions-changed'));
  }).finally(()=>pending=null);
  return pending;
 };
 const refresh=()=>{if(!document.hidden)void window.refreshSelfPermissions().catch(()=>{});};
 window.addEventListener('focus',refresh);
 document.addEventListener('visibilitychange',refresh);
 setInterval(refresh,15000);
})();
