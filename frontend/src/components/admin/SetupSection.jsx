import React from "react";
import { CredentialsTab } from "../CredentialsTab.jsx";
import { BranchesTab } from "../BranchesTab.jsx";
import { SETUP_TABS } from "./adminSections.js";

export function SetupSection({ setupTab, setSetupTab, pushState }) {
  const { isSubscribed, permission, subscribe, unsubscribe } = pushState;

  return (
    <div className="admin-section stack">
      <div className="admin-setup-tabs" role="tablist" aria-label="Setup sections">
        {SETUP_TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={setupTab === tab.id}
            className={setupTab === tab.id ? "active" : ""}
            onClick={() => setSetupTab(tab.id)}
          >
            <span className="material-symbols-outlined">{tab.icon}</span>
            {tab.label}
          </button>
        ))}
      </div>

      {setupTab === "notifications" && (
        <div className="admin-setup-block">
          {permission === "denied" ? (
            <div className="notice warn">
              <strong>Notifications blocked</strong>
              <p className="field-hint">Enable notifications in your browser settings to receive flag alerts on this device.</p>
            </div>
          ) : (
            <div className="admin-push-row">
              <div>
                <strong>Push notifications</strong>
                <span>Alert this device when new flags appear. Tapping a notification opens the Attention queue.</span>
              </div>
              <button type="button" className="btn btn-outline" onClick={isSubscribed ? unsubscribe : subscribe}>
                <span className="material-symbols-outlined">{isSubscribed ? "notifications_active" : "notifications"}</span>
                {isSubscribed ? "Disable" : "Enable"}
              </button>
            </div>
          )}
        </div>
      )}

      {setupTab === "passwords" && (
        <div className="admin-setup-block">
          <CredentialsTab />
        </div>
      )}

      {setupTab === "branches" && (
        <div className="admin-setup-block">
          <BranchesTab />
        </div>
      )}
    </div>
  );
}
