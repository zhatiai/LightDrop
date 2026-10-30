import { WebSocketServer, WebSocket } from 'ws';
import { IncomingMessage, Server } from 'http';
import { WsEventType, WsMessage, PeerInfo, P2PDirectMessage } from '../../shared/types.js';

export class WsService {
  private wss: WebSocketServer | null = null;
  private clients: Set<WebSocket> = new Set();
  // 维护在线 P2P 节点映射：deviceId -> { ws, info }
  private peers: Map<string, { ws: WebSocket; info: PeerInfo }> = new Map();

  public init(server: Server): void {
    this.wss = new WebSocketServer({ server, path: '/ws' });

    this.wss.on('connection', (ws: WebSocket, req: IncomingMessage) => {
      this.clients.add(ws);
      this.broadcastOnlineCount();

      // 获取当前客户端真实 IP
      let clientIp = req.socket.remoteAddress || '';
      if (clientIp.startsWith('::ffff:')) {
        clientIp = clientIp.replace('::ffff:', '');
      }

      // 定期保活 Ping-Pong
      (ws as any).isAlive = true;
      ws.on('pong', () => {
        (ws as any).isAlive = true;
      });

      // 监听客户端上行消息（P2P 注册、状态同步、点对点单播转发）
      ws.on('message', (data: Buffer | string) => {
        try {
          const msg = JSON.parse(data.toString());
          this.handleClientMessage(ws, msg, clientIp);
        } catch (err) {
          // 忽略非法 JSON，杜绝恶意格式导致异常
        }
      });

      ws.on('close', () => {
        this.handleClientDisconnect(ws);
      });

      ws.on('error', (err) => {
        console.warn('[WebSocket] Client error:', err);
        this.handleClientDisconnect(ws);
      });
    });

    // 30 秒心跳检测
    const interval = setInterval(() => {
      this.clients.forEach((ws) => {
        if ((ws as any).isAlive === false) {
          this.handleClientDisconnect(ws);
          return ws.terminate();
        }
        (ws as any).isAlive = false;
        ws.ping();
      });
    }, 30000);

    this.wss.on('close', () => {
      clearInterval(interval);
    });
  }

  /**
   * 处理客户端上行消息
   */
  private handleClientMessage(ws: WebSocket, msg: any, clientIp: string): void {
    if (!msg || typeof msg !== 'object') return;

    const { type, payload } = msg;

    if (type === 'PEER_REGISTER' && payload && payload.deviceId) {
      // 客户端声明身份并注册
      const peerInfo: PeerInfo = {
        deviceId: payload.deviceId,
        nickname: payload.nickname || 'Unknown',
        os: payload.os || 'unknown',
        browser: payload.browser,
        clientIp,
        isReceiveMode: Boolean(payload.isReceiveMode),
        avatarEmoji: payload.avatarEmoji,
        avatarColor: payload.avatarColor,
        connectedAt: new Date().toISOString(),
      };

      (ws as any).deviceId = peerInfo.deviceId;
      this.peers.set(peerInfo.deviceId, { ws, info: peerInfo });

      // 1. 仅向当前新注册客户端下发当前所有在线节点（排除自身，节约全网带宽）
      const onlineList: PeerInfo[] = [];
      this.peers.forEach((val, id) => {
        if (id !== peerInfo.deviceId && val.ws.readyState === WebSocket.OPEN) {
          onlineList.push(val.info);
        }
      });

      this.sendToSocket(ws, 'PEER_ONLINE_LIST', onlineList);

      // 2. 向其他在线节点轻量通知新节点加入 (单条增量广播，杜绝高频组播)
      this.broadcastExcept(ws, 'PEER_JOINED', peerInfo);
    } else if (type === 'PEER_UPDATE' && payload && payload.deviceId) {
      // 节点状态变更（如进入接收模式或修改昵称）
      const existing = this.peers.get(payload.deviceId);
      if (existing) {
        existing.info = {
          ...existing.info,
          ...payload,
          clientIp, // 保持最新 IP
        };
        // 轻量增量通知其他客户端该节点状态更新
        this.broadcastExcept(ws, 'PEER_UPDATED', existing.info);
      }
    } else if (type === 'P2P_DIRECT_MESSAGE' && payload && payload.targetDeviceId) {
      // P2P 单播消息 (握手请求、握手应答、WebRTC 信令、降级中继)
      // 绝对单播投递：仅精确转发给目标节点，不触碰任何其他无关节点！
      const target = this.peers.get(payload.targetDeviceId);
      if (target && target.ws.readyState === WebSocket.OPEN) {
        this.sendToSocket(target.ws, 'P2P_DIRECT_MESSAGE', payload);
      } else {
        // 目标离线，仅回传给发起方提示目标不在线
        this.sendToSocket(ws, 'P2P_DIRECT_MESSAGE', {
          messageType: 'HANDSHAKE_RESPONSE',
          targetDeviceId: payload.senderDeviceId,
          senderDeviceId: payload.targetDeviceId,
          payload: {
            transferId: payload.payload?.transferId || '',
            accepted: false,
            reason: 'offline',
            timestamp: new Date().toISOString(),
          },
        });
      }
    }
  }

  /**
   * 客户端断开处理
   */
  private handleClientDisconnect(ws: WebSocket): void {
    const deviceId = (ws as any).deviceId;
    this.clients.delete(ws);

    if (deviceId && this.peers.has(deviceId)) {
      const entry = this.peers.get(deviceId);
      // 只有断开的连接属于当前记录的 ws 才移除，防止多标签页重连误删
      if (entry && entry.ws === ws) {
        this.peers.delete(deviceId);
        // 轻量通知其他节点：该节点已离开
        this.broadcast('PEER_LEFT', { deviceId });
      }
    }

    this.broadcastOnlineCount();
  }

  /**
   * 向指定 WebSocket 单发消息
   */
  public sendToSocket<T = any>(ws: WebSocket, type: WsEventType, payload: T): void {
    if (ws.readyState === WebSocket.OPEN) {
      const message: WsMessage<T> = {
        type,
        payload,
        timestamp: new Date().toISOString(),
      };
      try {
        ws.send(JSON.stringify(message));
      } catch (err) {
        console.warn('[WebSocket] Direct send failed:', err);
      }
    }
  }

  public getOnlineCount(): number {
    return this.clients.size;
  }

  /**
   * 广播给除指定 socket 之外的所有客户端
   */
  public broadcastExcept<T = any>(exceptWs: WebSocket, type: WsEventType, payload: T): void {
    const message: WsMessage<T> = {
      type,
      payload,
      timestamp: new Date().toISOString(),
    };
    const data = JSON.stringify(message);

    this.clients.forEach((client) => {
      if (client !== exceptWs && client.readyState === WebSocket.OPEN) {
        try {
          client.send(data);
        } catch (e) {
          console.warn('[WebSocket] Broadcast except send failed:', e);
        }
      }
    });
  }

  public broadcast<T = any>(type: WsEventType, payload: T): void {
    const message: WsMessage<T> = {
      type,
      payload,
      timestamp: new Date().toISOString(),
    };
    const data = JSON.stringify(message);

    this.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        try {
          client.send(data);
        } catch (e) {
          console.warn('[WebSocket] Send failed:', e);
        }
      }
    });
  }

  public broadcastOnlineCount(): void {
    this.broadcast('ONLINE_COUNT_CHANGED', {
      onlineUsers: this.getOnlineCount(),
    });
  }

  public stop(): void {
    if (this.wss) {
      this.clients.forEach((client) => {
        try {
          client.terminate();
        } catch (_) {}
      });
      this.clients.clear();
      this.peers.clear();
      try {
        this.wss.close();
      } catch (_) {}
      this.wss = null;
    }
  }
}

export const wsService = new WsService();
