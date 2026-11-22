(()=>{
 const paths={dashboard:'/inicio',sales:'/ventas',productsAdmin:'/productos',inventory:'/inventario',purchases:'/compras',suppliers:'/proveedores',customers:'/clientes',cash:'/caja',alerts:'/alertas',replenishment:'/requerimientos',transfers:'/transferencias',reports:'/reportes',usersAdmin:'/usuarios',sunat:'/sunat',settings:'/configuracion'};
 function resolve(pathname){
  const path=pathname.replace(/\/+$/,'')||'/';
  if(path==='/'||path==='/index.html')return 'dashboard';
  if(path==='/reporte')return 'reports';
  return Object.keys(paths).find(key=>paths[key]===path)||null;
 }
 window.createWebRouter=({show,isReady,can,denied=()=>{}})=>{
  async function navigate(module,{replace=false}={}){
   if(!paths[module]||!isReady())return false;
   if(!can(module)){denied();return false;}
   const target=paths[module];
   if(location.pathname!==target||location.hash||location.search)window.history[replace?'replaceState':'pushState'](null,'',target);
   await show(module);return true;
  }
  async function restore(){
   if(!isReady())return false;
   let module=resolve(location.pathname)||'dashboard';
   if(!can(module)){denied();module=Object.keys(paths).find(can);}
   return module?navigate(module,{replace:true}):false;
  }
  window.addEventListener('popstate',()=>{void restore();});
  return {navigate,restore,resolve,href:module=>paths[module]||null};
 };
})();
