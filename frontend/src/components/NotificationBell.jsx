import React, { useState, useRef, useEffect } from "react";
import { markNotificationRead, markAllNotificationsRead } from "../api.js";

export function NotificationBell({ notifications = [], onNavigate }) {
  const [open, setOpen] = useState(false);
  const unreadCount = notifications.filter((n) => !n.read).length;
  const panelRef = useRef(null);

  useEffect(() => {
    function handleClickOutside(event) {
      if (panelRef.current && !panelRef.current.contains(event.target)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener("mousedown", handleClickOutside);
    else document.removeEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  async function handleMarkRead(id) {
    try {
      await markNotificationRead(id);
    } catch (err) {
      console.error(err);
    }
  }

  async function handleMarkAllRead() {
    try {
      await markAllNotificationsRead();
      setOpen(false);
    } catch (err) {
      console.error(err);
    }
  }

  async function handleItemClick(n) {
    if (!n.read) await handleMarkRead(n.id);
    if (n.type?.startsWith("requisition") && onNavigate) {
      onNavigate("requisitions");
      setOpen(false);
    }
  }

  return (
    <div className="dropdown-container" ref={panelRef}>
      <button
        className="icon-btn relative"
        onClick={() => setOpen(!open)}
        aria-label="Notifications"
      >
        <span className="material-symbols-outlined">notifications</span>
        {unreadCount > 0 && <span className="badge">{unreadCount > 9 ? "9+" : unreadCount}</span>}
      </button>

      {open && (
        <div className="dropdown-panel notifications-panel">
          <div className="dropdown-header">
            <strong>Notifications</strong>
            {unreadCount > 0 && (
              <button className="text-btn small" onClick={handleMarkAllRead}>Mark all read</button>
            )}
          </div>
          <div className="dropdown-content">
            {notifications.length === 0 ? (
              <div className="p-md text-center muted">No new notifications</div>
            ) : (
              <ul className="notif-list">
                {notifications.map((n) => (
                  <li
                    key={n.id}
                    className={`notif-item ${!n.read ? "unread" : ""}`}
                    onClick={() => handleItemClick(n)}
                  >
                    <div className="notif-text">
                      <p>{n.message}</p>
                      <small className="muted">{new Date(n.created_at).toLocaleString()}</small>
                    </div>
                    {!n.read && <span className="unread-dot"></span>}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
