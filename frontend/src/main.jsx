import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import * as XLSX from "xlsx";
import {
  applyScan,
  createClientScanId,
  createInitialState,
  createScan,
  dashboard,
  parseDeliveredVins,
  normalizeVin,
  removeDeliveredVehicles,
  resolveFlag,
  STORAGE_KEY,
  updateVehicleAdmin,
  yards,
} from "./stockyardLogic.js";
import {
  ExecutiveKpiCards,
  ModelDonutChart,
  YardCapacityBarChart,
  DwellDistributionChart,
  FlagDistributionChart,
  DwellByModelChart,
} from "./AnalyticsCharts.jsx";
import {
  bulkSync, getVehicles, getAdminDashboard, getFlags, resolveFlag as apiResolveFlag, adminOverrideVehicle
} from "./api.js";
import "./styles.css";

const loadState = () => {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || createInitialState();
  } catch {
    return createInitialState();
  }
};

function getRoutePath(viewName, role) {
  if (role === "admin") {
    if (viewName === "dashboard") return "/dashboard";
    if (viewName === "stock") return "/stock";
    if (viewName === "delivered") return "/delivered";
    if (viewName === "admin") return "/admin";
    return "/dashboard";
  }
  if (viewName === "dashboard") return "/dash";
  if (viewName === "stock") return "/stock";
  return "/scan";
}

function getViewFromPath(pathname, role) {
  const path = (pathname || "").toLowerCase();
  if (role === "admin") {
    if (path === "/admin") return "admin";
    if (path === "/delivered") return "delivered";
    if (path === "/stock") return "stock";
    if (path === "/dashboard" || path === "/dash") return "dashboard";
    return "dashboard";
  }
  if (path === "/stock") return "stock";
  if (path === "/dash" || path === "/dashboard") return "dashboard";
  return "scan";
}

function App() {
  const [state, setState] = useState(loadState);
  const [session, setSession] = useState(() => JSON.parse(localStorage.getItem("yardSession") || "null"));
  const [view, setView] = useState(() => {
    const savedSession = JSON.parse(localStorage.getItem("yardSession") || "null");
    if (!savedSession) return "scan";
    return getViewFromPath(window.location.pathname, savedSession.role);
  });
  const [online, setOnline] = useState(navigator.onLine);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [state]);

  useEffect(() => {
    localStorage.setItem("yardSession", JSON.stringify(session));
  }, [session]);

  useEffect(() => {
    if (!session) return;
    const targetPath = getRoutePath(view, session.role);
    if (window.location.pathname !== targetPath) {
      window.history.replaceState(null, "", targetPath);
    }
  }, [view, session]);

  useEffect(() => {
    const handlePopState = () => {
      if (!session) return;
      setView(getViewFromPath(window.location.pathname, session.role));
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [session]);

  useEffect(() => {
    if (!session) return;
    let mounted = true;
    async function loadData() {
      try {
        const vehiclesData = await getVehicles();
        if (!mounted) return;
        
        const mappedVehicles = {};
        vehiclesData.forEach(v => {
          mappedVehicles[v.vin] = {
            vin: v.vin,
            model: v.model || "Unknown",
            variant: "Standard",
            colour: "Not set",
            vinValid: v.vin_valid,
            currentStatus: v.current_status,
            currentYardId: v.current_yard_id,
            lastChangedAt: v.last_changed_at,
          };
        });
        
        let mappedFlags = [];
        if (session.role === "admin") {
          const flagsData = await getFlags();
          mappedFlags = flagsData.map(f => ({
            id: f.id,
            vin: f.vin,
            type: f.flag_type,
            message: f.message,
            resolved: f.resolved,
          }));
        }
        
        setState(s => ({
          ...s,
          vehicles: mappedVehicles,
          flags: session.role === "admin" ? mappedFlags : s.flags
        }));
      } catch (err) {
        console.error("Failed to load backend data", err);
      }
    }
    loadData();
    return () => { mounted = false; };
  }, [session, setState]);

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
    
    let cancelled = false;
    async function performSync() {
      // Find all queued scans that haven't been synced yet
      const scansToSync = state.scans.filter(s => state.queue.includes(s.clientScanId));
      if (scansToSync.length === 0) return;
      
      try {
        await bulkSync(scansToSync);
        if (cancelled) return;
        
        setState((current) => {
          const syncedIds = scansToSync.map(s => s.clientScanId);
          return {
            ...current,
            queue: current.queue.filter(id => !syncedIds.includes(id)),
            scans: current.scans.map((scan) => syncedIds.includes(scan.clientScanId) ? { ...scan, syncStatus: "synced" } : scan),
          };
        });
      } catch (err) {
        console.error("Background sync failed:", err);
      }
    }
    
    performSync();
    return () => { cancelled = true; };
  }, [online, state.queue.length, state.scans]);

  const navigateTo = (nextView) => {
    setView(nextView);
    if (session) {
      const nextPath = getRoutePath(nextView, session.role);
      window.history.pushState(null, "", nextPath);
    }
  };

  if (!session) return <Login onLogin={(nextSession) => {
    setSession(nextSession);
    const initialView = nextSession.role === "admin" ? "dashboard" : "scan";
    setView(initialView);
    window.history.replaceState(null, "", getRoutePath(initialView, nextSession.role));
  }} />;

  const isAdmin = session.role === "admin";
  const stats = dashboard(state, isAdmin ? null : session.yardId);

  return (
    <div className="app-shell">
      <Header session={session} online={online} pending={state.queue.length} onLogout={() => {
        setSession(null);
        window.history.replaceState(null, "", "/");
      }} />
      <main className="content">
        {view === "scan" && <ScanView state={state} setState={setState} session={session} online={online} />}
        {view === "stock" && <StockView state={state} session={session} />}
        {view === "dashboard" && (isAdmin ? <AdminHome stats={stats} state={state} setState={setState} /> : <DashboardView state={state} stats={stats} session={session} setState={setState} />)}
        {view === "delivered" && isAdmin && <DeliveredUpload state={state} setState={setState} />}
        {view === "admin" && isAdmin && <AdminView state={state} setState={setState} />}
      </main>
      <nav className="bottom-nav">
        {!isAdmin && <NavButton icon="barcode_scanner" label="Scan" active={view === "scan"} onClick={() => navigateTo("scan")} />}
        <NavButton icon="inventory_2" label="Stock" active={view === "stock"} onClick={() => navigateTo("stock")} />
        <NavButton icon="dashboard" label="Dash" active={view === "dashboard"} onClick={() => navigateTo("dashboard")} />
        {isAdmin && <NavButton icon="upload_file" label="Delivered" active={view === "delivered"} onClick={() => navigateTo("delivered")} />}
        {isAdmin && <NavButton icon="admin_panel_settings" label="Admin" active={view === "admin"} onClick={() => navigateTo("admin")} />}
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
            <button className="primary"><span>Login</span><span className="material-symbols-outlined">arrow_forward</span></button>
          </form>
        </div>
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

function exportAnalyticsReport(stats) {
  const yardSheet = XLSX.utils.json_to_sheet(
    stats.yards.map((y) => ({
      Code: y.code,
      Name: y.name,
      Capacity: y.capacity,
      Occupied: y.count,
      Utilization: `${y.utilization}%`,
      Risk: y.risk.toUpperCase(),
    }))
  );

  const modelSheet = XLSX.utils.json_to_sheet(
    stats.models.map((m) => ({
      Model: m.model,
      Units: m.count,
      Percentage: `${m.pct}%`,
    }))
  );

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, yardSheet, "Yard Capacity");
  XLSX.utils.book_append_sheet(workbook, modelSheet, "Model Distribution");
  XLSX.writeFile(workbook, `Stockyard_Analytics_${new Date().toISOString().slice(0, 10)}.xlsx`);
}

function AdminHome({ stats, state, setState }) {
  const [activeTab, setActiveTab] = useState("overview");
  const [showFilterBar, setShowFilterBar] = useState(false);
  const [riskFilter, setRiskFilter] = useState("all"); // 'all' | 'critical' | 'heavy'
  const [toastMessage, setToastMessage] = useState("");

  const busiestYard = stats.yards.reduce((top, yard) => yard.count > top.count ? yard : top, stats.yards[0] || { count: 0, code: "-", name: "No yard" });
  const healthyYards = stats.yards.filter((yard) => yard.risk === "normal").length;

  const filteredYards = stats.yards.filter((yard) => {
    if (riskFilter === "critical") return yard.risk === "critical";
    if (riskFilter === "heavy") return yard.risk === "critical" || yard.risk === "heavy";
    return true;
  });

  const handleDownload = () => {
    exportAnalyticsReport(stats);
    setToastMessage("Analytics report exported to Excel!");
    setTimeout(() => setToastMessage(""), 3000);
  };

  const activeFlagsList = state ? state.flags.filter((f) => !f.resolved) : [];

  return (
    <section className="dashboard-workspace">
      <aside className="dashboard-rail" aria-label="Stockyard summary">
        <div className="rail-brand">
          <span className="material-symbols-outlined">directions_car</span>
          <strong>Nippon</strong>
        </div>
        <div className="rail-menu">
          <button
            type="button"
            className={activeTab === "overview" ? "active" : ""}
            onClick={() => setActiveTab("overview")}
          >
            <span className="material-symbols-outlined">dashboard</span>
            <span>Overview</span>
          </button>
          <button
            type="button"
            className={activeTab === "yards" ? "active" : ""}
            onClick={() => setActiveTab("yards")}
          >
            <span className="material-symbols-outlined">warehouse</span>
            <span>Yards</span>
          </button>
          <button
            type="button"
            className={activeTab === "flags" ? "active" : ""}
            onClick={() => setActiveTab("flags")}
          >
            <span className="material-symbols-outlined">flag</span>
            <span>Flags</span>
            {stats.openFlags > 0 && <span className="rail-badge">{stats.openFlags}</span>}
          </button>
        </div>
        <div className="rail-note">
          <b>{healthyYards}/{stats.yards.length}</b>
          <span>yards healthy</span>
        </div>
      </aside>

      <div className="stack analytical-dashboard">
        <div className="dashboard-header">
          <div>
            <span className="eyebrow">Stockyard Intelligence</span>
            <h1>Admin Analytics Dashboard</h1>
          </div>
          <div className="dashboard-actions">
            <button
              type="button"
              className="action-icon-btn"
              onClick={handleDownload}
              title="Download Excel Analytics Report"
              aria-label="Download Report"
            >
              <span className="material-symbols-outlined">download</span>
            </button>
            <button
              type="button"
              className={`action-icon-btn ${showFilterBar || riskFilter !== "all" ? "active" : ""}`}
              onClick={() => setShowFilterBar(!showFilterBar)}
              title="Tune Dashboard Filters"
              aria-label="Tune Dashboard Filters"
            >
              <span className="material-symbols-outlined">tune</span>
            </button>
            <div className="segmented">
              <button type="button" className={activeTab === "overview" ? "active" : ""} onClick={() => setActiveTab("overview")}>Overview</button>
              <button type="button" className={activeTab === "yards" ? "active" : ""} onClick={() => setActiveTab("yards")}>Yards</button>
              <button type="button" className={activeTab === "flags" ? "active" : ""} onClick={() => setActiveTab("flags")}>Flags ({stats.openFlags})</button>
            </div>
          </div>
        </div>

        {toastMessage && <div className="notice ok">{toastMessage}</div>}

        {showFilterBar && (
          <div className="filter-drawer analytics-filter-drawer">
            <div className="filter-drawer-header">
              <span>Dashboard Risk Filter</span>
              {riskFilter !== "all" && (
                <button type="button" className="clear-btn" onClick={() => setRiskFilter("all")}>Reset</button>
              )}
            </div>
            <div className="filter-grid">
              <select value={riskFilter} onChange={(e) => setRiskFilter(e.target.value)}>
                <option value="all">Show All Yards ({stats.yards.length})</option>
                <option value="heavy">Show High Utilization (&ge;75%)</option>
                <option value="critical">Show Critical Capacity (&ge;90%)</option>
              </select>
            </div>
          </div>
        )}

        <div className="dashboard-spotlight">
          <div>
            <span>Highest occupied yard</span>
            <strong>{busiestYard.name}</strong>
          </div>
          <b>{busiestYard.count}</b>
          <small>{busiestYard.code}</small>
        </div>

        <ExecutiveKpiCards stats={stats} />

        {activeTab === "overview" && (
          <>
            <div className="analytics-grid-2col">
              <section className="panel chart-panel chart-panel-wide">
                <div className="chart-panel-header">
                  <h2>Yard Capacity Utilization</h2>
                  <span className="pill info">Capacity vs Occupied</span>
                </div>
                <YardCapacityBarChart yards={filteredYards} />
              </section>

              <section className="panel chart-panel chart-panel-compact">
                <div className="chart-panel-header">
                  <h2>Vehicle Model Distribution</h2>
                  <span className="pill info">In-Stock Split</span>
                </div>
                <ModelDonutChart models={stats.models} />
              </section>
            </div>

            <div className="analytics-grid-3col">
              <section className="panel chart-panel">
                <div className="chart-panel-header">
                  <h2>Dwell Time Ageing</h2>
                  <span className="pill neutral">Parked Duration</span>
                </div>
                <DwellDistributionChart dwellDistribution={stats.dwellDistribution} />
              </section>

              <section className="panel chart-panel">
                <div className="chart-panel-header">
                  <h2>Flag & Risk Breakdown</h2>
                  <span className={stats.openFlags > 0 ? "pill bad" : "pill ok"}>
                    {stats.openFlags} Active Issue{stats.openFlags === 1 ? "" : "s"}
                  </span>
                </div>
                <FlagDistributionChart flags={stats.flagBreakdown} />
              </section>

              <section className="panel chart-panel">
                <div className="chart-panel-header">
                  <h2>Dwell by Model</h2>
                  <span className="pill neutral">Days in Stock</span>
                </div>
                <DwellByModelChart dwellByModel={stats.dwellByModel} />
              </section>
            </div>
          </>
        )}

        {activeTab === "yards" && (
          <section className="yard-box-grid">
            {filteredYards.map((yard) => {
              const empty = Math.max(0, yard.capacity - yard.count);
              return (
                <article className={`yard-box ${yard.risk === "critical" ? "risk-critical" : yard.risk === "heavy" ? "risk-heavy" : ""}`} key={yard.id}>
                  <div>
                    <span className="eyebrow">{yard.code}</span>
                    <h2>{yard.name}</h2>
                  </div>
                  <div className="yard-count">{yard.count}</div>
                  <div className="yard-box-metrics">
                    <span><b>{yard.count}</b>Utilised</span>
                    <span><b>{empty}</b>Empty</span>
                    <span><b>{yard.capacity}</b>Capacity</span>
                  </div>
                  <div className="progress-wrapper">
                    <progress max="100" value={Math.min(100, yard.utilization)} />
                    <span className="progress-lbl">{yard.utilization}%</span>
                  </div>
                </article>
              );
            })}
          </section>
        )}

        {activeTab === "flags" && (
          <section className="panel stack">
            <div className="chart-panel-header">
              <h2>Active Operational Flags ({activeFlagsList.length})</h2>
              <span className={activeFlagsList.length > 0 ? "pill bad" : "pill ok"}>
                {activeFlagsList.length > 0 ? "Review Required" : "All Clear"}
              </span>
            </div>
            {activeFlagsList.length === 0 ? (
              <p className="notice ok">No open flags or exceptions. All stockyards operating smoothly.</p>
            ) : (
              activeFlagsList.map((flag) => (
                <div className="flag-row" key={flag.id}>
                  <span>
                    <b>{flag.vin}</b>
                    <small>{flag.message}</small>
                  </span>
                  {setState && (
                    <button onClick={async () => {
                      try {
                        await apiResolveFlag(flag.id);
                        setState(resolveFlag(state, flag.id));
                      } catch (err) {
                        alert(err.message);
                      }
                    }}>
                      Resolve
                    </button>
                  )}
                </div>
              ))
            )}
          </section>
        )}
      </div>
    </section>
  );
}

function ScanView({ state, setState, session, online }) {
  const [type, setType] = useState("in");
  const [vin, setVin] = useState("");
  const [outRemark, setOutRemark] = useState("");
  const [damaged, setDamaged] = useState(false);
  const [damageRemark, setDamageRemark] = useState("");
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraError, setCameraError] = useState("");
  const [scanSuccess, setScanSuccess] = useState(null);
  const [message, setMessage] = useState(null);
  const videoRef = useRef(null);
  const fileInputRef = useRef(null);
  const trackRef = useRef(null);
  const scanLockedRef = useRef(false);
  const yard = yards.find((item) => item.id === session.yardId) || yards[0];

  const signalScanSuccess = useCallback(() => {
    if (navigator.vibrate?.([200])) return;
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return;
      const context = new AudioContext();
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = "square";
      oscillator.frequency.value = 1400;
      gain.gain.setValueAtTime(0.001, context.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.25, context.currentTime + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + 0.14);
      oscillator.connect(gain).connect(context.destination);
      oscillator.start();
      oscillator.stop(context.currentTime + 0.16);
      oscillator.onended = () => context.close();
    } catch {}
  }, []);

  const handleQrText = useCallback((text) => {
    const scannedVin = normalizeVin(text);
    if (scannedVin.length === 17) {
      if (scanLockedRef.current) return true;
      scanLockedRef.current = true;
      setVin(scannedVin);
      setScanSuccess(scannedVin);
      setMessage({ kind: "ok", text: `VIN ${scannedVin} scanned.` });
      setCameraOpen(false);
      signalScanSuccess();
      return true;
    }
    setCameraError("QR code found, but no valid VIN was inside it.");
    return false;
  }, [signalScanSuccess]);

  useEffect(() => {
    if (!cameraOpen) return;
    let cancelled = false;
    let controls;
    let stream;
    let frameId;

    const stopStream = () => stream?.getTracks().forEach((track) => track.stop());

    const bindCameraControls = () => {
      const track = stream?.getVideoTracks?.()[0] || videoRef.current?.srcObject?.getVideoTracks?.()[0];
      if (!track) return;
      trackRef.current = track;
      const caps = track.getCapabilities?.() || {};
      if (caps.torch) track.applyConstraints({ advanced: [{ torch: true }] }).catch(() => {});
    };

    async function startNativeScanner() {
      if (!("BarcodeDetector" in window)) return false;
      if (window.BarcodeDetector.getSupportedFormats) {
        const formats = await window.BarcodeDetector.getSupportedFormats().catch(() => []);
        if (!formats.includes("qr_code")) return false;
      }

      const detector = new window.BarcodeDetector({ formats: ["qr_code"] });
      const constraints = [
        { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } },
        { facingMode: "environment" },
        true
      ];

      for (const videoOpt of constraints) {
        try {
          stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: videoOpt });
          if (stream) break;
        } catch {
          // Try next constraint set
        }
      }

      if (!stream || !videoRef.current) return false;

      videoRef.current.srcObject = stream;
      await videoRef.current.play();
      bindCameraControls();
      setCameraError("");

      const scanFrame = async () => {
        if (cancelled || !videoRef.current) return;
        try {
          const codes = await detector.detect(videoRef.current);
          if (!cancelled && codes[0]) handleQrText(codes[0].rawValue || "");
        } catch {
          // Keep scanning
        }
        if (!cancelled) frameId = requestAnimationFrame(scanFrame);
      };

      frameId = requestAnimationFrame(scanFrame);
      return true;
    }

    async function openCamera() {
      try {
        const nativeWorked = await startNativeScanner().catch(() => false);
        if (nativeWorked) return;

        const { BrowserQRCodeReader } = await import("@zxing/browser");
        const reader = new BrowserQRCodeReader();
        const onDecode = (result) => {
          if (!cancelled && result) handleQrText(result.getText());
        };

        const zxingConstraints = [
          { video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } } },
          { video: { facingMode: "environment" } },
          { video: true }
        ];

        for (const c of zxingConstraints) {
          try {
            controls = await reader.decodeFromConstraints(c, videoRef.current, onDecode);
            if (controls) break;
          } catch {
            // Try next constraint set
          }
        }

        bindCameraControls();
        setCameraError("");
      } catch (err) {
        console.warn("Camera init failed:", err);
        setCameraError("Camera permission or constraints error. Try uploading a QR image.");
        setCameraOpen(false);
      }
    }

    openCamera();
    return () => {
      cancelled = true;
      cancelAnimationFrame(frameId);
      stopStream();
      controls?.stop();
      trackRef.current = null;
    };
  }, [cameraOpen, handleQrText]);

  function closeCamera() {
    setCameraOpen(false);
  }

  async function uploadQr(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    scanLockedRef.current = false;
    setCameraOpen(false);
    setCameraError("");
    const url = URL.createObjectURL(file);

    try {
      if ("BarcodeDetector" in window && "createImageBitmap" in window) {
        const bitmap = await createImageBitmap(file);
        try {
          const detector = new window.BarcodeDetector({ formats: ["qr_code"] });
          const codes = await detector.detect(bitmap);
          if (codes[0] && handleQrText(codes[0].rawValue || "")) return;
        } finally {
          bitmap.close?.();
        }
      }

      const { BrowserQRCodeReader } = await import("@zxing/browser");
      const result = await new BrowserQRCodeReader().decodeFromImageUrl(url);
      handleQrText(result.getText());
    } catch {
      setCameraError("No QR code found in that image.");
    } finally {
      URL.revokeObjectURL(url);
    }
  }

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
    setScanSuccess(null);
    scanLockedRef.current = false;
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
          <button className={`scan-box ${cameraOpen ? "live" : ""}`} type="button" onClick={() => {
            scanLockedRef.current = false;
            setScanSuccess(null);
            setCameraOpen(true);
          }} aria-label="Open camera scanner">
            {cameraOpen && <video ref={videoRef} autoPlay muted playsInline />}
            <span className="corner top-left"></span>
            <span className="corner top-right"></span>
            <span className="corner bottom-left"></span>
            <span className="corner bottom-right"></span>
            {!cameraOpen && <span className="qr-pattern" aria-hidden="true"></span>}
          </button>
          <p>{cameraOpen ? "Point the camera at the vehicle QR code." : "Tap the QR grid to open camera scanner."}</p>
          {cameraError && <p className="camera-error">{cameraError}</p>}
          {cameraOpen && <button type="button" className="ghost" onClick={closeCamera}>Close camera</button>}
          <input ref={fileInputRef} type="file" accept="image/*" onChange={uploadQr} style={{ display: "none" }} />
          <button type="button" className="ghost" onClick={() => fileInputRef.current?.click()}><span className="material-symbols-outlined">upload_file</span> Upload QR</button>
          {scanSuccess && (
            <div className="scan-success" role="status" aria-live="assertive">
              <button className="scan-success-close" type="button" aria-label="Close success message" onClick={() => setScanSuccess(null)}>X</button>
              <span>Scanned successfully</span>
              <b>{scanSuccess}</b>
              <button type="button" className="scan-success-next" onClick={() => {
                setVin("");
                setScanSuccess(null);
                setMessage(null);
                scanLockedRef.current = false;
                setCameraOpen(true);
              }}>Scan next</button>
            </div>
          )}
        </div>
        <label htmlFor="vin">Manual VIN entry</label>
        <div className="inline-form">
          <input id="vin" value={vin} onChange={(event) => {
            setVin(event.target.value.toUpperCase());
            setScanSuccess(null);
          }} placeholder="Enter VIN" />
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
      <aside className="panel yard-card">
        <span className="eyebrow">Assigned yard</span>
        <h2>{yard.name}</h2>
        <div className="yard-meta"><span>{yard.code}</span><b>Capacity {yard.capacity}</b></div>
        <div className="yard-device">
          <span className="material-symbols-outlined">smartphone</span>
          <span>Device {state.deviceId.slice(-8)}</span>
        </div>
        <p className="muted">GPS is captured on submit. Offline scans stay queued until the browser comes online.</p>
      </aside>
    </section>
  );
}

function StockView({ state, session }) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [model, setModel] = useState("all");
  const [variant, setVariant] = useState("all");
  const [colour, setColour] = useState("all");
  const [yardId, setYardId] = useState("all");
  const [showFilters, setShowFilters] = useState(false);

  const visibleVehicles = Object.values(state.vehicles).filter((vehicle) => session.role === "admin" || vehicle.currentYardId === session.yardId);
  const options = (key) => [...new Set(visibleVehicles.map((vehicle) => vehicle[key]).filter(Boolean))].sort();
  const stockIn = visibleVehicles.filter((vehicle) => vehicle.currentStatus === "in").length;
  const stockOut = visibleVehicles.filter((vehicle) => vehicle.currentStatus === "out").length;
  const flagged = visibleVehicles.filter((vehicle) => state.flags.some((flag) => flag.vin === vehicle.vin && !flag.resolved)).length;
  const visibleYardIds = session.role === "admin" ? yards.map((yard) => yard.id) : [session.yardId];
  const capacity = yards.filter((yard) => visibleYardIds.includes(yard.id)).reduce((sum, yard) => sum + yard.capacity, 0);
  const utilisation = capacity ? Math.round((stockIn / capacity) * 100) : 0;

  const activeFilterCount = [status, model, variant, colour, yardId].filter((v) => v !== "all").length + (query.trim() ? 1 : 0);

  const clearFilters = () => {
    setQuery("");
    setStatus("all");
    setModel("all");
    setVariant("all");
    setColour("all");
    setYardId("all");
  };

  const rows = Object.values(state.vehicles)
    .filter((vehicle) => session.role === "admin" || vehicle.currentYardId === session.yardId)
    .filter((vehicle) => status === "all" || vehicle.currentStatus === status)
    .filter((vehicle) => model === "all" || vehicle.model === model)
    .filter((vehicle) => variant === "all" || vehicle.variant === variant)
    .filter((vehicle) => colour === "all" || vehicle.colour === colour)
    .filter((vehicle) => yardId === "all" || vehicle.currentYardId === yardId)
    .filter((vehicle) => `${vehicle.vin} ${vehicle.model} ${vehicle.variant || ""} ${vehicle.colour || ""}`.toLowerCase().includes(query.toLowerCase()))
    .sort((a, b) => b.lastChangedAt.localeCompare(a.lastChangedAt));

  return (
    <section className="stack stock-container">
      <div className="stock-header-bar">
        <div>
          <span className="eyebrow">Vehicle Inventory</span>
          <h2>Live Stock ({rows.length})</h2>
        </div>
        <div className="stock-actions">
          <button
            type="button"
            className={`filter-toggle-btn ${activeFilterCount > 0 ? "active" : ""}`}
            onClick={() => setShowFilters(!showFilters)}
          >
            <span className="material-symbols-outlined">filter_list</span>
            <span>Filters {activeFilterCount > 0 && `(${activeFilterCount})`}</span>
          </button>
        </div>
      </div>

      <div className="stock-analytics">
        <StockStat icon="inventory_2" label="In Stock" value={stockIn} tone="green" />
        <StockStat icon="logout" label="Moved Out" value={stockOut} />
        <StockStat icon="flag" label="Flags" value={flagged} tone={flagged ? "red" : "green"} />
        <StockStat icon="percent" label="Utilisation" value={`${utilisation}%`} />
      </div>

      <div className="stock-control-panel">
        <div className="search-row">
          <span className="material-symbols-outlined">search</span>
          <input
            className="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search VIN, model, variant or colour"
          />
        </div>

        {(showFilters || activeFilterCount > 0) && (
          <div className="filter-drawer">
            <div className="filter-drawer-header">
              <span>Filter Criteria</span>
              {activeFilterCount > 0 && (
                <button type="button" className="clear-btn" onClick={clearFilters}>
                  Clear All
                </button>
              )}
            </div>
            <div className="filter-grid">
              <select value={status} onChange={(event) => setStatus(event.target.value)} aria-label="Status filter">
                <option value="all">Status: All (In/Out)</option>
                <option value="in">Status: IN Only</option>
                <option value="out">Status: OUT Only</option>
              </select>
              <select value={model} onChange={(event) => setModel(event.target.value)} aria-label="Model filter">
                <option value="all">Model: All Models</option>
                {options("model").map((item) => <option key={item} value={item}>{item}</option>)}
              </select>
              <select value={variant} onChange={(event) => setVariant(event.target.value)} aria-label="Variant filter">
                <option value="all">Variant: All Variants</option>
                {options("variant").map((item) => <option key={item} value={item}>{item}</option>)}
              </select>
              <select value={colour} onChange={(event) => setColour(event.target.value)} aria-label="Colour filter">
                <option value="all">Colour: All Colours</option>
                {options("colour").map((item) => <option key={item} value={item}>{item}</option>)}
              </select>
              <select value={yardId} onChange={(event) => setYardId(event.target.value)} aria-label="Stockyard location filter">
                <option value="all">Yard: All Locations</option>
                {yards.map((yard) => <option key={yard.id} value={yard.id}>{yard.name}</option>)}
              </select>
            </div>
          </div>
        )}
      </div>

      <div className="vehicle-list">
        {rows.length === 0 ? (
          <div className="no-results">
            <span className="material-symbols-outlined">search_off</span>
            <p>No vehicles match the selected filters.</p>
            {activeFilterCount > 0 && <button className="primary" onClick={clearFilters}>Reset Filters</button>}
          </div>
        ) : (
          rows.map((vehicle) => (
            <VehicleCard
              key={vehicle.vin}
              vehicle={vehicle}
              flags={state.flags.filter((flag) => flag.vin === vehicle.vin && !flag.resolved)}
            />
          ))
        )}
      </div>
    </section>
  );
}

function StockStat({ icon, label, value, tone = "" }) {
  return (
    <article className={`stock-stat ${tone}`}>
      <span className="material-symbols-outlined">{icon}</span>
      <div>
        <b>{value}</b>
        <small>{label}</small>
      </div>
    </article>
  );
}

function VehicleCard({ vehicle, flags }) {
  const yard = yards.find((item) => item.id === vehicle.currentYardId);
  const statusText = flags.length ? "Flagged" : vehicle.currentStatus === "in" ? "In yard" : "Out";
  return (
    <article className={`vehicle ${vehicle.currentStatus} ${flags.length ? "flagged" : ""}`}>
      <div className="vehicle-main">
        <span className="vehicle-mark">{vehicle.model?.slice(0, 1) || "V"}</span>
        <div>
          <strong>{vehicle.vin}</strong>
          <span>{vehicle.model}</span>
          <small>{vehicle.variant || "Standard"} · {vehicle.colour || "Not set"}</small>
        </div>
      </div>
      <div className="vehicle-yard">
        <span>{yard?.code || "-"}</span>
        <small>{yard?.name || "No yard"}</small>
      </div>
      <div className="vehicle-state">
        <b>{statusText}</b>
        <small>{new Date(vehicle.lastChangedAt).toLocaleDateString("en-GB")}</small>
      </div>
    </article>
  );
}

function DashboardView({ state, stats, session, setState }) {
  const [tab, setTab] = useState("charts");
  const activeFlags = state.flags.filter((flag) => !flag.resolved && state.vehicles[flag.vin]?.currentYardId === session.yardId);

  return (
    <section className="stack">
      <ExecutiveKpiCards stats={stats} />

      <div className="segmented">
        <button type="button" className={tab === "charts" ? "active" : ""} onClick={() => setTab("charts")}>Analytics Charts</button>
        <button type="button" className={tab === "flags" ? "active" : ""} onClick={() => setTab("flags")}>Open Flags ({activeFlags.length})</button>
      </div>

      {tab === "charts" && (
        <div className="stack">
          <section className="panel chart-panel">
            <div className="chart-panel-header">
              <h2>Yard Capacity Breakdown</h2>
              <span className="pill info">Utilization Rate</span>
            </div>
            <YardCapacityBarChart yards={stats.yards} />
          </section>

          <section className="panel chart-panel">
            <div className="chart-panel-header">
              <h2>Model Stock Split</h2>
              <span className="pill info">Units by Model</span>
            </div>
            <ModelDonutChart models={stats.models} />
          </section>

          <section className="panel chart-panel">
            <div className="chart-panel-header">
              <h2>Stock Dwell Time Distribution</h2>
              <span className="pill neutral">Parked Duration</span>
            </div>
            <DwellDistributionChart dwellDistribution={stats.dwellDistribution} />
          </section>
        </div>
      )}

      {tab === "flags" && (
        <section className="panel stack">
          <h2>Active Flags & Exceptions</h2>
          {activeFlags.length === 0 ? (
            <p className="notice ok">All operational flags resolved. Zero active exceptions.</p>
          ) : (
            activeFlags.map((flag) => (
              <div className="flag-row" key={flag.id}>
                <span>
                  <b>{flag.vin}</b>
                  <small>{flag.message}</small>
                </span>
                {session.role === "admin" && (
                  <button onClick={async () => {
                    try {
                      await apiResolveFlag(flag.id);
                      setState(resolveFlag(state, flag.id));
                    } catch (err) {
                      alert(err.message);
                    }
                  }}>Resolve</button>
                )}
              </div>
            ))
          )}
        </section>
      )}
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
  const [loading, setLoading] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setLoading(true);
    try {
      await adminOverrideVehicle(vin, status, reason, status === "in" ? yardId : null);
      setState(updateVehicleAdmin(state, { vin, yardId, status, reason }));
      setVin("");
      setReason("");
    } catch (err) {
      alert("Failed to override: " + err.message);
    } finally {
      setLoading(false);
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
        <button className="primary" disabled={loading}>{loading ? "Applying..." : "Apply Correction"}</button>
      </form>
    </section>
  );
}

function DeliveredUpload({ state, setState }) {
  const [text, setText] = useState("");
  const [message, setMessage] = useState("");
  const vins = useMemo(() => parseDeliveredVins(text), [text]);
  const liveMatches = vins.filter((vin) => state.vehicles[vin]);

  function upload(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (file.name.toLowerCase().endsWith(".xlsx")) {
        const workbook = XLSX.read(reader.result, { type: "array" });
        setText(workbook.SheetNames.map((name) => XLSX.utils.sheet_to_csv(workbook.Sheets[name])).join("\n"));
        return;
      }
      setText(String(reader.result || ""));
    };
    if (file.name.toLowerCase().endsWith(".xlsx")) reader.readAsArrayBuffer(file);
    else reader.readAsText(file);
  }

  function submit(event) {
    event.preventDefault();
    setState(removeDeliveredVehicles(state, vins));
    setMessage(`${liveMatches.length} delivered vehicle${liveMatches.length === 1 ? "" : "s"} removed from live stock.`);
    setText("");
  }

  return (
    <section className="panel stack">
      <h2>Delivered Vehicles</h2>
      <form className="stack" onSubmit={submit}>
        <label htmlFor="delivered-file">Upload Excel export</label>
        <input id="delivered-file" type="file" accept=".xlsx,.csv,.txt" onChange={upload} />
        <label htmlFor="delivered-vins">VIN list</label>
        <textarea id="delivered-vins" rows="8" value={text} onChange={(event) => setText(event.target.value)} placeholder="Paste VIN column from Excel" />
        <div className="split"><span>{vins.length} VINs found</span><b>{liveMatches.length} live matches</b></div>
        <button className="primary" disabled={!vins.length}>Remove From Live Stock</button>
      </form>
      {message && <p className="notice ok">{message}</p>}
    </section>
  );
}

createRoot(document.getElementById("root")).render(<App />);
