import React, { useCallback, useEffect, useRef, useState } from 'react';
import { getPdiList, getPdiVehicle, savePdiInspection, humanizeApiError } from '../api.js';
import { canSubmitPdi, pdiVin } from '../pdiLogic.js';
import { useSocket } from '../useSocket.js';
import { PdiBadge, PdiHistory, PdiRecord } from './PdiDetails.jsx';
import { PdiScanner } from './PdiScanner.jsx';

export function PdiWorkspace({ session, online }) {
  const [view, setView] = useState('inspect');
  const [vin, setVin] = useState('');
  const [vehicle, setVehicle] = useState(null);
  const [camera, setCamera] = useState(false);
  const [checked, setChecked] = useState(false);
  const [result, setResult] = useState('');
  const [remarks, setRemarks] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const [needsReview, setNeedsReview] = useState(false);
  const [pending, setPending] = useState(false);
  const submission = useRef(null);
  const locked = useRef(false);
  const [revision, setRevision] = useState(0);
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const [page, setPage] = useState(1);
  const [list, setList] = useState(null);
  const [listError, setListError] = useState('');
  const refresh = useCallback(() => setRevision(n => n + 1), []);
  useSocket(refresh, online);
  useEffect(() => {
    const focus = () => { if (document.visibilityState === 'visible') refresh(); };
    window.addEventListener('focus', focus);
    document.addEventListener('visibilitychange', focus);
    return () => { window.removeEventListener('focus', focus); document.removeEventListener('visibilitychange', focus); };
  }, [refresh]);
  useEffect(() => {
    if (view === 'inspect') return;
    let cancelled = false;
    setList(null); setListError('');
    if (!online) { setListError('Connect to the internet to load branch records.'); return; }
    getPdiList(view, { page, q: query, result: filter }).then(data => { if (!cancelled) setList(data); })
      .catch(err => { if (!cancelled) setListError(humanizeApiError(err)); });
    return () => { cancelled = true; };
  }, [view, page, query, filter, online, revision]);

  function clearInspection() {
    setVehicle(null); setChecked(false); setResult(''); setRemarks('');
    setError(''); setSaved(false); setNeedsReview(false); setPending(false); submission.current = null;
  }
  function discardAllowed() {
    return saved || (!checked && !result && !remarks && !pending)
      || window.confirm('Leave this inspection? Unsaved entries will be discarded.');
  }
  async function lookup(raw, review = false) {
    if (locked.current || !online) return;
    const normalized = pdiVin(raw);
    if (!normalized) { setError('Enter a valid 17-character VIN.'); return; }
    if (!review && !discardAllowed()) return;
    locked.current = true; setBusy(true); setCamera(false); setError(''); setView('inspect');
    if (!review) clearInspection();
    else if (!pending) setChecked(false);
    if (review && saved) { setResult(''); setRemarks(''); }
    setVin(normalized);
    try {
      const found = await getPdiVehicle(normalized);
      setVehicle(found);
      setChecked(false); setSaved(false); setNeedsReview(false); setPending(false); submission.current = null;
    } catch (err) { setError(humanizeApiError(err)); }
    finally { locked.current = false; setBusy(false); }
  }
  async function submit(event) {
    event.preventDefault();
    if (locked.current || pdiVin(vin) !== vehicle?.vin || !canSubmitPdi({ vehicle, checked, result, remarks, online, busy, saved, needsReview })) return;
    locked.current = true; setBusy(true); setError('');
    const payload = submission.current || {
      submission_id: crypto.randomUUID(), expected_latest_id: vehicle.pdi?.id || null,
      expected_yard_id: vehicle.current_yard_id, checking_completed: true, result, remarks: remarks.trim(),
    };
    submission.current = payload;
    setPending(true);
    try {
      const response = await savePdiInspection(vehicle.vin, payload);
      setVehicle(v => ({ ...v, pdi: response.inspection }));
      setSaved(true); setPending(false); submission.current = null; refresh();
    } catch (err) {
      setError(humanizeApiError(err));
      if (err.status >= 400 && err.status < 500) {
        setPending(false); submission.current = null;
        if ([403, 404, 409].includes(err.status)) setNeedsReview(true);
      }
    } finally { locked.current = false; setBusy(false); }
  }
  function nextVehicle() {
    if (busy || !discardAllowed()) return;
    clearInspection(); setVin(''); setCamera(online);
  }
  const permitted = pdiVin(vin) === vehicle?.vin && canSubmitPdi({ vehicle, checked, result, remarks, online, busy, saved, needsReview });
  return <section className="pdi-workspace">
    <header className="pdi-heading">
      <div><span className="eyebrow">Pre-delivery inspection</span><h1>Vehicle inspection</h1><p>{session.name}</p></div>
      <span className="pdi-scope">Branch team</span>
    </header>
    {!online && <p className="notice warn" role="status">You are offline. Connect to look up vehicles and save inspections. Your form stays here.</p>}
    <nav className="pdi-tabs" aria-label="PDI views">
      {[['inspect', 'Scan / Inspect'], ['vehicles', 'Branch vehicles'], ['history', 'Inspection history']].map(([key, label]) =>
        <button type="button" key={key} aria-current={view === key ? 'page' : undefined} disabled={busy}
          onClick={() => { setView(key); setPage(1); setFilter('all'); setQuery(''); setSearch(''); }}>{label}</button>)}
    </nav>
    {view === 'inspect' ? <div className="pdi-inspect-layout">
      <section className="pdi-panel">
        <h2>Find a vehicle</h2>
        <form className="pdi-lookup" onSubmit={e => { e.preventDefault(); lookup(vin); }}>
          <label htmlFor="pdi-vin">VIN</label>
          <input id="pdi-vin" value={vin} maxLength={17} autoComplete="off" autoCapitalize="characters" spellCheck={false}
            onChange={e => setVin(e.target.value.toUpperCase())} placeholder="Enter 17-character VIN" disabled={busy || pending} />
          <button className="primary" disabled={!online || busy || pending}>{busy ? 'Please wait…' : 'Find vehicle'}</button>
          <button type="button" disabled={!online || busy || pending} onClick={() => setCamera(v => !v)}>{camera ? 'Close camera' : 'Scan QR code'}</button>
        </form>
        {camera && <PdiScanner onRead={lookup} onClose={() => setCamera(false)} />}
        {error && <p className="notice bad" role="alert">{error}</p>}
        {busy && <p role="status">Please wait…</p>}
        {!vehicle && !busy && <p className="pdi-hint">Scan or enter a VIN to view its details and record an inspection.</p>}
        {vehicle && <>
          <div className="pdi-vehicle-sheet">
            <span className="eyebrow">Vehicle to inspect</span><h2 className="pdi-vin">{vehicle.vin}</h2>
            <dl>
              <div><dt>Model</dt><dd>{vehicle.model || 'Not recorded'}</dd></div>
              <div><dt>Drive type</dt><dd>{vehicle.drive_type?.replaceAll('_', ' ') || 'Not recorded'}</dd></div>
              {vehicle.variant && <div><dt>Variant</dt><dd>{vehicle.variant}</dd></div>}
              {vehicle.colour && <div><dt>Colour</dt><dd>{vehicle.colour}</dd></div>}
              <div><dt>Yard</dt><dd>{vehicle.yard_name || 'Not assigned'}</dd></div>
              <div><dt>Stock status</dt><dd>{vehicle.current_status?.toUpperCase() || 'Not recorded'}</dd></div>
            </dl>
            <PdiBadge result={vehicle.pdi?.result} />
          </div>
          {saved ? <div className="pdi-saved" role="status"><strong>Inspection saved.</strong><p>{vehicle.vin}</p>
            <button type="button" className="primary" onClick={nextVehicle}>Scan next vehicle</button>
            <button type="button" onClick={() => lookup(vehicle.vin, true)}>Start reinspection</button>
          </div> : <form className="pdi-form" onSubmit={submit}>
            <h2>Record inspection</h2>
            {vehicle.current_status !== 'in' && <p className="notice warn">This vehicle must be marked IN at one of your branch’s yards before you can inspect it.</p>}
            <fieldset disabled={busy || pending || needsReview || vehicle.current_status !== 'in'}>
              <label className="pdi-check"><input type="checkbox" checked={checked} onChange={e => setChecked(e.target.checked)} required />Checking completed</label>
              <fieldset className="pdi-results"><legend>Inspection result</legend>
                <label className={result === 'ok' ? 'selected' : ''}><input type="radio" name="pdi-result" value="ok" checked={result === 'ok'} onChange={() => setResult('ok')} required />OK for sale</label>
                <label className={result === 'repair_required' ? 'selected' : ''}><input type="radio" name="pdi-result" value="repair_required" checked={result === 'repair_required'} onChange={() => setResult('repair_required')} required />Repair required</label>
              </fieldset>
              <label htmlFor="pdi-remarks">Remarks {result === 'repair_required' ? '(required)' : '(optional)'}</label>
              <textarea id="pdi-remarks" value={remarks} onChange={e => setRemarks(e.target.value)} maxLength={2000} rows={4} required={result === 'repair_required'} placeholder="Record what you checked or the repairs needed." />
            </fieldset>
            {pending && !busy && <p className="notice warn">Save confirmation was not received. Retry the same inspection to check or finish saving it.</p>}
            {needsReview && <p className="notice warn">Reload and review the latest details below, then confirm checking again. Your result and remarks will be kept.</p>}
            <div className="pdi-form-actions">
              <button type="submit" className="primary" disabled={!permitted}>{busy ? 'Saving…' : pending ? 'Retry save' : 'Save inspection'}</button>
              {(needsReview || (!pending && vehicle.current_status !== 'in')) && <button type="button" disabled={busy || !online} onClick={() => lookup(vehicle.vin, true)}>Reload latest details</button>}
              <button type="button" disabled={busy} onClick={nextVehicle}>Next vehicle</button>
            </div>
          </form>}
        </>}
      </section>
      <aside className="pdi-panel pdi-history-panel">
        <h2>Inspection history</h2>
        {vehicle ? <PdiHistory key={vehicle.vin} vin={vehicle.vin} revision={vehicle.pdi?.id} />
          : <p className="pdi-hint">Previous results, remarks, and the inspecting team appear here after you select a vehicle.</p>}
      </aside>
    </div> : <section className="pdi-panel">
      <form className="pdi-filters" onSubmit={e => { e.preventDefault(); setQuery(search); setPage(1); }}>
        <label>Search<input value={search} onChange={e => setSearch(e.target.value)} placeholder={view === 'history' ? 'VIN or inspector' : 'VIN or model'} maxLength={80} /></label>
        <button type="submit">Search</button>
        <label>Result<select aria-label="Inspection result filter" value={filter} onChange={e => { setFilter(e.target.value); setPage(1); }}>
          <option value="all">All results</option>{view === 'vehicles' && <option value="not_recorded">PDI not recorded</option>}
          <option value="ok">OK</option><option value="repair_required">Repair Required</option>
        </select></label>
        <button type="button" onClick={refresh}>Refresh</button>
      </form>
      {listError ? <p className="notice bad" role="alert">{listError}</p> : !list ? <p role="status">Loading branch records…</p> : <>
        {!list.data.length && <p>No {view === 'history' ? 'inspections' : 'vehicles'} match this view. Check the filters or contact Admin about your branch’s yard assignments.</p>}
        <div className="pdi-list">{list.data.map(item => view === 'history'
          ? <div key={item.id}><button type="button" className="pdi-vin-link" onClick={() => lookup(item.vin)}>{item.vin}</button><PdiRecord inspection={item} /></div>
          : <button type="button" className="pdi-vehicle-row" key={item.id} onClick={() => lookup(item.vin)}>
            <span><strong className="pdi-vin">{item.vin}</strong><small>{item.model || 'Model not recorded'} · {item.yard_name}</small></span>
            <span><PdiBadge result={item.pdi?.result} /><small>{item.current_status?.toUpperCase()}</small></span>
          </button>)}</div>
        <div className="pdi-pagination"><button type="button" disabled={page === 1} onClick={() => setPage(p => p - 1)}>Previous</button><span>Page {page}</span><button type="button" disabled={!list.has_more} onClick={() => setPage(p => p + 1)}>Next</button></div>
      </>}
    </section>}
  </section>;
}
