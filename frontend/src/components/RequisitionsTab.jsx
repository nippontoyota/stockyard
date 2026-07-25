import React, { useState, useEffect } from "react";
import { getAdminBranches, getBranchStock, createRequisition, approveRequisition, rejectRequisition } from "../api.js";

export function RequisitionsTab({ state, session }) {
  const { incoming, outgoing } = state.requisitions;
  const [activeTab, setActiveTab] = useState("incoming");
  const [showCreate, setShowCreate] = useState(false);
  const isDelivery = session.role === "delivery_incharge";

  return (
    <div className="stack p-md max-w-lg mx-auto">
      <header className="row justify-between align-center">
        <div>
          <h2>Vehicle Requisitions</h2>
          <p className="muted">Branch-to-branch transfers.</p>
        </div>
        {isDelivery && (
          <button className="primary" onClick={() => setShowCreate(true)}>
            <span className="material-symbols-outlined">add</span> Request Vehicle
          </button>
        )}
      </header>

      <div className="segmented">
        <button 
          className={activeTab === "incoming" ? "active" : ""} 
          onClick={() => setActiveTab("incoming")}
        >
          Incoming ({incoming.length})
        </button>
        {isDelivery && (
          <button 
            className={activeTab === "outgoing" ? "active" : ""} 
            onClick={() => setActiveTab("outgoing")}
          >
            Outgoing ({outgoing.length})
          </button>
        )}
      </div>

      <div className="req-list stack gap-sm">
        {activeTab === "incoming" && incoming.length === 0 && <p className="muted p-md text-center">No incoming requests.</p>}
        {activeTab === "incoming" && incoming.map(req => <RequisitionCard key={req.id} req={req} type="incoming" />)}
        
        {activeTab === "outgoing" && outgoing.length === 0 && <p className="muted p-md text-center">No outgoing requests.</p>}
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
    pending: "warn",
    approved: "ok",
    rejected: "bad"
  }[req.status] || "muted";

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
    <div className="card p-sm stack gap-sm">
      <div className="row justify-between align-start">
        <div>
          <strong>{req.vehicle?.model}</strong>
          <div className="muted small font-mono">{req.vehicle?.vin}</div>
        </div>
        <span className={`pill ${statusClass}`}>{req.status.toUpperCase()}</span>
      </div>
      
      <div className="text-sm">
        {type === "incoming" ? (
          <p>Requested by: <strong>{req.requesting_branch?.name || "Unknown Branch"}</strong></p>
        ) : (
          <p>Requested from: <strong>{req.source_branch?.name || "Unknown Branch"}</strong></p>
        )}
        <p className="muted">On: {new Date(req.requested_at).toLocaleString()}</p>
      </div>

      {req.status === "rejected" && req.rejection_reason && (
        <div className="notice bad small">Reason: {req.rejection_reason}</div>
      )}

      {type === "incoming" && req.status === "pending" && !isRejecting && (
        <div className="row gap-sm mt-sm">
          <button className="primary flex-1" onClick={handleApprove}>Approve</button>
          <button className="secondary flex-1" onClick={() => setIsRejecting(true)}>Reject</button>
        </div>
      )}

      {isRejecting && (
        <form onSubmit={handleReject} className="stack gap-xs mt-sm">
          <input 
            type="text" 
            placeholder="Reason for rejection" 
            value={rejectReason} 
            onChange={e => setRejectReason(e.target.value)} 
            required 
            autoFocus
          />
          <div className="row gap-sm">
            <button type="submit" className="danger flex-1">Confirm Reject</button>
            <button type="button" className="secondary flex-1" onClick={() => setIsRejecting(false)}>Cancel</button>
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
    <div className="modal-backdrop">
      <div className="modal-panel">
        <header className="row justify-between">
          <h3>Request Vehicle</h3>
          <button className="icon-btn" onClick={onClose}><span className="material-symbols-outlined">close</span></button>
        </header>
        <form onSubmit={handleSubmit} className="stack p-md">
          <div className="field">
            <label>Source Branch</label>
            <select value={selectedBranchId} onChange={e => setSelectedBranchId(e.target.value)} required>
              <option value="">-- Select Branch --</option>
              {branches.map(b => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
          </div>

          {selectedBranchId && (
            <div className="field">
              <label>Select Vehicle in Stock</label>
              {loading ? (
                <p className="muted">Loading stock...</p>
              ) : stock.length === 0 ? (
                <p className="notice warn">No vehicles currently available at this branch.</p>
              ) : (
                <div className="scroll-y max-h-64 border rounded">
                  {stock.map(v => (
                    <label key={v.vin} className={`row gap-sm p-sm align-center border-b ${selectedVin === v.vin ? 'bg-light' : ''}`}>
                      <input 
                        type="radio" 
                        name="vehicle" 
                        value={v.vin} 
                        checked={selectedVin === v.vin}
                        onChange={() => setSelectedVin(v.vin)} 
                        required
                      />
                      <div>
                        <strong>{v.model}</strong>
                        <div className="muted small font-mono">{v.vin}</div>
                      </div>
                    </label>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="row gap-sm justify-end mt-md">
            <button type="button" className="secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="primary" disabled={submitting || !selectedVin}>
              {submitting ? "Submitting..." : "Submit Request"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
