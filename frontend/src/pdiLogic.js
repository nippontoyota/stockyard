export function pdiLabel(result) {
  if (result === 'ok') return 'PDI Done — OK';
  if (result === 'repair_required') return 'PDI Done — Repair Required';
  return 'PDI not recorded';
}

export function pdiVin(value) {
  const vin = String(value || '').trim().toUpperCase();
  return /^[A-HJ-NPR-Z0-9]{17}$/.test(vin) ? vin : null;
}

export function pdiQrVin(value) {
  // Existing yard QR codes can wrap the VIN in a URL or label. Require one
  // unambiguous, complete VIN rather than truncating arbitrary camera text.
  const matches = String(value || '').toUpperCase().match(/\b[A-HJ-NPR-Z0-9]{17}\b/g) || [];
  const unique = [...new Set(matches)];
  return unique.length === 1 ? unique[0] : null;
}

export function canSubmitPdi({ vehicle, checked, result, remarks, online, busy, saved, needsReview }) {
  return !!vehicle && vehicle.current_status === 'in' && checked && online && !busy && !saved && !needsReview
    && (result === 'ok' || (result === 'repair_required' && !!remarks.trim()));
}
