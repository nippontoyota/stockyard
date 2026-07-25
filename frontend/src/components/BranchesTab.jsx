import React, { useState, useEffect } from "react";
import { getAdminBranches, createAdminBranch, updateAdminBranch, assignBranchYards } from "../api.js";
import { yards } from "../stockyardLogic.js";

export function BranchesTab() {
  const [branches, setBranches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  
  const [newBranchName, setNewBranchName] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [editName, setEditName] = useState("");
  
  // For yard assignment
  const [assigningId, setAssigningId] = useState(null);
  const [selectedYards, setSelectedYards] = useState([]);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true);
    try {
      const data = await getAdminBranches();
      setBranches(data || []);
      setError(null);
    } catch (e) {
      setError(e.message);
    }
    setLoading(false);
  }

  async function handleCreate(e) {
    e.preventDefault();
    if (!newBranchName.trim()) return;
    try {
      await createAdminBranch(newBranchName.trim());
      setNewBranchName("");
      load();
    } catch (err) {
      alert(err.message);
    }
  }

  async function handleToggleActive(id, active) {
    try {
      await updateAdminBranch(id, { active: !active });
      load();
    } catch (err) {
      alert(err.message);
    }
  }
  
  async function handleSaveEdit(id) {
    if (!editName.trim()) return;
    try {
      await updateAdminBranch(id, { name: editName.trim() });
      setEditingId(null);
      load();
    } catch (err) {
      alert(err.message);
    }
  }

  async function handleSaveYards(e) {
    e.preventDefault();
    try {
      await assignBranchYards(assigningId, selectedYards);
      setAssigningId(null);
      load();
    } catch (err) {
      alert(err.message);
    }
  }

  if (loading && branches.length === 0) {
    return <div className="p-xl text-center">Loading branches...</div>;
  }

  if (assigningId) {
    const branch = branches.find(b => b.id === assigningId);
    return (
      <div className="stack p-md">
        <header className="row justify-between">
          <h2>Assign Yards to {branch?.name}</h2>
          <button className="icon-btn" onClick={() => setAssigningId(null)}>
            <span className="material-symbols-outlined">close</span>
          </button>
        </header>
        <form onSubmit={handleSaveYards} className="stack">
          <div className="grid col-2">
            {yards.map(y => (
              <label key={y.id} className="row align-center gap-sm">
                <input 
                  type="checkbox" 
                  checked={selectedYards.includes(y.id)} 
                  onChange={(e) => {
                    if (e.target.checked) setSelectedYards([...selectedYards, y.id]);
                    else setSelectedYards(selectedYards.filter(id => id !== y.id));
                  }}
                />
                {y.code} · {y.name}
              </label>
            ))}
          </div>
          <button type="submit" className="primary">Save Yard Assignments</button>
        </form>
      </div>
    );
  }

  return (
    <div className="stack p-md max-w-lg mx-auto">
      <header>
        <h2>Branch Management</h2>
        <p className="muted">Group physical yards into logical branches for requisitions.</p>
      </header>
      
      {error && <div className="notice bad">{error}</div>}

      <form onSubmit={handleCreate} className="row align-end gap-sm">
        <div className="field flex-1">
          <label>New Branch Name</label>
          <input value={newBranchName} onChange={e => setNewBranchName(e.target.value)} placeholder="e.g. Cochin (Nippon Towers)" required />
        </div>
        <button type="submit" className="primary" style={{ marginBottom: '4px' }}>Add</button>
      </form>

      <ul className="list-group">
        {branches.map(b => (
          <li key={b.id} className="list-item stack">
            <div className="row justify-between align-center">
              {editingId === b.id ? (
                <div className="row gap-sm flex-1">
                  <input value={editName} onChange={e => setEditName(e.target.value)} autoFocus className="flex-1" />
                  <button onClick={() => handleSaveEdit(b.id)} className="primary small">Save</button>
                  <button onClick={() => setEditingId(null)} className="small">Cancel</button>
                </div>
              ) : (
                <div className="row gap-sm align-center">
                  <strong className={b.active ? "" : "muted"}>{b.name}</strong>
                  {!b.active && <span className="pill warn">Inactive</span>}
                </div>
              )}
              
              {editingId !== b.id && (
                <div className="row gap-sm">
                  <button onClick={() => {
                    setAssigningId(b.id);
                    setSelectedYards(b.yards?.map(y => y.id) || []);
                  }} className="small">Assign Yards</button>
                  <button className="icon-btn small" onClick={() => { setEditingId(b.id); setEditName(b.name); }}>
                    <span className="material-symbols-outlined">edit</span>
                  </button>
                  <button className="icon-btn small" onClick={() => handleToggleActive(b.id, b.active)}>
                    <span className="material-symbols-outlined">{b.active ? "archive" : "unarchive"}</span>
                  </button>
                </div>
              )}
            </div>
            
            {b.yards && b.yards.length > 0 && (
              <div className="row wrap gap-xs mt-sm">
                {b.yards.map(y => (
                  <span key={y.id} className="pill muted">{y.code}</span>
                ))}
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
