import { FavoritePeer, PeerInfo } from '@shared/types';

const FAVORITES_STORAGE_KEY = 'lightdrop_p2p_favorite_nodes';
export const FAVORITES_CHANGE_EVENT = 'lightdrop:favorites-changed';

/**
 * 获取本地缓存的所有已收藏节点列表
 */
export function getFavoritePeers(): FavoritePeer[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(FAVORITES_STORAGE_KEY);
    if (!raw) return [];
    const list = JSON.parse(raw);
    return Array.isArray(list) ? list : [];
  } catch (err) {
    console.warn('[FavoritePeers] Failed to load from localStorage:', err);
    return [];
  }
}

/**
 * 保存收藏节点列表到本地存储
 */
function saveFavoritePeers(list: FavoritePeer[]): void {
  try {
    localStorage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify(list));
    window.dispatchEvent(new CustomEvent(FAVORITES_CHANGE_EVENT, { detail: list }));
  } catch (err) {
    console.warn('[FavoritePeers] Failed to save to localStorage:', err);
  }
}

/**
 * 收藏一个节点 (如果已存在则更新其昵称或自定义名称)
 */
export function addFavoritePeer(peer: PeerInfo, customName?: string): FavoritePeer {
  const list = getFavoritePeers();
  const existingIndex = list.findIndex((item) => item.deviceId === peer.deviceId);

  const newEntry: FavoritePeer = {
    deviceId: peer.deviceId,
    customName: customName?.trim() || (existingIndex >= 0 ? list[existingIndex].customName : undefined),
    nickname: peer.nickname,
    os: peer.os,
    createdAt: existingIndex >= 0 ? list[existingIndex].createdAt : new Date().toISOString(),
  };

  if (existingIndex >= 0) {
    list[existingIndex] = newEntry;
  } else {
    list.unshift(newEntry);
  }

  saveFavoritePeers(list);
  return newEntry;
}

/**
 * 修改某个已收藏节点的自定义名称
 */
export function updateFavoritePeerName(deviceId: string, customName: string): void {
  const list = getFavoritePeers();
  const target = list.find((item) => item.deviceId === deviceId);
  if (target) {
    target.customName = customName.trim() || undefined;
    saveFavoritePeers(list);
  }
}

/**
 * 移除某个收藏节点
 */
export function removeFavoritePeer(deviceId: string): void {
  const list = getFavoritePeers();
  const filtered = list.filter((item) => item.deviceId !== deviceId);
  saveFavoritePeers(filtered);
}

/**
 * 检查某个设备是否已被收藏
 */
export function isPeerFavorite(deviceId: string): boolean {
  const list = getFavoritePeers();
  return list.some((item) => item.deviceId === deviceId);
}
