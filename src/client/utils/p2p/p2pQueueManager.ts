import { ShareItem, P2PSession } from '@shared/types';
export type { P2PSession };
import {
  addP2PRecord,
  updateP2PRecordProgress,
  completeP2PRecord,
  failP2PRecord,
  deleteLocalP2PRecord,
} from './p2pRecordStorage';

export interface P2PTaskItem {
  id: string; // transferId
  direction: 'send' | 'receive';
  peerId: string;
  peerName: string;
  itemType: 'text' | 'file' | 'folder' | 'batch';
  title: string;
  totalSize: number;
  transferredBytes: number;
  speedText: string;
  percent: number;
  status: 'pending' | 'transferring' | 'completed' | 'failed' | 'cancelled';
  channel?: 'webrtc' | 'relay';
  createdAt: string;
  files?: Array<{ name: string; size: number }>;
  textContent?: string;
}



const QUEUE_CHANGE_EVENT = 'lightdrop:p2p-queue-changed';
const SESSION_CHANGE_EVENT = 'lightdrop:p2p-session-changed';

let activeTasks: P2PTaskItem[] = [];
let activeSessions: P2PSession[] = [];

// 从 sessionStorage 恢复长连接会话（支持单会话与多会话格式）
try {
  const cachedSessions = sessionStorage.getItem('lightdrop_p2p_active_sessions');
  if (cachedSessions) {
    const parsed = JSON.parse(cachedSessions);
    activeSessions = Array.isArray(parsed) ? parsed : [];
  } else {
    const cachedSession = sessionStorage.getItem('lightdrop_p2p_active_session');
    if (cachedSession) {
      activeSessions = [JSON.parse(cachedSession)];
    }
  }
} catch (_) {}

function persistActiveSessions(): void {
  try {
    sessionStorage.setItem('lightdrop_p2p_active_sessions', JSON.stringify(activeSessions));
    if (activeSessions.length > 0) {
      sessionStorage.setItem('lightdrop_p2p_active_session', JSON.stringify(activeSessions[0]));
    } else {
      sessionStorage.removeItem('lightdrop_p2p_active_session');
    }
  } catch (_) {}
  window.dispatchEvent(new CustomEvent(SESSION_CHANGE_EVENT, { detail: [...activeSessions] }));
}

export function getP2PTasks(): P2PTaskItem[] {
  return [...activeTasks];
}

/**
 * 获取所有当前已建立的 P2P 长连接会话
 */
export function getActiveP2PSessions(): P2PSession[] {
  return [...activeSessions];
}

/**
 * 获取指定节点或当前首个活跃的 P2P 会话
 */
export function getActiveP2PSession(peerId?: string): P2PSession | null {
  if (peerId) {
    return activeSessions.find((s) => s.peerId === peerId) || null;
  }
  return activeSessions[0] || null;
}

/**
 * 判断指定节点是否处于长连接状态
 */
export function isP2PSessionActive(peerId: string): boolean {
  return activeSessions.some((s) => s.peerId === peerId);
}

/**
 * 添加或更新一个 P2P 长连接会话
 */
export function addOrUpdateActiveP2PSession(session: P2PSession): void {
  activeSessions = [session, ...activeSessions.filter((s) => s.peerId !== session.peerId)];
  persistActiveSessions();
}

/**
 * 断开并移除指定节点的 P2P 长连接会话
 */
export function removeActiveP2PSession(peerId: string): void {
  activeSessions = activeSessions.filter((s) => s.peerId !== peerId);
  persistActiveSessions();
}

/**
 * 清空所有 P2P 长连接会话
 */
export function clearActiveP2PSessions(): void {
  activeSessions = [];
  persistActiveSessions();
}

/**
 * 兼容旧版单个会话设置方法
 */
export function setActiveP2PSession(session: P2PSession | null): void {
  if (session) {
    addOrUpdateActiveP2PSession(session);
  } else {
    clearActiveP2PSessions();
  }
}

function notifyQueueChange(): void {
  window.dispatchEvent(new CustomEvent(QUEUE_CHANGE_EVENT, { detail: [...activeTasks] }));
}

/**
 * 创建并加入传输任务队列，同时在本地 P2P 共享记录表中创建初始条目
 */
export function addP2PTask(
  task: Omit<P2PTaskItem, 'status' | 'percent' | 'transferredBytes' | 'speedText'>
): P2PTaskItem {
  const newTask: P2PTaskItem = {
    ...task,
    status: 'transferring',
    percent: 0,
    transferredBytes: 0,
    speedText: '0 KB/s',
  };

  activeTasks = [newTask, ...activeTasks.filter((t) => t.id !== task.id)];
  notifyQueueChange();

  // 同步在本地 P2P 共享记录中创建一条记录 (接收中状态)
  const firstFileName = task.files && task.files.length > 0 ? task.files[0].name : (task.itemType !== 'text' ? task.title : undefined);
  const ext = firstFileName && firstFileName.includes('.') ? firstFileName.split('.').pop()?.toLowerCase() : undefined;

  const shareRecord: ShareItem = {
    id: `p2p_${task.id}`,
    type: (task.itemType as any) === 'mixed' ? 'batch' : task.itemType,
    title: task.title || firstFileName || '直传内容',
    customTitle: task.title,
    fileName: firstFileName,
    extension: ext,
    content: task.textContent,
    preview: task.textContent ? task.textContent.slice(0, 100) : undefined,
    fileSize: task.totalSize,
    fileCount: task.files ? task.files.length : (task.itemType === 'text' ? undefined : 1),
    files: task.files?.map((f, i) => ({
      id: `${task.id}_${i}`,
      name: f.name,
      size: f.size,
      extension: f.name.includes('.') ? f.name.split('.').pop()?.toLowerCase() : undefined,
    })),
    createdAt: task.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    permission: 'all_can_download',
    downloadCount: 0,
    senderName: task.peerName,
    isP2P: true,
    p2pDirection: task.direction,
    p2pPeerName: task.peerName,
    p2pPeerId: task.peerId,
    p2pStatus: 'transferring',
    p2pProgress: 0,
    p2pSpeed: '0 KB/s',
    p2pTransferId: task.id,
  };

  addP2PRecord(shareRecord);
  return newTask;
}

/**
 * 取消任务并彻底清除本地存储与队列记录 (释放内存与 IndexedDB)
 */
export async function cancelAndRemoveP2PTask(id: string): Promise<void> {
  const cleanId = id.startsWith('p2p_') ? id.slice(4) : id;
  activeTasks = activeTasks.filter((t) => t.id !== cleanId && t.id !== id);
  notifyQueueChange();

  await deleteLocalP2PRecord(`p2p_${cleanId}`);
  await deleteLocalP2PRecord(cleanId);
}

/**
 * 实时更新任务进度与本地记录
 */
export function updateP2PTaskProgress(
  id: string,
  percent: number,
  transferredBytes: number,
  speedText: string,
  channel?: 'webrtc' | 'relay'
): void {
  const target = activeTasks.find((t) => t.id === id);
  if (target) {
    target.percent = percent;
    target.transferredBytes = transferredBytes;
    target.speedText = speedText;
    if (channel) target.channel = channel;
    notifyQueueChange();

    updateP2PRecordProgress(`p2p_${id}`, percent, speedText);
  }
}

/**
 * 标记任务完成并更新本地 P2P 记录
 */
export async function finishP2PTask(
  id: string,
  fileBlobs?: Array<{ name: string; blob: Blob }>
): Promise<void> {
  const target = activeTasks.find((t) => t.id === id);
  if (target) {
    target.status = 'completed';
    target.percent = 100;
    target.speedText = '完成';
    notifyQueueChange();

    await completeP2PRecord(`p2p_${id}`, fileBlobs);
  }
}

/**
 * 标记任务失败或取消
 */
export function cancelOrFailP2PTask(id: string, isCancel = false): void {
  const target = activeTasks.find((t) => t.id === id);
  if (target) {
    target.status = isCancel ? 'cancelled' : 'failed';
    notifyQueueChange();

    failP2PRecord(`p2p_${id}`, isCancel ? 'cancelled' : 'failed');
  }
}

/**
 * 从队列中清除已完成或已取消的任务
 */
export function removeP2PTask(id: string): void {
  activeTasks = activeTasks.filter((t) => t.id !== id);
  notifyQueueChange();
}

export { QUEUE_CHANGE_EVENT, SESSION_CHANGE_EVENT };
