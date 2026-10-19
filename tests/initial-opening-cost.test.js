import test from 'node:test';import {createFixture,ids} from './helpers/initial-inventory-template-fixture.js';import {initialCostChecks} from './helpers/initial-cost-checks.js';
test('Valor inicial unico: API real y PostgreSQL WASM ficticio',async t=>{const f=await createFixture();t.after(()=>f.close());await initialCostChecks(t,f,ids)});
