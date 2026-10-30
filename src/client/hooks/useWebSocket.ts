import { useEffect, useRef, useState, useCallback } from 'react';
import { WsEventType, WsMessage } from '@shared/types';
import { getLocalPeerInfo } from '../utils/p2p/peerIdentity';

let activeWs: WebSocket | null = null;

/**
 * 全局发送 WebSocket 上行消息函数 (低开销、直接调用)
 */
export function sendWsMessage<T = any>(type: WsEventType, payload: T): boolean {
  if (activeWs && activeWs.readyState === WebSocket.OPEN) {
    try {
      activeWs.send(
        JSON.stringify({
          type,
          payload,
          timestamp: new Date().toISOString(),
        })
      );
      return true;
    } catch (e) {
      console.warn('[WS] sendWsMessage failed:', e);
      return false;
    }
  }
  return false;
}

/**
 * 获取当前底层 WebSocket 出站缓冲区堆积的字节数 (用于流控背压测算)
 */
export function getWsBufferedAmount(): number {
  if (activeWs && activeWs.readyState === WebSocket.OPEN) {
    return activeWs.bufferedAmount || 0;
  }
  return 0;
}

/**
 * 等待 WebSocket 发送缓冲区排空到安全阈值以下 (严格背压控制，防止内存撑爆与虚假进度)
 * @param maxBuffered 允许的最大堆积字节数 (默认 512 KB)
 * @param pollInterval 轮询检查周期 (默认 12ms)
 * @param timeoutMs 安全超时防止极端情况死锁 (默认 60000ms)
 */
export function waitForWsDrain(
  maxBuffered: number = 512 * 1024,
  pollInterval: number = 12,
  timeoutMs: number = 60000
): Promise<void> {
  return new Promise((resolve) => {
    if (!activeWs || activeWs.readyState !== WebSocket.OPEN) {
      return resolve();
    }
    if (activeWs.bufferedAmount <= maxBuffered) {
      return resolve();
    }
    const startTime = Date.now();
    const interval = setInterval(() => {
      if (
        !activeWs ||
        activeWs.readyState !== WebSocket.OPEN ||
        activeWs.bufferedAmount <= maxBuffered ||
        Date.now() - startTime > timeoutMs
      ) {
        clearInterval(interval);
        resolve();
      }
    }, pollInterval);
  });
}

export function useWebSocket(onMessageReceived?: (msg: WsMessage) => void) {
  const [isConnected, setIsConnected] = useState(false);
  const [onlineCount, setOnlineCount] = useState(1);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // 用 ref 保存最新的消息回调函数，彻底防止因依赖变更导致的无效重连与连接抖动
  const callbackRef = useRef(onMessageReceived);
  useEffect(() => {
    callbackRef.current = onMessageReceived;
  }, [onMessageReceived]);

  const connect = useCallback(() => {
    if (
      wsRef.current &&
      (wsRef.current.readyState === WebSocket.OPEN || wsRef.current.readyState === WebSocket.CONNECTING)
    ) {
      return;
    }

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host;
    const wsUrl = `${protocol}//${host}/ws`;

    try {
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;
      activeWs = ws;

      ws.onopen = () => {
        setIsConnected(true);
        if (reconnectTimeoutRef.current) {
          clearTimeout(reconnectTimeoutRef.current);
          reconnectTimeoutRef.current = null;
        }

        // 连接成功后，立即向服务端注册当前设备身份 (用于 P2P 发现)
        const localPeer = getLocalPeerInfo();
        sendWsMessage('PEER_REGISTER', localPeer);
      };

      ws.onmessage = (event) => {
        try {
          const data: WsMessage = JSON.parse(event.data);
          if (data.type === 'ONLINE_COUNT_CHANGED' && data.payload?.onlineUsers) {
            setOnlineCount(data.payload.onlineUsers);
          }
          if (callbackRef.current) {
            callbackRef.current(data);
          }
        } catch (e) {
          console.warn('[WS] Parse message error:', e);
        }
      };

      ws.onclose = () => {
        setIsConnected(false);
        wsRef.current = null;
        activeWs = null;
        // 快速自动重连 (1.5 秒)
        if (!reconnectTimeoutRef.current) {
          reconnectTimeoutRef.current = setTimeout(() => {
            reconnectTimeoutRef.current = null;
            connect();
          }, 1500);
        }
      };

      ws.onerror = () => {
        try {
          ws.close();
        } catch (_) {}
      };
    } catch (e) {
      console.warn('[WS] Connection init error:', e);
      if (!reconnectTimeoutRef.current) {
        reconnectTimeoutRef.current = setTimeout(() => {
          reconnectTimeoutRef.current = null;
          connect();
        }, 2000);
      }
    }
  }, []);

  useEffect(() => {
    connect();

    // 监听本地昵称变化并通知服务端 (低开销事件驱动)
    const handleNicknameChanged = () => {
      const localPeer = getLocalPeerInfo();
      sendWsMessage('PEER_UPDATE', {
        deviceId: localPeer.deviceId,
        nickname: localPeer.nickname,
        avatarEmoji: localPeer.avatarEmoji,
        avatarColor: localPeer.avatarColor,
      });
    };
    window.addEventListener('lightdrop:nickname-changed', handleNicknameChanged);

    // 移动端锁屏/切换前后台唤醒时，主动检查并快速恢复长连接
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
          connect();
        }
      }
    };

    window.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('online', connect);

    return () => {
      window.removeEventListener('lightdrop:nickname-changed', handleNicknameChanged);
      window.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('online', connect);

      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (wsRef.current) {
        try {
          wsRef.current.close();
        } catch (_) {}
      }
      activeWs = null;
    };
  }, [connect]);

  return { isConnected, onlineCount, sendMessage: sendWsMessage };
}
