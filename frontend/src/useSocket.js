import { useEffect, useRef } from 'react';
import { io } from 'socket.io-client';

const API_BASE = import.meta.env.VITE_API_URL || 'https://stockyard-00s6.onrender.com';

export function useSocket(onDataChange, enabled = true) {
  const heartbeatRef = useRef(null);
  const onDataChangeRef = useRef(onDataChange);
  onDataChangeRef.current = onDataChange;

  useEffect(() => {
    if (!enabled || !onDataChange) return;

    const refresh = () => onDataChangeRef.current?.();

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
      heartbeatRef.current = setInterval(refresh, 10000);
    });

    socket.on('connect', () => {
      clearInterval(heartbeatRef.current);
      heartbeatRef.current = null;
    });

    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        if (!socket.connected) socket.connect();
        refresh();
      }
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      for (const event of events) socket.off(event, refresh);
      socket.removeAllListeners();
      socket.disconnect();
      clearInterval(heartbeatRef.current);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [enabled, !!onDataChange]);
}
