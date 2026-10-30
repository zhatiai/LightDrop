import { PeerInfo } from '@shared/types';
import { getUserNickname, getCharacterInfo } from '../nickname';
import { getOperatingSystem } from '../platform';

const DEVICE_ID_KEY = 'lightdrop_p2p_device_id';

/**
 * 获取或初始化当前设备的唯一稳定 UUID 标识
 */
export function getDeviceId(): string {
  if (typeof window === 'undefined') {
    return 'node_ssr';
  }
  try {
    let id = localStorage.getItem(DEVICE_ID_KEY);
    if (!id || id.trim().length === 0) {
      id = `node_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
      localStorage.setItem(DEVICE_ID_KEY, id);
    }
    return id;
  } catch {
    return `node_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
  }
}

/**
 * 简易检测浏览器名称
 */
function getBrowserName(): string {
  if (typeof navigator === 'undefined') return 'Browser';
  const ua = navigator.userAgent;
  if (/chrome|crios/i.test(ua) && !/edge|edgios|edga|opr\//i.test(ua)) return 'Chrome';
  if (/safari/i.test(ua) && !/chrome|crios/i.test(ua)) return 'Safari';
  if (/firefox|fxios/i.test(ua)) return 'Firefox';
  if (/edg/i.test(ua)) return 'Edge';
  if (/opr\//i.test(ua)) return 'Opera';
  return 'Browser';
}

/**
 * 获取当前设备的 PeerInfo 结构
 */
export function getLocalPeerInfo(isReceiveMode = false): PeerInfo {
  const nickname = getUserNickname();
  const charInfo = getCharacterInfo(nickname);
  const os = getOperatingSystem();
  const browser = getBrowserName();

  return {
    deviceId: getDeviceId(),
    nickname,
    os,
    browser,
    isReceiveMode,
    avatarEmoji: charInfo.emoji,
    avatarColor: charInfo.color,
    connectedAt: new Date().toISOString(),
  };
}
