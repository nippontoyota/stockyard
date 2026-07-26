import { Server as SocketServer } from 'socket.io';
import type { Server as HttpServer } from 'http';

let io: SocketServer | null = null;

export function initSocket(httpServer: HttpServer): SocketServer {
  io = new SocketServer(httpServer, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST'],
    },
    transports: ['websocket', 'polling'],
  });

  io.on('connection', (socket) => {
    console.log(`[ws] client connected: ${socket.id}`);
    socket.on('disconnect', () => {
      console.log(`[ws] client disconnected: ${socket.id}`);
    });
  });

  return io;
}

export function getIO(): SocketServer {
  if (!io) throw new Error('Socket.io not initialized — call initSocket first');
  return io;
}

/** Emit a scan event to all connected clients */
export function emitScanEvent(data: {
  type: 'in' | 'out';
  vin: string;
  model: string | null;
  yardId: string;
  yardName?: string;
  timestamp: string;
  flagType?: string;
  status: string;
}) {
  if (io) io.emit('scan:new', data);
}

/** Emit a flag event */
export function emitFlagEvent(data: {
  id: string;
  vehicleId: string;
  vin: string;
  flagType: string;
  message: string;
}) {
  if (io) io.emit('flag:created', data);
}

/** Emit vehicle status change */
export function emitVehicleStatusChange(data: {
  vin: string;
  status: string;
  yardId: string | null;
}) {
  if (io) io.emit('vehicle:status-changed', data);
}
