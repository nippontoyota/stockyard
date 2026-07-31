import React, { useMemo, useState } from "react";
import { YardVehiclesModal } from "./YardVehiclesModal.jsx";
import { useWebPush } from "../hooks/useWebPush.js";
import { useToast } from "../hooks/useToast.js";
import { countFlagsByYard } from "./admin/flagUtils.js";
import { getDamagedExtras } from "./admin/dismissedDamage.js";
import { ADMIN_SECTIONS, adminSectionSubtitle, getAdminSectionBadge } from "./admin/adminSections.js";
import { useAdminDeepLink } from "./admin/useAdminDeepLink.js";
import { StatusStrip } from "./admin/StatusStrip.jsx";
import { DamagePhotoModal } from "./admin/DamagePhotoModal.jsx";
import { AttentionSection } from "./admin/AttentionSection.jsx";
import { YardsSection } from "./admin/YardsSection.jsx";
import { VehiclesSection } from "./admin/VehiclesSection.jsx";
import { SetupSection } from "./admin/SetupSection.jsx";
import { ConfirmDialog } from "./ConfirmDialog.jsx";

export function AdminHome({ stats, state, setState, onRefresh }) {
  const [section, setSection] = useState("attention");
  const [issueFilter, setIssueFilter] = useState("all");
  const [yardRiskFilter, setYardRiskFilter] = useState("all");
  const [setupTab, setSetupTab] = useState("notifications");
  const [selectedYardModal, setSelectedYardModal] = useState(null);
  const [selectedPhotoModal, setSelectedPhotoModal] = useState(null);
  const [yardSearch, setYardSearch] = useState("");
  const [editVinRequest, setEditVinRequest] = useState(null);
  const [errorDialog, setErrorDialog] = useState(null);

  const { toastMessage, toast } = useToast();
  const pushState = useWebPush();

  useAdminDeepLink({
    section,
    issueFilter,
    yardRiskFilter,
    setupTab,
    setSection,
    setIssueFilter,
    setYardRiskFilter,
    setSetupTab,
  });

  const activeFlagsList = state ? state.flags.filter((f) => !f.resolved) : [];
  const damageFlagCount = activeFlagsList.filter((f) => f.type === "damage_reported").length;
  const transitVehicles = state?.vehicles ? Object.values(state.vehicles).filter((v) => v.currentStatus === "transit") : [];
  const transitCount = transitVehicles.length;

  const flagsByYard = useMemo(() => countFlagsByYard(activeFlagsList, state), [activeFlagsList, state]);

  const damageExtrasCount = useMemo(
    () => getDamagedExtras(state, activeFlagsList).length,
    [state, activeFlagsList]
  );

  const healthyYards = stats.yards.filter((yard) => yard.risk === "normal").length;

  function handleJump(targetSection, options = "all") {
    if (typeof options === "string") {
      setSection(targetSection);
      if (targetSection === "attention") setIssueFilter(options);
      return;
    }
    setSection(targetSection);
    if (targetSection === "attention" && options.filter) setIssueFilter(options.filter);
    if (targetSection === "vehicles" && options.tool) {
      setEditVinRequest({ vin: null, tool: options.tool });
    }
  }

  function handleEditVehicle(vin) {
    setEditVinRequest({ vin, tool: null });
    setSection("vehicles");
  }

  function clearEditVinRequest() {
    setEditVinRequest(null);
  }

  return (
    <section className={`dashboard-workspace admin-console admin-console--${section}`}>
      <aside className="dashboard-rail" aria-label="Admin sections">
        <div className="rail-brand">
          <span className="material-symbols-outlined">admin_panel_settings</span>
          <strong>Admin</strong>
        </div>
        <div className="rail-menu" role="tablist" aria-label="Admin sections">
          {ADMIN_SECTIONS.map((s) => {
            const badge = getAdminSectionBadge(s.id, { openFlags: activeFlagsList.length, transitCount });
            return (
              <button
                key={s.id}
                type="button"
                role="tab"
                aria-selected={section === s.id}
                className={section === s.id ? "active" : ""}
                onClick={() => setSection(s.id)}
              >
                <span className="material-symbols-outlined">{s.icon}</span>
                <span>{s.label}</span>
                {badge > 0 && <span className="rail-badge">{badge}</span>}
              </button>
            );
          })}
        </div>
        <div className="rail-note">
          <b>
            {healthyYards}/{stats.yards.length}
          </b>
          <span>yards healthy</span>
        </div>
      </aside>

      <div className="stack analytical-dashboard admin-console-main">
        <header className="admin-console-header">
          <div className="segmented dashboard-mobile-tabs admin-mobile-tabs" role="tablist" aria-label="Admin sections">
            {ADMIN_SECTIONS.map((s) => {
              const badge = getAdminSectionBadge(s.id, { openFlags: activeFlagsList.length, transitCount });
              return (
                <button
                  key={s.id}
                  type="button"
                  role="tab"
                  aria-selected={section === s.id}
                  className={section === s.id ? "active" : ""}
                  onClick={() => setSection(s.id)}
                >
                  {s.label}
                  {badge > 0 ? ` (${badge})` : ""}
                </button>
              );
            })}
          </div>
          <div className="dashboard-header-copy">
            <h1>{ADMIN_SECTIONS.find((s) => s.id === section)?.label || "Admin"}</h1>
            <p className="dashboard-subtitle">{adminSectionSubtitle(section)}</p>
          </div>
        </header>

        {section !== "setup" && (
          <StatusStrip
            stats={stats}
            openFlags={activeFlagsList.length}
            damageCount={damageFlagCount + damageExtrasCount}
            transitCount={transitCount}
            onJump={handleJump}
          />
        )}

        {toastMessage && <div className="notice ok">{toastMessage}</div>}

        {section === "attention" && (
          <AttentionSection
            state={state}
            setState={setState}
            activeFlagsList={activeFlagsList}
            issueFilter={issueFilter}
            setIssueFilter={setIssueFilter}
            onShowPhoto={setSelectedPhotoModal}
            onEditVehicle={handleEditVehicle}
            toast={toast}
            onError={(msg) => setErrorDialog(msg)}
          />
        )}

        {section === "yards" && (
          <YardsSection
            stats={stats}
            yardSearch={yardSearch}
            setYardSearch={setYardSearch}
            yardRiskFilter={yardRiskFilter}
            setYardRiskFilter={setYardRiskFilter}
            flagsByYard={flagsByYard}
            onSelectYard={setSelectedYardModal}
          />
        )}

        {section === "vehicles" && (
          <VehiclesSection
            state={state}
            setState={setState}
            transitVehicles={transitVehicles}
            transitCount={transitCount}
            editVinRequest={editVinRequest}
            onEditVinConsumed={clearEditVinRequest}
            onEditVehicle={handleEditVehicle}
            onRefresh={onRefresh}
            toast={toast}
            onError={(msg) => setErrorDialog(msg)}
          />
        )}

        {section === "setup" && <SetupSection setupTab={setupTab} setSetupTab={setSetupTab} pushState={pushState} />}
      </div>

      <YardVehiclesModal yard={selectedYardModal} state={state} setState={setState} onClose={() => setSelectedYardModal(null)} />

      <DamagePhotoModal photo={selectedPhotoModal} onClose={() => setSelectedPhotoModal(null)} />

      <ConfirmDialog
        open={Boolean(errorDialog)}
        title="Something went wrong"
        message={errorDialog || ""}
        confirmLabel="OK"
        cancelLabel=""
        onConfirm={() => setErrorDialog(null)}
        onCancel={() => setErrorDialog(null)}
      />
    </section>
  );
}
