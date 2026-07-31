import React, { useState, useEffect } from "react";
import { getAdminBranches, getBranchStock, createRequisition, approveRequisition, rejectRequisition } from "../api.js";
import "../corporate-modern.css";

const ACTIVE_STATUSES = new Set(["pending", "approved"]);

function filterByView(items, showAll) {
  return showAll ? items : items.filter((r) => ACTIVE_STATUSES.has(r.status));
}

export function RequisitionsTab({ state, session, onRefresh }) {
  const { incoming, outgoing } = state.requisitions;
  const [activeTab, setActiveTab] = useState("incoming");
  const [showAll, setShowAll] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const isDelivery = session.role === "delivery_incharge";

  const visibleIncoming = filterByView(incoming, showAll);
  const visibleOutgoing = filterByView(outgoing, showAll);
  const pendingIncoming = incoming.filter((r) => r.status === "pending").length;

  return (
    <div className="req-container">
      <header className="req-header">
        <div className="req-header-text">
          <h2>Vehicle Requisitions</h2>
          <p>Manage branch-to-branch inventory transfers</p>
        </div>
        {isDelivery && (
          <button className="bm-btn bm-btn-primary req-header-btn" onClick={() => setShowCreate(true)}>
            <span className="material-symbols-outlined">add</span> Request Vehicle
          </button>
        )}
      </header>

      <div className="req-tabs">
        <button
          className={`req-tab ${activeTab === "incoming" ? "active" : ""}`}
          onClick={() => setActiveTab("incoming")}
        >
          Incoming <span className="req-tab-count">{pendingIncoming || visibleIncoming.length}</span>
        </button>
        {isDelivery && (
          <button
            className={`req-tab ${activeTab === "outgoing" ? "active" : ""}`}
            onClick={() => setActiveTab("outgoing")}
          >
            Outgoing <span className="req-tab-count">{visibleOutgoing.length}</span>
          </button>
        )}
        <button
          type="button"
          className={`req-tab req-tab-filter ${showAll ? "active" : ""}`}
          onClick={() => setShowAll((v) => !v)}
          title={showAll ? "Show active only" : "Show all history"}
        >
          {showAll ? "All" : "Active"}
        </button>
      </div>

      <div className="req-table-container">
        {activeTab === "incoming" && visibleIncoming.length === 0 && (
          <div className="req-empty">
            <span className="material-symbols-outlined">inbox</span>
            <h3>No incoming requests</h3>
            <p>{showAll ? "No requisitions yet." : "No pending or approved requests from other branches."}</p>
          </div>
        )}
        {activeTab === "incoming" && visibleIncoming.length > 0 && (
          <div className="req-list">
            <div className="req-list-header">
              <div className="req-col-vehicle">Vehicle</div>
              <div className="req-col-branch">Requested By</div>
              <div className="req-col-date">Date</div>
              <div className="req-col-status">Status</div>
              <div className="req-col-actions"></div>
            </div>
            {visibleIncoming.map((req) => (
              <RequisitionRow key={req.id} req={req} type="incoming" onRefresh={onRefresh} />
            ))}
          </div>
        )}

        {activeTab === "outgoing" && visibleOutgoing.length === 0 && (
          <div className="req-empty">
            <span className="material-symbols-outlined">outbox</span>
            <h3>No outgoing requests</h3>
            <p>{showAll ? "You haven't requested any vehicles." : "No active requests to other branches."}</p>
          </div>
        )}
        {activeTab === "outgoing" && visibleOutgoing.length > 0 && (
          <div className="req-list">
            <div className="req-list-header">
              <div className="req-col-vehicle">Vehicle</div>
              <div className="req-col-branch">Requested From</div>
              <div className="req-col-date">Date</div>
              <div className="req-col-status">Status</div>
              <div className="req-col-actions"></div>
            </div>
            {visibleOutgoing.map((req) => (
              <RequisitionRow key={req.id} req={req} type="outgoing" onRefresh={onRefresh} />
            ))}
          </div>
        )}
      </div>

      {showCreate && (
        <CreateRequisitionModal
          session={session}
          onClose={() => setShowCreate(false)}
          onRefresh={onRefresh}
        />
      )}
    </div>
  );
}

function RequisitionRow({ req, type, onRefresh }) {
  const [rejectReason, setRejectReason] = useState("");
  const [isRejecting, setIsRejecting] = useState(false);
  const [isActioning, setIsActioning] = useState(false);

  const statusClass = {
    pending: "warning",
    approved: "success",
    rejected: "error",
    fulfilled: "success",
  }[req.status] || "neutral";

  async function handleApprove() {
    setIsActioning(true);
    try {
      await approveRequisition(req.id);
      onRefresh?.();
    } catch (e) {
      alert(e.message);
      setIsActioning(false);
    }
  }

  async function handleReject(e) {
    e.preventDefault();
    setIsActioning(true);
    try {
      await rejectRequisition(req.id, rejectReason);
      setIsRejecting(false);
      onRefresh?.();
    } catch (e) {
      alert(e.message);
      setIsActioning(false);
    }
  }

  const branchName = type === "incoming"
    ? (req.requesting_branch?.name || "Unknown")
    : (req.source_branch?.name || "Unknown");

  return (
    <div className="req-row">
      <div className="req-row-main">
        <div className="req-col-vehicle">
          <strong>{req.vehicle?.model}</strong>
          <span className="req-vin">{req.vehicle?.vin}</span>
        </div>
        <div className="req-col-branch">{branchName}</div>
        <div className="req-col-date">
          {new Date(req.requested_at).toLocaleDateString(undefined, {
            month: "short",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          })}
        </div>
        <div className="req-col-status">
          <span className={`bm-badge bm-badge-${statusClass}`}>{req.status}</span>
        </div>
        <div className="req-col-actions">
          {type === "incoming" && req.status === "pending" && !isRejecting && (
            <div className="req-action-buttons">
              <button
                className="bm-btn bm-btn-secondary req-btn-reject"
                onClick={() => setIsRejecting(true)}
                disabled={isActioning}
                title="Reject Request"
              >
                <span className="material-symbols-outlined">close</span>
              </button>
              <button
                className="bm-btn bm-btn-primary req-btn-approve"
                onClick={handleApprove}
                disabled={isActioning}
                title="Approve Request"
              >
                <span className="material-symbols-outlined">check</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {req.status === "approved" && type === "incoming" && (
        <div className="req-row-detail">
          <span className="material-symbols-outlined">local_shipping</span>
          Scan this vehicle OUT as <strong>Stockyard Transfer</strong> to fulfill.
        </div>
      )}

      {req.status === "rejected" && req.rejection_reason && (
        <div className="req-row-detail error">
          <span className="material-symbols-outlined">info</span>
          <strong>Rejected:</strong> {req.rejection_reason}
        </div>
      )}

      {isRejecting && (
        <form className="req-row-detail actioning" onSubmit={handleReject}>
          <input
            type="text"
            className="bm-input"
            placeholder="Reason for rejection..."
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            required
            autoFocus
            disabled={isActioning}
          />
          <button type="button" className="bm-btn bm-btn-secondary" onClick={() => setIsRejecting(false)} disabled={isActioning}>
            Cancel
          </button>
          <button type="submit" className="bm-btn bm-btn-danger" disabled={isActioning || !rejectReason.trim()}>
            Confirm Rejection
          </button>
        </form>
      )}
    </div>
  );
}

function CreateRequisitionModal({ session, onClose, onRefresh }) {
  const [branches, setBranches] = useState([]);
  const [selectedBranchId, setSelectedBranchId] = useState("");
  const [stock, setStock] = useState([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [selectedVin, setSelectedVin] = useState("");

  useEffect(() => {
    getAdminBranches()
      .then((res) => {
        const list = (res || []).filter((b) => b.id !== session.branchId);
        setBranches(list);
      })
      .catch(console.error);
  }, [session.branchId]);

  useEffect(() => {
    if (!selectedBranchId) {
      setStock([]);
      return;
    }
    setLoading(true);
    getBranchStock(selectedBranchId)
      .then((res) => {
        setStock((res || []).filter((v) => !v.requisition_status));
        setSelectedVin("");
      })
      .catch((e) => {
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
      const v = stock.find((s) => s.vin === selectedVin);
      await createRequisition(selectedBranchId, v.vehicle_id);
      onRefresh?.();
      onClose();
    } catch (err) {
      alert(err.message);
      setSubmitting(false);
    }
  }

  return (
    <div className="bm-modal-overlay req-modal">
      <div className="bm-modal-content">
        <header className="bm-modal-header">
          <h3 className="bm-modal-title">Request Vehicle Transfer</h3>
          <button type="button" className="bm-btn-icon" onClick={onClose} aria-label="Close">
            <span className="material-symbols-outlined">close</span>
          </button>
        </header>

        <form onSubmit={handleSubmit} className="bm-modal-body">
          <div className="bm-form-group">
            <label className="bm-label">Source Branch</label>
            <div className="bm-select-wrapper">
              <select
                className="bm-input"
                value={selectedBranchId}
                onChange={(e) => setSelectedBranchId(e.target.value)}
                required
              >
                <option value="">Select a branch to request from...</option>
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
            </div>
          </div>

          {selectedBranchId && (
            <div className="bm-form-group">
              <label className="bm-label">Available Stock</label>
              {loading ? (
                <div className="req-loading">
                  <span className="material-symbols-outlined spin">sync</span>
                  <span>Fetching inventory...</span>
                </div>
              ) : stock.length === 0 ? (
                <div className="req-empty-stock">
                  <span className="material-symbols-outlined">inventory_2</span>
                  <span>No vehicles currently available at this branch.</span>
                </div>
              ) : (
                <div className="req-stock-list">
                  {stock.map((v) => (
                    <label
                      key={v.vin}
                      className={`req-stock-item ${selectedVin === v.vin ? "selected" : ""}`}
                    >
                      <input
                        type="radio"
                        name="vehicle"
                        value={v.vin}
                        checked={selectedVin === v.vin}
                        onChange={() => setSelectedVin(v.vin)}
                        required
                      />
                      <div className="req-stock-info">
                        <strong>{v.model}</strong>
                        <span className="req-vin font-mono">{v.vin}</span>
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
              {submitting ? "Requesting..." : "Submit Request"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
