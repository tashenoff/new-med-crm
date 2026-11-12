import test from 'node:test';
import assert from 'node:assert/strict';
import {canReceiveTreatmentPayment} from '../src/utils/treatmentPaymentAccess.js';
import {hasPermission} from '../src/utils/permissions.js';
for(const role of ['doctor','marketer','administrator','admin'])test(role+' receives patient payment without finance access',()=>{
 const user={role,is_active:true,permissions:['patients_view']};assert.equal(canReceiveTreatmentPayment(user),true);assert.equal(hasPermission(user,'finance_view'),false);assert.equal(hasPermission(user,'finance_edit'),false);assert.equal(hasPermission(user,'patients_edit'),false);
});
test('no anonymous, inactive, nonstaff or inaccessible-patient access',()=>{
 for(const user of [null,{role:'doctor',permissions:[]},{role:'doctor',is_active:false,permissions:['patients_view']},{role:'patient',permissions:['patients_view']},{role:'unknown',permissions:['patients_view']}])assert.equal(canReceiveTreatmentPayment(user),false);
});
