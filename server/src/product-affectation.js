export function productAffectation(value){
 if(value===null||value===undefined||value==='')return null;
 if(typeof value!=='string'||!['10','20','30'].includes(value))throw Object.assign(Error('Selecciona una afectación IGV válida: 10, 20 o 30.'),{status:400});
 return value;
}
