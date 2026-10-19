(() => {
  const modal=document.getElementById('appDialogModal');
  const title=document.getElementById('appDialogTitle');
  const message=document.getElementById('appDialogMessage');
  const form=document.getElementById('appDialogForm');
  const field=document.getElementById('appDialogField');
  const input=document.getElementById('appDialogInput');
  const accept=document.getElementById('appDialogAccept');
  const cancel=document.getElementById('appDialogCancel');
  const queue=[];
  let current=null,focusVersion=0;

  function canFocus(element) {
    return !!element?.isConnected && !element.disabled && !element.closest('.hidden,[hidden],[inert],dialog:not([open])') && element.getClientRects().length>0 && getComputedStyle(element).visibility!=='hidden';
  }
  function restoreAppFocus(previous) {
    const version=++focusVersion;
    const focus=()=>{
      if(version!==focusVersion || !modal.classList.contains('hidden'))return;
      const search=document.getElementById('search');
      let target=document.getElementById('sales')?.classList.contains('active') && canFocus(search) ? search : canFocus(previous)?previous:null;
      if(!target && canFocus(document.activeElement) && document.activeElement!==document.body)return;
      if(!target)target=[...document.querySelectorAll('.module.active input:not([type="hidden"]),.module.active textarea,.module.active select,.module.active button,#branch')].find(canFocus);
      target?.focus({preventScroll:true});
      if(!canFocus(document.activeElement) || document.activeElement.closest?.('.hidden,[hidden]'))document.activeElement?.blur?.();
    };
    return new Promise(resolve=>setTimeout(()=>{focus();requestAnimationFrame(()=>{focus();resolve();});},0));
  }
  function present() {
    if(current || !queue.length)return;
    const item=current=queue.shift();
    item.previous=document.activeElement;
    ++focusVersion;
    item.inert=[];
    for(const id of ['app','login']) {
      const element=document.getElementById(id);
      if(element && !element.inert){element.inert=true;item.inert.push(element);}
    }
    title.textContent=item.options.title || (item.type==='notice'?'Aviso de EDUXFAC':item.type==='confirm'?'Confirmar operación':'Ingresar información');
    message.textContent=String(item.message??'');
    field.classList.toggle('hidden',item.type!=='prompt');
    input.value=String(item.options.value??'');
    input.setAttribute('aria-label',String(item.options.inputLabel||item.message||title.textContent));
    accept.textContent=item.options.acceptLabel || 'Aceptar';
    cancel.textContent=item.options.cancelLabel || 'Cancelar';
    cancel.classList.toggle('hidden',item.type==='notice');
    modal.setAttribute('role',item.type==='notice'?'alertdialog':'dialog');
    modal.classList.remove('hidden');
    const first=item.type==='prompt'?input:item.type==='confirm'?cancel:accept;
    first.focus({preventScroll:true});
    if(item.type==='prompt')input.select();
  }
  async function finish(accepted) {
    const item=current;
    if(!item || item.closing)return;
    item.closing=true;
    const result=item.type==='prompt'?(accepted?input.value:null):item.type==='confirm'?!!accepted:undefined;
    if(modal.contains(document.activeElement))document.activeElement.blur();
    modal.classList.add('hidden');
    item.inert.forEach(element=>{element.inert=false;});
    await restoreAppFocus(item.previous);
    current=null;
    item.resolve(result);
    // Let the awaiting operation update its form before showing a queued message.
    queueMicrotask(present);
  }
  function show(type,message,options={}) {
    return new Promise(resolve=>{queue.push({type,message,options,resolve});present();});
  }
  form.addEventListener('submit',event=>{event.preventDefault();finish(true);});
  cancel.addEventListener('click',()=>finish(false));
  document.addEventListener('keydown',event=>{
    if(!current || current.closing)return;
    if(event.key==='Escape'){event.preventDefault();event.stopImmediatePropagation();finish(false);return;}
    if(event.key==='Enter' && !event.isComposing){event.preventDefault();event.stopImmediatePropagation();finish(document.activeElement!==cancel);return;}
    if(event.key==='Tab') {
      const controls=[input,cancel,accept].filter(canFocus);
      const index=controls.indexOf(document.activeElement);
      const next=(index+(event.shiftKey?-1:1)+controls.length)%controls.length;
      event.preventDefault();event.stopImmediatePropagation();controls[next]?.focus();
    }
  },true);
  document.addEventListener('focusin',event=>{
    if(current && !current.closing && !modal.contains(event.target)) (current.type==='prompt'?input:current.type==='confirm'?cancel:accept).focus({preventScroll:true});
  });
  window.showAppNotice=(message,options)=>show('notice',message,options);
  window.showAppConfirm=(message,options)=>show('confirm',message,options);
  window.showAppPrompt=(message,options)=>show('prompt',message,options);
  window.restoreAppFocus=restoreAppFocus;
})();
