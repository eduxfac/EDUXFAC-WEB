import test from 'node:test';import {createFixture,ids} from './helpers/initial-inventory-template-fixture.js';import {requirementChecks} from './helpers/purchase-requirement-checks.js';
test('Requerimiento: HTTP real y base ficticia, solo lectura',async t=>{const f=await createFixture();t.after(()=>f.close());await requirementChecks(t,f,ids)});
