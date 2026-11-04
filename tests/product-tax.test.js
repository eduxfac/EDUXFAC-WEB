import test from 'node:test';
import assert from 'node:assert/strict';
import {productTaxCode} from '../server/src/product-tax.js';
test('La emisión conserva la clasificación IGV explícita del producto',()=>{
 for(const [value,expected] of [['10','10'],['20','20'],['30','30'],['EXONERADO','20'],['INAFECTO','30'],['GRAVADO','10']])assert.equal(productTaxCode(value),expected);
});
test('Un producto pendiente no se convierte automáticamente en gravado',()=>{
 for(const value of [null,undefined,'','PENDIENTE','99'])assert.throws(()=>productTaxCode(value),error=>error.status===400);
});
