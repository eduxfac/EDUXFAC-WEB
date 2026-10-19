(()=>{
 const allowed=new Set(['createProductCatalog','exportReportCenter','exportReportCenterPdf','selectReportCenter','loadReportCenter','clearReportCenter','closeUserEdit','toggleUserPasswordEdit','toggleUserPasswordVisibility','createUser','bwSaveCompanySettings','bwSaveTicketSettings','bwSaveSalesCashSettings','showCashWelcome','openBranchEdit','changeBranchStatus','deleteEmptyBranch','editCfgBranch']);
 document.addEventListener('click',event=>{
  const element=event.target.closest?.('[data-edux-action]');if(!element)return;
  const source=element.getAttribute('data-edux-action');
  if(/^window\.print\(\);?(?:\s*return false;?)?$/.test(source)){event.preventDefault();window.print();return;}
  const m=source.match(/^([A-Za-z][A-Za-z0-9_]*)\((?:'([^']*)'|(true|false))?\)$/);
  if(!m||!allowed.has(m[1])||typeof window.eduxfacActions?.[m[1]]!=='function')return;
  event.preventDefault();const args=m[2]!==undefined?[m[2]]:m[3]!==undefined?[m[3]==='true']:[];window.eduxfacActions?.[m[1]](...args);
 });
})();
