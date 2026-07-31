import React, { useEffect } from "react";

export function ConfirmDialog({ open, title, message, confirmLabel = "Confirm", cancelLabel = "Cancel", tone = "default", loading = false, onConfirm, onCancel }) {
  useEffect(() => {
    if (!open) return undefined;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (e) => {
      if (e.key === "Escape" && !loading) onCancel?.();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open, loading, onCancel]);

  if (!open) return null;

  return (
    <div className="modal-overlay" onClick={loading ? undefined : onCancel} aria-modal="true" role="alertdialog" aria-labelledby="confirm-dialog-title">
      <div className="modal-content confirm-dialog-card" onClick={(e) => e.stopPropagation()}>
        <h3 id="confirm-dialog-title">{title}</h3>
        {typeof message === "string" ? <p className="confirm-dialog-message">{message}</p> : <div className="confirm-dialog-message">{message}</div>}
        <div className={`confirm-dialog-actions${cancelLabel ? "" : " single"}`}>
          {cancelLabel ? (
            <button type="button" className="cred-modal-cancel" onClick={onCancel} disabled={loading}>
              {cancelLabel}
            </button>
          ) : null}
          <button type="button" className={tone === "danger" ? "primary danger-btn" : "primary"} onClick={onConfirm} disabled={loading}>
            {loading ? "Working…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
