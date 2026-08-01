import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import * as XLSX from "xlsx";
import {
  applyScan,
  createClientScanId,
  createInitialState,
  createScan,
  dashboard,
  decodeVinDetails,
  normalizeVin,
  flagLabel,
  yards,
  fallbackBranches,
  setConfig,
  findApprovedTransferReq,
  findYardById,
  yardsByRegion,
} from "./stockyardLogic.js";
import {
  ExecutiveKpiCards,
  ModelDonutChart,
  YardCapacityBarChart,
  DwellDistributionChart,
} from "./AnalyticsCharts.jsx";
import {
  bulkSync, getVehicles, getFlags, getScans, loginApi,
  getAdminBranches,
  getNotifications, getRequisitions,
  getVehicleStatus,
  isNetworkError,
} from "./api.js";
import "./styles.css";

// Import new components
import { RequisitionsTab } from "./components/RequisitionsTab.jsx";
import { NotificationBell } from "./components/NotificationBell.jsx";
import { useSocket } from "./useSocket.js";
import { ScanOverlay } from "./components/ScanOverlay.jsx";
import { enqueueScan, getPendingCount, drainQueue } from "./offlineQueue.js";
import { saveSnapshot, loadSnapshot, formatSnapshotAge, applySnapshotToState } from "./offlineSnapshot.js";
import { usePwaInstall } from "./usePwaInstall.js";
import { YARD_REGIONS } from "./yardData.js";
import { AdminHome } from "./components/AdminDashboard.jsx";
import { YardVehiclesModal } from "./components/YardVehiclesModal.jsx";

function getRoutePath(viewName, role) {
  if (role === "admin") {
    if (viewName === "stock") return "/stock";
    return "/dashboard";
  }
  if (role === "delivery_incharge") {
    if (viewName === "dashboard") return "/dash";
    if (viewName === "stock") return "/stock";
    if (viewName === "requisitions") return "/requisitions";
    return "/requisitions";
  }
  // stockyard
  if (viewName === "dashboard") return "/dash";
  if (viewName === "stock") return "/stock";
  if (viewName === "requisitions") return "/requisitions";
  return "/scan";
}

function getViewFromPath(pathname, role) {
  const path = (pathname || "").toLowerCase();
  if (role === "admin") {
    if (path === "/stock") return "stock";
    // Legacy /admin and /admin-branches URLs land on the unified Admin console
    return "dashboard";
  }
  if (role === "delivery_incharge") {
    if (path === "/stock") return "stock";
    if (path === "/dash" || path === "/dashboard") return "dashboard";
    if (path === "/requisitions") return "requisitions";
    return "requisitions";
  }
  // stockyard
  if (path === "/stock") return "stock";
  if (path === "/dash" || path === "/dashboard") return "dashboard";
  if (path === "/requisitions") return "requisitions";
  return "scan";
}

function mapApiRole(role) {
  if (role === "yard") return "stockyard";
  return role;
}

function sessionFromLogin(res, { name, yardId, branchId }) {
  const role = mapApiRole(res.user.role);
  return {
    role,
    yardId: res.user.yardId || yardId || null,
    branchId: res.user.branch_id || branchId || null,
    name,
    token: res.token,
  };
}
function getStoredSession() {
  try {
    return JSON.parse(localStorage.getItem("yardSession") || "null");
  } catch {
    return null;
  }
}

function mapServerResponse(vehiclesData, flagsData, scansData, notifsData, reqsData) {
  const mappedVehicles = {};
  vehiclesData.forEach((v) => {
    const decoded = decodeVinDetails(v.vin);
    mappedVehicles[v.vin] = {
      vin: v.vin,
      model: v.model && v.model !== "Unknown" && v.model !== "Toyota Vehicle" ? v.model : decoded.model,
      variant: v.variant && v.variant !== "Standard" ? v.variant : decoded.variant,
      colour: v.colour && v.colour !== "Not set" ? v.colour : decoded.colour,
      driveType: v.drive_type,
      vinValid: v.vin_valid,
      currentStatus: v.current_status,
      currentYardId: v.current_yard_id,
      lastChangedAt: v.last_changed_at,
      outRemark: v.out_remark,
      keyNo: v.key_no || v.keyNo || "",
    };
  });

  const mappedFlags = flagsData.map((f) => ({
    id: f.id,
    vin: f.vin,
    type: f.flag_type,
    message: f.message,
    createdAt: f.created_at,
    resolved: f.resolved,
    damageRemark: f.damage_remark,
    damageImage: f.damage_image,
    scanType: f.scan_type,
    yardId: f.yard_id,
  }));

  const mappedScans = scansData.map((s) => ({
    id: s.id,
    clientScanId: s.clientScanId || s.id,
    vin: s.vin,
    vinRaw: s.vinRaw || s.vin,
    type: s.type,
    yardId: s.yardId,
    scannedAt: s.scannedAt,
    damaged: Boolean(s.damaged),
    damageRemark: s.damageRemark || "",
    damageImage: s.damageImage || "",
    outRemark: s.outRemark || "",
    transferDestinationYardId: s.transferDestinationYardId || "",
    transferRequestedBy: s.transferRequestedBy || "",
    keyNo: s.keyNo || s.key_no || "",
    syncStatus: "synced",
  }));

  return {
    vehicles: mappedVehicles,
    flags: mappedFlags,
    scans: mappedScans,
    notifications: notifsData || [],
    requisitions: reqsData || { incoming: [], outgoing: [] },
  };
}

function hydrateFromSnapshot(session, setState, setLastSyncedAt, setStaleSnapshotAt) {
  const snapshot = loadSnapshot(session);
  if (!snapshot) return false;
  setState((s) => applySnapshotToState(s, snapshot));
  setLastSyncedAt(new Date(snapshot.syncedAt));
  setStaleSnapshotAt(snapshot.syncedAt);
  return true;
}

export default function App() {
  const [session, setSession] = useState(getStoredSession);

  const [state, setState] = useState(() => {
    const base = createInitialState();
    const snap = loadSnapshot(getStoredSession());
    return snap ? applySnapshotToState(base, snap) : base;
  });
  const [online, setOnline] = useState(() => navigator.onLine);
  const [view, setView] = useState(() => {
    if (!session) return "login";
    return getViewFromPath(window.location.pathname, session.role);
  });
  const [dataReady, setDataReady] = useState(() => {
    const sess = getStoredSession();
    if (!sess) return true;
    return Boolean(loadSnapshot(sess));
  });
  const [lastSyncedAt, setLastSyncedAt] = useState(() => {
    const snap = loadSnapshot(getStoredSession());
    return snap ? new Date(snap.syncedAt) : null;
  });
  const [staleSnapshotAt, setStaleSnapshotAt] = useState(() => loadSnapshot(getStoredSession())?.syncedAt || null);
  const [loadWarning, setLoadWarning] = useState("");

  useEffect(() => {
    // Yards are hardcoded in stockyardLogic â€” do not fetch (filtered API + cache
    // was causing login to show only the previously selected yard after logout).
    localStorage.removeItem("cache:yards");
    getAdminBranches()
      .then((newBranches) => setConfig(null, newBranches))
      .catch((e) => console.error("Failed to load branches config", e));
  }, []);

  useEffect(() => {
    // Drop scans saved by versions that queued data only in this browser.
    localStorage.removeItem("yardScanState");
  }, []);

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

  const fetchServerData = useCallback(async () => {
    if (!session) return;
    if (!online) {
      setDataReady(true);
      return;
    }
    try {
      const isDeliveryOrYard = session.role === "delivery_incharge" || session.role === "stockyard";
      const tasks = [
        { key: "vehicles", run: () => getVehicles() },
        { key: "flags", run: () => getFlags() },
        { key: "scans", run: () => getScans() },
        { key: "notifications", run: () => isDeliveryOrYard ? getNotifications() : Promise.resolve([]) },
        { key: "requisitions", run: () => isDeliveryOrYard ? getRequisitions() : Promise.resolve({ incoming: [], outgoing: [] }) },
      ];
      const settled = await Promise.allSettled(tasks.map((t) => t.run()));
      const failures = settled
        .map((result, i) => (result.status === "rejected" ? tasks[i].key : null))
        .filter(Boolean);

      if (failures.length === tasks.length) {
        throw new Error("All data endpoints failed");
      }

      const [vehiclesData, flagsData, scansData, notifsData, reqsData] = settled.map((result, i) =>
        result.status === "fulfilled" ? result.value : (i === 4 ? { incoming: [], outgoing: [] } : [])
      );

      const payload = mapServerResponse(vehiclesData, flagsData, scansData, notifsData, reqsData);

      setState((s) => ({ ...s, ...payload }));
      saveSnapshot(session, payload);
      setLastSyncedAt(new Date());
      setStaleSnapshotAt(null);
      setLoadWarning(failures.length ? `Partial load — could not refresh: ${failures.join(", ")}` : "");
    } catch (err) {
      console.error("Failed to load backend data", err);
      hydrateFromSnapshot(session, setState, setLastSyncedAt, setStaleSnapshotAt);
      setLoadWarning("Could not refresh data from server.");
    } finally {
      setDataReady(true);
    }
  }, [session, online, setState]);

  useEffect(() => {
    fetchServerData();

    const onFocus = () => fetchServerData();
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") fetchServerData();
    };

    window.addEventListener("focus", onFocus);
    window.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [fetchServerData]);

  // §1.1 — Socket.io event-driven updates (only when logged in)
  useSocket(fetchServerData, Boolean(session));

  useEffect(() => {
    if (!session) return;
    fetchServerData();
  }, [view, session, fetchServerData]);

  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").then((reg) => {
        reg.update();
      }).catch(() => { });
    }
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    addEventListener("online", up);
    addEventListener("offline", down);
    return () => {
      removeEventListener("online", up);
      removeEventListener("offline", down);
    };
  }, []);

  const navigateTo = (nextView) => {
    setView(nextView);
    if (session) {
      const nextPath = getRoutePath(nextView, session.role);
      window.history.pushState(null, "", nextPath);
    }
  };

  if (!session) return <Login onLogin={(nextSession) => {
    setDataReady(false);
    setStaleSnapshotAt(null);
    const snap = loadSnapshot(nextSession);
    if (snap) {
      setState((s) => applySnapshotToState(s, snap));
      setLastSyncedAt(new Date(snap.syncedAt));
      setStaleSnapshotAt(snap.syncedAt);
      setDataReady(true);
    }
    setSession(nextSession);
    const initialView = nextSession.role === "admin" ? "dashboard" : nextSession.role === "delivery_incharge" ? "requisitions" : "scan";
    setView(initialView);
    window.history.replaceState(null, "", getRoutePath(initialView, nextSession.role));
  }} />;

  const isAdmin = session.role === "admin";
  const stats = dashboard(state, isAdmin ? null : session.yardId);
  const pendingReqCount = (state.requisitions?.incoming || []).filter((r) => r.status === "pending").length;

  return (
    <div className="app-shell">
      <Header
        session={session}
        online={online}
        notifications={state.notifications}
        onNavigate={navigateTo}
        onLogout={() => {
          setSession(null);
          setStaleSnapshotAt(null);
          setLoadWarning("");
          setDataReady(true);
          window.history.replaceState(null, "", "/");
        }}
      />
      {staleSnapshotAt && (
        <div className="stale-data-banner" role="status">
          <span className="material-symbols-outlined" aria-hidden="true">cloud_off</span>
          <span>
            {!online ? "Offline" : "Could not refresh"} — showing data from {formatSnapshotAge(staleSnapshotAt)}
          </span>
        </div>
      )}
      {loadWarning && !staleSnapshotAt && (
        <div className="stale-data-banner" role="status">
          <span className="material-symbols-outlined" aria-hidden="true">warning</span>
          <span>{loadWarning}</span>
        </div>
      )}
      <main className="content">
        {view === "scan" && <ScanView state={state} setState={setState} session={session} online={online} onRefresh={fetchServerData} lastSyncedAt={lastSyncedAt} />}
        {view === "stock" && <StockView state={state} session={session} />}
        {view === "dashboard" && !dataReady && (
          <div className="dashboard-loading" style={{ padding: '1rem' }}>
            <div className="skeleton skeleton-kpi" style={{ height: 80, marginBottom: 12 }} />
            <div className="skeleton skeleton-kpi" style={{ height: 200 }} />
          </div>
        )}
        {view === "dashboard" && dataReady && (
          isAdmin
            ? <AdminHome stats={stats} state={state} setState={setState} onRefresh={fetchServerData} />
            : <DashboardView state={state} stats={stats} session={session} setState={setState} />
        )}
        {view === "requisitions" && <RequisitionsTab state={state} session={session} onRefresh={fetchServerData} />}
      </main>
      <nav className={`bottom-nav ${isAdmin ? "bottom-nav-admin" : ""}`}>
        {session.role === "stockyard" && <NavButton icon="barcode_scanner" label="Scan" active={view === "scan"} onClick={() => navigateTo("scan")} />}
        <NavButton icon="inventory_2" label="Stock" active={view === "stock"} onClick={() => navigateTo("stock")} />
        {!isAdmin && <NavButton icon="dashboard" label="Dash" active={view === "dashboard"} onClick={() => navigateTo("dashboard")} />}
        {(session.role === "stockyard" || session.role === "delivery_incharge") && (
          <NavButton icon="swap_horiz" label="Requests" badge={pendingReqCount} active={view === "requisitions"} onClick={() => navigateTo("requisitions")} />
        )}
        {isAdmin && (
          <NavButton
            icon="admin_panel_settings"
            label="Admin"
            active={view === "dashboard"}
            onClick={() => navigateTo("dashboard")}
          />
        )}
      </nav>
    </div>
  );
}

function Login({ onLogin }) {
  const [role, setRole] = useState("stockyard");
  const [region, setRegion] = useState(YARD_REGIONS[0]);
  const [yardId, setYardId] = useState(() => yards.find((y) => y.city === YARD_REGIONS[0])?.id || yards[0]?.id || "");
  const [branches, setBranches] = useState(fallbackBranches);
  const [branchId, setBranchId] = useState(fallbackBranches[0]?.id || "");
  const [passwordInput, setPasswordInput] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const regionYards = useMemo(
    () => yards.filter((yard) => yard.city === region),
    [region]
  );

  useEffect(() => {
    if (!regionYards.some((yard) => yard.id === yardId)) {
      setYardId(regionYards[0]?.id || "");
    }
  }, [region, regionYards, yardId]);

  useEffect(() => {
    getAdminBranches().then(res => {
      if (res && res.length > 0) {
        setBranches(res);
        setBranchId(prev => res.some(b => b.id === prev) ? prev : res[0].id);
      }
    }).catch(console.error);
  }, []);

  const handleRoleChange = (newRole) => {
    setRole(newRole);
    setErrorMsg("");
  };

  const handleRegionChange = (e) => {
    setRegion(e.target.value);
    setErrorMsg("");
  };

  const handleYardChange = (e) => {
    setYardId(e.target.value);
    setErrorMsg("");
  };

  async function submit(event) {
    event.preventDefault();
    setErrorMsg("");
    setIsLoading(true);

    const cleanPassword = passwordInput.trim();
    const targetYard = yards.find((y) => y.id === yardId) || yards[0];
    const targetBranch = branches.find((b) => b.id === branchId);
    const cleanUsername =
      role === "admin"
        ? "admin"
        : role === "delivery_incharge"
          ? targetBranch?.id || ""
          : targetYard?.id || "";

    // 1. Evaluate local credential validity (handles default & custom saved credentials)
    let isLocalValid = false;
    if (role === "admin") {
      if (cleanPassword === "ADMIN123") {
        isLocalValid = true;
      }
    } else if (role === "delivery_incharge") {
      if (cleanPassword === "delivery123") {
        isLocalValid = true;
      }
    } else if (targetYard?.code && cleanPassword.toLowerCase() === targetYard.code.toLowerCase()) {
      isLocalValid = true;
    }

    try {
      const cachedCreds = JSON.parse(localStorage.getItem("nippon_credentials_cache") || "[]");
      const matched = cachedCreds.find(
        (c) =>
          c.username === cleanUsername ||
          (targetYard && c.yardId === targetYard.id) ||
          (targetBranch && c.branchId === targetBranch.id)
      );
      if (matched && matched.password === cleanPassword) {
        isLocalValid = true;
      }
    } catch (e) { }

    // 2. Authenticate with server and store signed session token
    try {
      const res = await loginApi(cleanUsername, cleanPassword);
      if (!res?.token || !res?.user) {
        setErrorMsg("Invalid credentials. Please try again.");
        setIsLoading(false);
        return;
      }

      if (res.user.role === "admin") {
        onLogin(sessionFromLogin(res, { name: "Admin Console" }));
      } else if (res.user.role === "delivery_incharge") {
        const userBranchId = res.user.branch_id || branchId;
        const userBranch = branches.find(b => b.id === userBranchId);
        onLogin(sessionFromLogin(res, {
          name: `Delivery: ${userBranch ? userBranch.name : userBranchId}`,
          branchId: userBranchId,
        }));
      } else {
        const yard = findYardById(res.user.yardId) || targetYard;
        onLogin(sessionFromLogin(res, {
          name: yard.name,
          yardId: yard.id,
        }));
      }
      return;
    } catch (apiErr) {
      if (isLocalValid && import.meta.env.DEV) {
        if (role === "admin") {
          onLogin({ role: "admin", yardId: null, name: "Admin Console" });
        } else if (role === "delivery_incharge") {
          onLogin({ role: "delivery_incharge", branchId: branchId, name: `Delivery: ${targetBranch ? targetBranch.name : branchId}` });
        } else {
          onLogin({ role: "stockyard", yardId: targetYard.id, name: targetYard.name });
        }
        return;
      }
      setErrorMsg(apiErr.message || "Invalid credentials. Please try again.");
    }

    setIsLoading(false);
  }

  const selectedYardObj = yards.find((y) => y.id === yardId);

  return (
    <main className="login">
      <section className="login-panel">
        <div className="login-visual" aria-hidden="true" />
        <div className="login-form-panel">
          <div className="brand-row">
            <div className="brand-mark"><span className="material-symbols-outlined">qr_code_scanner</span></div>
            <div>
              <span className="eyebrow">Toyota yard operations</span>
              <h1>Nippon Yard Scan</h1>
            </div>
          </div>
          <p>Select your yard location and enter password to sign in.</p>

          {errorMsg && <div className="notice bad">{errorMsg}</div>}

          <form onSubmit={submit} className="stack">
            <label>Account Role</label>
            <div className="segmented">
              <button type="button" className={role === "stockyard" ? "active" : ""} onClick={() => handleRoleChange("stockyard")}>Stockyard</button>
              <button type="button" className={role === "delivery_incharge" ? "active" : ""} onClick={() => handleRoleChange("delivery_incharge")}>Delivery</button>
              <button type="button" className={role === "admin" ? "active" : ""} onClick={() => handleRoleChange("admin")}>Admin</button>
            </div>

            {role === "stockyard" && (
              <div className="login-location-fields stack">
                <div className="login-field">
                  <label htmlFor="regionSelect">Region</label>
                  <select id="regionSelect" value={region} onChange={handleRegionChange}>
                    {YARD_REGIONS.map((regionName) => {
                      const count = yards.filter((y) => y.city === regionName).length;
                      return (
                        <option key={regionName} value={regionName}>
                          {regionName} ({count} {count === 1 ? "yard" : "yards"})
                        </option>
                      );
                    })}
                  </select>
                </div>
                <div className="login-field">
                  <label htmlFor="yardSelect">Yard location</label>
                  <select id="yardSelect" value={yardId} onChange={handleYardChange} required>
                    {regionYards.map((yard) => (
                      <option key={yard.id} value={yard.id}>
                        {yard.code} Â· {yard.name}
                      </option>
                    ))}
                  </select>
                  <p className="login-yard-hint">
                    Password is the yard code ({selectedYardObj?.code || "e.g. CO01A"}).
                  </p>
                </div>
              </div>
            )}

            {role === "delivery_incharge" && (
              <>
                <label htmlFor="branchSelect">Select Branch Location</label>
                <select id="branchSelect" value={branchId} onChange={(e) => { setBranchId(e.target.value); setErrorMsg(""); }} required>
                  {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </>
            )}

            <label htmlFor="password">Password</label>
            <div className="password-field-wrapper">
              <input
                id="password"
                type={showPassword ? "text" : "password"}
                required
                value={passwordInput}
                onChange={(e) => setPasswordInput(e.target.value)}
                placeholder={role === "admin" ? "Enter Admin Password" : role === "delivery_incharge" ? "Enter Delivery Password" : `Enter Password for ${selectedYardObj?.code || yardId}`}
              />
              <button
                type="button"
                className="password-toggle-btn"
                onClick={() => setShowPassword(!showPassword)}
                title={showPassword ? "Hide password" : "Show password"}
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                <span className="material-symbols-outlined">
                  {showPassword ? "visibility_off" : "visibility"}
                </span>
              </button>
            </div>

            <button className="primary" disabled={isLoading}>
              <span>{isLoading ? "Authenticating..." : "Sign In"}</span>
              <span className="material-symbols-outlined">arrow_forward</span>
            </button>
          </form>
        </div>
      </section>
    </main>
  );
}

function Header({ session, online, notifications, onNavigate, onLogout }) {
  const { isInstallable, promptInstall } = usePwaInstall();
  const topbarClass = session.role === "stockyard" ? "topbar topbar-stockyard" : "topbar";

  return (
    <header className={topbarClass}>
      <div className="topbar-brand-section">
        <strong className="topbar-brand">Nippon Yard Scan</strong>
        <div className="topbar-badge">
          {session.role === "admin" ? "Admin Console" : session.name}
        </div>
      </div>
      <div className="top-actions">
        {isInstallable && (
          <button className="primary pwa-install-btn" onClick={promptInstall}>
            <span className="material-symbols-outlined">install_mobile</span>
            <span className="pwa-install-label">Install App</span>
          </button>
        )}
        {session.role !== "admin" && <NotificationBell notifications={notifications || []} onNavigate={onNavigate} />}
        <span className={online ? "pill ok online-pill" : "pill warn online-pill"} aria-label={online ? "Online" : "Offline"}>
          {online ? "Online" : "Offline"}
        </span>
        <button className="icon-btn" onClick={onLogout} aria-label="Log out"><span className="material-symbols-outlined">logout</span></button>
      </div>
    </header>
  );
}

function NavButton({ icon, label, active, badge, onClick }) {
  return (
    <button className={active ? "active" : ""} onClick={onClick}>
      <span className="material-symbols-outlined">{icon}</span>
      {badge > 0 && <span className="nav-badge">{badge > 9 ? "9+" : badge}</span>}
      <small>{label}</small>
    </button>
  );
}

function compressImage(file, maxDimension = 1000, quality = 0.8) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        if (width > maxDimension || height > maxDimension) {
          if (width > height) {
            height = Math.round((height * maxDimension) / width);
            width = maxDimension;
          } else {
            width = Math.round((width * maxDimension) / height);
            height = maxDimension;
          }
        }
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      img.onerror = () => resolve(e.target.result || "");
      img.src = e.target.result;
    };
    reader.onerror = () => resolve("");
    reader.readAsDataURL(file);
  });
}

function ScanView({ state, setState, session, online, onRefresh, lastSyncedAt }) {
  const [vin, setVin] = useState("");
  const [outRemark, setOutRemark] = useState("");
  const [transferDestinationYardId, setTransferDestinationYardId] = useState("");
  const [transferRequestedBy, setTransferRequestedBy] = useState("");
  const [keyNo, setKeyNo] = useState("");
  const [damaged, setDamaged] = useState(false);
  const [damageRemark, setDamageRemark] = useState("");
  const [damageImage, setDamageImage] = useState("");
  const [driveType, setDriveType] = useState("");
  const [manualScanType, setManualScanType] = useState("in"); // ponytail: manual toggle always wins; QR still uses auto scanType
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraError, setCameraError] = useState("");
  const [torchOn, setTorchOn] = useState(false);
  const [supportsTorch, setSupportsTorch] = useState(false);
  const [scanSuccess, setScanSuccess] = useState(null);
  const [overlayResult, setOverlayResult] = useState(null);
  const [pendingCount, setPendingCount] = useState(0);
  const [message, setMessage] = useState(null);
  // Item 5: OUT confirmation
  const [confirmOutData, setConfirmOutData] = useState(null);
  const videoRef = useRef(null);
  const fileInputRef = useRef(null);
  const damagePhotoInputRef = useRef(null);
  const trackRef = useRef(null);
  const scanLockedRef = useRef(false);
  const yard = findYardById(session.yardId) || yards[0];
  const pendingVin = normalizeVin(vin);
  const isCarInCurrentYard = state.vehicles[pendingVin]?.currentStatus === "in" && state.vehicles[pendingVin]?.currentYardId === yard.id;
  const scanType = isCarInCurrentYard ? "out" : "in";
  const activeFlag = state.flags?.find((f) => f.vin === pendingVin && !f.resolved);
  const isFlagged = Boolean(activeFlag);
  // Item 7: Decoded VIN info for verification
  const decodedVin = useMemo(() => pendingVin.length >= 5 ? decodeVinDetails(pendingVin) : null, [pendingVin]);

  useEffect(() => {
    if (!pendingVin || scanType !== "out") return;
    const req = findApprovedTransferReq(state.requisitions, pendingVin);
    if (!req) return;
    setOutRemark("stockyard_transfer");
    setTransferRequestedBy(req.requested_by || "");
    const destYard = req.requesting_branch?.yards?.[0]?.id;
    if (destYard) setTransferDestinationYardId(destYard);
  }, [pendingVin, scanType, state.requisitions]);

  useEffect(() => {
    getPendingCount().then(setPendingCount);
  }, []);

  useEffect(() => {
    if (online) {
      drainQueue(bulkSync).then(res => {
        if (res.synced > 0) {
          getPendingCount().then(setPendingCount);
          onRefresh();
        }
      });
    }
  }, [online, onRefresh]);

  async function handleDamagePhotoSelect(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    // Item 10a: Client-side image size validation
    if (file.size > 10 * 1024 * 1024) {
      setOverlayResult({ type: "error", message: "Photo is too large (max 10MB). Try a smaller image." });
      return;
    }
    try {
      const compressed = await compressImage(file, 1000, 0.8);
      // Check compressed size â€” base64 is ~33% larger than binary
      if (compressed.length > 3 * 1024 * 1024) {
        setOverlayResult({ type: "error", message: "Compressed photo still too large (max 3MB). Use a lower-resolution camera setting." });
        return;
      }
      setDamageImage(compressed);
      setOverlayResult(null);
    } catch {
      setDamageImage("");
    }
  }

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
    } catch { }
  }, []);

  const handleQrText = useCallback((text) => {
    const scannedVin = normalizeVin(text);
    if (scannedVin.length === 17) {
      if (scanLockedRef.current) return true;
      scanLockedRef.current = true;
      setVin(scannedVin);
      setScanSuccess(scannedVin);
      setOverlayResult(null);
      setCameraOpen(false);
      setTorchOn(false);
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
      const supportedConstraints = navigator.mediaDevices?.getSupportedConstraints?.() || {};
      const canUseTorch = Boolean(caps.torch || supportedConstraints.torch);
      setSupportsTorch(canUseTorch);
      if (canUseTorch) track.applyConstraints({ advanced: [{ torch: false }] }).catch(() => { });
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
        setTimeout(bindCameraControls, 250);
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
      setSupportsTorch(false);
    };
  }, [cameraOpen, handleQrText]);

  function closeCamera() {
    trackRef.current?.applyConstraints?.({ advanced: [{ torch: false }] }).catch(() => { });
    setTorchOn(false);
    setCameraOpen(false);
  }

  function toggleTorch() {
    if (!trackRef.current) return setSupportsTorch(false);
    const next = !torchOn;
    trackRef.current?.applyConstraints?.({ advanced: [{ torch: next }] }).then(() => setTorchOn(next)).catch(() => {
      setSupportsTorch(false);
      setTorchOn(false);
    });
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

  // Item 5: Actual submission logic (called after OUT confirmation or directly for IN)
  async function doSubmit(confirmedScanType) {
    const finalScanType = confirmedScanType || scanType;

    const scan = createScan({ vin, type: finalScanType, yardId: yard.id, outRemark, transferDestinationYardId, transferRequestedBy, keyNo, damaged, damageRemark, damageImage, driveType });
    const result = applyScan(state, scan);

    if (!result.accepted) return setOverlayResult({ type: "error", message: result.message });

    const newFlags = result.state.flags.filter(f => f.vin === scan.vin && !f.resolved);
    const resultType = newFlags.length ? "flagged" : "success";

        try {
      if (!online) throw Object.assign(new Error("Offline"), { offline: true });
      await bulkSync([scan]);
      finishSubmit(result.state, resultType, result.message, newFlags.map(f => flagLabel(f.type)));
    } catch (err) {
      if (err.rejected) {
        return setOverlayResult({ type: "error", message: err.message });
      }
      if (isNetworkError(err)) {
        await enqueueScan(scan);
        setPendingCount(c => c + 1);
        finishSubmit(result.state, resultType, result.message + " (Saved offline)", newFlags.map(f => flagLabel(f.type)));
        return;
      }
      setOverlayResult({ type: "error", message: err.message || "Sync failed. Please try again." });
    }

  }

  async function submit(event) {
    event.preventDefault();
    // Manual entry: toggle wins. QR popover: keep auto scanType (+ live check).
    const fromQr = Boolean(scanSuccess);
    let effectiveType = fromQr ? scanType : manualScanType;

    if (!vin.trim()) return setOverlayResult({ type: "error", message: "Enter or scan a VIN." });
    if (effectiveType === "out" && !outRemark) return setOverlayResult({ type: "error", message: "Select an OUT reason." });
    if (outRemark === "stockyard_transfer" && !transferDestinationYardId) return setOverlayResult({ type: "error", message: "Select destination yard for transfer." });
    if (outRemark === "stockyard_transfer" && !transferRequestedBy.trim()) return setOverlayResult({ type: "error", message: "Enter the name of person who requested the transfer." });
    if (damaged) {
      if (!damageRemark.trim()) return setOverlayResult({ type: "error", message: "Add the damage remark." });
      if (!damageImage) return setOverlayResult({ type: "error", message: "Attach or capture a photo of the vehicle damage." });
    }
    if (isFlagged && !damageImage) {
      return setOverlayResult({ type: "error", message: "This vehicle has an active flag. You must attach a photo to proceed." });
    }

    if (fromQr && online && pendingVin.length === 17) {
      try {
        const liveStatus = await getVehicleStatus(pendingVin);
        if (liveStatus && liveStatus.current_status) {
          const liveIsIn = liveStatus.current_status === 'in' && liveStatus.current_yard_id === yard.id;
          effectiveType = liveIsIn ? 'out' : 'in';
        }
      } catch {
        // Offline or not found â€” use local/auto type
      }
    }

    if (effectiveType === "out" && !confirmOutData) {
      setConfirmOutData({ vin: pendingVin, scanType: effectiveType, outRemark, model: decodedVin?.model || "Unknown" });
      return;
    }

    setConfirmOutData(null);
    await doSubmit(effectiveType);
  }

  function finishSubmit(newState, type, msg, flags) {
    setState(newState);
    saveSnapshot(session, {
      vehicles: newState.vehicles,
      flags: newState.flags,
      scans: newState.scans,
      notifications: newState.notifications,
      requisitions: newState.requisitions,
    });
    setOverlayResult({ type, vin, message: msg, flags });
    setVin("");
    setOutRemark("");
    setTransferDestinationYardId("");
    setTransferRequestedBy("");
    setKeyNo("");
    setDriveType("");
    setDamaged(false);
    setDamageRemark("");
    setDamageImage("");
    setManualScanType("in");
    setScanSuccess(null);
    scanLockedRef.current = false;
    onRefresh();
  }


  return (
    <section className="scan-grid">
      {pendingCount > 0 && <div className="offline-badge">Offline Mode <span className="pending-count-badge">{pendingCount}</span></div>}
      <form className="scan-card stack" onSubmit={submit}>
        {confirmOutData && (
          <div className="scan-result-popover" style={{zIndex: 20}}>
            <h2 style={{color: 'var(--accent)', marginTop: 0}}>Confirm OUT Scan</h2>
            <p><strong>Model:</strong> {confirmOutData.model}</p>
            <p><strong>VIN:</strong> {confirmOutData.vin}</p>
            <p><strong>Reason:</strong> {confirmOutData.outRemark.replace('_', ' ')}</p>
            <div className="split" style={{marginTop: '16px'}}>
              <button type="button" className="ghost" onClick={() => setConfirmOutData(null)}>Cancel</button>
              <button type="button" className="primary" onClick={() => {
                const type = confirmOutData.scanType;
                setConfirmOutData(null);
                doSubmit(type);
              }}>Confirm OUT</button>
            </div>
          </div>
        )}
        <div className="scan-ticket">
          {scanSuccess ? (
            <span className={`scan-badge ${scanType}`} aria-label={`Will submit as ${scanType.toUpperCase()}`}>
              {scanType.toUpperCase()}
            </span>
          ) : (
            <span className="scan-yard-mark" aria-hidden="true">
              <span className="material-symbols-outlined">location_on</span>
            </span>
          )}
          <div className="scan-ticket-copy">
            <h1>{yard.code}</h1>
            <p>{yard.name}</p>
            <div className="scan-ticket-meta">
              <span>Capacity {yard.capacity}</span>
              {lastSyncedAt && (
                <span>Synced {Math.round((Date.now() - lastSyncedAt.getTime()) / 60000)}m ago</span>
              )}
              {!online && <span className="scan-ticket-offline">Offline</span>}
              {pendingCount > 0 && <span className="scan-ticket-queue">{pendingCount} queued</span>}
            </div>
          </div>
        </div>
        <div className="camera">
          <button className={`scan-box ${cameraOpen ? "live" : ""}`} type="button" onClick={() => {
            scanLockedRef.current = false;
            setScanSuccess(null);
            setOverlayResult(null);
            setTorchOn(false);
            setCameraOpen(true);
          }} aria-label="Open camera scanner">
            {cameraOpen && <video ref={videoRef} autoPlay muted playsInline />}
            <span className="corner top-left"></span>
            <span className="corner top-right"></span>
            <span className="corner bottom-left"></span>
            <span className="corner bottom-right"></span>
            {!cameraOpen && <span className="qr-pattern" aria-hidden="true"></span>}
            {cameraOpen && supportsTorch && (
              <span
                role="button"
                tabIndex={0}
                className="torch-toggle"
                aria-label={torchOn ? "Turn flash off" : "Turn flash on"}
                aria-pressed={torchOn}
                onClick={(e) => {
                  e.stopPropagation();
                  toggleTorch();
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.stopPropagation();
                    toggleTorch();
                  }
                }}
              >
                <span className="material-symbols-outlined">{torchOn ? "flashlight_off" : "flashlight_on"}</span>
              </span>
            )}
          </button>
          {scanSuccess && (
            <div className="scan-result-popover" aria-live="polite">
              <span className="material-symbols-outlined">check_circle</span>
              <div>
                <b>VIN {scanSuccess} scanned.</b>
                {decodedVin && <div style={{fontSize: '0.85rem', color: 'var(--text-dim)', margin: '4px 0'}}>
                  {decodedVin.model} {decodedVin.engine ? `(${decodedVin.engine})` : ''} Â· {decodedVin.plant || 'Unknown Plant'}
                </div>}
                <small>Ready for vehicle {scanType.toUpperCase()}.</small>
              </div>
              {scanType === "out" && (
                <select value={outRemark} onChange={(event) => {
                  setOutRemark(event.target.value);
                  if (event.target.value !== "stockyard_transfer") {
                    setTransferDestinationYardId("");
                    setTransferRequestedBy("");
                  }
                  setOverlayResult(null);
                }} aria-label="OUT reason">
                  <option value="">Select OUT reason</option>
                  <option value="customer_acquisition">Customer Acquisition</option>
                  <option value="stockyard_transfer">Stockyard Transfer</option>
                </select>
              )}
              {outRemark === "stockyard_transfer" && (
                <>
                  <select value={transferDestinationYardId} onChange={(event) => {
                    setTransferDestinationYardId(event.target.value);
                    setOverlayResult(null);
                  }} aria-label="Destination yard">
                    <option value="">Select destination yard</option>
                    {yardsByRegion().map(({ region, yards: regionYards }) => {
                      const options = regionYards.filter((y) => y.id !== yard.id);
                      if (!options.length) return null;
                      return (
                        <optgroup key={region} label={region}>
                          {options.map((y) => (
                            <option key={y.id} value={y.id}>{y.code} Â· {y.name}</option>
                          ))}
                        </optgroup>
                      );
                    })}
                  </select>
                  <input
                    value={transferRequestedBy}
                    onChange={(event) => {
                      setTransferRequestedBy(event.target.value);
                      setMessage(null);
                    }}
                    placeholder="Requested by (person name)"
                  />
                </>
              )}
              <input
                value={keyNo}
                onChange={(event) => {
                  setKeyNo(event.target.value);
                  setMessage(null);
                }}
                placeholder="Key No (optional, e.g. K-101)"
              />
              <select
                value={driveType}
                onChange={(event) => {
                  setDriveType(event.target.value);
                  setMessage(null);
                }}
                aria-label="Drive type"
                style={{ marginTop: '8px' }}
              >
                <option value="">Select Drive Type</option>
                <option value="neo_drive">Neo Drive</option>
                <option value="hybrid">Hybrid</option>
                <option value="petrol">Petrol</option>
                <option value="diesel">Diesel</option>
              </select>
              {isFlagged && (
                <div className="notice warn" style={{ marginTop: '12px', marginBottom: '12px' }}>
                  <strong>Active Flag:</strong> A photo of the vehicle is required to complete this scan.
                </div>
              )}
              <label className="check scan-damage-check">
                <input type="checkbox" checked={damaged} onChange={(event) => {
                  setDamaged(event.target.checked);
                  if (!event.target.checked && !isFlagged) {
                    setDamageRemark("");
                    setDamageImage("");
                  }
                  setMessage(null);
                }} />
                Car damaged
              </label>
              {(damaged || isFlagged) && (
                <div className="damage-inputs stack">
                  {damaged && (
                    <textarea
                      value={damageRemark}
                      onChange={(event) => {
                        setDamageRemark(event.target.value);
                        setMessage(null);
                      }}
                      rows="2"
                      placeholder="Type of damage & details..."
                    />
                  )}
                  <input ref={damagePhotoInputRef} type="file" accept="image/*" capture="environment" onChange={handleDamagePhotoSelect} style={{ display: "none" }} />
                  <div className="damage-photo-upload-row">
                    <button type="button" className="ghost damage-photo-btn" onClick={() => damagePhotoInputRef.current?.click()}>
                      <span className="material-symbols-outlined">add_a_photo</span>
                      <span>{damageImage ? "Change photo" : (isFlagged && !damaged ? "Take mandatory photo" : "Take damage photo")}</span>
                    </button>
                    {damageImage && (
                      <div className="damage-thumb-wrap">
                        <img src={damageImage} alt="Damage preview" className="damage-thumb" />
                        <button type="button" className="damage-thumb-remove" onClick={() => setDamageImage("")} title="Remove photo">&times;</button>
                      </div>
                    )}
                  </div>
                </div>
              )}
              {message && <small className={`scan-popover-message ${message.kind}`}>{message.text}</small>}
              <button className="primary scan-submit-button">Submit {scanType.toUpperCase()}</button>
            </div>
          )}
          <p className="scan-camera-hint">
            {cameraOpen
              ? "Point the camera at the vehicle QR code."
              : "Tap to scan — IN or OUT is detected automatically."}
          </p>
          {cameraError && <p className="camera-error">{cameraError}</p>}
          {cameraOpen && <button type="button" className="ghost" onClick={closeCamera}>Close camera</button>}
          <input ref={fileInputRef} type="file" accept="image/*" onChange={uploadQr} style={{ display: "none" }} />
          <button type="button" className="ghost" onClick={() => fileInputRef.current?.click()}><span className="material-symbols-outlined">upload_file</span> Upload QR</button>
        </div>
        {!scanSuccess && (
          <div className="manual-entry-section stack">
            <div className="manual-entry-header">
              <span className="manual-entry-title">Manual VIN entry</span>
              <span className="manual-entry-hint">Choose IN or OUT yourself</span>
            </div>
            <div className="segmented" role="tablist" aria-label="Manual submit type">
              <button
                type="button"
                role="tab"
                aria-selected={manualScanType === "in"}
                className={manualScanType === "in" ? "active" : ""}
                onClick={() => {
                  setManualScanType("in");
                  setOutRemark("");
                  setTransferDestinationYardId("");
                  setTransferRequestedBy("");
                }}
              >
                IN
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={manualScanType === "out"}
                className={manualScanType === "out" ? "active" : ""}
                onClick={() => setManualScanType("out")}
              >
                OUT
              </button>
            </div>
          </div>
        )}
        <div className={scanSuccess ? "vin-submit-panel scanned" : "inline-form"}>
          <input id="vin" value={vin} onChange={(event) => {
            setVin(event.target.value.toUpperCase());
            setScanSuccess(null);
          }} placeholder="Enter VIN" aria-live={scanSuccess ? "polite" : undefined} />
          {!scanSuccess && <button className="primary">Submit {manualScanType.toUpperCase()}</button>}
          {scanSuccess && (
            <button type="button" className="scan-next-button" onClick={() => {
              setVin("");
              setOutRemark("");
              setTransferDestinationYardId("");
              setTransferRequestedBy("");
              setKeyNo("");
              setDamaged(false);
              setDamageRemark("");
              setDamageImage("");
              setScanSuccess(null);
              setMessage(null);
              scanLockedRef.current = false;
              setTorchOn(false);
              setCameraOpen(true);
            }}>Scan next</button>
          )}
        </div>
        {!scanSuccess && (
          <div className="stack">
            {manualScanType === "out" && (
              <>
                <label htmlFor="remark">OUT Reason</label>
                <select id="remark" value={outRemark} onChange={(event) => {
                  setOutRemark(event.target.value);
                  if (event.target.value !== "stockyard_transfer") {
                    setTransferDestinationYardId("");
                    setTransferRequestedBy("");
                  }
                }}>
                  <option value="">Select reason</option>
                  <option value="customer_acquisition">Customer Acquisition</option>
                  <option value="stockyard_transfer">Stockyard Transfer</option>
                </select>
                {outRemark === "stockyard_transfer" && (
                  <>
                    <label htmlFor="transfer-dest">Transfer Destination Yard</label>
                    <select id="transfer-dest" value={transferDestinationYardId} onChange={(event) => setTransferDestinationYardId(event.target.value)}>
                      <option value="">Select destination yard</option>
                      {yardsByRegion().map(({ region, yards: regionYards }) => {
                        const options = regionYards.filter((y) => y.id !== yard.id);
                        if (!options.length) return null;
                        return (
                          <optgroup key={region} label={region}>
                            {options.map((y) => (
                              <option key={y.id} value={y.id}>{y.code} Â· {y.name}</option>
                            ))}
                          </optgroup>
                        );
                      })}
                    </select>
                    <label htmlFor="transfer-requester">Requested By</label>
                    <input
                      id="transfer-requester"
                      value={transferRequestedBy}
                      onChange={(event) => setTransferRequestedBy(event.target.value)}
                      placeholder="Person name who requested transfer"
                    />
                  </>
                )}
              </>
            )}
            <label htmlFor="keyNo">Key No.</label>
            <input
              id="keyNo"
              value={keyNo}
              onChange={(event) => setKeyNo(event.target.value)}
              placeholder="Key No (optional, e.g. K-101)"
            />
            <label htmlFor="driveType">Drive Type</label>
            <select
              id="driveType"
              value={driveType}
              onChange={(event) => setDriveType(event.target.value)}
            >
              <option value="">Select Drive Type</option>
              <option value="neo_drive">Neo Drive</option>
              <option value="hybrid">Hybrid</option>
              <option value="petrol">Petrol</option>
              <option value="diesel">Diesel</option>
            </select>
            <label className="check"><input type="checkbox" checked={damaged} onChange={(event) => {
              setDamaged(event.target.checked);
              if (!event.target.checked) {
                setDamageRemark("");
                setDamageImage("");
              }
            }} /> Car damaged</label>
            {damaged && (
              <div className="damage-inputs stack">
                <textarea value={damageRemark} onChange={(event) => setDamageRemark(event.target.value)} rows="3" placeholder="Type of damage & details..." />
                <input ref={damagePhotoInputRef} type="file" accept="image/*" capture="environment" onChange={handleDamagePhotoSelect} style={{ display: "none" }} />
                <div className="damage-photo-upload-row">
                  <button type="button" className="ghost damage-photo-btn" onClick={() => damagePhotoInputRef.current?.click()}>
                    <span className="material-symbols-outlined">add_a_photo</span>
                    <span>{damageImage ? "Change photo" : "Take damage photo"}</span>
                  </button>
                  {damageImage && (
                    <div className="damage-thumb-wrap">
                      <img src={damageImage} alt="Damage preview" className="damage-thumb" />
                      <button type="button" className="damage-thumb-remove" onClick={() => setDamageImage("")} title="Remove photo">&times;</button>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
        {message && !scanSuccess && <p className={`notice ${message.kind}`}>{message.text}</p>}
      </form>
      <ScanOverlay result={overlayResult} onDismiss={() => setOverlayResult(null)} />
      <aside className="panel yard-card scan-yard-sidebar" aria-label="Yard details">
        <h2 className="yard-card-title">{yard.name}</h2>
        <div className="yard-meta"><span>{yard.code}</span><b>Capacity {yard.capacity}</b></div>
        <div className="yard-device">
          <span className="material-symbols-outlined" aria-hidden="true">smartphone</span>
          <span>Device {state.deviceId.slice(-8)}</span>
        </div>
        <p className="yard-sync-note muted">
          {online
            ? "Scans sync to the server immediately."
            : "Offline — scans are saved on this device and sync when you reconnect."}
        </p>
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
    .sort((a, b) => String(b.lastChangedAt || "").localeCompare(String(a.lastChangedAt || "")));

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
              <label className="filter-field">
                <span>Status</span>
                <select value={status} onChange={(event) => setStatus(event.target.value)} aria-label="Status filter">
                  <option value="all">All (In/Out)</option>
                  <option value="in">IN only</option>
                  <option value="out">OUT only</option>
                </select>
              </label>
              <label className="filter-field">
                <span>Model</span>
                <select value={model} onChange={(event) => setModel(event.target.value)} aria-label="Model filter">
                  <option value="all">All models</option>
                  {options("model").map((item) => <option key={item} value={item}>{item}</option>)}
                </select>
              </label>
              <label className="filter-field">
                <span>Variant</span>
                <select value={variant} onChange={(event) => setVariant(event.target.value)} aria-label="Variant filter">
                  <option value="all">All variants</option>
                  {options("variant").map((item) => <option key={item} value={item}>{item}</option>)}
                </select>
              </label>
              <label className="filter-field">
                <span>Colour</span>
                <select value={colour} onChange={(event) => setColour(event.target.value)} aria-label="Colour filter">
                  <option value="all">All colours</option>
                  {options("colour").map((item) => <option key={item} value={item}>{item}</option>)}
                </select>
              </label>
              <label className="filter-field">
                <span>Yard</span>
                <select value={yardId} onChange={(event) => setYardId(event.target.value)} aria-label="Stockyard location filter">
                  <option value="all">All locations</option>
                  {yardsByRegion().map(({ region, yards: regionYards }) => (
                    <optgroup key={region} label={region}>
                      {regionYards.map((yard) => (
                        <option key={yard.id} value={yard.id}>{yard.code} · {yard.name}</option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </label>
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
  const yard = findYardById(vehicle.currentYardId);
  const statusText = flags.length ? "Flagged" : vehicle.currentStatus === "in" ? "In yard" : "Out";
  return (
    <article className={`vehicle ${vehicle.currentStatus} ${flags.length ? "flagged" : ""}`}>
      <div className="vehicle-main">
        <span className="vehicle-mark">{vehicle.model?.slice(0, 1) || "V"}</span>
        <div>
          <strong>{vehicle.vin}</strong>
          <span>{vehicle.model}</span>
          <small>{vehicle.variant || "Standard"} Â· {vehicle.colour || "Not set"}{vehicle.keyNo ? ` Â· Key No: ${vehicle.keyNo}` : ""}</small>
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

      {stats.dwellAlertCount > 0 && (
        <div className="notice warn" style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 16px' }}>
          <span className="material-symbols-outlined" style={{ fontSize: '1.5rem' }}>alarm</span>
          <div>
            <strong>{stats.dwellAlertCount} vehicle{stats.dwellAlertCount > 1 ? 's' : ''} exceed{stats.dwellAlertCount === 1 ? 's' : ''} dwell time threshold.</strong>
            <small style={{ display: 'block' }}>Review in the Flags tab to resolve.</small>
          </div>
        </div>
      )}

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
                  <small>
                    {flag.createdAt && <span className="flag-time">{new Date(flag.createdAt).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</span>}{" · "}
                    <strong className="flag-kind">{flagLabel(flag.type)}</strong> {flag.message}
                  </small>
                </span>
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

createRoot(document.getElementById("root")).render(<App />);
