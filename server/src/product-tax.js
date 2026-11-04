export function productTaxCode(value){
 const code=String(value??'').trim().toUpperCase();
 if(!code)throw Object.assign(Error('El producto no tiene afectación IGV configurada. Revísala en Productos antes de emitir.'),{status:400});
 if(/^(10|20|30)(?:\D|$)/.test(code))return code.slice(0,2);
 if(code.includes('EXONERAD'))return '20';
 if(code.includes('INAFECT'))return '30';
 if(code.includes('GRAVAD'))return '10';
 throw Object.assign(Error('Afectación tributaria no soportada: '+code),{status:400});
}
