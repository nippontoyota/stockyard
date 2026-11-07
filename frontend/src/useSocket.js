import { useEffect, useRef } from 'react';
import { io } from 'socket.io-client';

const API_BASE = import.meta.env.VITE_API_URL || 'https://stockyard-api-xvaa.onrender.com';
const REFRESH_DEBOUNCE_MS = 750;
const DISCONNECT_POLL_MS = 60_000;

export function useSocket(onDataChange, enabled = true) {
  const heartbeatRef = useRef(null);
  const debounceRef = useRef(null);
  const onDataChangeRef = useRef(onDataChange);
  onDataChangeRef.current = onDataChange;

  useEffect(() => {
    if (!enabled || !onDataChange) return;

    let forceRefresh = false;
    const refresh = (force = false) => {
      forceRefresh = forceRefresh || force;
      clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        onDataChangeRef.current?.({ force: forceRefresh });
        forceRefresh = false;
      }, REFRESH_DEBOUNCE_MS);
    };

    const socket = io(API_BASE, {
      transports: ['polling', 'websocket'],
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 10000,
      timeout: 20000,
    });

    const events = ['scan:new', 'flag:created', 'requisition:changed', 'pdi:changed'];
    const listeners = events.map(event => [event, () => refresh(event === 'pdi:changed')]);
    for (const [event, listener] of listeners) socket.on(event, listener);

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
      for (const [event, listener] of listeners) socket.off(event, listener);
      socket.removeAllListeners();
      socket.disconnect();
      clearInterval(heartbeatRef.current);
      clearTimeout(debounceRef.current);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [enabled, !!onDataChange]);
}
