import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";
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
  const [session, setSession] = useState(() => {
    try {
      const parsed = JSON.parse(localStorage.getItem("yardSession") || "null");
      // Check if it looks like a valid Supabase session (has access_token or user)
      if (parsed && !parsed.access_token && !parsed.user) return null;
      return parsed;
    } catch (e) {
      return null;
    }
  });
  const [view, setView] = useState("scan");
  const [online, setOnline] = useState(navigator.onLine);
  const [queueCount, setQueueCount] = useState(getQueue().length);

  useEffect(() => {
    localStorage.setItem("yardSession", JSON.stringify(session));
  }, [session]);

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
  const [role, setRole] = useState("stockyard");
  const [yardId, setYardId] = useState(yards[0].id);
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  async function submit(event) {
    event.preventDefault();
    setError(null);
    setLoading(true);
    try {
      // Map code to email for Supabase
      const isAd = role === "admin" || code.trim().toUpperCase() === "ADMIN";
      const userCode = isAd ? "admin" : code.trim().toLowerCase() || yardId.split("-")[0].toLowerCase();
      const email = isAd ? "admin@nippon.toyota" : `${userCode}@yard.nippon`;
      
      const password = isAd ? "admin123" : "stockyard123";
      const sessionData = await login(email, password);
      onLogin(sessionData);
    } catch (err) {
      setError(err.message || "Invalid access code.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="login">
      <section className="login-panel">
        <div className="login-visual" aria-hidden="true">
          <div className="login-visual-top">
            <span className="toyota-dot"></span>
            <strong>Stockyard gate</strong>
          </div>
          <div className="yard-strip">
            <span>Live yard access</span>
            <b>{yards.length} yards</b>
          </div>
        </div>
        <div className="login-form-panel">
          <div className="brand-row">
            <div className="brand-mark"><span className="material-symbols-outlined">qr_code_scanner</span></div>
            <div>
              <span className="eyebrow">Toyota yard operations</span>
              <h1>Nippon Yard Scan</h1>
            </div>
          </div>
          <p>Sign in to scan vehicle movement at the gate.</p>
          <form onSubmit={submit} className="stack">
            <label>Account type</label>
            <div className="segmented">
              <button type="button" className={role === "stockyard" ? "active" : ""} onClick={() => setRole("stockyard")}>Stockyard</button>
              <button type="button" className={role === "admin" ? "active" : ""} onClick={() => setRole("admin")}>Admin</button>
            </div>
            {role === "stockyard" && (
              <>
                <label htmlFor="yard">Physical yard</label>
                <select id="yard" value={yardId} onChange={(event) => setYardId(event.target.value)}>
                  {yards.map((yard) => <option key={yard.id} value={yard.id}>{yard.code} · {yard.name}</option>)}
                </select>
              </>
            )}
            <label htmlFor="code">Access code</label>
            <input id="code" required value={code} onChange={(event) => setCode(event.target.value)} placeholder={role === "admin" ? "ADMIN" : "Shared yard code"} />
            {error && <p className="notice error">{error}</p>}
            <button className="primary" disabled={loading}><span>{loading ? "Verifying..." : "Login"}</span><span className="material-symbols-outlined">arrow_forward</span></button>
          </form>
        </div>
      </section>
    </main>
  );
}

function Header({ session, online, pending, onLogout }) {
  const name = session?.userDetails?.role === "admin" ? "Admin Console" : (yards.find(y => y.id === session?.userDetails?.yard_id)?.name || session?.user?.email || session?.name || "Unknown User");
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
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraError, setCameraError] = useState("");
  const [message, setMessage] = useState(null);
  const [loading, setLoading] = useState(false);
  const videoRef = useRef(null);
  const yard = yards.find((item) => item.id === session.userDetails?.yard_id) || yards[0];

  useEffect(() => {
    if (!cameraOpen) return;
    let stream;

    async function openCamera() {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          const settings = stream.getVideoTracks()[0]?.getSettings() || {};
          // Mirror the video preview if it's a front-facing (or desktop) camera
          videoRef.current.style.transform = settings.facingMode === "environment" ? "scaleX(1)" : "scaleX(-1)";
        }
        setCameraError("");
      } catch {
        setCameraError("Camera access blocked. Allow camera permission and try again.");
        setCameraOpen(false);
      }
    }

    openCamera();
    return () => stream?.getTracks().forEach((track) => track.stop());
  }, [cameraOpen]);

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
        <div className="scan-ticket">
          <span className={`scan-badge ${type}`}>{type.toUpperCase()}</span>
          <div>
            <h1>{yard.code}</h1>
            <p>{yard.name}</p>
          </div>
          <span className={online ? "status-dot ok" : "status-dot warn"}>{online ? "Online" : "Offline"}</span>
        </div>
        <div className="segmented big scan-toggle">
          <button type="button" className={type === "in" ? "active" : ""} onClick={() => setType("in")}>Vehicle IN</button>
          <button type="button" className={type === "out" ? "active out" : ""} onClick={() => setType("out")}>Vehicle OUT</button>
        </div>
        <div className="camera">
          <button className={`scan-box ${cameraOpen ? "live" : ""}`} type="button" onClick={() => setCameraOpen(true)} aria-label="Open camera scanner">
            {cameraOpen && <video ref={videoRef} autoPlay muted playsInline />}
            <span className="corner top-left"></span>
            <span className="corner top-right"></span>
            <span className="corner bottom-left"></span>
            <span className="corner bottom-right"></span>
            {!cameraOpen && <span className="qr-pattern" aria-hidden="true"></span>}
          </button>
          <p>{cameraOpen ? "Point the camera at the vehicle QR code." : "Tap the QR grid to open camera scanner."}</p>
          {cameraError && <p className="camera-error">{cameraError}</p>}
          {cameraOpen && <button type="button" className="ghost" onClick={() => setCameraOpen(false)}>Close camera</button>}
          <button type="button" onClick={() => setVin("JTMBA38V70D123456")}><span className="material-symbols-outlined">barcode_scanner</span> Demo Scan</button>
        </div>
        <label htmlFor="vin">Manual VIN entry</label>
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
      <aside className="panel yard-card">
        <span className="eyebrow">Assigned yard</span>
        <h2>{yard.name}</h2>
        <div className="yard-meta"><span>{yard.code}</span><b>Capacity {yard.capacity}</b></div>
        <div className="yard-device">
          <span className="material-symbols-outlined">smartphone</span>
          <span>Device Connected</span>
        </div>
        <p className="muted">GPS is captured on submit. Offline scans stay queued until the browser comes online.</p>
      </aside>
    </section>
  );
}

function StockView({ session }) {
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
  return (
    <article className={`vehicle ${vehicle.current_status}`}>
      <div>
        <strong>{vehicle.vin}</strong>
        <span>{vehicle.model}</span>
      </div>
      <div>
        <b>{vehicle.current_status ? vehicle.current_status.toUpperCase() : "UNKNOWN"}</b>
        <small>{vehicle.last_changed_at ? new Date(vehicle.last_changed_at).toLocaleDateString("en-GB") : ""}</small>
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
      load();
    } catch (err) {
      alert("Failed to resolve: " + err.message);
    }
  };

  if (loading || !stats) return <p>Loading dashboard...</p>;

  return (
    <section className="stack">
      <div className="metrics">
        <Metric label="Current Stock" value={stats.total_in} />
        <Metric label="Avg Dwell" value={`${stats.dwell_time?.by_model[0]?.avg_dwell_hours || 0}h`} />
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
