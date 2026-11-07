import assert from 'node:assert/strict';
import { canSubmitPdi, pdiLabel, pdiVin, pdiQrVin } from './pdiLogic.js';

const form = { vehicle: { current_status: 'in' }, checked: true, result: 'repair_required', remarks: 'Repair lamp', online: true };
assert.equal(canSubmitPdi(form), true);
for (const patch of [{ checked: false }, { remarks: ' ' }, { online: false }, { busy: true }, { saved: true }, { needsReview: true }, { vehicle: { current_status: 'out' } }, { result: '' }]) {
  assert.equal(canSubmitPdi({ ...form, ...patch }), false);
}
assert.equal(canSubmitPdi({ ...form, result: 'ok', remarks: '' }), true);
assert.equal(pdiLabel('ok'), 'PDI Done — OK');
assert.equal(pdiLabel('repair_required'), 'PDI Done — Repair Required');
assert.equal(pdiLabel(null), 'PDI not recorded');
assert.equal(pdiVin(' jtdbr32e720000001 '), 'JTDBR32E720000001');
assert.equal(pdiVin('JTDBR32E72000000I'), null);
assert.equal(pdiVin('JTDBR32E720000001EXTRA'), null);
assert.equal(pdiQrVin('https://example.test/vehicle?vin=JTDBR32E720000001'), 'JTDBR32E720000001');
assert.equal(pdiQrVin('VIN: JTDBR32E720000001'), 'JTDBR32E720000001');
assert.equal(pdiQrVin('JTDBR32E720000001 JTDBR32E720000002'), null);
assert.equal(pdiQrVin('JTDBR32E720000001EXTRA'), null);
console.log('PDI form and labels passed');
