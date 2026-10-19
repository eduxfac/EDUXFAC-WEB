import test from 'node:test';import {createFixture,ids} from './helpers/initial-inventory-template-fixture.js';import {monthlyChecks} from './helpers/monthly-sales-checks.js';
test('Ventas mensuales SQL/HTTP aisladas',async t=>{const f=await createFixture();t.after(()=>f.close());await monthlyChecks(t,f,ids)});
