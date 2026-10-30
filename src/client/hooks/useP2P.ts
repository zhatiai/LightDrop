import { useState, useEffect, useCallback, useRef } from 'react';
import {
  PeerInfo,
  FavoritePeer,
  WsMessage,
  P2PDirectMessage,
  P2PHandshakeRequestPayload,
  P2PHandshakeResponsePayload,
  P2PSignalPayload,
} from '@shared/types';
import { getDeviceId, getLocalPeerInfo } from '../utils/p2p/peerIdentity';
import {
  getFavoritePeers,
  addFavoritePeer,
  updateFavoritePeerName,
  removeFavoritePeer,
  FAVORITES_CHANGE_EVENT,
} from '../utils/p2p/favoriteStorage';
import { sendWsMessage, waitForWsDrain, getWsBufferedAmount } from './useWebSocket';
import {
  P2PSender,
  P2PReceiver,
  TransferProgress,
  ReceivedResult,
} from '../utils/p2p/p2pEngine';
import {
  P2PTaskItem,
  P2PSession,
  getP2PTasks,
  getActiveP2PSession,
  getActiveP2PSessions,
  isP2PSessionActive,
  addOrUpdateActiveP2PSession,
  removeActiveP2PSession,
  clearActiveP2PSessions,
  setActiveP2PSession,
  addP2PTask,
  updateP2PTaskProgress,
  finishP2PTask,
  cancelOrFailP2PTask,
  cancelAndRemoveP2PTask,
  QUEUE_CHANGE_EVENT,
  SESSION_CHANGE_EVENT,
} from '../utils/p2p/p2pQueueManager';

export interface IncomingSessionRequestItem {
  sender: PeerInfo;
  requestedAt: string;
}

export interface OutgoingTransferPayload {
  transferId: string;
  files?: File[];
  text?: string;
  title?: string;
  targetDeviceId: string;
  targetNickname: string;
}

export interface OutgoingTransferState {
  transferId: string;
  targetDeviceId: string;
  targetNickname: string;
  status: 'requesting' | 'transferring' | 'completed' | 'rejected' | 'failed' | 'cancelled';
  progress?: TransferProgress;
  errorMessage?: string;
}

export interface IncomingTransferRequest {
  transferId: string;
  sender: PeerInfo;
  itemType: 'text' | 'file' | 'folder' | 'mixed';
  title?: string;
  textContent?: string;
  textPreview?: string;
  textLength?: number;
  files?: Array<{ name: string; size: number; type?: string }>;
  totalSize: number;
  totalCount: number;
  timestamp: string;
}

export interface IncomingTransferProgressState {
  transferId: string;
  sender: PeerInfo;
  status: 'receiving' | 'completed' | 'failed';
  progress?: TransferProgress;
  result?: ReceivedResult;
  errorMessage?: string;
}

export function useP2P(onToast?: (type: 'success' | 'error' | 'info', text: string) => void) {
  const localDeviceId = getDeviceId();

  // 1. 在线发现的节点列表 (排除自己)
  const [onlinePeers, setOnlinePeers] = useState<PeerInfo[]>([]);

  // 2. 本地收藏的节点列表 (从 localStorage 同步)
  const [favoritePeers, setFavoritePeers] = useState<FavoritePeer[]>(() => getFavoritePeers());

  // 3. 当前选中的直传目标节点 ID
  const [selectedTargetId, setSelectedTargetId] = useState<string | null>(null);

  // 4. 当前设备是否处于专属“接收模式”
  const [isReceiveMode, setIsReceiveModeState] = useState(false);

  // 5. 长连接多会话状态 (P2P Sessions)
  const [activeSessions, setActiveSessionsState] = useState<P2PSession[]>(() => getActiveP2PSessions());
  const activeSession = activeSessions[0] || null;

  // 6. 任务队列
  const [tasks, setTasks] = useState<P2PTaskItem[]>(() => getP2PTasks());

  // 7. 弹窗提示与交互状态
  const [outgoingTransfer, setOutgoingTransfer] = useState<OutgoingTransferState | null>(null);
  const [incomingRequest, setIncomingRequest] = useState<IncomingTransferRequest | null>(null);
  const [incomingTransfer, setIncomingTransfer] = useState<IncomingTransferProgressState | null>(null);

  // 双通道传输引擎多端并发隔离映射与兼容引用
  const senderEnginesRef = useRef<Map<string, P2PSender>>(new Map());
  const receiverEnginesRef = useRef<Map<string, P2PReceiver>>(new Map());
  const currentTransferPayloadsRef = useRef<Map<string, OutgoingTransferPayload>>(new Map());
  const senderEngineRef = useRef<P2PSender | null>(null);
  const receiverEngineRef = useRef<P2PReceiver | null>(null);
  const currentTransferPayloadRef = useRef<OutgoingTransferPayload | null>(null);

  // 跨回调引用，杜绝闭包陷阱与声明顺序问题
  const handleDirectMessageRef = useRef<(directMsg: P2PDirectMessage) => Promise<void>>(() => Promise.resolve());
  const startReceivingFlowRef = useRef<(req: IncomingTransferRequest) => Promise<void>>(() => Promise.resolve());

  // 同步本地收藏、任务队列与长连接会话事件
  useEffect(() => {
    const handleFavChange = () => setFavoritePeers(getFavoritePeers());
    const handleQueueChange = () => setTasks(getP2PTasks());
    const handleSessionChange = () => setActiveSessionsState(getActiveP2PSessions());

    window.addEventListener(FAVORITES_CHANGE_EVENT, handleFavChange);
    window.addEventListener(QUEUE_CHANGE_EVENT, handleQueueChange);
    window.addEventListener(SESSION_CHANGE_EVENT, handleSessionChange);

    return () => {
      window.removeEventListener(FAVORITES_CHANGE_EVENT, handleFavChange);
      window.removeEventListener(QUEUE_CHANGE_EVENT, handleQueueChange);
      window.removeEventListener(SESSION_CHANGE_EVENT, handleSessionChange);
    };
  }, []);

  // 切换专有“接收模式”
  const toggleReceiveMode = useCallback((enabled?: boolean) => {
    setIsReceiveModeState((prev) => {
      const next = typeof enabled === 'boolean' ? enabled : !prev;
      sendWsMessage('PEER_UPDATE', {
        deviceId: localDeviceId,
        isReceiveMode: next,
      });
      return next;
    });
  }, [localDeviceId]);

  // 收藏 / 取消收藏节点
  const toggleFavorite = useCallback(
    (peer: PeerInfo, customName?: string) => {
      const isFav = favoritePeers.some((f) => f.deviceId === peer.deviceId);
      if (isFav) {
        removeFavoritePeer(peer.deviceId);
        if (onToast) onToast('success', '已从收藏列表中移除');
      } else {
        addFavoritePeer(peer, customName);
        if (onToast) onToast('success', `已成功收藏设备: ${customName || peer.nickname}`);
      }
    },
    [favoritePeers, onToast]
  );

  // 修改收藏节点自定义别名
  const updateFavoriteName = useCallback(
    (deviceId: string, name: string) => {
      updateFavoritePeerName(deviceId, name);
      if (onToast) onToast('success', '已更新设备备注名称');
    },
    [onToast]
  );

  // 8. 长连接互信请求队列状态 (支持多端并发排队申请)
  const [incomingSessionRequests, setIncomingSessionRequests] = useState<IncomingSessionRequestItem[]>([]);
  const incomingSessionRequest = incomingSessionRequests[0] || null;

  // 请求建立 / 确认 P2P 长连接互信会话 (需对端确认同意)
  const establishSession = useCallback(
    (peer: PeerInfo) => {
      sendWsMessage('P2P_DIRECT_MESSAGE', {
        messageType: 'SESSION_REQUEST',
        targetDeviceId: peer.deviceId,
        senderDeviceId: localDeviceId,
        payload: {
          sender: getLocalPeerInfo(isReceiveMode),
        },
      });
      if (onToast) onToast('info', `已向 ${peer.nickname} 发送建立长连接请求，等待对方确认...`);
    },
    [localDeviceId, isReceiveMode, onToast]
  );

  // 确认同意对端发起的长连接请求 (支持指定 peerId 或默认首个)
  const acceptSessionRequest = useCallback(
    (peerId?: string) => {
      const targetReq = peerId
        ? incomingSessionRequests.find((r) => r.sender.deviceId === peerId)
        : incomingSessionRequests[0];
      if (!targetReq) return;
      const { sender } = targetReq;
      const session: P2PSession = {
        peerId: sender.deviceId,
        peerName: sender.nickname,
        peerOs: sender.os,
        peerAvatarEmoji: sender.avatarEmoji,
        peerAvatarColor: sender.avatarColor,
        establishedAt: new Date().toISOString(),
      };
      addOrUpdateActiveP2PSession(session);
      const myInfo = getLocalPeerInfo(isReceiveMode);
      sendWsMessage('P2P_DIRECT_MESSAGE', {
        messageType: 'SESSION_ESTABLISHED',
        targetDeviceId: sender.deviceId,
        senderDeviceId: localDeviceId,
        payload: {
          receiver: myInfo,
          sender: myInfo,
        },
      });
      setIncomingSessionRequests((prev) => prev.filter((r) => r.sender.deviceId !== sender.deviceId));
      if (onToast) onToast('success', `🎉 已与 ${sender.nickname} 建立 P2P 直连长连接！`);
    },
    [incomingSessionRequests, localDeviceId, isReceiveMode, onToast]
  );

  // 拒绝对端发起的长连接请求 (支持指定 peerId 或默认首个)
  const rejectSessionRequest = useCallback(
    (peerId?: string) => {
      const targetReq = peerId
        ? incomingSessionRequests.find((r) => r.sender.deviceId === peerId)
        : incomingSessionRequests[0];
      if (!targetReq) return;
      const { sender } = targetReq;
      sendWsMessage('P2P_DIRECT_MESSAGE', {
        messageType: 'SESSION_REJECT',
        targetDeviceId: sender.deviceId,
        senderDeviceId: localDeviceId,
        payload: { reason: 'rejected' },
      });
      setIncomingSessionRequests((prev) => prev.filter((r) => r.sender.deviceId !== sender.deviceId));
      if (onToast) onToast('info', `已拒绝来自 ${sender.nickname} 的长连接请求`);
    },
    [incomingSessionRequests, localDeviceId, onToast]
  );

  // 一键同意全部待处理的长连接请求
  const acceptAllSessionRequests = useCallback(() => {
    const myInfo = getLocalPeerInfo(isReceiveMode);
    incomingSessionRequests.forEach((req) => {
      const { sender } = req;
      const session: P2PSession = {
        peerId: sender.deviceId,
        peerName: sender.nickname,
        peerOs: sender.os,
        peerAvatarEmoji: sender.avatarEmoji,
        peerAvatarColor: sender.avatarColor,
        establishedAt: new Date().toISOString(),
      };
      addOrUpdateActiveP2PSession(session);
      sendWsMessage('P2P_DIRECT_MESSAGE', {
        messageType: 'SESSION_ESTABLISHED',
        targetDeviceId: sender.deviceId,
        senderDeviceId: localDeviceId,
        payload: { receiver: myInfo, sender: myInfo },
      });
    });
    const count = incomingSessionRequests.length;
    setIncomingSessionRequests([]);
    if (onToast) onToast('success', `🎉 已同意全部 (${count}) 个长连接请求！`);
  }, [incomingSessionRequests, localDeviceId, isReceiveMode, onToast]);

  // 一键拒绝全部待处理的长连接请求
  const rejectAllSessionRequests = useCallback(() => {
    incomingSessionRequests.forEach((req) => {
      sendWsMessage('P2P_DIRECT_MESSAGE', {
        messageType: 'SESSION_REJECT',
        targetDeviceId: req.sender.deviceId,
        senderDeviceId: localDeviceId,
        payload: { reason: 'rejected' },
      });
    });
    setIncomingSessionRequests([]);
    if (onToast) onToast('info', '已拒绝全部长连接请求');
  }, [incomingSessionRequests, localDeviceId, onToast]);

  // 断开长连接会话 (支持断开指定 peerId，若未传则断开全部)
  const disconnectSession = useCallback(
    (peerId?: string) => {
      if (peerId) {
        const session = getActiveP2PSession(peerId);
        sendWsMessage('P2P_DIRECT_MESSAGE', {
          messageType: 'SESSION_DISCONNECT',
          targetDeviceId: peerId,
          senderDeviceId: localDeviceId,
          payload: {},
        });
        removeActiveP2PSession(peerId);
        if (onToast) onToast('info', `已断开与 ${session?.peerName || '对端'} 的 P2P 直连长连接`);
      } else {
        const sessions = getActiveP2PSessions();
        sessions.forEach((s) => {
          sendWsMessage('P2P_DIRECT_MESSAGE', {
            messageType: 'SESSION_DISCONNECT',
            targetDeviceId: s.peerId,
            senderDeviceId: localDeviceId,
            payload: {},
          });
        });
        clearActiveP2PSessions();
        if (onToast) onToast('info', '已断开所有 P2P 直连长连接');
      }
    },
    [localDeviceId, onToast]
  );

  // 断开全部长连接会话快捷方法
  const disconnectAllSessions = useCallback(() => {
    disconnectSession();
  }, [disconnectSession]);

  const isPeerSessionActive = useCallback((peerId: string) => {
    return isP2PSessionActive(peerId);
  }, []);

  // 处理接收到的 P2P WebSocket 消息
  const handleP2PWsMessage = useCallback(
    (msg: WsMessage) => {
      const { type, payload } = msg;

      if (type === 'PEER_ONLINE_LIST') {
        const list = Array.isArray(payload) ? payload : [];
        setOnlinePeers(list.filter((p: PeerInfo) => p.deviceId !== localDeviceId));
      } else if (type === 'PEER_JOINED' && payload && payload.deviceId) {
        if (payload.deviceId !== localDeviceId) {
          setOnlinePeers((prev) => {
            const next = prev.filter((p) => p.deviceId !== payload.deviceId);
            next.push(payload);
            return next;
          });
        }
      } else if (type === 'PEER_UPDATED' && payload && payload.deviceId) {
        if (payload.deviceId !== localDeviceId) {
          setOnlinePeers((prev) =>
            prev.map((p) => (p.deviceId === payload.deviceId ? { ...p, ...payload } : p))
          );
        }
      } else if (type === 'PEER_LEFT' && payload && payload.deviceId) {
        setOnlinePeers((prev) => prev.filter((p) => p.deviceId !== payload.deviceId));
        // 如果离线的是长连接对端，仅移除该离线对端的长连接会话
        if (isP2PSessionActive(payload.deviceId)) {
          removeActiveP2PSession(payload.deviceId);
        }
      } else if (type === 'P2P_DIRECT_MESSAGE' && payload) {
        const directMsg = payload as P2PDirectMessage;
        handleDirectMessageRef.current(directMsg);
      }
    },
    [localDeviceId]
  );

  // 处理点对点单播信令与数据中继
  const handleDirectMessage = useCallback(
    async (directMsg: P2PDirectMessage) => {
      const { messageType, senderDeviceId, payload } = directMsg;

      // 0. 长连接会话消息处理
      if (messageType === 'SESSION_REQUEST' || messageType === 'SESSION_ESTABLISH') {
        const sender = payload?.sender as PeerInfo;
        if (sender) {
          setIncomingSessionRequests((prev) => {
            if (prev.some((r) => r.sender.deviceId === sender.deviceId)) return prev;
            return [...prev, { sender, requestedAt: new Date().toISOString() }];
          });
        }
      } else if (messageType === 'SESSION_ESTABLISHED') {
        const remotePeer = (payload?.receiver || payload?.sender) as PeerInfo;
        if (remotePeer) {
          const session: P2PSession = {
            peerId: remotePeer.deviceId,
            peerName: remotePeer.nickname,
            peerOs: remotePeer.os,
            peerAvatarEmoji: remotePeer.avatarEmoji,
            peerAvatarColor: remotePeer.avatarColor,
            establishedAt: new Date().toISOString(),
          };
          addOrUpdateActiveP2PSession(session);
          if (onToast) onToast('success', `🎉 ${session.peerName} 已同意，P2P 直连长连接建立成功！`);
        } else if (payload?.session) {
          const fallbackSession: P2PSession = {
            ...payload.session,
            peerId: senderDeviceId || payload.session.peerId,
          };
          addOrUpdateActiveP2PSession(fallbackSession);
          if (onToast) onToast('success', `🎉 ${fallbackSession.peerName} 已同意，P2P 直连长连接建立成功！`);
        }
      } else if (messageType === 'SESSION_REJECT') {
        if (onToast) onToast('error', '对方拒绝了建立长连接请求');
      } else if (messageType === 'SESSION_DISCONNECT') {
        const remotePeerId = senderDeviceId || payload?.senderDeviceId;
        if (remotePeerId) {
          const existing = getActiveP2PSession(remotePeerId);
          removeActiveP2PSession(remotePeerId);
          if (onToast) onToast('info', `对端 ${existing?.peerName || ''} 已断开 P2P 直连会话`);
        } else {
          clearActiveP2PSessions();
          if (onToast) onToast('info', '对端已断开 P2P 直连会话');
        }
      }

      // 长连接模式下极速单向文本直达接收 (0 握手等待，0 弹窗，即发即收)
      else if (messageType === 'SESSION_DIRECT_TEXT') {
        const { transferId, sender, title, text, timestamp } = payload;
        const totalSize = new TextEncoder().encode(text || '').byteLength;
        const textPayload = text || '';
        addP2PTask({
          id: transferId,
          direction: 'receive',
          peerId: sender.deviceId,
          peerName: sender.nickname,
          itemType: 'text',
          title: title || (textPayload.length > 30 ? textPayload.slice(0, 30) + '...' : (textPayload || '文本直传')),
          totalSize,
          createdAt: timestamp || new Date().toISOString(),
          textContent: textPayload,
        });
        await finishP2PTask(transferId);
        if (onToast) onToast('success', `🎉 收到来自 ${sender.nickname} 的文本`);
      }

      // 1. 收到对端的握手请求 (有数据要直传给我)
      else if (messageType === 'HANDSHAKE_REQUEST') {
        const req = payload as P2PHandshakeRequestPayload;
        // 如果对端处于已建立的直连长连接中，或者带有 isSessionTransfer 标记，立即自动静默进入接收并确认！
        const isSession = Boolean(req.isSessionTransfer || isP2PSessionActive(req.sender.deviceId));

        if (isSession) {
          setIncomingRequest(null);
          await startReceivingFlowRef.current(req);
        } else {
          setIncomingRequest({
            transferId: req.transferId,
            sender: req.sender,
            itemType: req.itemType,
            title: req.title,
            textContent: req.textContent,
            files: req.files,
            totalSize: req.totalSize,
            totalCount: req.totalCount,
            timestamp: req.timestamp,
          });
        }
      }

      // 2. 发送方收到对端对握手的响应 (同意 / 拒绝)
      else if (messageType === 'HANDSHAKE_RESPONSE') {
        const resp = payload as P2PHandshakeResponsePayload;
        if (!resp.accepted) {
          setOutgoingTransfer((prev) =>
            prev && prev.transferId === resp.transferId
              ? {
                  ...prev,
                  status: 'rejected',
                  errorMessage:
                    resp.reason === 'offline'
                      ? '对端设备已离线，无法完成直传'
                      : '对方拒绝了本次直传请求',
                }
              : prev
          );
          cancelOrFailP2PTask(resp.transferId, true);
          const s = senderEnginesRef.current.get(resp.transferId);
          if (s) {
            s.cleanup();
            senderEnginesRef.current.delete(resp.transferId);
          }
          currentTransferPayloadsRef.current.delete(resp.transferId);
          return;
        }

        // 对方同意接收！开始通过双通道引擎启动直传
        setOutgoingTransfer((prev) =>
          prev && prev.transferId === resp.transferId
            ? { ...prev, status: 'transferring' }
            : prev
        );

        const content = currentTransferPayloadsRef.current.get(resp.transferId) || currentTransferPayloadRef.current;
        if (!content || content.transferId !== resp.transferId) return;

        // 加入发送任务队列并在本地 P2P 记录中创建记录
        addP2PTask({
          id: resp.transferId,
          direction: 'send',
          peerId: senderDeviceId,
          peerName: content.targetNickname,
          itemType: content.files ? (content.files.length > 1 ? 'batch' : 'file') : 'text',
          title: content.title || (content.files ? content.files[0].name : '文本直传'),
          totalSize: content.files
            ? content.files.reduce((a, b) => a + b.size, 0)
            : new TextEncoder().encode(content.text || '').byteLength,
          createdAt: new Date().toISOString(),
          files: content.files?.map((f) => ({ name: f.name, size: f.size })),
          textContent: content.text,
        });

        try {
          const sender = new P2PSender(
            // WebRTC 信令
            (signal, signalType) => {
              sendWsMessage('P2P_DIRECT_MESSAGE', {
                messageType: 'SIGNAL',
                targetDeviceId: senderDeviceId,
                senderDeviceId: localDeviceId,
                payload: {
                  transferId: resp.transferId,
                  senderDeviceId: localDeviceId,
                  targetDeviceId: senderDeviceId,
                  signalType,
                  signal,
                } as P2PSignalPayload,
              });
            },
            // 中继控制信令与分片
            (msgType, chunkPayload) => {
              sendWsMessage('P2P_DIRECT_MESSAGE', {
                messageType: msgType as any,
                targetDeviceId: senderDeviceId,
                senderDeviceId: localDeviceId,
                payload: chunkPayload,
              });
            },
            // WebSocket 严格背压排空
            waitForWsDrain,
            // WebSocket 实时出站缓冲区大小
            getWsBufferedAmount
          );
          senderEnginesRef.current.set(resp.transferId, sender);
          senderEngineRef.current = sender;

          // 接收端真实进度 ACK 强同步
          sender.setOnRemoteAck((receivedBytes) => {
            const total = content.files
              ? content.files.reduce((a, b) => a + b.size, 0)
              : 0;
            if (total > 0) {
              const percent = Math.min(99, Math.round((receivedBytes / total) * 100));
              updateP2PTaskProgress(content.transferId, percent, receivedBytes, '同步中', 'relay');
            }
          });

          // 开始流式分片发送
          if (content.files && content.files.length > 0) {
            // 文件直传：优先快速尝试 WebRTC 协商 (250ms 超时秒级切换至 WebSocket 内存隧道)
            await sender.initConnection();
            await sender.sendFiles(content.transferId, content.files, content.title, (progress) => {
              setOutgoingTransfer((prev) => (prev ? { ...prev, progress } : null));
              updateP2PTaskProgress(
                content.transferId,
                progress.percent,
                progress.transferredBytes,
                progress.speedText,
                progress.channel
              );
            });
          } else if (content.text) {
            // 纯文本内容：直接走极速 WebSocket 内存通道，无需等待 WebRTC 协商
            await sender.sendText(content.transferId, content.text, content.title, (progress) => {
              setOutgoingTransfer((prev) => (prev ? { ...prev, progress } : null));
              updateP2PTaskProgress(
                content.transferId,
                progress.percent,
                progress.transferredBytes,
                progress.speedText,
                progress.channel
              );
            });
          }

          // 标记发送完成
          setOutgoingTransfer((prev) => (prev ? { ...prev, status: 'completed' } : null));
          await finishP2PTask(content.transferId);
          if (onToast) onToast('success', '⚡ P2P 直传已成功完成！');
        } catch (err: any) {
          console.error('[P2P Sender Error]', err);
          setOutgoingTransfer((prev) =>
            prev
              ? {
                  ...prev,
                  status: 'failed',
                  errorMessage: err?.message || '传输中断',
                }
              : null
          );
          cancelOrFailP2PTask(content.transferId, false);
          // 告知对端异常
          sendWsMessage('P2P_DIRECT_MESSAGE', {
            messageType: 'TRANSFER_ERROR',
            targetDeviceId: senderDeviceId,
            senderDeviceId: localDeviceId,
            payload: { transferId: content.transferId },
          });
        } finally {
          senderEnginesRef.current.delete(resp.transferId);
          currentTransferPayloadsRef.current.delete(resp.transferId);
        }
      }

      // 3. 接收方收到 TRANSFER_START 传输开始通知
      else if (messageType === 'TRANSFER_START') {
        const transferId = payload?.transferId;
        const receiver = (transferId ? receiverEnginesRef.current.get(transferId) : null) || receiverEngineRef.current;
        if (receiver) {
          receiver.handleControlMessage(payload, payload?.channel || 'relay');
        }
      }

      // 4. 接收方收到分片数据 (来自 WebSocket 内存通道)
      else if (messageType === 'TRANSFER_DATA_CHUNK') {
        const transferId = payload?.transferId;
        const receiver = (transferId ? receiverEnginesRef.current.get(transferId) : null) || receiverEngineRef.current;
        if (receiver) {
          receiver.handleControlMessage(payload, 'relay');
        }
      }

      // 5. 接收方收到完成通知
      else if (messageType === 'TRANSFER_COMPLETE') {
        const transferId = payload?.transferId;
        const receiver = (transferId ? receiverEnginesRef.current.get(transferId) : null) || receiverEngineRef.current;
        if (receiver) {
          receiver.handleControlMessage({ type: 'COMPLETE', transferId }, 'relay');
        }
      }

      // 5.1 发送方收到对端的真实接收进度 ACK 或落盘完成 ACK
      else if (messageType === 'TRANSFER_ACK' || messageType === 'TRANSFER_COMPLETE_ACK') {
        const transferId = payload?.transferId;
        const sender = (transferId ? senderEnginesRef.current.get(transferId) : null) || senderEngineRef.current;
        if (sender) {
          sender.handleAckMessage({
            type: messageType,
            transferId: payload?.transferId,
            receivedBytes: payload?.receivedBytes,
          });
        }
      }

      // 6. 收到对端的取消通知
      else if (messageType === 'HANDSHAKE_CANCEL' || messageType === 'TRANSFER_CANCEL') {
        const transferId = payload?.transferId;
        setIncomingRequest((prev) => (prev && prev.transferId === transferId ? null : prev));
        setIncomingTransfer((prev) => (prev && prev.transferId === transferId ? null : prev));
        setOutgoingTransfer((prev) => (prev && prev.transferId === transferId ? null : prev));

        if (transferId) {
          await cancelAndRemoveP2PTask(transferId);
          const r = receiverEnginesRef.current.get(transferId);
          if (r) {
            r.cleanup();
            receiverEnginesRef.current.delete(transferId);
          }
          const s = senderEnginesRef.current.get(transferId);
          if (s) {
            s.cleanup();
            senderEnginesRef.current.delete(transferId);
          }
          currentTransferPayloadsRef.current.delete(transferId);
        }
        if (onToast) onToast('info', '对端已取消本次传输，本地已自动清理');
      }

      // 7. 收到对端异常通知
      else if (messageType === 'TRANSFER_ERROR') {
        const transferId = payload?.transferId;
        if (transferId) {
          cancelOrFailP2PTask(transferId, false);
          const r = receiverEnginesRef.current.get(transferId);
          if (r) {
            r.cleanup();
            receiverEnginesRef.current.delete(transferId);
          }
          const s = senderEnginesRef.current.get(transferId);
          if (s) {
            s.cleanup();
            senderEnginesRef.current.delete(transferId);
          }
          currentTransferPayloadsRef.current.delete(transferId);
        }
        setIncomingTransfer((prev) =>
          prev && prev.transferId === transferId
            ? { ...prev, status: 'failed', errorMessage: '对端传输连接异常中断' }
            : prev
        );
        if (onToast) onToast('error', 'P2P 传输连接中断');
      }

      // 8. WebRTC 信令交换
      else if (messageType === 'SIGNAL') {
        const signalPayload = payload as P2PSignalPayload;
        const transferId = signalPayload?.transferId;
        if (signalPayload.signalType === 'answer' || signalPayload.signalType === 'candidate') {
          const sender = (transferId ? senderEnginesRef.current.get(transferId) : null) || senderEngineRef.current;
          if (sender) {
            await sender.handleRemoteSignal(
              signalPayload.signal,
              signalPayload.signalType as any
            );
          }
        } else if (signalPayload.signalType === 'offer' || signalPayload.signalType === 'candidate') {
          const receiver = (transferId ? receiverEnginesRef.current.get(transferId) : null) || receiverEngineRef.current;
          if (receiver) {
            await receiver.handleRemoteSignal(
              signalPayload.signal,
              signalPayload.signalType as any
            );
          }
        }
      }
    },
    [localDeviceId, onToast]
  );
  handleDirectMessageRef.current = handleDirectMessage;

  // 辅助函数：长连接模式下自动同意握手
  const autoAcceptHandshake = useCallback(
    async (req: P2PHandshakeRequestPayload) => {
      // 自动回复同意并启动接收器
      await startReceivingFlowRef.current(req);
    },
    []
  );

  // 启动接收数据处理流
  const startReceivingFlow = useCallback(
    async (req: IncomingTransferRequest) => {
      setIsReceiveModeState(true);
      sendWsMessage('PEER_UPDATE', {
        deviceId: localDeviceId,
        isReceiveMode: true,
      });

      // 加入接收任务队列并在本地 P2P 共享记录中创建条目 (状态为接收中)
      addP2PTask({
        id: req.transferId,
        direction: 'receive',
        peerId: req.sender.deviceId,
        peerName: req.sender.nickname,
        itemType: req.itemType === 'mixed' ? 'batch' : (req.itemType as any),
        title: req.title || (req.files ? req.files[0].name : '文本直传'),
        totalSize: req.totalSize,
        createdAt: req.timestamp || new Date().toISOString(),
        files: req.files?.map((f) => ({ name: f.name, size: f.size })),
        textContent: req.textContent,
      });

      // 检测是否为长连接直传
      const isSession = Boolean(
        (req as any).isSessionTransfer ||
        isP2PSessionActive(req.sender.deviceId)
      );

      // 长连接模式下完全静默接收，不弹出任何接收与完成弹窗
      if (!isSession) {
        setIncomingTransfer({
          transferId: req.transferId,
          sender: req.sender,
          status: 'receiving',
          progress: {
            percent: 0,
            transferredBytes: 0,
            totalBytes: req.totalSize,
            speedText: '0 KB/s',
            speedBytesPerSec: 0,
          },
        });
      } else {
        setIncomingTransfer(null);
        setIncomingRequest(null);
      }

      try {
        const receiver = new P2PReceiver(
          (signal, signalType) => {
            sendWsMessage('P2P_DIRECT_MESSAGE', {
              messageType: 'SIGNAL',
              targetDeviceId: req.sender.deviceId,
              senderDeviceId: localDeviceId,
              payload: {
                transferId: req.transferId,
                senderDeviceId: localDeviceId,
                targetDeviceId: req.sender.deviceId,
                signalType,
                signal,
              } as P2PSignalPayload,
            });
          },
          (msgType, chunkPayload) => {
            sendWsMessage('P2P_DIRECT_MESSAGE', {
              messageType: msgType as any,
              targetDeviceId: req.sender.deviceId,
              senderDeviceId: localDeviceId,
              payload: chunkPayload,
            });
          }
        );
        receiverEnginesRef.current.set(req.transferId, receiver);
        receiverEngineRef.current = receiver;

        await receiver.initConnection(
          (progress) => {
            if (!isSession) {
              setIncomingTransfer((prev) => (prev ? { ...prev, progress } : null));
            }
            updateP2PTaskProgress(
              req.transferId,
              progress.percent,
              progress.transferredBytes,
              progress.speedText,
              progress.channel
            );
          },
          async (result) => {
            if (!isSession) {
              setIncomingTransfer((prev) => (prev ? { ...prev, status: 'completed', result } : null));
            } else {
              setIncomingTransfer(null);
            }

            // 将接收完成的文件存入本地 IndexedDB，并把记录状态更新为 completed
            const fileBlobs = result.files?.map((f) => ({ name: f.name, blob: f.blob }));
            await finishP2PTask(req.transferId, fileBlobs);
            receiverEnginesRef.current.delete(req.transferId);

            if (onToast) onToast('success', '🎉 已成功接收来自对端的内容并保存至本地！');

            // 若接收到文件，触发自动保存/下载
            if (result.files && result.files.length > 0) {
              result.files.forEach((item) => {
                const url = URL.createObjectURL(item.blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = item.name;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                setTimeout(() => URL.revokeObjectURL(url), 10000);
              });
            }
          }
        );

        // 回复发送端确认握手
        sendWsMessage('P2P_DIRECT_MESSAGE', {
          messageType: 'HANDSHAKE_RESPONSE',
          targetDeviceId: req.sender.deviceId,
          senderDeviceId: localDeviceId,
          payload: {
            transferId: req.transferId,
            accepted: true,
            receiver: getLocalPeerInfo(true),
            timestamp: new Date().toISOString(),
          } as P2PHandshakeResponsePayload,
        });
      } catch (err: any) {
        console.error('[P2P Receiver Error]', err);
        receiverEnginesRef.current.delete(req.transferId);
        cancelOrFailP2PTask(req.transferId, false);
      }
    },
    [localDeviceId, onToast]
  );
  startReceivingFlowRef.current = startReceivingFlow;

  // 发送方发起直传请求
  const startP2PTransfer = useCallback(
    async (
      targetDeviceId: string,
      targetNickname: string,
      content: { text?: string; files?: File[]; title?: string }
    ) => {
      const transferId = `trans_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      const payloadInfo = {
        transferId,
        files: content.files,
        text: content.text,
        title: content.title,
        targetDeviceId,
        targetNickname,
      };
      currentTransferPayloadRef.current = payloadInfo;
      currentTransferPayloadsRef.current.set(transferId, payloadInfo);

      const totalSize = content.files
        ? content.files.reduce((a, b) => a + b.size, 0)
        : new TextEncoder().encode(content.text || '').byteLength;

      const fileMeta = content.files?.map((f) => ({
        name: f.name,
        size: f.size,
        type: f.type,
      }));

      const isSessionDrop = isP2PSessionActive(targetDeviceId);

      // 【核心优化】：长连接会话模式下的纯文本瞬时秒发 (0 握手等待，0 毫秒阻塞，即发即收)
      if (isSessionDrop && (!content.files || content.files.length === 0)) {
        const textPayload = content.text || content.title || '';
        addP2PTask({
          id: transferId,
          direction: 'send',
          peerId: targetDeviceId,
          peerName: targetNickname,
          itemType: 'text',
          title: content.title || (textPayload.length > 30 ? textPayload.slice(0, 30) + '...' : (textPayload || '文本直传')),
          totalSize,
          createdAt: new Date().toISOString(),
          textContent: textPayload,
        });
        await finishP2PTask(transferId);

        setOutgoingTransfer({
          transferId,
          targetDeviceId,
          targetNickname,
          status: 'completed',
        });

        sendWsMessage('P2P_DIRECT_MESSAGE', {
          messageType: 'SESSION_DIRECT_TEXT',
          targetDeviceId,
          senderDeviceId: localDeviceId,
          payload: {
            transferId,
            sender: getLocalPeerInfo(isReceiveMode),
            title: content.title,
            text: textPayload,
            timestamp: new Date().toISOString(),
          },
        });
        return;
      }

      const reqPayload: P2PHandshakeRequestPayload = {
        transferId,
        sender: getLocalPeerInfo(isReceiveMode),
        targetDeviceId,
        isSessionTransfer: isSessionDrop,
        itemType: content.files ? (content.files.length > 1 ? 'mixed' : 'file') : 'text',
        title: content.title,
        textContent: content.text,
        textPreview: content.text ? content.text.slice(0, 100) : undefined,
        textLength: content.text ? content.text.length : undefined,
        files: fileMeta,
        totalSize,
        totalCount: content.files ? content.files.length : 1,
        timestamp: new Date().toISOString(),
      };

      // 发送方立即在本地队列与共享记录中创建初始条目 (0% 进度)
      addP2PTask({
        id: transferId,
        direction: 'send',
        peerId: targetDeviceId,
        peerName: targetNickname,
        itemType: content.files ? (content.files.length > 1 ? 'batch' : 'file') : 'text',
        title: content.title || (content.files ? content.files[0].name : '文本直传'),
        totalSize,
        createdAt: new Date().toISOString(),
        files: content.files?.map((f) => ({ name: f.name, size: f.size })),
        textContent: content.text,
      });

      setOutgoingTransfer({
        transferId,
        targetDeviceId,
        targetNickname,
        status: isSessionDrop ? 'transferring' : 'requesting',
      });

      // 发送握手请求
      sendWsMessage('P2P_DIRECT_MESSAGE', {
        messageType: 'HANDSHAKE_REQUEST',
        targetDeviceId,
        senderDeviceId: localDeviceId,
        payload: reqPayload,
      });
    },
    [isReceiveMode, localDeviceId]
  );

  // 取消直传 (彻底清理本地存储与任务，并通知远端)
  const cancelTransfer = useCallback(
    async (transferId?: string) => {
      const id = transferId || outgoingTransfer?.transferId || incomingTransfer?.transferId;
      if (id) {
        const cleanId = id.startsWith('p2p_') ? id.slice(4) : id;
        const tasks = getP2PTasks();
        const task = tasks.find((t) => t.id === cleanId || t.id === id);
        const targetId = task?.peerId || outgoingTransfer?.targetDeviceId || incomingTransfer?.sender.deviceId;

        if (targetId) {
          sendWsMessage('P2P_DIRECT_MESSAGE', {
            messageType: 'TRANSFER_CANCEL',
            targetDeviceId: targetId,
            senderDeviceId: localDeviceId,
            payload: { transferId: cleanId },
          });
        }

        await cancelAndRemoveP2PTask(cleanId);
        const targetSender = senderEnginesRef.current.get(cleanId);
        if (targetSender) {
          targetSender.cancel(cleanId);
          senderEnginesRef.current.delete(cleanId);
        }
        const targetReceiver = receiverEnginesRef.current.get(cleanId);
        if (targetReceiver) {
          targetReceiver.cleanup();
          receiverEnginesRef.current.delete(cleanId);
        }
        currentTransferPayloadsRef.current.delete(cleanId);
      }

      if (senderEngineRef.current) {
        senderEngineRef.current.cancel(id);
        senderEngineRef.current = null;
      }
      if (receiverEngineRef.current) {
        receiverEngineRef.current.cleanup();
        receiverEngineRef.current = null;
      }

      setOutgoingTransfer(null);
      setIncomingTransfer(null);
      setIncomingRequest(null);
      currentTransferPayloadRef.current = null;
      if (onToast) onToast('info', '已取消传输并清理本地缓存');
    },
    [outgoingTransfer, incomingTransfer, localDeviceId, onToast]
  );

  // 接收方确认握手进入接收
  const acceptIncomingTransfer = useCallback(async () => {
    if (!incomingRequest) return;
    const req = incomingRequest;
    setIncomingRequest(null);
    await startReceivingFlow(req);
  }, [incomingRequest, startReceivingFlow]);

  // 接收方拒绝握手
  const rejectIncomingTransfer = useCallback(() => {
    if (!incomingRequest) return;
    sendWsMessage('P2P_DIRECT_MESSAGE', {
      messageType: 'HANDSHAKE_RESPONSE',
      targetDeviceId: incomingRequest.sender.deviceId,
      senderDeviceId: localDeviceId,
      payload: {
        transferId: incomingRequest.transferId,
        accepted: false,
        reason: 'rejected',
        receiver: getLocalPeerInfo(isReceiveMode),
        timestamp: new Date().toISOString(),
      } as P2PHandshakeResponsePayload,
    });
    setIncomingRequest(null);
    if (onToast) onToast('success', '已拒绝该传输请求');
  }, [incomingRequest, localDeviceId, isReceiveMode, onToast]);

  const dismissOutgoingTransfer = useCallback(() => setOutgoingTransfer(null), []);
  const dismissIncomingTransfer = useCallback(() => setIncomingTransfer(null), []);

  return {
    localDeviceId,
    onlinePeers,
    favoritePeers,
    selectedTargetId,
    setSelectedTargetId,
    isReceiveMode,
    toggleReceiveMode,
    toggleFavorite,
    updateFavoriteName,
    handleP2PWsMessage,
    // 长连接多会话模式
    activeSessions,
    activeSession,
    isPeerSessionActive,
    establishSession,
    disconnectSession,
    disconnectAllSessions,
    incomingSessionRequests,
    incomingSessionRequest,
    acceptSessionRequest,
    rejectSessionRequest,
    acceptAllSessionRequests,
    rejectAllSessionRequests,
    // 任务队列
    tasks,
    // 动作与控制
    startP2PTransfer,
    cancelTransfer,
    cancelOutgoingTransfer: cancelTransfer,
    acceptIncomingTransfer,
    rejectIncomingTransfer,
    dismissOutgoingTransfer,
    dismissIncomingTransfer,
    // 状态
    outgoingTransfer,
    incomingRequest,
    incomingTransfer,
  };
}
