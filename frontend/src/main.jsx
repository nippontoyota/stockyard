import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  applyScan,
  createClientScanId,
  createInitialState,
  createScan,
  dashboard,
  resolveFlag,
  STORAGE_KEY,
  updateVehicleAdmin,
  yards,
} from "./stockyardLogic.js";
import "./styles.css";

const loadState = () => {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || createInitialState();
  } catch {
    return createInitialState();
  }
};

function App() {
  const [state, setState] = useState(loadState);
  const [session, setSession] = useState(() => JSON.parse(localStorage.getItem("yardSession") || "null"));
  const [view, setView] = useState("scan");
  const [online, setOnline] = useState(navigator.onLine);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [state]);

  useEffect(() => {
    localStorage.setItem("yardSession", JSON.stringify(session));
  }, [session]);

  useEffect(() => {
    navigator.serviceWorker?.register("/sw.js").catch(() => {});
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    addEventListener("online", up);
    addEventListener("offline", down);
    return () => {
      removeEventListener("online", up);
      removeEventListener("offline", down);
    };
  }, []);

  useEffect(() => {
    if (!online || state.queue.length === 0) return;
    setState((current) => ({ ...current, queue: [] }));
  }, [online, state.queue.length]);

  if (!session) return <Login onLogin={setSession} />;

  const stats = dashboard(state);
  const isAdmin = session.role === "admin";

  return (
    <div className="app-shell">
      <Header session={session} online={online} pending={state.queue.length} onLogout={() => setSession(null)} />
      <main className="content">
        {view === "scan" && <ScanView state={state} setState={setState} session={session} online={online} />}
        {view === "stock" && <StockView state={state} session={session} />}
        {view === "dashboard" && <DashboardView state={state} stats={stats} setState={setState} />}
        {view === "admin" && isAdmin && <AdminView state={state} setState={setState} />}
      </main>
      <nav className="bottom-nav">
        <NavButton icon="barcode_scanner" label="Scan" active={view === "scan"} onClick={() => setView("scan")} />
        <NavButton icon="inventory_2" label="Stock" active={view === "stock"} onClick={() => setView("stock")} />
        <NavButton icon="dashboard" label="Dash" active={view === "dashboard"} onClick={() => setView("dashboard")} />
        {isAdmin && <NavButton icon="admin_panel_settings" label="Admin" active={view === "admin"} onClick={() => setView("admin")} />}
      </nav>
    </div>
  );
}

function Login({ onLogin }) {
  const [role, setRole] = useState("stockyard");
  const [yardId, setYardId] = useState(yards[0].id);
  const [code, setCode] = useState("");

  function submit(event) {
    event.preventDefault();
    if (role === "admin" || code.trim().toUpperCase() === "ADMIN") {
      onLogin({ role: "admin", yardId: null, name: "Admin" });
      return;
    }
    const yard = yards.find((item) => item.id === yardId);
    onLogin({ role: "stockyard", yardId, name: yard.name });
  }

  return (
    <main className="login">
      <section className="login-panel">
        <div className="brand-mark"><span className="material-symbols-outlined">qr_code_scanner</span></div>
        <h1>Nippon Yard Scan</h1>
        <p>Log vehicle IN and OUT at the yard gate.</p>
        <form onSubmit={submit} className="stack">
          <label>Account Type</label>
          <div className="segmented">
            <button type="button" className={role === "stockyard" ? "active" : ""} onClick={() => setRole("stockyard")}>Stockyard</button>
            <button type="button" className={role === "admin" ? "active" : ""} onClick={() => setRole("admin")}>Admin</button>
          </div>
          {role === "stockyard" && (
            <>
              <label htmlFor="yard">Physical Yard</label>
              <select id="yard" value={yardId} onChange={(event) => setYardId(event.target.value)}>
                {yards.map((yard) => <option key={yard.id} value={yard.id}>{yard.code} · {yard.name}</option>)}
              </select>
            </>
          )}
          <label htmlFor="code">Access Code</label>
          <input id="code" required value={code} onChange={(event) => setCode(event.target.value)} placeholder={role === "admin" ? "ADMIN" : "Shared yard code"} />
          <button className="primary">Login</button>
        </form>
      </section>
    </main>
  );
}

function Header({ session, online, pending, onLogout }) {
  return (
    <header className="topbar">
      <div>
        <strong>Nippon Yard Scan</strong>
        <small>{session.role === "admin" ? "Admin Console" : session.name}</small>
      </div>
      <div className="top-actions">
        <span className={online ? "pill ok" : "pill warn"}>{online ? "Online" : "Offline"} · {pending} queued</span>
        <button className="icon-btn" onClick={onLogout} aria-label="Log out"><span className="material-symbols-outlined">logout</span></button>
      </div>
    </header>
  );
}

function NavButton({ icon, label, active, onClick }) {
  return <button className={active ? "active" : ""} onClick={onClick}><span className="material-symbols-outlined">{icon}</span><small>{label}</small></button>;
}

function ScanView({ state, setState, session, online }) {
  const [type, setType] = useState("in");
  const [vin, setVin] = useState("");
  const [outRemark, setOutRemark] = useState("");
  const [damaged, setDamaged] = useState(false);
  const [damageRemark, setDamageRemark] = useState("");
  const [message, setMessage] = useState(null);
  const yard = yards.find((item) => item.id === session.yardId) || yards[0];

  function submit(event) {
    event.preventDefault();
    if (!vin.trim()) return setMessage({ kind: "error", text: "Enter or scan a VIN." });
    if (type === "out" && !outRemark) return setMessage({ kind: "error", text: "Select an OUT reason." });
    if (type === "out" && damaged && !damageRemark.trim()) return setMessage({ kind: "error", text: "Add the damage remark." });

    const gps = { latitude: yard.latitude, longitude: yard.longitude, accuracy: online ? 24 : null };
    const scan = createScan({ vin, type, yardId: yard.id, gps, outRemark, damaged, damageRemark, online });
    const result = applyScan(state, scan);
    setState(result.state);
    setMessage({ kind: result.accepted ? "ok" : "error", text: result.message });
    setVin("");
  }

  return (
    <section className="scan-grid">
      <form className="scan-card stack" onSubmit={submit}>
        <div className="segmented big">
          <button type="button" className={type === "in" ? "active" : ""} onClick={() => setType("in")}>IN</button>
          <button type="button" className={type === "out" ? "active out" : ""} onClick={() => setType("out")}>OUT</button>
        </div>
        <div className="camera">
          <div className="scan-box"><span>Align QR</span></div>
          <button type="button" onClick={() => setVin("JTMBA38V70D123456")}><span className="material-symbols-outlined">barcode_scanner</span> Demo Scan</button>
        </div>
        <label htmlFor="vin">Manual VIN Entry</label>
        <div className="inline-form">
          <input id="vin" value={vin} onChange={(event) => setVin(event.target.value.toUpperCase())} placeholder="Enter VIN" />
          <button className="primary">Submit</button>
        </div>
        {type === "out" && (
          <div className="stack">
            <label htmlFor="remark">OUT Reason</label>
            <select id="remark" value={outRemark} onChange={(event) => setOutRemark(event.target.value)}>
              <option value="">Select reason</option>
              <option value="customer_acquisition">Customer Acquisition</option>
              <option value="stockyard_transfer">Stockyard Transfer</option>
            </select>
            <label className="check"><input type="checkbox" checked={damaged} onChange={(event) => setDamaged(event.target.checked)} /> Damage reported</label>
            {damaged && <textarea value={damageRemark} onChange={(event) => setDamageRemark(event.target.value)} rows="3" placeholder="Damage remark" />}
          </div>
        )}
        {message && <p className={`notice ${message.kind}`}>{message.text}</p>}
      </form>
      <aside className="panel">
        <h2>{yard.name}</h2>
        <p className="muted">{yard.code} · capacity {yard.capacity}</p>
        <p className="muted">Device {state.deviceId.slice(-8)}</p>
        <p className="muted">GPS captured on submit. Offline scans stay in the queue until the browser comes online.</p>
      </aside>
    </section>
  );
}

function StockView({ state, session }) {
  const [query, setQuery] = useState("");
  const rows = Object.values(state.vehicles)
    .filter((vehicle) => session.role === "admin" || vehicle.currentYardId === session.yardId)
    .filter((vehicle) => `${vehicle.vin} ${vehicle.model}`.toLowerCase().includes(query.toLowerCase()))
    .sort((a, b) => b.lastChangedAt.localeCompare(a.lastChangedAt));

  return (
    <section className="stack">
      <input className="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search VIN or model" />
      <div className="vehicle-list">
        {rows.map((vehicle) => <VehicleCard key={vehicle.vin} vehicle={vehicle} flags={state.flags.filter((flag) => flag.vin === vehicle.vin && !flag.resolved)} />)}
      </div>
    </section>
  );
}

function VehicleCard({ vehicle, flags }) {
  return (
    <article className={`vehicle ${vehicle.currentStatus} ${flags.length ? "flagged" : ""}`}>
      <div>
        <strong>{vehicle.vin}</strong>
        <span>{vehicle.model}</span>
      </div>
      <div>
        <b>{flags.length ? "FLAGGED" : vehicle.currentStatus.toUpperCase()}</b>
        <small>{new Date(vehicle.lastChangedAt).toLocaleString()}</small>
      </div>
    </article>
  );
}

function DashboardView({ state, stats, setState }) {
  return (
    <section className="stack">
      <div className="metrics">
        <Metric label="Current Stock" value={stats.currentStock} />
        <Metric label="Avg Dwell" value={`${stats.averageDwellDays}d`} />
        <Metric label="Open Flags" value={stats.openFlags} tone="bad" />
      </div>
      <section className="panel">
        <h2>Yard Utilization</h2>
        <div className="yard-grid">
          {stats.yards.map((yard) => <Progress key={yard.id} yard={yard} />)}
        </div>
      </section>
      <section className="panel">
        <h2>Model Split</h2>
        {stats.models.map((row) => <div className="split" key={row.model}><span>{row.model}</span><b>{row.count}</b></div>)}
      </section>
      <section className="panel">
        <h2>Flags</h2>
        {state.flags.filter((flag) => !flag.resolved).map((flag) => (
          <div className="flag-row" key={flag.id}>
            <span><b>{flag.vin}</b><small>{flag.message}</small></span>
            <button onClick={() => setState(resolveFlag(state, flag.id))}>Resolve</button>
          </div>
        ))}
      </section>
    </section>
  );
}

function Metric({ label, value, tone = "" }) {
  return <div className={`metric ${tone}`}><span>{label}</span><strong>{value}</strong></div>;
}

function Progress({ yard }) {
  return (
    <div className="yard-progress">
      <div><b>{yard.name}</b><span>{yard.count}/{yard.capacity}</span></div>
      <progress max="100" value={Math.min(100, yard.utilization)} />
    </div>
  );
}

function AdminView({ state, setState }) {
  const [vin, setVin] = useState("");
  const [yardId, setYardId] = useState(yards[0].id);
  const [status, setStatus] = useState("out");
  const [reason, setReason] = useState("");

  function submit(event) {
    event.preventDefault();
    setState(updateVehicleAdmin(state, { vin, yardId, status, reason }));
    setVin("");
    setReason("");
  }

  return (
    <section className="panel stack">
      <h2>Admin Correction</h2>
      <form className="stack" onSubmit={submit}>
        <input required value={vin} onChange={(event) => setVin(event.target.value.toUpperCase())} placeholder="VIN" />
        <select value={status} onChange={(event) => setStatus(event.target.value)}>
          <option value="out">Force close OUT</option>
          <option value="in">Reassign IN yard</option>
        </select>
        {status === "in" && <select value={yardId} onChange={(event) => setYardId(event.target.value)}>{yards.map((yard) => <option value={yard.id} key={yard.id}>{yard.name}</option>)}</select>}
        <textarea required value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Correction note" />
        <button className="primary">Apply Correction</button>
      </form>
    </section>
  );
}

createRoot(document.getElementById("root")).render(<App />);
