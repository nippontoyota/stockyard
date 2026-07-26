import { useEffect, useRef } from 'react';
import { io } from 'socket.io-client';

const API_BASE = import.meta.env.VITE_API_URL || 'https://stockyard-00s6.onrender.com';

/**
 * §1.1 — WebSocket hook. Replaces 5s polling with event-driven updates.
 * Falls back to 30s heartbeat poll if WebSocket disconnects.
 */
export function useSocket(onDataChange) {
  const socketRef = useRef(null);
  const heartbeatRef = useRef(null);

  useEffect(() => {
    if (!onDataChange) return;

    const socket = io(API_BASE, {
      transports: ['websocket', 'polling'],
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 10000,
    });
    socketRef.current = socket;

    // Real-time events trigger data refresh
    socket.on('scan:new', () => onDataChange());
    socket.on('flag:created', () => onDataChange());
    socket.on('vehicle:status-changed', () => onDataChange());

    socket.on('connect', () => {
      // Connected via WebSocket — drop heartbeat to 30s
      clearInterval(heartbeatRef.current);
      heartbeatRef.current = setInterval(onDataChange, 30000);
    });

    socket.on('disconnect', () => {
      // Disconnected — increase heartbeat frequency
      clearInterval(heartbeatRef.current);
      heartbeatRef.current = setInterval(onDataChange, 10000);
    });

    // Reconnect on tab focus
    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        if (!socket.connected) socket.connect();
        onDataChange();
      }
    };
    document.addEventListener('visibilitychange', onVisibility);

    // Initial heartbeat
    heartbeatRef.current = setInterval(onDataChange, 30000);

    return () => {
      socket.disconnect();
      clearInterval(heartbeatRef.current);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [onDataChange]);

  return socketRef;
}
