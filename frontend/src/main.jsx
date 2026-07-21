import React, { useEffect, useState, useCallback } from "react";
import { createRoot } from "react-dom/client";
import {
  login,
  logout,
  yards,
  scanIn,
  scanOut,
  createScanPayload,
  bulkSync,
  fetchDashboard,
  fetchStock,
  fetchFlags,
  resolveFlag,
  adminOverride,
  getQueue,
  addToQueue,
  clearQueue,
} from "./stockyardLogic.js";
import "./styles.css";

function App() {
  const [session, setSession] = useState(() => JSON.parse(localStorage.getItem("yardSession") || "null"));
  const [view, setView] = useState("scan");
  const [online, setOnline] = useState(navigator.onLine);
  const [queueCount, setQueueCount] = useState(getQueue().length);

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

  const syncOffline = useCallback(async () => {
    const queue = getQueue();
    if (queue.length === 0) return;
    try {
      await bulkSync(queue);
      clearQueue();
      setQueueCount(0);
    } catch (err) {
      console.error("Bulk sync failed", err);
    }
  }, []);

  useEffect(() => {
    if (online) {
      syncOffline();
    }
  }, [online, syncOffline]);

  const updateQueueCount = () => setQueueCount(getQueue().length);

  if (!session) return <Login onLogin={setSession} />;

  const isAdmin = session.userDetails?.role === "admin";

  const handleLogout = async () => {
    await logout();
    setSession(null);
  };

  return (
    <div className="app-shell">
      <Header session={session} online={online} pending={queueCount} onLogout={handleLogout} />
      <main className="content">
        {view === "scan" && <ScanView session={session} online={online} onQueueUpdate={updateQueueCount} />}
        {view === "stock" && <StockView session={session} />}
        {view === "dashboard" && isAdmin && <DashboardView />}
        {view === "admin" && isAdmin && <AdminView />}
      </main>
      <nav className="bottom-nav">
        <NavButton icon="barcode_scanner" label="Scan" active={view === "scan"} onClick={() => setView("scan")} />
        <NavButton icon="inventory_2" label="Stock" active={view === "stock"} onClick={() => setView("stock")} />
        {isAdmin && <NavButton icon="dashboard" label="Dash" active={view === "dashboard"} onClick={() => setView("dashboard")} />}
        {isAdmin && <NavButton icon="admin_panel_settings" label="Admin" active={view === "admin"} onClick={() => setView("admin")} />}
      </nav>
    </div>
  );
}

function Login({ onLogin }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const sessionData = await login(email, password);
      onLogin(sessionData);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  // Pre-fill helper for demo purposes based on selected yard
  const setDemoLogin = (e) => {
    const code = e.target.value.toLowerCase();
    setEmail(`${code}@yard.nippon`);
    setPassword("stockyard123");
  };

  return (
    <main className="login">
      <section className="login-panel">
        <div className="brand-mark"><span className="material-symbols-outlined">qr_code_scanner</span></div>
        <h1>Nippon Yard Scan</h1>
        <p>Log vehicle IN and OUT at the yard gate.</p>
        <form onSubmit={submit} className="stack">
          <label>Demo Yard (Auto-fills login)</label>
          <select onChange={setDemoLogin} defaultValue="">
             <option value="" disabled>Select a demo yard...</option>
             {yards.map(y => <option key={y.code} value={y.code}>{y.code} - {y.name}</option>)}
             <option value="admin">Admin User (admin@nippon.local)</option>
          </select>
          <hr />
          <label htmlFor="email">Email</label>
          <input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" />
          <label htmlFor="password">Password</label>
          <input id="password" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password" />
          {error && <p className="notice error">{error}</p>}
          <button className="primary" disabled={loading}>{loading ? "Logging in..." : "Login"}</button>
        </form>
      </section>
    </main>
  );
}

function Header({ session, online, pending, onLogout }) {
  const name = session.userDetails?.role === "admin" ? "Admin Console" : (yards.find(y => y.id === session.userDetails?.yard_id)?.name || session.user.email);
  return (
    <header className="topbar">
      <div>
        <strong>Nippon Yard Scan</strong>
        <small>{name}</small>
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

function ScanView({ session, online, onQueueUpdate }) {
  const [type, setType] = useState("in");
  const [vin, setVin] = useState("");
  const [outRemark, setOutRemark] = useState("");
  const [damaged, setDamaged] = useState(false);
  const [damageRemark, setDamageRemark] = useState("");
  const [message, setMessage] = useState(null);
  const [loading, setLoading] = useState(false);
  
  const yard = yards.find((item) => item.id === session.userDetails?.yard_id) || yards[0];

  async function submit(event) {
    event.preventDefault();
    if (!vin.trim()) return setMessage({ kind: "error", text: "Enter or scan a VIN." });
    if (type === "out" && !outRemark) return setMessage({ kind: "error", text: "Select an OUT reason." });
    if (type === "out" && damaged && !damageRemark.trim()) return setMessage({ kind: "error", text: "Add the damage remark." });

    const gps = { latitude: yard.latitude, longitude: yard.longitude, accuracy: online ? 24 : null };
    const payload = createScanPayload({ vin, type, gps, outRemark, damaged, damageRemark });

    if (!online) {
      addToQueue(payload);
      onQueueUpdate();
      setMessage({ kind: "ok", text: "Saved offline. Will sync when online." });
      setVin("");
      return;
    }

    setLoading(true);
    try {
      const res = type === "in" ? await scanIn(payload) : await scanOut(payload);
      if (res.flags && res.flags.length > 0) {
        setMessage({ kind: "warn", text: `Scan accepted with flags: ${res.flags.join(", ")}` });
      } else {
        setMessage({ kind: "ok", text: "Scan accepted." });
      }
      setVin("");
    } catch (err) {
      setMessage({ kind: "error", text: err.message });
    } finally {
      setLoading(false);
    }
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
          <button className="primary" disabled={loading}>{loading ? "..." : "Submit"}</button>
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
        <p className="muted">GPS captured on submit. Offline scans stay in the queue until the browser comes online.</p>
      </aside>
    </section>
  );
}

function StockView() {
  const [query, setQuery] = useState("");
  const [vehicles, setVehicles] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const res = await fetchStock(query);
        if (active) setVehicles(res.data);
      } catch (err) {
        console.error(err);
      } finally {
        if (active) setLoading(false);
      }
    };
    load();
    return () => { active = false; };
  }, [query]);

  return (
    <section className="stack">
      <input className="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search VIN or model" />
      <div className="vehicle-list">
        {loading && <p>Loading...</p>}
        {!loading && vehicles.map((vehicle) => <VehicleCard key={vehicle.vin} vehicle={vehicle} />)}
      </div>
    </section>
  );
}

function VehicleCard({ vehicle }) {
  // Backend doesn't return flags inline for stock view, so we don't know if it's FLAGGED here. 
  // We can just show current_status.
  return (
    <article className={`vehicle ${vehicle.current_status}`}>
      <div>
        <strong>{vehicle.vin}</strong>
        <span>{vehicle.model}</span>
      </div>
      <div>
        <b>{vehicle.current_status ? vehicle.current_status.toUpperCase() : "UNKNOWN"}</b>
        <small>{vehicle.last_changed_at ? new Date(vehicle.last_changed_at).toLocaleString() : ""}</small>
      </div>
    </article>
  );
}

function DashboardView() {
  const [stats, setStats] = useState(null);
  const [flags, setFlags] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    try {
      const [statsRes, flagsRes] = await Promise.all([
        fetchDashboard(),
        fetchFlags()
      ]);
      setStats(statsRes);
      setFlags(flagsRes.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const handleResolve = async (id) => {
    try {
      await resolveFlag(id);
      load(); // refresh
    } catch (err) {
      alert("Failed to resolve: " + err.message);
    }
  };

  if (loading || !stats) return <p>Loading dashboard...</p>;

  return (
    <section className="stack">
      <div className="metrics">
        <Metric label="Current Stock" value={stats.total_in} />
        {/* We just show an average of averages for simplicity, or just omit if too complex */}
        <Metric label="Avg Dwell (Model)" value={`${stats.dwell_time?.by_model[0]?.avg_dwell_hours || 0}h`} />
        <Metric label="Open Flags" value={flags.length} tone="bad" />
      </div>
      <section className="panel">
        <h2>Yard Utilization</h2>
        <div className="yard-grid">
          {stats.yards.map((yard) => <Progress key={yard.yard_id} yard={yard} />)}
        </div>
      </section>
      <section className="panel">
        <h2>Model Split</h2>
        {stats.model_split.map((row) => <div className="split" key={row.model}><span>{row.model}</span><b>{row.count}</b></div>)}
      </section>
      <section className="panel">
        <h2>Flags</h2>
        {flags.map((flag) => (
          <div className="flag-row" key={flag.id}>
            <span><b>{flag.vin}</b><small>{flag.message}</small></span>
            <button onClick={() => handleResolve(flag.id)}>Resolve</button>
          </div>
        ))}
        {flags.length === 0 && <p className="muted">No open flags.</p>}
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
      <div><b>{yard.name}</b><span>{yard.current_count}/{yard.capacity}</span></div>
      <progress max="100" value={Math.min(100, yard.utilization_pct || 0)} />
    </div>
  );
}

function AdminView() {
  const [vin, setVin] = useState("");
  const [yardId, setYardId] = useState(yards[0].id);
  const [status, setStatus] = useState("out");
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState(null);

  async function submit(event) {
    event.preventDefault();
    try {
      await adminOverride(vin, { yard_id: yardId, status, reason });
      setMessage({ kind: "ok", text: "Correction applied." });
      setVin("");
      setReason("");
    } catch (err) {
      setMessage({ kind: "error", text: err.message });
    }
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
        {message && <p className={`notice ${message.kind}`}>{message.text}</p>}
        <button className="primary">Apply Correction</button>
      </form>
    </section>
  );
}

createRoot(document.getElementById("root")).render(<App />);
