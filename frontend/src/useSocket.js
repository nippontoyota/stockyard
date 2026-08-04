import { useEffect, useRef } from 'react';
import { io } from 'socket.io-client';

const API_BASE = import.meta.env.VITE_API_URL || 'https://stockyard-api-xvaa.onrender.com';
const REFRESH_DEBOUNCE_MS = 750;
const DISCONNECT_POLL_MS = 30_000;

export function useSocket(onDataChange, enabled = true) {
  const heartbeatRef = useRef(null);
  const debounceRef = useRef(null);
  const onDataChangeRef = useRef(onDataChange);
  onDataChangeRef.current = onDataChange;

  useEffect(() => {
    if (!enabled || !onDataChange) return;

    const refresh = () => {
      clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        onDataChangeRef.current?.();
      }, REFRESH_DEBOUNCE_MS);
    };

    const socket = io(API_BASE, {
      transports: ['polling', 'websocket'],
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 10000,
      timeout: 20000,
    });

    const events = ['scan:new', 'flag:created', 'requisition:changed'];
    for (const event of events) socket.on(event, refresh);

    socket.on('disconnect', () => {
      clearInterval(heartbeatRef.current);
      // Slow poll while offline from socket — avoid a full sync storm every 10s.
      heartbeatRef.current = setInterval(refresh, DISCONNECT_POLL_MS);
    });

    socket.on('connect', () => {
      clearInterval(heartbeatRef.current);
      heartbeatRef.current = null;
    });

    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        if (!socket.connected) socket.connect();
        // Parent already refreshes on visibility; only reconnect here.
      }
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      for (const event of events) socket.off(event, refresh);
      socket.removeAllListeners();
      socket.disconnect();
      clearInterval(heartbeatRef.current);
      clearTimeout(debounceRef.current);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [enabled, !!onDataChange]);
}
