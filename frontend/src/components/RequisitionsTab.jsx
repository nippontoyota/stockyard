import React, { useState, useEffect, useMemo } from "react";
import {
  getRequestTargetYards,
  getYardStock,
  createRequisition,
  approveRequisition,
  rejectRequisition,
} from "../api.js";

const ACTIVE_STATUSES = new Set(["pending", "approved"]);

function filterByView(items, showAll) {
  return showAll ? items : items.filter((r) => ACTIVE_STATUSES.has(r.status));
}

function statusTone(status) {
  return {
    pending: "warn",
    approved: "ok",
    rejected: "bad",
    fulfilled: "ok",
  }[status] || "neutral";
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
    <section className="stack req-page">
      <div className="stock-header-bar">
        <div>
          <span className="eyebrow">Transfers</span>
          <h2>Vehicle requests</h2>
          <p className="delivery-stock-subtitle">Branch-to-branch requisitions for stockyard transfers</p>
        </div>
        {isDelivery && (
          <div className="stock-actions">
            <button type="button" className="primary req-request-btn" onClick={() => setShowCreate(true)}>
              <span className="material-symbols-outlined">add</span>
              Request vehicle
            </button>
          </div>
        )}
      </div>

      <div className="segmented req-segmented" role="tablist" aria-label="Requisition lists">
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "incoming"}
          className={activeTab === "incoming" ? "active" : ""}
          onClick={() => setActiveTab("incoming")}
        >
          Incoming ({pendingIncoming || visibleIncoming.length})
        </button>
        {isDelivery && (
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "outgoing"}
            className={activeTab === "outgoing" ? "active" : ""}
            onClick={() => setActiveTab("outgoing")}
          >
            Outgoing ({visibleOutgoing.length})
          </button>
        )}
        <button
          type="button"
          className={showAll ? "active" : ""}
          onClick={() => setShowAll((v) => !v)}
          title={showAll ? "Show active only" : "Show all history"}
        >
          {showAll ? "All" : "Active"}
        </button>
      </div>

      <div className="panel req-panel">
        {activeTab === "incoming" && visibleIncoming.length === 0 && (
          <div className="no-results req-empty">
            <span className="material-symbols-outlined">inbox</span>
            <p>{showAll ? "No requisitions yet." : "No pending or approved requests from other branches."}</p>
          </div>
        )}
        {activeTab === "incoming" && visibleIncoming.length > 0 && (
          <div className="req-list">
            {visibleIncoming.map((req) => (
              <RequisitionRow key={req.id} req={req} type="incoming" onRefresh={onRefresh} />
            ))}
          </div>
        )}

        {activeTab === "outgoing" && visibleOutgoing.length === 0 && (
          <div className="no-results req-empty">
            <span className="material-symbols-outlined">outbox</span>
            <p>{showAll ? "You haven\u2019t requested any vehicles." : "No active requests to other branches."}</p>
          </div>
        )}
        {activeTab === "outgoing" && visibleOutgoing.length > 0 && (
          <div className="req-list">
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
    </section>
  );
}

function RequisitionRow({ req, type, onRefresh }) {
  const [rejectReason, setRejectReason] = useState("");
  const [isRejecting, setIsRejecting] = useState(false);
  const [isActioning, setIsActioning] = useState(false);

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
    <article className="req-row">
      <div className="req-row-main">
        <div className="req-col-vehicle">
          <strong>{req.vehicle?.model || "Model not set"}</strong>
          <span className="req-vin">{req.vehicle?.vin}</span>
        </div>
        <div className="req-col-meta">
          <span>{type === "incoming" ? "From" : "To"} {branchName}</span>
          <small>
            {new Date(req.requested_at).toLocaleDateString(undefined, {
              month: "short",
              day: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            })}
          </small>
        </div>
        <span className={`badge ${statusTone(req.status)}`}>{req.status}</span>
        {type === "incoming" && req.status === "pending" && !isRejecting && (
          <div className="req-action-buttons">
            <button
              type="button"
              className="ghost req-icon-btn"
              onClick={() => setIsRejecting(true)}
              disabled={isActioning}
              title="Reject request"
              aria-label="Reject request"
            >
              <span className="material-symbols-outlined">close</span>
            </button>
            <button
              type="button"
              className="primary req-icon-btn"
              onClick={handleApprove}
              disabled={isActioning}
              title="Approve request"
              aria-label="Approve request"
            >
              <span className="material-symbols-outlined">check</span>
            </button>
          </div>
        )}
      </div>

      {req.status === "approved" && type === "incoming" && (
        <div className="notice warn req-row-note">
          <span className="material-symbols-outlined">local_shipping</span>
          <span>Scan this vehicle OUT as <strong>Stockyard Transfer</strong> to fulfill.</span>
        </div>
      )}

      {req.status === "rejected" && req.rejection_reason && (
        <div className="notice bad req-row-note">
          <span className="material-symbols-outlined">info</span>
          <span><strong>Rejected:</strong> {req.rejection_reason}</span>
        </div>
      )}

      {isRejecting && (
        <form className="req-reject-form" onSubmit={handleReject}>
          <input
            type="text"
            placeholder="Reason for rejection…"
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            required
            autoFocus
            disabled={isActioning}
          />
          <button type="button" className="ghost" onClick={() => setIsRejecting(false)} disabled={isActioning}>
            Cancel
          </button>
          <button type="submit" className="primary" disabled={isActioning || !rejectReason.trim()}>
            Confirm rejection
          </button>
        </form>
      )}
    </article>
  );
}

function CreateRequisitionModal({ session, onClose, onRefresh }) {
  const [targets, setTargets] = useState([]);
  const [region, setRegion] = useState("");
  const [yardId, setYardId] = useState("");
  const [stock, setStock] = useState([]);
  const [loadingTargets, setLoadingTargets] = useState(true);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [selectedVin, setSelectedVin] = useState("");
  const [error, setError] = useState("");

  const regions = useMemo(() => {
    const set = new Set(targets.map((y) => y.city).filter(Boolean));
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [targets]);

  const regionYards = useMemo(
    () => targets.filter((y) => y.city === region),
    [targets, region],
  );

  const selectedYard = targets.find((y) => y.id === yardId) || null;

  useEffect(() => {
    setLoadingTargets(true);
    getRequestTargetYards()
      .then((res) => {
        const list = Array.isArray(res) ? res : [];
        setTargets(list);
        const firstRegion = [...new Set(list.map((y) => y.city).filter(Boolean))].sort()[0] || "";
        setRegion(firstRegion);
        const firstYard = list.find((y) => y.city === firstRegion) || list[0];
        setYardId(firstYard?.id || "");
      })
      .catch((e) => {
        setError(e.message || "Could not load yards.");
        setTargets([]);
      })
      .finally(() => setLoadingTargets(false));
  }, [session.branchId]);

  useEffect(() => {
    if (!regionYards.some((y) => y.id === yardId)) {
      setYardId(regionYards[0]?.id || "");
    }
  }, [region, regionYards, yardId]);

  useEffect(() => {
    if (!yardId) {
      setStock([]);
      return;
    }
    setLoading(true);
    setError("");
    getYardStock(yardId)
      .then((res) => {
        setStock((res || []).filter((v) => !v.requisition_status));
        setSelectedVin("");
      })
      .catch((e) => {
        console.error(e);
        setStock([]);
        setError(e.message || "Could not load yard stock.");
      })
      .finally(() => setLoading(false));
  }, [yardId]);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!selectedYard?.branch_id || !selectedVin) return;

    setSubmitting(true);
    setError("");
    try {
      const v = stock.find((s) => s.vin === selectedVin);
      await createRequisition(selectedYard.branch_id, v.vehicle_id);
      onRefresh?.();
      onClose();
    } catch (err) {
      setError(err.message || "Request failed.");
      setSubmitting(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose} role="dialog" aria-modal="true" aria-labelledby="req-create-title">
      <div className="modal-content req-create-modal" onClick={(e) => e.stopPropagation()}>
        <header className="req-create-header">
          <div>
            <span className="eyebrow">New request</span>
            <h3 id="req-create-title">Request vehicle transfer</h3>
          </div>
          <button type="button" className="close-modal-btn" onClick={onClose} aria-label="Close">
            <span className="material-symbols-outlined">close</span>
          </button>
        </header>

        <form onSubmit={handleSubmit} className="stack req-create-body">
          {loadingTargets ? (
            <div className="req-loading">
              <span className="material-symbols-outlined spin">sync</span>
              <span>Loading yards…</span>
            </div>
          ) : targets.length === 0 ? (
            <div className="notice warn req-empty-stock">
              <span className="material-symbols-outlined">warehouse</span>
              <span>No other yards are available to request from.</span>
            </div>
          ) : (
            <>
              <label htmlFor="req-region">Region</label>
              <select
                id="req-region"
                value={region}
                onChange={(e) => setRegion(e.target.value)}
                required
              >
                {regions.map((r) => (
                  <option key={r} value={r}>{r}</option>
                ))}
              </select>

              <label htmlFor="req-yard">Yard</label>
              <select
                id="req-yard"
                value={yardId}
                onChange={(e) => setYardId(e.target.value)}
                required
              >
                {regionYards.map((y) => (
                  <option key={y.id} value={y.id}>
                    {y.code} · {y.name} ({y.in_count ?? 0})
                  </option>
                ))}
              </select>

              {selectedYard && (
                <p className="req-yard-count-hint">
                  {selectedYard.in_count ?? 0} vehicle{(selectedYard.in_count ?? 0) === 1 ? "" : "s"} IN at this yard
                </p>
              )}

              <label>Available stock</label>
              {loading ? (
                <div className="req-loading">
                  <span className="material-symbols-outlined spin">sync</span>
                  <span>Fetching inventory…</span>
                </div>
              ) : stock.length === 0 ? (
                <div className="notice warn req-empty-stock">
                  <span className="material-symbols-outlined">inventory_2</span>
                  <span>No vehicles currently available at this yard.</span>
                </div>
              ) : (
                <div className="req-stock-list" role="radiogroup" aria-label="Available vehicles">
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
                      <span className="req-stock-info">
                        <strong>{v.model || "Model not set"}</strong>
                        <span className="req-vin">{v.vin}</span>
                      </span>
                    </label>
                  ))}
                </div>
              )}
            </>
          )}

          {error && <p className="notice bad">{error}</p>}

          <div className="req-create-actions">
            <button type="button" className="ghost" onClick={onClose}>Cancel</button>
            <button type="submit" className="primary" disabled={submitting || !selectedVin || !selectedYard}>
              {submitting ? "Requesting…" : "Submit request"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
