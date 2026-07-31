import { Server as SocketServer } from 'socket.io';
import type { Server as HttpServer } from 'http';
import { notifyAdmins } from './webPush.js';

let io: SocketServer | null = null;

export function initSocket(httpServer: HttpServer): SocketServer {
  io = new SocketServer(httpServer, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST'],
    },
    transports: ['polling', 'websocket'],
    pingTimeout: 60000,
    pingInterval: 25000,
  });

  io.on('connection', (socket) => {
    console.log(`[ws] client connected: ${socket.id}`);
    socket.on('disconnect', () => {
      console.log(`[ws] client disconnected: ${socket.id}`);
    });
  });

  return io;
}

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

export function emitFlagEvent(data: {
  id: string;
  vehicleId: string;
  vin: string;
  flagType: string;
  message: string;
}) {
  if (io) io.emit('flag:created', data);

  const filter = data.flagType === 'damage_reported' ? 'damage' : 'exceptions';
  void notifyAdmins({
    title: 'New flag needs attention',
    body: `${data.vin}: ${data.message}`,
    url: `/dashboard?section=attention&filter=${filter}`,
  });
}

export function emitRequisitionEvent() {
  if (io) io.emit('requisition:changed');
}
