import { ShareItem } from '@shared/types';

const P2P_RECORDS_KEY = 'lightdrop_p2p_records';
export const P2P_RECORDS_CHANGED_EVENT = 'lightdrop:p2p-records-changed';

const DB_NAME = 'LightDrop_P2P_DB';
const DB_VERSION = 1;
const STORE_NAME = 'blobs';

// 打开或创建本地 IndexedDB 数据库
function openP2PDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      return reject(new Error('IndexedDB not supported'));
    }
    const request = window.indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * 获取本地缓存的所有 P2P 共享记录元数据
 */
export function getLocalP2PRecords(): ShareItem[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(P2P_RECORDS_KEY);
    if (!raw) return [];
    const list = JSON.parse(raw);
    return Array.isArray(list) ? list : [];
  } catch (err) {
    console.warn('[P2P Storage] Failed to read from localStorage:', err);
    return [];
  }
}

/**
 * 内部保存 P2P 记录列表
 */
function saveLocalP2PRecords(records: ShareItem[]): void {
  try {
    localStorage.setItem(P2P_RECORDS_KEY, JSON.stringify(records));
    window.dispatchEvent(new CustomEvent(P2P_RECORDS_CHANGED_EVENT, { detail: records }));
  } catch (err) {
    console.warn('[P2P Storage] Failed to save to localStorage:', err);
  }
}

/**
 * 新增一条 P2P 记录（如传输开始时）
 */
export function addP2PRecord(item: ShareItem): void {
  const list = getLocalP2PRecords();
  const existingIdx = list.findIndex((r) => r.id === item.id);
  if (existingIdx >= 0) {
    list[existingIdx] = item;
  } else {
    list.unshift(item);
  }
  saveLocalP2PRecords(list);
}

/**
 * 实时更新正在传输中的 P2P 记录进度
 */
export function updateP2PRecordProgress(
  id: string,
  progress: number,
  speedText?: string
): void {
  const list = getLocalP2PRecords();
  const target = list.find((r) => r.id === id || r.p2pTransferId === id);
  if (target) {
    target.p2pProgress = progress;
    if (speedText) target.p2pSpeed = speedText;
    saveLocalP2PRecords(list);
  }
}

/**
 * 标记 P2P 记录传输完成，并将接收到的二进制文件 Blob 安全存入 IndexedDB
 */
export async function completeP2PRecord(
  id: string,
  fileBlobs?: Array<{ name: string; blob: Blob }>
): Promise<void> {
  const list = getLocalP2PRecords();
  const target = list.find((r) => r.id === id || r.p2pTransferId === id);
  if (!target) return;

  target.p2pStatus = 'completed';
  target.p2pProgress = 100;
  target.p2pSpeed = '完成';

  // 将文件 Blobs 存入 IndexedDB 保证离线持久化且不爆内存/localStorage
  if (fileBlobs && fileBlobs.length > 0) {
    try {
      const db = await openP2PDatabase();
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);

      for (let i = 0; i < fileBlobs.length; i++) {
        const key = `${target.id}_${i}`;
        store.put(fileBlobs[i].blob, key);
      }

      await new Promise<void>((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    } catch (err) {
      console.warn('[P2P Storage] Failed to save blobs to IndexedDB:', err);
    }
  }

  saveLocalP2PRecords(list);
}

/**
 * 标记 P2P 记录失败或取消
 */
export function failP2PRecord(id: string, reason?: string): void {
  const list = getLocalP2PRecords();
  const target = list.find((r) => r.id === id || r.p2pTransferId === id);
  if (target) {
    target.p2pStatus = reason === 'cancelled' ? 'cancelled' : 'failed';
    saveLocalP2PRecords(list);
  }
}

/**
 * 从 IndexedDB 获取指定 P2P 记录的文件 Blob
 */
export async function getP2PRecordBlob(
  recordId: string,
  fileIndex = 0
): Promise<Blob | null> {
  try {
    const db = await openP2PDatabase();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const key = `${recordId}_${fileIndex}`;
      const request = store.get(key);

      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  } catch (err) {
    console.warn('[P2P Storage] Failed to get blob from IndexedDB:', err);
    return null;
  }
}

/**
 * 删除单条 P2P 记录 (清除元数据及关联的 IndexedDB Blobs)
 */
export async function deleteLocalP2PRecord(recordId: string): Promise<void> {
  const list = getLocalP2PRecords();
  const target = list.find((r) => r.id === recordId);
  const filtered = list.filter((r) => r.id !== recordId);
  saveLocalP2PRecords(filtered);

  // 清除 IndexedDB 数据
  if (target && target.fileCount) {
    try {
      const db = await openP2PDatabase();
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      for (let i = 0; i < (target.fileCount || 1); i++) {
        store.delete(`${recordId}_${i}`);
      }
    } catch (_) {}
  }
}

/**
 * 清空全部本地 P2P 记录与文件缓存
 */
export async function clearAllLocalP2PRecords(): Promise<void> {
  saveLocalP2PRecords([]);
  try {
    const db = await openP2PDatabase();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).clear();
  } catch (_) {}
}
