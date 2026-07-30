import React, { useState, useEffect } from "react";
import { getAdminBranches, createAdminBranch, updateAdminBranch, assignBranchYards } from "../api.js";
import { yardsByRegion } from "../stockyardLogic.js";
import "../corporate-modern.css";

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
    return <div className="p-xl text-center bm-container">Loading branches...</div>;
  }

  return (
    <div className="bm-container">
      <div className="bm-header">
        <h2>Branches</h2>
        <p>Group yards into branches used for requisitions and delivery login.</p>
      </div>
      
      {error && <div className="notice bad" style={{marginBottom: 16}}>{error}</div>}

      <form onSubmit={handleCreate} className="bm-add-form">
        <label htmlFor="new-branch">New branch name</label>
        <div className="input-group">
          <input 
            id="new-branch"
            value={newBranchName} 
            onChange={e => setNewBranchName(e.target.value)} 
            placeholder="e.g. Cochin (Nippon Towers)" 
            required 
          />
          <button type="submit">
            Add branch
          </button>
        </div>
      </form>

      {/* Branch List Grid */}
      <div className="bm-grid">
        {branches.map(b => (
          <div key={b.id} className="bm-card">
            <div className="bm-card-header">
              {editingId === b.id ? (
                <div style={{flex: 1, display: 'flex', gap: 8, alignItems: 'center'}}>
                  <input 
                    value={editName} 
                    onChange={e => setEditName(e.target.value)} 
                    autoFocus 
                  />
                  <button type="button" onClick={() => handleSaveEdit(b.id)} className="bm-btn-small">Save</button>
                  <button type="button" onClick={() => setEditingId(null)} className="bm-btn-small secondary">Cancel</button>
                </div>
              ) : (
                <>
                  <div>
                    <h3>
                      {b.name}
                    </h3>
                    {!b.active && <span className="inactive-pill" style={{marginTop: 4}}>Inactive</span>}
                  </div>
                  <div className="bm-card-actions">
                    <button type="button" className="bm-icon-btn" onClick={() => { setEditingId(b.id); setEditName(b.name); }} title="Rename branch" aria-label="Rename branch">
                      <span className="material-symbols-outlined">edit</span>
                    </button>
                    <button type="button" className="bm-icon-btn" onClick={() => handleToggleActive(b.id, b.active)} title={b.active ? "Archive branch" : "Restore branch"} aria-label={b.active ? "Archive branch" : "Restore branch"}>
                      <span className="material-symbols-outlined">{b.active ? "archive" : "unarchive"}</span>
                    </button>
                  </div>
                </>
              )}
            </div>
            
            <div className="bm-card-body">
              {b.yards && b.yards.length > 0 ? (
                <>
                  <p style={{textTransform: 'uppercase', fontSize: 12, fontWeight: 700, letterSpacing: '0.05em', color: 'var(--bm-on-surface-variant)', marginBottom: 8}}>Assigned Yards</p>
                  <div className="bm-yards-list">
                    {b.yards.map(y => (
                      <span key={y.id} className="bm-yard-chip">{y.name}</span>
                    ))}
                  </div>
                </>
              ) : (
                <p>No yards assigned.</p>
              )}
            </div>
            
            <div className="bm-card-footer">
              <button type="button" className="bm-btn-assign" onClick={() => {
                setAssigningId(b.id);
                setSelectedYards(b.yards?.map(y => y.id) || []);
              }}>
                Assign Yards
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Modal for Assigning Yards */}
      {assigningId && (
        <div className="bm-modal-overlay" onClick={() => setAssigningId(null)}>
          <div className="bm-modal-content" onClick={e => e.stopPropagation()}>
            <div className="bm-modal-header">
              <div>
                <h3>Assign Yards</h3>
                <p>Select the yards for {branches.find(b => b.id === assigningId)?.name}</p>
              </div>
              <button type="button" className="bm-icon-btn" onClick={() => setAssigningId(null)}>
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>
            
            <form onSubmit={handleSaveYards} style={{display: 'flex', flexDirection: 'column', overflow: 'hidden'}}>
              <div className="bm-modal-body">
                {yardsByRegion().map(({ region, yards: regionYards }) => (
                  <div key={region} className="bm-yard-region">
                    <p className="bm-yard-region-label">{region}</p>
                    {regionYards.map((y) => (
                      <label key={y.id} className="bm-yard-checkbox">
                        <input
                          type="checkbox"
                          checked={selectedYards.includes(y.id)}
                          onChange={(e) => {
                            if (e.target.checked) setSelectedYards([...selectedYards, y.id]);
                            else setSelectedYards(selectedYards.filter((id) => id !== y.id));
                          }}
                        />
                        <span>{y.code} · {y.name}</span>
                      </label>
                    ))}
                  </div>
                ))}
              </div>
              <div className="bm-modal-footer">
                <button type="submit">Save Assignments</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
