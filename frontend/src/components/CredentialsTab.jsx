import React, { useState, useEffect } from "react";
import { yards, fallbackBranches } from "../stockyardLogic.js";
import { getCredentialsApi, updateCredentialApi, getAdminBranches } from "../api.js";
import {
  ADMIN_DEFAULT_PASSWORD,
  DELIVERY_DEFAULT_PASSWORD,
  defaultPasswordForRole,
  buildDefaultCredentials,
} from "../credentials.js";

function mergeWithDefaults(apiRows, defaults) {
  const byUsername = new Map(apiRows.map((row) => [row.username, row]));
  return defaults.map((fallback) => {
    const found = byUsername.get(fallback.username);
    if (!found) return fallback;
    return {
      ...fallback,
      ...found,
      yardName: found.yardName || fallback.yardName,
      yardCode: found.yardCode || fallback.yardCode,
      isDefault: found.password === defaultPasswordForRole(found.role, found.yardCode || fallback.yardCode),
    };
  });
}

export function CredentialsTab() {
  const [credentials, setCredentials] = useState([]);
  const [branches, setBranches] = useState(fallbackBranches);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [visiblePasswords, setVisiblePasswords] = useState({});
  const [editingAccount, setEditingAccount] = useState(null);
  const [newPasswordInput, setNewPasswordInput] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [toastMessage, setToastMessage] = useState("");

  const loadCredentials = async () => {
    setLoading(true);
    const cachedRaw = localStorage.getItem("nippon_credentials_cache");
    const cachedCreds = cachedRaw ? JSON.parse(cachedRaw) : [];
    const defaults = buildDefaultCredentials(yards, branches);

    try {
      const res = await getCredentialsApi();
      if (res?.credentials?.length) {
        const merged = mergeWithDefaults(res.credentials, defaults);
        setCredentials(merged);
        localStorage.setItem("nippon_credentials_cache", JSON.stringify(merged));
      } else {
        const merged = mergeWithDefaults(cachedCreds, defaults);
        setCredentials(merged);
      }
    } catch {
      const merged = mergeWithDefaults(cachedCreds, defaults);
      setCredentials(merged);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    getAdminBranches()
      .then((res) => {
        if (res?.length) setBranches(res);
      })
      .catch(() => {})
      .finally(() => {
        loadCredentials();
      });
  }, []);

  const togglePasswordVisibility = (username) => {
    setVisiblePasswords((prev) => ({
      ...prev,
      [username]: !prev[username],
    }));
  };

  const openEditModal = (account) => {
    setEditingAccount(account);
    setNewPasswordInput(account.password);
  };

  const handleUpdatePassword = async (e) => {
    e.preventDefault();
    if (!newPasswordInput.trim() || !editingAccount) return;
    setIsSubmitting(true);
    const updatedPassword = newPasswordInput.trim();

    const applyLocalUpdate = () => {
      setCredentials((prev) => {
        const updated = prev.map((item) =>
          item.username === editingAccount.username
            ? {
                ...item,
                password: updatedPassword,
                isDefault: updatedPassword === defaultPasswordForRole(item.role, item.yardCode),
              }
            : item
        );
        localStorage.setItem("nippon_credentials_cache", JSON.stringify(updated));
        return updated;
      });
    };

    try {
      await updateCredentialApi(editingAccount.username, updatedPassword);
      applyLocalUpdate();
      setToastMessage("Password updated.");
    } catch {
      applyLocalUpdate();
      setToastMessage("Password saved locally. Sync when back online.");
    } finally {
      setEditingAccount(null);
      setNewPasswordInput("");
      setTimeout(() => setToastMessage(""), 3500);
      setIsSubmitting(false);
    }
  };

  const filteredCredentials = credentials.filter((item) => {
    const matchesRole = roleFilter === "all" || item.role === roleFilter;
    const searchString = `${item.yardCode || ""} ${item.yardName || ""} ${item.yardId || ""} ${item.branchId || ""}`.toLowerCase();
    const matchesSearch = searchString.includes(searchQuery.toLowerCase());
    return matchesRole && matchesSearch;
  });

  const adminAccount = credentials.find((c) => c.role === "admin");
  const yardAccounts = filteredCredentials.filter((c) => c.role === "yard");
  const deliveryAccounts = filteredCredentials.filter((c) => c.role === "delivery_incharge");

  const defaultHint =
    editingAccount?.role === "admin"
      ? `Default is ${ADMIN_DEFAULT_PASSWORD}.`
      : editingAccount?.role === "delivery_incharge"
        ? `Default is ${DELIVERY_DEFAULT_PASSWORD} for all delivery logins.`
        : editingAccount?.yardCode
          ? `Default is the yard code (${editingAccount.yardCode}).`
          : "Keep it short so yard staff can type it on a phone.";

  const placeholder =
    editingAccount?.role === "admin"
      ? "e.g. ADMIN123"
      : editingAccount?.role === "delivery_incharge"
        ? "e.g. delivery123"
        : `e.g. ${editingAccount?.yardCode || "CO01A"}`;

  return (
    <section className="credentials-workspace stack">
      <div className="tab-summary credentials-summary">
        <div className="credentials-summary-copy">
          <strong>Login passwords</strong>
          <span className="tab-summary-hint">
            Staff pick their role and location on the sign-in screen, then enter the password shown here.
          </span>
        </div>
        <button
          type="button"
          className="action-icon-btn"
          onClick={loadCredentials}
          title="Refresh passwords"
          aria-label="Refresh passwords"
        >
          <span className="material-symbols-outlined">refresh</span>
        </button>
      </div>

      {toastMessage && <div className="notice ok">{toastMessage}</div>}

      <div className="controls-row credentials-controls">
        <div className="search-row inline-search">
          <span className="material-symbols-outlined">search</span>
          <input
            className="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search yard code or name…"
            aria-label="Search passwords"
          />
        </div>
        <div className="segmented" role="tablist" aria-label="Filter by role">
          <button
            type="button"
            className={roleFilter === "all" ? "active" : ""}
            onClick={() => setRoleFilter("all")}
          >
            All ({credentials.length})
          </button>
          <button
            type="button"
            className={roleFilter === "yard" ? "active" : ""}
            onClick={() => setRoleFilter("yard")}
          >
            Yards ({credentials.filter((c) => c.role === "yard").length})
          </button>
          <button
            type="button"
            className={roleFilter === "delivery_incharge" ? "active" : ""}
            onClick={() => setRoleFilter("delivery_incharge")}
          >
            Delivery ({credentials.filter((c) => c.role === "delivery_incharge").length})
          </button>
          <button
            type="button"
            className={roleFilter === "admin" ? "active" : ""}
            onClick={() => setRoleFilter("admin")}
          >
            Admin
          </button>
        </div>
      </div>

      {adminAccount && (roleFilter === "all" || roleFilter === "admin") && !searchQuery && (
        <div className="admin-cred-spotlight">
          <div className="cred-spotlight-header">
            <div className="cred-icon-badge admin">
              <span className="material-symbols-outlined">shield_person</span>
            </div>
            <div>
              <h3>Admin login</h3>
              <small className="cred-login-hint">Sign-in screen → Admin role → password below</small>
            </div>
          </div>

          <div className="cred-field-box">
            <label className="cred-label">Password</label>
            <div className="cred-password-row">
              <input
                type={visiblePasswords[adminAccount.username] ? "text" : "password"}
                value={adminAccount.password}
                readOnly
                className="cred-password-input"
                aria-label="Admin password"
              />
              <button
                type="button"
                className="icon-btn-inline"
                onClick={() => togglePasswordVisibility(adminAccount.username)}
                title={visiblePasswords[adminAccount.username] ? "Hide password" : "Show password"}
                aria-label={visiblePasswords[adminAccount.username] ? "Hide password" : "Show password"}
              >
                <span className="material-symbols-outlined">
                  {visiblePasswords[adminAccount.username] ? "visibility_off" : "visibility"}
                </span>
              </button>
              <button
                type="button"
                className="primary cred-edit-btn"
                onClick={() => openEditModal(adminAccount)}
              >
                Change password
              </button>
            </div>
            <small className="field-hint">Default: {ADMIN_DEFAULT_PASSWORD}</small>
          </div>
        </div>
      )}

      {(roleFilter === "all" || roleFilter === "delivery_incharge") && !searchQuery && deliveryAccounts.length > 0 && (
        <>
          <div className="tab-summary">
            <strong>Delivery logins</strong>
            <span className="tab-summary-hint">
              Each branch has its own sign-in location. Default password is {DELIVERY_DEFAULT_PASSWORD} unless changed.
            </span>
          </div>
          <div className="cred-card-grid">
            {deliveryAccounts.map((account) => {
              const isVisible = visiblePasswords[account.username];
              return (
                <div key={account.username} className="cred-card">
                  <div className="cred-card-top">
                    <div className="cred-card-title">
                      <span className="material-symbols-outlined cred-card-icon">local_shipping</span>
                      <div>
                        <strong>{account.yardName}</strong>
                        <small className="cred-yard-code">Delivery branch</small>
                      </div>
                    </div>
                    <span className={`pill ${account.isDefault ? "neutral" : "ok"}`}>
                      {account.isDefault ? "Default" : "Custom"}
                    </span>
                  </div>

                  <div className="cred-card-body">
                    <div className="cred-meta">
                      <span className="cred-meta-label">Sign-in password</span>
                      <div className="cred-password-wrapper">
                        <span className="cred-password-text">
                          {isVisible ? account.password : "••••••••••••"}
                        </span>
                        <button
                          type="button"
                          className="icon-btn-tiny"
                          onClick={() => togglePasswordVisibility(account.username)}
                          title={isVisible ? "Hide password" : "Show password"}
                          aria-label={isVisible ? "Hide password" : "Show password"}
                        >
                          <span className="material-symbols-outlined">
                            {isVisible ? "visibility_off" : "visibility"}
                          </span>
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="cred-card-footer">
                    <button type="button" className="cred-card-btn" onClick={() => openEditModal(account)}>
                      <span className="material-symbols-outlined">key</span>
                      <span>Change password</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {(roleFilter === "all" || roleFilter === "yard") && (
        <>
          <div className="tab-summary">
            <strong>Yard logins</strong>
            <span className="tab-summary-hint">
              Showing {yardAccounts.length} yard{yardAccounts.length === 1 ? "" : "s"}. Default password matches the yard code (e.g. CO01A).
            </span>
          </div>

          {loading ? (
            <div className="notice info">Loading accounts…</div>
          ) : yardAccounts.length === 0 ? (
            <div className="no-results modal-no-results">
              <span className="material-symbols-outlined">key_off</span>
              <p>No yard accounts match this search.</p>
            </div>
          ) : (
            <div className="cred-card-grid">
              {yardAccounts.map((account) => {
                const isVisible = visiblePasswords[account.username];
                return (
                  <div key={account.username} className="cred-card">
                    <div className="cred-card-top">
                      <div className="cred-card-title">
                        <span className="material-symbols-outlined cred-card-icon">warehouse</span>
                        <div>
                          <strong>{account.yardName}</strong>
                          <small className="cred-yard-code">{account.yardCode || account.yardId}</small>
                        </div>
                      </div>
                      <span className={`pill ${account.isDefault ? "neutral" : "ok"}`}>
                        {account.isDefault ? "Default" : "Custom"}
                      </span>
                    </div>

                    <div className="cred-card-body">
                      <div className="cred-meta">
                        <span className="cred-meta-label">Sign-in password</span>
                        <div className="cred-password-wrapper">
                          <span className="cred-password-text">
                            {isVisible ? account.password : "••••••••••••"}
                          </span>
                          <button
                            type="button"
                            className="icon-btn-tiny"
                            onClick={() => togglePasswordVisibility(account.username)}
                            title={isVisible ? "Hide password" : "Show password"}
                            aria-label={isVisible ? "Hide password" : "Show password"}
                          >
                            <span className="material-symbols-outlined">
                              {isVisible ? "visibility_off" : "visibility"}
                            </span>
                          </button>
                        </div>
                      </div>
                    </div>

                    <div className="cred-card-footer">
                      <button type="button" className="cred-card-btn" onClick={() => openEditModal(account)}>
                        <span className="material-symbols-outlined">key</span>
                        <span>Change password</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {editingAccount && (
        <div className="modal-overlay" onClick={() => setEditingAccount(null)} aria-modal="true" role="dialog">
          <div className="modal-content cred-modal-card" onClick={(e) => e.stopPropagation()}>
            <header className="cred-modal-header">
              <div className="cred-modal-title">
                <span className="cred-modal-eyebrow">
                  {editingAccount.role === "admin"
                    ? "Admin"
                    : editingAccount.role === "delivery_incharge"
                      ? "Delivery"
                      : editingAccount.yardCode || "Yard"}
                </span>
                <h2>Change password</h2>
              </div>
              <button
                type="button"
                className="close-modal-btn"
                onClick={() => setEditingAccount(null)}
                aria-label="Close dialog"
              >
                <span className="material-symbols-outlined">close</span>
              </button>
            </header>

            <form onSubmit={handleUpdatePassword} className="cred-modal-form">
              <div className="cred-modal-body">
                <div className="cred-modal-field">
                  <span className="cred-modal-label">Account</span>
                  <p className="cred-modal-account-value">
                    {editingAccount.role === "admin"
                      ? "Admin console"
                      : editingAccount.role === "delivery_incharge"
                        ? `Delivery · ${editingAccount.yardName}`
                        : `${editingAccount.yardCode || editingAccount.yardId} · ${editingAccount.yardName}`}
                  </p>
                </div>

                <div className="cred-modal-field">
                  <label className="cred-modal-label" htmlFor="cred-new-password">
                    New password
                  </label>
                  <input
                    id="cred-new-password"
                    type="text"
                    className="cred-modal-input"
                    value={newPasswordInput}
                    onChange={(e) => setNewPasswordInput(e.target.value)}
                    placeholder={placeholder}
                    required
                    autoFocus
                    autoComplete="off"
                    spellCheck={false}
                  />
                  <p className="cred-modal-hint">{defaultHint}</p>
                </div>
              </div>

              <footer className="cred-modal-footer">
                <button type="button" className="cred-modal-cancel" onClick={() => setEditingAccount(null)}>
                  Cancel
                </button>
                <button
                  type="submit"
                  className="primary cred-modal-save"
                  disabled={isSubmitting || !newPasswordInput.trim()}
                >
                  {isSubmitting ? "Saving…" : "Save password"}
                </button>
              </footer>
            </form>
          </div>
        </div>
      )}
    </section>
  );
}
