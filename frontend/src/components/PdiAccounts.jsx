import React, { useEffect, useRef, useState } from 'react';
import { createPdiAccount, updateCredentialApi, humanizeApiError } from '../api.js';
import { useToast } from '../hooks/useToast.js';

export function PdiAccounts({ accounts, assignedBranchIds, branches, onRefresh }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [branch, setBranch] = useState('');
  const [editing, setEditing] = useState(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const dialogRef = useRef(null);
  const { toastMessage, toast, clearToast } = useToast(5000);
  const availableBranches = branches.filter(b => b.active !== false && !assignedBranchIds.includes(b.id));

  useEffect(() => {
    if (!open) return;
    const dialog = dialogRef.current;
    const previousOverflow = document.body.style.overflow;
    const previousRootOverflow = document.documentElement.style.overflow;
    document.documentElement.style.overflow = 'hidden';
    document.body.style.overflow = 'hidden';
    dialog.showModal();
    dialog.querySelector('input')?.focus({ preventScroll: true });
    return () => {
      dialog.close();
      document.body.style.overflow = previousOverflow;
      document.documentElement.style.overflow = previousRootOverflow;
    };
  }, [open]);

  function openForm(account = null) {
    setEditing(account); setUsername(''); setPassword(''); setBranch(''); setError('');
    clearToast(); setOpen(true);
  }

  function closeForm() {
    if (busy) return;
    setOpen(false); setPassword(''); setError('');
  }

  async function save(event) {
    event.preventDefault();
    if (busy) return;
    setBusy(true); setError('');
    const successMessage = editing ? 'PDI password updated.' : 'Account created successfully.';
    try {
      if (editing) await updateCredentialApi(editing.username, password);
      else await createPdiAccount({ username: username.trim(), password, branch_id: branch });
    } catch (err) {
      setError(humanizeApiError(err));
      return;
    } finally { setBusy(false); }

    setOpen(false); setUsername(''); setPassword(''); setBranch(''); setEditing(null);
    toast(successMessage);
    try { await onRefresh(); }
    catch { toast(`${successMessage} Refresh the list to see the latest accounts.`); }
  }
  return <section className="pdi-accounts pdi-panel">
    <div className="pdi-accounts-heading">
      <h3>PDI branch teams</h3>
      <button type="button" className="primary" disabled={!availableBranches.length} onClick={() => openForm()}>Create PDI account</button>
    </div>
    <p>{availableBranches.length ? 'Each branch can have one PDI account. Only branches without an account are available.' : 'No branches are available for a new PDI account. Each active branch can have one account.'}</p>
    {toastMessage && <div className="pdi-account-toast notice ok" role="status">{toastMessage}</div>}
    <dialog ref={dialogRef} className="pdi-account-dialog" aria-labelledby="pdi-account-title"
      aria-describedby="pdi-account-description" onCancel={event => { event.preventDefault(); closeForm(); }}>
      <div className="pdi-account-dialog-heading">
        <h3 id="pdi-account-title">{editing ? 'Change PDI password' : 'Create PDI account'}</h3>
        <button type="button" className="pdi-account-close" aria-label="Close PDI account popup" disabled={busy} onClick={closeForm}>×</button>
      </div>
      <p id="pdi-account-description">{editing ? 'Set a new password for this branch’s PDI account.' : 'Create the PDI account for a branch. Each branch can have only one account.'}</p>
      {error && <p role="alert" className="notice bad">{error}</p>}
      <form className="pdi-account-form" onSubmit={save} aria-busy={busy}>
      {editing ? <p>New password for <strong>{editing.username}</strong></p> : <>
        <label>Inspector username<input required minLength={3} maxLength={80} pattern="[a-zA-Z0-9._\-]+" autoComplete="off" value={username} onChange={e => setUsername(e.target.value)} disabled={busy} /></label>
        <label>Branch<select aria-label="Branch" required value={branch} onChange={e => setBranch(e.target.value)} disabled={busy}>
          <option value="">Select a branch</option>{availableBranches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select></label>
      </>}
      <label>{editing ? 'New password' : 'Password'}<input type="password" autoComplete="new-password" required minLength={8} maxLength={128} value={password} onChange={e => setPassword(e.target.value)} disabled={busy} /></label>
      <small>Use at least 8 characters. PDI passwords are case-sensitive and are not displayed after saving.</small>
      <div className="pdi-form-actions"><button className="primary" disabled={busy}>{busy ? 'Saving…' : editing ? 'Update PDI password' : 'Create PDI account'}</button>
        <button type="button" disabled={busy} onClick={closeForm}>Cancel</button></div>
      </form>
    </dialog>
    <div className="pdi-account-list">{accounts.map(account => <div key={account.id || account.username}>
      <span><strong>{account.username}</strong><small>{branches.find(b => b.id === account.branchId)?.name || account.yardName}</small></span>
      <button type="button" disabled={busy} onClick={() => openForm(account)}>Change password</button>
    </div>)}</div>
    {!accounts.length && <p>No PDI accounts in this view.</p>}
  </section>;
}
