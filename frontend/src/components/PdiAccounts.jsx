import React, { useState } from 'react';
import { createPdiAccount, updateCredentialApi, humanizeApiError } from '../api.js';

export function PdiAccounts({ accounts, branches, onRefresh }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [branch, setBranch] = useState('');
  const [editing, setEditing] = useState(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null);
  async function save(event) {
    event.preventDefault(); setBusy(true); setMessage(null);
    try {
      if (editing) await updateCredentialApi(editing.username, password);
      else await createPdiAccount({ username: username.trim(), password, branch_id: branch });
      setMessage({ ok: true, text: editing ? 'PDI password updated.' : 'PDI account created. Share the username and password with the inspector.' });
      setUsername(''); setPassword(''); setEditing(null);
      await onRefresh();
    } catch (err) { setMessage({ ok: false, text: humanizeApiError(err) }); }
    finally { setBusy(false); }
  }
  return <section className="pdi-accounts pdi-panel">
    <h3>PDI branch teams</h3><p>Create an individual account for each inspector. Their assigned branch controls which vehicles they can inspect.</p>
    {message && <p role={message.ok ? 'status' : 'alert'} className={`notice ${message.ok ? 'ok' : 'bad'}`}>{message.text}</p>}
    <form className="pdi-account-form" onSubmit={save}>
      {editing ? <p>New password for <strong>{editing.username}</strong></p> : <>
        <label>Inspector username<input required minLength={3} maxLength={80} pattern="[a-zA-Z0-9._\-]+" autoComplete="off" value={username} onChange={e => setUsername(e.target.value)} disabled={busy} /></label>
        <label>Branch<select aria-label="Branch" required value={branch} onChange={e => setBranch(e.target.value)} disabled={busy}>
          <option value="">Select a branch</option>{branches.filter(b => b.active !== false).map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select></label>
      </>}
      <label>{editing ? 'New password' : 'Password'}<input type="password" autoComplete="new-password" required minLength={8} maxLength={128} value={password} onChange={e => setPassword(e.target.value)} disabled={busy} /></label>
      <small>Use at least 8 characters. PDI passwords are case-sensitive and are not displayed after saving.</small>
      <div className="pdi-form-actions"><button className="primary" disabled={busy}>{busy ? 'Saving…' : editing ? 'Update PDI password' : 'Create PDI account'}</button>
        {editing && <button type="button" disabled={busy} onClick={() => { setEditing(null); setPassword(''); }}>Cancel</button>}</div>
    </form>
    <div className="pdi-account-list">{accounts.map(account => <div key={account.id || account.username}>
      <span><strong>{account.username}</strong><small>{branches.find(b => b.id === account.branchId)?.name || account.yardName}</small></span>
      <button type="button" disabled={busy} onClick={() => { setEditing(account); setPassword(''); setMessage(null); }}>Change password</button>
    </div>)}</div>
    {!accounts.length && <p>No PDI accounts in this view.</p>}
  </section>;
}
