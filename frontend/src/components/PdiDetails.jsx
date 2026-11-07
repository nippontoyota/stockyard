import React, { useEffect, useState } from 'react';
import { getPdiHistory, humanizeApiError } from '../api.js';
import { pdiLabel } from '../pdiLogic.js';

export function PdiBadge({ result }) {
  return <span className={`pdi-badge pdi-${result || 'none'}`}>{pdiLabel(result)}</span>;
}

export function PdiRecord({ inspection }) {
  return <article className="pdi-record">
    <PdiBadge result={inspection.result} />
    <p><strong>{inspection.inspector_username_snapshot}</strong> · {inspection.branch_name || 'Branch'} · {inspection.yard_name || inspection.yard_id}</p>
    <time dateTime={inspection.created_at}>{new Date(inspection.created_at).toLocaleString('en-IN')}</time>
    {inspection.remarks && <p className="pdi-remarks">{inspection.remarks}</p>}
    <small>VIN at inspection: {inspection.vin_snapshot}</small>
  </article>;
}

export function PdiHistory({ vin, revision }) {
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  useEffect(() => { setPage(1); }, [vin, revision]);
  useEffect(() => {
    let cancelled = false;
    setData(null); setError('');
    getPdiHistory(vin, page).then(value => { if (!cancelled) setData(value); })
      .catch(err => { if (!cancelled) setError(humanizeApiError(err)); });
    return () => { cancelled = true; };
  }, [vin, page, revision, retry]);
  return <div className="pdi-history">
    {error ? <div role="alert" className="notice bad">{error} <button type="button" onClick={() => setRetry(v => v + 1)}>Retry</button></div>
      : !data ? <p role="status">Loading inspection history…</p>
      : <>
        {!data.data.length && <p>No PDI inspection is recorded for this vehicle.</p>}
        {data.data.map(item => <PdiRecord key={item.id} inspection={item} />)}
        {(page > 1 || data.has_more) && <div className="pdi-pagination">
          <button type="button" disabled={page === 1} onClick={() => setPage(p => p - 1)}>Previous</button>
          <span>Page {page}</span>
          <button type="button" disabled={!data.has_more} onClick={() => setPage(p => p + 1)}>Next</button>
        </div>}
      </>}
  </div>;
}

export function PdiDetails({ vin, pdi }) {
  const [open, setOpen] = useState(false);
  if (pdi === undefined || pdi?.disabled) return null;
  return <details className="pdi-details" onToggle={e => setOpen(e.currentTarget.open)}
    onClick={e => e.stopPropagation()} onKeyDown={e => e.stopPropagation()}>
    <summary aria-label={`PDI history for ${vin}`}><PdiBadge result={pdi?.result} /></summary>
    {open && <PdiHistory vin={vin} revision={pdi?.id} />}
  </details>;
}
