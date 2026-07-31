export function StatusStrip({ stats, openFlags, damageCount, transitCount, onJump }) {
  return (
    <div className="admin-status-strip" role="navigation" aria-label="Admin status">
      <button type="button" className="admin-status-chip" onClick={() => onJump("yards")}>
        <span className="admin-status-value">{stats.currentStock}</span>
        <span className="admin-status-label">In stock</span>
      </button>
      <button
        type="button"
        className={`admin-status-chip ${openFlags > 0 ? "warn" : ""}`}
        onClick={() => onJump("attention", "all")}
      >
        <span className="admin-status-value">{openFlags}</span>
        <span className="admin-status-label">Open flags</span>
      </button>
      <button
        type="button"
        className={`admin-status-chip ${damageCount > 0 ? "warn" : ""}`}
        onClick={() => onJump("attention", "damage")}
      >
        <span className="admin-status-value">{damageCount}</span>
        <span className="admin-status-label">Damage</span>
      </button>
      <button
        type="button"
        className={`admin-status-chip ${transitCount > 0 ? "info" : ""}`}
        onClick={() => onJump("vehicles", { tool: "transit" })}
      >
        <span className="admin-status-value">{transitCount}</span>
        <span className="admin-status-label">In transit</span>
      </button>
      <button type="button" className="admin-status-chip" onClick={() => onJump("yards")}>
        <span className="admin-status-value">{stats.overallUtilization}%</span>
        <span className="admin-status-label">Utilisation</span>
      </button>
    </div>
  );
}
