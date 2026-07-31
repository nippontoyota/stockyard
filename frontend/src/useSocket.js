import { useEffect, useRef } from 'react';
import { io } from 'socket.io-client';

const API_BASE = import.meta.env.VITE_API_URL || 'https://stockyard-00s6.onrender.com';

/**
 * §1.1 — WebSocket hook. Replaces 5s polling with event-driven updates.
 * Falls back to 30s heartbeat poll if Socket.IO disconnects.
 */
export function useSocket(onDataChange, enabled = true) {
  const socketRef = useRef(null);
  const heartbeatRef = useRef(null);
  const onDataChangeRef = useRef(onDataChange);
  onDataChangeRef.current = onDataChange;

  useEffect(() => {
    if (!enabled || !onDataChange) return;

    const refresh = () => onDataChangeRef.current?.();

    const socket = io(API_BASE, {
      // Polling first — Render's proxy handles long-polling reliably; upgrade to WS when possible.
      transports: ['polling', 'websocket'],
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 10000,
      timeout: 20000,
    });
    socketRef.current = socket;

    const events = ['scan:new', 'flag:created', 'vehicle:status-changed', 'requisition:changed'];
    for (const event of events) socket.on(event, refresh);

    socket.on('connect', () => {
      clearInterval(heartbeatRef.current);
      heartbeatRef.current = setInterval(refresh, 30000);
    });

    socket.on('disconnect', () => {
      clearInterval(heartbeatRef.current);
      heartbeatRef.current = setInterval(refresh, 10000);
    });

    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        if (!socket.connected) socket.connect();
        refresh();
      }
    };
    document.addEventListener('visibilitychange', onVisibility);

    heartbeatRef.current = setInterval(refresh, 30000);

    return () => {
      for (const event of events) socket.off(event, refresh);
      socket.removeAllListeners();
      socket.disconnect();
      clearInterval(heartbeatRef.current);
      document.removeEventListener('visibilitychange', onVisibility);
      socketRef.current = null;
    };
  }, [enabled, !!onDataChange]);

  return socketRef;
}
