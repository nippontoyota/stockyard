import React, { useState, useEffect } from "react";
import { yards } from "../stockyardLogic.js";
import { getCredentialsApi, updateCredentialApi } from "../api.js";

export function CredentialsTab() {
  const [credentials, setCredentials] = useState([]);
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

    try {
      const res = await getCredentialsApi();
      if (res && res.credentials) {
        setCredentials(res.credentials);
        localStorage.setItem("nippon_credentials_cache", JSON.stringify(res.credentials));
      } else {
        // Fallback default list from static yards array
        const defaultList = [
          {
            username: "ADMIN123@nippon.com",
            password: "ADMIN123@nippon.com",
            role: "admin",
            yardId: null,
            yardName: "System Administrator",
            isDefault: true,
          },
          ...yards.map((y) => ({
            username: `${y.id}@nippon.com`,
            password: `${y.id}@nippon.com`,
            role: "yard",
            yardId: y.id,
            yardName: y.name,
            isDefault: true,
          })),
        ];
        const mergedList = defaultList.map((d) => {
          const found = cachedCreds.find((c) => c.username === d.username);
          return found ? { ...d, password: found.password, isDefault: found.password === d.username } : d;
        });
        setCredentials(mergedList);
      }
    } catch (err) {
      // Offline / fallback fallback populate
      const fallbackList = [
        {
          username: "ADMIN123@nippon.com",
          password: "ADMIN123@nippon.com",
          role: "admin",
          yardId: null,
          yardName: "System Administrator",
          isDefault: true,
        },
        ...yards.map((y) => ({
          username: `${y.id}@nippon.com`,
          password: `${y.id}@nippon.com`,
          role: "yard",
          yardId: y.id,
          yardName: y.name,
          isDefault: true,
        })),
      ];
      const mergedList = fallbackList.map((d) => {
        const found = cachedCreds.find((c) => c.username === d.username);
        return found ? { ...d, password: found.password, isDefault: found.password === d.username } : d;
      });
      setCredentials(mergedList);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCredentials();
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
            ? { ...item, password: updatedPassword, isDefault: updatedPassword === item.username }
            : item
        );
        localStorage.setItem("nippon_credentials_cache", JSON.stringify(updated));
        return updated;
      });
    };

    try {
      await updateCredentialApi(editingAccount.username, updatedPassword);
      applyLocalUpdate();
      setToastMessage(`Password updated successfully!`);
    } catch (err) {
      applyLocalUpdate();
      setToastMessage(`Password updated locally.`);
    } finally {
      setEditingAccount(null);
      setNewPasswordInput("");
      setTimeout(() => setToastMessage(""), 3500);
      setIsSubmitting(false);
    }
  };

  const filteredCredentials = credentials.filter((item) => {
    const matchesRole = roleFilter === "all" || item.role === roleFilter;
    const searchString = `${item.username} ${item.yardName || ""} ${item.yardId || ""}`.toLowerCase();
    const matchesSearch = searchString.includes(searchQuery.toLowerCase());
    return matchesRole && matchesSearch;
  });

  const adminAccount = credentials.find((c) => c.role === "admin");
  const yardAccounts = filteredCredentials.filter((c) => c.role !== "admin");

  return (
    <section className="credentials-workspace stack">
      <div className="tab-summary">
        <div>
          <span className="eyebrow">Access & Credentials Management</span>
          <strong style={{ fontSize: "1.2rem", display: "block", marginTop: "4px" }}>
            Stockyard & Admin Login Passwords
          </strong>
        </div>
        <button
          type="button"
          className="action-icon-btn"
          onClick={loadCredentials}
          title="Refresh Credentials List"
          aria-label="Refresh Credentials"
        >
          <span className="material-symbols-outlined">refresh</span>
        </button>
      </div>

      {toastMessage && <div className="notice ok">{toastMessage}</div>}

      {/* Control / Filter Bar */}
      <div className="modal-controls credentials-controls">
          <div className="search-row modal-search">
            <span className="material-symbols-outlined">search</span>
            <input
              className="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search stockyard by code (e.g. CO01A) or name..."
            />
          </div>
        <div className="segmented">
          <button
            type="button"
            className={roleFilter === "all" ? "active" : ""}
            onClick={() => setRoleFilter("all")}
          >
            All Accounts ({credentials.length})
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
            className={roleFilter === "admin" ? "active" : ""}
            onClick={() => setRoleFilter("admin")}
          >
            Admin ({credentials.filter((c) => c.role === "admin").length})
          </button>
        </div>
      </div>

      {/* Admin Account Card Spotlight */}
      {adminAccount && (roleFilter === "all" || roleFilter === "admin") && !searchQuery && (
        <div className="admin-cred-spotlight">
          <div className="cred-spotlight-header">
            <div className="cred-icon-badge admin">
              <span className="material-symbols-outlined">shield_person</span>
            </div>
            <div>
              <span className="eyebrow">Executive Access</span>
              <h3>System Administrator Account</h3>
              <small className="cred-email">{adminAccount.username}</small>
            </div>
          </div>

          <div className="cred-field-box">
            <label className="cred-label">Admin Password</label>
            <div className="cred-password-row">
              <input
                type={visiblePasswords[adminAccount.username] ? "text" : "password"}
                value={adminAccount.password}
                readOnly
                className="cred-password-input"
              />
              <button
                type="button"
                className="icon-btn-inline"
                onClick={() => togglePasswordVisibility(adminAccount.username)}
                title={visiblePasswords[adminAccount.username] ? "Hide Password" : "Show Password"}
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
                Change Admin Password
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Stockyard Account Grid */}
      <div className="tab-summary">
        <span className="eyebrow">Stockyard Worker Credentials</span>
        <span>Showing {yardAccounts.length} yard account{yardAccounts.length === 1 ? "" : "s"}</span>
      </div>

      {loading ? (
        <div className="notice info">Loading credential accounts...</div>
      ) : yardAccounts.length === 0 ? (
        <div className="no-results modal-no-results">
          <span className="material-symbols-outlined">key_off</span>
          <p>No accounts match your search filter.</p>
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
                      <small className="cred-yard-code">{account.yardId || "Yard"}</small>
                    </div>
                  </div>
                  <span className={`pill ${account.isDefault ? "neutral" : "ok"}`}>
                    {account.isDefault ? "Default Password" : "Custom Password"}
                  </span>
                </div>

                <div className="cred-card-body">
                  <div className="cred-meta">
                    <span className="cred-meta-label">Login Account:</span>
                    <span className="cred-meta-val">{account.username}</span>
                  </div>

                  <div className="cred-meta">
                    <span className="cred-meta-label">Password:</span>
                    <div className="cred-password-wrapper">
                      <span className="cred-password-text">
                        {isVisible ? account.password : "••••••••••••"}
                      </span>
                      <button
                        type="button"
                        className="icon-btn-tiny"
                        onClick={() => togglePasswordVisibility(account.username)}
                        title={isVisible ? "Hide Password" : "Show Password"}
                      >
                        <span className="material-symbols-outlined">
                          {isVisible ? "visibility_off" : "visibility"}
                        </span>
                      </button>
                    </div>
                  </div>
                </div>

                <div className="cred-card-footer">
                  <button
                    type="button"
                    className="cred-card-btn"
                    onClick={() => openEditModal(account)}
                  >
                    <span className="material-symbols-outlined">edit_key</span>
                    <span>Edit Password</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Edit Password Modal */}
      {editingAccount && (
        <div className="modal-overlay" onClick={() => setEditingAccount(null)} aria-modal="true" role="dialog">
          <div className="modal-content cred-modal-card" onClick={(e) => e.stopPropagation()}>
            <header className="modal-header">
              <div>
                <span className="eyebrow">{editingAccount.role === "admin" ? "ADMIN ACCOUNT" : editingAccount.yardId}</span>
                <h2>Edit Account Password</h2>
              </div>
              <button
                className="close-modal-btn"
                onClick={() => setEditingAccount(null)}
                aria-label="Close dialog"
              >
                <span className="material-symbols-outlined">close</span>
              </button>
            </header>

            <form onSubmit={handleUpdatePassword} className="modal-body stack">
              <div className="field-group">
                <label className="field-label">Stockyard Account / Role</label>
                <input
                  className="input-disabled"
                  value={editingAccount.yardName ? `${editingAccount.yardId || "Yard"} · ${editingAccount.yardName}` : "System Administrator"}
                  readOnly
                  disabled
                />
              </div>

              <div className="field-group">
                <label className="field-label">New Password</label>
                <input
                  type="text"
                  className="search modal-input"
                  value={newPasswordInput}
                  onChange={(e) => setNewPasswordInput(e.target.value)}
                  placeholder="Enter new password (e.g. CO01A@nippon.com)"
                  required
                  autoFocus
                />
                <small className="field-hint">
                  Password format for worker stockyard accounts should be simple and easy for workers to enter on mobile.
                </small>
              </div>

              <div className="modal-footer" style={{ padding: 0, marginTop: "1rem" }}>
                <button
                  type="button"
                  className="secondary"
                  onClick={() => setEditingAccount(null)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="primary"
                  disabled={isSubmitting || !newPasswordInput.trim()}
                >
                  {isSubmitting ? "Updating..." : "Save New Password"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </section>
  );
}
