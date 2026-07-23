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

function flagLabel(type) {
  return {
    damage_reported: "Damage Reported",
    gps_outside_yard: "GPS Radius Violation",
    unverified_in: "Unverified OUT",
    yard_capacity_exceeded: "Capacity Exceeded",
    duplicate_yard_status: "Duplicate Status",
    invalid_vin: "Invalid VIN Format",
    manual_admin_override: "Admin Override",
  }[type] || String(type || "Flag").replace(/_/g, " ");
}

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

  const fetchServerData = useCallback(async () => {
    if (!session || !online) return;
    try {
      const vehiclesData = await getVehicles();
      
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
      
      const flagsData = await getFlags();
      let mappedFlags = flagsData.map(f => ({
        id: f.id,
        vin: f.vin,
        type: f.flag_type,
        message: f.message,
        createdAt: f.created_at,
        resolved: f.resolved,
      }));
      
      setState(s => ({
        ...s,
        vehicles: mappedVehicles,
        flags: mappedFlags
      }));
    } catch (err) {
      console.error("Failed to load backend data", err);
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
    
    const intervalId = setInterval(fetchServerData, 60000);
    
    return () => {
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("visibilitychange", onVisibilityChange);
      clearInterval(intervalId);
    };
  }, [fetchServerData]);

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
        
        // Immediately fetch the fresh state from the server now that our sync is accepted!
        fetchServerData();
      } catch (err) {
        console.error("Background sync failed:", err);
      }
    }
    
    performSync();
    return () => { cancelled = true; };
  }, [online, state.queue.length, state.scans, fetchServerData]);

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
  const [passwordInput, setPasswordInput] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleRoleChange = (newRole) => {
    setRole(newRole);
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

    const cleanUsername = role === "admin" ? "ADMIN123@nippon.com" : `${yardId}@nippon.com`;
    const cleanPassword = passwordInput.trim();

    try {
      // Try online API login
      const res = await loginApi(cleanUsername, cleanPassword);
      if (res && res.user) {
        if (res.user.role === "admin") {
          onLogin({ role: "admin", yardId: null, name: "Admin Console" });
        } else {
          const yard = yards.find((y) => y.id === res.user.yardId) || yards[0];
          onLogin({ role: "stockyard", yardId: yard.id, name: yard.name });
        }
        return;
      }
    } catch (err) {
      // Offline fallback validation
      if (cleanUsername === "ADMIN123@nippon.com" && (cleanPassword === "ADMIN123@nippon.com" || cleanPassword.toUpperCase() === "ADMIN")) {
        onLogin({ role: "admin", yardId: null, name: "Admin Console" });
        return;
      }
      if (cleanUsername.endsWith("@nippon.com")) {
        const extractedYardCode = cleanUsername.replace("@nippon.com", "");
        const yard = yards.find((y) => y.id === extractedYardCode || y.code === extractedYardCode);
        if (yard && (cleanPassword === cleanUsername || cleanPassword === extractedYardCode || cleanPassword.length >= 3)) {
          onLogin({ role: "stockyard", yardId: yard.id, name: yard.name });
          return;
        }
      }
      setErrorMsg("Incorrect password. Please try again.");
    } finally {
      setIsLoading(false);
    }
  }

  const selectedYardObj = yards.find((y) => y.id === yardId);

  return (
    <main className="login">
      <section className="login-panel">
        <div className="login-visual" aria-hidden="true">
          <div className="login-visual-top">
            <span className="toyota-dot"></span>
            <strong>Stockyard Gate Security</strong>
          </div>
          <div className="yard-strip">
            <span>Authorised access only</span>
            <b>{yards.length} active yards</b>
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
          <p>Select your yard location and enter password to sign in.</p>

          {errorMsg && <div className="notice bad">{errorMsg}</div>}

          <form onSubmit={submit} className="stack">
            <label>Account Role</label>
            <div className="segmented">
              <button type="button" className={role === "stockyard" ? "active" : ""} onClick={() => handleRoleChange("stockyard")}>Stockyard Worker</button>
              <button type="button" className={role === "admin" ? "active" : ""} onClick={() => handleRoleChange("admin")}>Admin Console</button>
            </div>

            {role === "stockyard" && (
              <>
                <label htmlFor="yardSelect">Select Stockyard Location</label>
                <select id="yardSelect" value={yardId} onChange={handleYardChange}>
                  {yards.map((yard) => <option key={yard.id} value={yard.id}>{yard.code} · {yard.name}</option>)}
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
                placeholder={role === "admin" ? "Enter Admin Password" : `Enter Password for ${selectedYardObj?.code || yardId}`}
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

import { YardVehiclesModal } from "./components/YardVehiclesModal.jsx";
import { AdminHome } from "./components/AdminDashboard.jsx";

function ScanView({ state, setState, session, online }) {
  const [vin, setVin] = useState("");
  const [outRemark, setOutRemark] = useState("");
  const [damaged, setDamaged] = useState(false);
  const [damageRemark, setDamageRemark] = useState("");
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraError, setCameraError] = useState("");
  const [torchOn, setTorchOn] = useState(false);
  const [supportsTorch, setSupportsTorch] = useState(false);
  const [scanSuccess, setScanSuccess] = useState(null);
  const [message, setMessage] = useState(null);
  const videoRef = useRef(null);
  const fileInputRef = useRef(null);
  const trackRef = useRef(null);
  const scanLockedRef = useRef(false);
  const yard = yards.find((item) => item.id === session.yardId) || yards[0];
  const pendingVin = normalizeVin(vin);
  const isCarInCurrentYard = state.vehicles[pendingVin]?.currentStatus === "in" && (state.vehicles[pendingVin]?.currentYardId === yard.id || state.vehicles[pendingVin]?.currentYardId === yard.code);
  const scanType = isCarInCurrentYard ? "out" : "in";

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
      if (canUseTorch) track.applyConstraints({ advanced: [{ torch: false }] }).catch(() => {});
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
    trackRef.current?.applyConstraints?.({ advanced: [{ torch: false }] }).catch(() => {});
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

  function submit(event) {
    event.preventDefault();
    if (!vin.trim()) return setMessage({ kind: "error", text: "Enter or scan a VIN." });
    if (scanType === "out" && !outRemark) return setMessage({ kind: "error", text: "Select an OUT reason." });
    if (scanType === "out" && damaged && !damageRemark.trim()) return setMessage({ kind: "error", text: "Add the damage remark." });

    const gps = { latitude: yard.latitude, longitude: yard.longitude, accuracy: online ? 24 : null };
    const scan = createScan({ vin, type: scanType, yardId: yard.id, gps, outRemark, damaged, damageRemark, online });
    const result = applyScan(state, scan);
    setState(result.state);
    setMessage({ kind: result.accepted ? "ok" : "error", text: result.message });
    setVin("");
    setOutRemark("");
    setDamaged(false);
    setDamageRemark("");
    setScanSuccess(null);
    scanLockedRef.current = false;
  }

  return (
    <section className="scan-grid">
      <form className="scan-card stack" onSubmit={submit}>
        <div className="scan-ticket">
          <span className={`scan-badge ${scanType}`}>{scanType.toUpperCase()}</span>
          <div>
            <h1>{yard.code}</h1>
            <p>{yard.name}</p>
          </div>
          <span className={online ? "status-dot ok" : "status-dot warn"}>{online ? "Online" : "Offline"}</span>
        </div>
        <div className="camera">
          <button className={`scan-box ${cameraOpen ? "live" : ""}`} type="button" onClick={() => {
            scanLockedRef.current = false;
            setScanSuccess(null);
            setMessage(null);
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
                <small>Ready for vehicle {scanType.toUpperCase()}.</small>
              </div>
              {scanType === "out" && (
                <>
                  <select value={outRemark} onChange={(event) => {
                    setOutRemark(event.target.value);
                    setMessage(null);
                  }} aria-label="OUT reason">
                    <option value="">Select OUT reason</option>
                    <option value="customer_acquisition">Customer Acquisition</option>
                    <option value="stockyard_transfer">Stockyard Transfer</option>
                  </select>
                  <label className="check scan-damage-check">
                    <input type="checkbox" checked={damaged} onChange={(event) => {
                      setDamaged(event.target.checked);
                      if (!event.target.checked) setDamageRemark("");
                      setMessage(null);
                    }} />
                    Damage reported
                  </label>
                  {damaged && (
                    <textarea
                      value={damageRemark}
                      onChange={(event) => {
                        setDamageRemark(event.target.value);
                        setMessage(null);
                      }}
                      rows="2"
                      placeholder="Damage remark"
                    />
                  )}
                </>
              )}
              {message && <small className={`scan-popover-message ${message.kind}`}>{message.text}</small>}
              <button className="primary scan-submit-button">Submit {scanType.toUpperCase()}</button>
            </div>
          )}
          <p>{cameraOpen ? "Point the camera at the vehicle QR code." : "Tap the QR grid to open camera scanner."}</p>
          {cameraError && <p className="camera-error">{cameraError}</p>}
          {cameraOpen && <button type="button" className="ghost" onClick={closeCamera}>Close camera</button>}
          <input ref={fileInputRef} type="file" accept="image/*" onChange={uploadQr} style={{ display: "none" }} />
          <button type="button" className="ghost" onClick={() => fileInputRef.current?.click()}><span className="material-symbols-outlined">upload_file</span> Upload QR</button>
        </div>
        {!scanSuccess && <label htmlFor="vin">Manual VIN entry</label>}
        <div className={scanSuccess ? "vin-submit-panel scanned" : "inline-form"}>
          <input id="vin" value={vin} onChange={(event) => {
            setVin(event.target.value.toUpperCase());
            setScanSuccess(null);
          }} placeholder="Enter VIN" aria-live={scanSuccess ? "polite" : undefined} />
          {!scanSuccess && <button className="primary">Submit {scanType.toUpperCase()}</button>}
          {scanSuccess && (
            <button type="button" className="scan-next-button" onClick={() => {
              setVin("");
              setOutRemark("");
              setDamaged(false);
              setDamageRemark("");
              setScanSuccess(null);
              setMessage(null);
              scanLockedRef.current = false;
              setTorchOn(false);
              setCameraOpen(true);
            }}>Scan next</button>
          )}
        </div>
        {!scanSuccess && scanType === "out" && (
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
        {message && !scanSuccess && <p className={`notice ${message.kind}`}>{message.text}</p>}
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
                  <small>
                    {flag.createdAt && <span className="flag-time">{new Date(flag.createdAt).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</span>}{" · "}
                    <strong className="flag-kind">{flagLabel(flag.type)}</strong> {flag.message}
                  </small>
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
