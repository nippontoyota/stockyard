import React, { useState, useEffect } from "react";
import { getAdminBranches, getBranchStock, createRequisition, approveRequisition, rejectRequisition } from "../api.js";
import "../corporate-modern.css";

export function RequisitionsTab({ state, session }) {
  const { incoming, outgoing } = state.requisitions;
  const [activeTab, setActiveTab] = useState("incoming");
  const [showCreate, setShowCreate] = useState(false);
  const isDelivery = session.role === "delivery_incharge";

  return (
    <div className="bm-container">
      <header className="bm-header">
        <div>
          <h2>Vehicle Requisitions</h2>
          <p className="bm-subtitle">Branch-to-branch transfers.</p>
        </div>
        {isDelivery && (
          <button className="bm-btn bm-btn-primary" onClick={() => setShowCreate(true)}>
            <span className="material-symbols-outlined">add</span> Request Vehicle
          </button>
        )}
      </header>

      <div className="bm-segmented-control" style={{ marginBottom: '24px' }}>
        <button 
          className={`bm-segmented-btn ${activeTab === "incoming" ? "active" : ""}`}
          onClick={() => setActiveTab("incoming")}
        >
          Incoming ({incoming.length})
        </button>
        {isDelivery && (
          <button 
            className={`bm-segmented-btn ${activeTab === "outgoing" ? "active" : ""}`}
            onClick={() => setActiveTab("outgoing")}
          >
            Outgoing ({outgoing.length})
          </button>
        )}
      </div>

      <div className="bm-list-grid">
        {activeTab === "incoming" && incoming.length === 0 && (
          <div className="bm-empty-state">
            <span className="material-symbols-outlined bm-empty-icon">inbox</span>
            <h3>No Incoming Requests</h3>
            <p>You don't have any vehicle requests from other branches.</p>
          </div>
        )}
        {activeTab === "incoming" && incoming.map(req => <RequisitionCard key={req.id} req={req} type="incoming" />)}
        
        {activeTab === "outgoing" && outgoing.length === 0 && (
          <div className="bm-empty-state">
            <span className="material-symbols-outlined bm-empty-icon">outbox</span>
            <h3>No Outgoing Requests</h3>
            <p>You haven't requested any vehicles from other branches.</p>
          </div>
        )}
        {activeTab === "outgoing" && outgoing.map(req => <RequisitionCard key={req.id} req={req} type="outgoing" />)}
      </div>

      {showCreate && <CreateRequisitionModal onClose={() => setShowCreate(false)} />}
    </div>
  );
}

function RequisitionCard({ req, type }) {
  const [rejectReason, setRejectReason] = useState("");
  const [isRejecting, setIsRejecting] = useState(false);

  const statusClass = {
    pending: "warning",
    approved: "success",
    rejected: "error"
  }[req.status] || "neutral";

  async function handleApprove() {
    try {
      await approveRequisition(req.id);
    } catch (e) {
      alert(e.message);
    }
  }

  async function handleReject(e) {
    e.preventDefault();
    try {
      await rejectRequisition(req.id, rejectReason);
      setIsRejecting(false);
    } catch (e) {
      alert(e.message);
    }
  }

  return (
    <div className="bm-card">
      <div className="bm-card-header">
        <div>
          <h3 className="bm-card-title">{req.vehicle?.model}</h3>
          <p className="bm-card-subtitle font-mono">{req.vehicle?.vin}</p>
        </div>
        <span className={`bm-badge bm-badge-${statusClass}`}>{req.status.toUpperCase()}</span>
      </div>
      
      <div className="bm-card-body" style={{ fontSize: '0.875rem', marginBottom: '16px' }}>
        {type === "incoming" ? (
          <p>Requested by: <strong>{req.requesting_branch?.name || "Unknown Branch"}</strong></p>
        ) : (
          <p>Requested from: <strong>{req.source_branch?.name || "Unknown Branch"}</strong></p>
        )}
        <p className="bm-subtitle" style={{ marginTop: '4px' }}>On: {new Date(req.requested_at).toLocaleString()}</p>
      </div>

      {req.status === "rejected" && req.rejection_reason && (
        <div style={{ backgroundColor: 'rgba(239, 68, 68, 0.1)', padding: '12px', borderRadius: '6px', color: '#b91c1c', fontSize: '0.875rem', marginBottom: '16px' }}>
          <strong>Reason:</strong> {req.rejection_reason}
        </div>
      )}

      {type === "incoming" && req.status === "pending" && !isRejecting && (
        <div className="bm-card-actions">
          <button className="bm-btn bm-btn-primary" onClick={handleApprove} style={{ flex: 1 }}>Approve</button>
          <button className="bm-btn bm-btn-secondary" onClick={() => setIsRejecting(true)} style={{ flex: 1 }}>Reject</button>
        </div>
      )}

      {isRejecting && (
        <form onSubmit={handleReject} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <input 
            type="text" 
            className="bm-input"
            placeholder="Reason for rejection" 
            value={rejectReason} 
            onChange={e => setRejectReason(e.target.value)} 
            required 
            autoFocus
          />
          <div className="bm-card-actions">
            <button type="submit" className="bm-btn bm-btn-danger" style={{ flex: 1 }}>Confirm</button>
            <button type="button" className="bm-btn bm-btn-secondary" onClick={() => setIsRejecting(false)} style={{ flex: 1 }}>Cancel</button>
          </div>
        </form>
      )}
    </div>
  );
}

function CreateRequisitionModal({ onClose }) {
  const [branches, setBranches] = useState([]);
  const [selectedBranchId, setSelectedBranchId] = useState("");
  const [stock, setStock] = useState([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [selectedVin, setSelectedVin] = useState("");

  useEffect(() => {
    getAdminBranches().then(res => setBranches(res || [])).catch(console.error);
  }, []);

  useEffect(() => {
    if (!selectedBranchId) {
      setStock([]);
      return;
    }
    setLoading(true);
    getBranchStock(selectedBranchId)
      .then(res => {
        setStock(res || []);
        setSelectedVin("");
      })
      .catch(e => {
        console.error(e);
        setStock([]);
      })
      .finally(() => setLoading(false));
  }, [selectedBranchId]);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!selectedBranchId || !selectedVin) return;
    
    setSubmitting(true);
    try {
      const v = stock.find(s => s.vin === selectedVin);
      await createRequisition(selectedBranchId, v.vehicle_id);
      onClose();
    } catch (err) {
      alert(err.message);
      setSubmitting(false);
    }
  }

  return (
    <div className="bm-modal-overlay">
      <div className="bm-modal-content">
        <header className="bm-modal-header">
          <h3 className="bm-modal-title">Request Vehicle</h3>
          <button type="button" className="bm-btn-icon" onClick={onClose} aria-label="Close">
            <span className="material-symbols-outlined">close</span>
          </button>
        </header>

        <form onSubmit={handleSubmit} className="bm-modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div className="bm-form-group">
            <label className="bm-label">Source Branch</label>
            <div className="bm-select-wrapper">
              <select 
                className="bm-input" 
                value={selectedBranchId} 
                onChange={e => setSelectedBranchId(e.target.value)} 
                required
              >
                <option value="">-- Select Branch --</option>
                {branches.map(b => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
            </div>
          </div>

          {selectedBranchId && (
            <div className="bm-form-group">
              <label className="bm-label">Select Vehicle in Stock</label>
              {loading ? (
                <div style={{ padding: '24px', textAlign: 'center', color: '#64748b' }}>
                  <span className="material-symbols-outlined">sync</span>
                  <p style={{ marginTop: '8px' }}>Loading stock...</p>
                </div>
              ) : stock.length === 0 ? (
                <div style={{ backgroundColor: 'rgba(245, 158, 11, 0.1)', padding: '16px', borderRadius: '8px', color: '#b45309', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span className="material-symbols-outlined">warning</span>
                  No vehicles currently available at this branch.
                </div>
              ) : (
                <div style={{ maxHeight: '300px', overflowY: 'auto', border: '1px solid #e2e8f0', borderRadius: '8px' }}>
                  {stock.map(v => (
                    <label 
                      key={v.vin} 
                      style={{ 
                        display: 'flex', 
                        alignItems: 'center', 
                        gap: '12px', 
                        padding: '12px 16px', 
                        borderBottom: '1px solid #e2e8f0',
                        cursor: 'pointer',
                        backgroundColor: selectedVin === v.vin ? '#f1f5f9' : 'transparent',
                        transition: 'background-color 0.2s'
                      }}
                    >
                      <input 
                        type="radio" 
                        name="vehicle" 
                        value={v.vin} 
                        checked={selectedVin === v.vin}
                        onChange={() => setSelectedVin(v.vin)} 
                        required
                        style={{ accentColor: '#002046', width: '16px', height: '16px' }}
                      />
                      <div>
                        <strong style={{ display: 'block', color: '#0f172a' }}>{v.model}</strong>
                        <div style={{ fontSize: '0.75rem', color: '#64748b', fontFamily: 'monospace', marginTop: '2px' }}>{v.vin}</div>
                      </div>
                    </label>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="bm-modal-footer">
            <button type="button" className="bm-btn bm-btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="bm-btn bm-btn-primary" disabled={submitting || !selectedVin}>
              {submitting ? "Submitting..." : "Submit Request"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
