import os from 'os';
import { execSync } from 'child_process';
import { NetworkIpInfo } from '../../shared/types.js';

let cachedLocalHostName: string | null = null;
let cachedLocalHostNameTime = 0;

/**
 * 获取设备在局域网中的 mDNS / Bonjour 广播主机名 (如 'my-macbook')
 * macOS 下优先获取系统的 LocalHostName，支持 .local 域名全网解析
 */
export function getLocalHostName(): string {
  const now = Date.now();
  // 缓存 30 秒，避免高频系统调用
  if (cachedLocalHostName && now - cachedLocalHostNameTime < 30000) {
    return cachedLocalHostName;
  }

  let hostName = '';

  if (process.platform === 'darwin') {
    try {
      const output = execSync('scutil --get LocalHostName', {
        encoding: 'utf8',
        timeout: 1000,
        stdio: ['ignore', 'pipe', 'ignore'],
      });
      hostName = output.trim();
    } catch (_) {
      // 忽略错误，降级回退
    }
  }

  if (!hostName) {
    try {
      hostName = os.hostname().replace(/\.local$/i, '').trim();
    } catch (_) {}
  }

  // 兜底净化：移除非法主机名字符
  hostName = hostName.replace(/[^\w-]/g, '') || 'localhost';

  cachedLocalHostName = hostName;
  cachedLocalHostNameTime = now;
  return hostName;
}

/**
 * 获取 Bonjour / mDNS 完整域名 (如 'my-macbook.local')
 */
export function getBonjourHost(): string {
  const name = getLocalHostName();
  return name === 'localhost' ? 'localhost' : `${name}.local`;
}

/**
 * 获取 Bonjour 完整访问地址 (如 'http://my-macbook.local:8080')
 */
export function getBonjourUrl(port: number = 8080, protocol: string = 'http'): string {
  return `${protocol}://${getBonjourHost()}:${port}`;
}

/**
 * 智能获取当前主机在局域网中的最佳 IPv4 地址
 */
export function getLocalIpAddress(): string {
  const allIps = getAllNetworkIps(8080, 'http', false);
  const defaultItem = allIps.find((item) => item.isDefault);
  return defaultItem ? defaultItem.ip : '127.0.0.1';
}

/**
 * 获取当前所有真实网卡的 IPv4 字符串签名 (用于低开销侦测网络变动)
 */
export function getNetworkSignature(): string {
  const ips = getAllNetworkIps(8080, 'http', false).map((item) => item.ip);
  return ips.sort().join('|');
}

/**
 * 获取当前设备所有非回环真实 IPv4 地址列表，并可附带 Bonjour 稳定域名
 */
export function getAllNetworkIps(
  port: number = 8080,
  protocol: string = 'http',
  includeBonjour: boolean = true
): NetworkIpInfo[] {
  const interfaces = os.networkInterfaces();
  const candidates: { name: string; ip: string; priority: number }[] = [];
  const seenIps = new Set<string>();

  for (const name of Object.keys(interfaces)) {
    const lowerName = name.toLowerCase();
    // 忽略特定纯内部或本地虚拟接口
    if (
      lowerName.includes('docker') ||
      lowerName.includes('veth') ||
      lowerName.includes('vmnet') ||
      lowerName.includes('virtual') ||
      lowerName.includes('utun') ||
      lowerName.includes('tun') ||
      lowerName.includes('tap')
    ) {
      continue;
    }

    const ifaceList = interfaces[name];
    if (!ifaceList) continue;

    for (const iface of ifaceList) {
      // 只要非回环的 IPv4
      if (iface.family === 'IPv4' && !iface.internal) {
        const ip = iface.address;
        if (ip === '127.0.0.1' || ip === '0.0.0.0' || seenIps.has(ip)) {
          continue;
        }
        seenIps.add(ip);

        let priority = 1;
        // 局域网常见网段优先级：192.168.x > 10.x > 172.16-31.x
        if (ip.startsWith('192.168.')) {
          priority = 4;
        } else if (ip.startsWith('10.')) {
          priority = 3;
        } else if (/^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(ip)) {
          priority = 2;
        }

        // 如果网卡名类似 en0, eth0, wlan0，提升优先级
        if (/^(en0|eth0|wlan0)$/i.test(name)) {
          priority += 0.5;
        }

        candidates.push({ name, ip, priority });
      }
    }
  }

  // 按优先级降序排序
  candidates.sort((a, b) => b.priority - a.priority);

  const result: NetworkIpInfo[] = [];

  if (candidates.length === 0) {
    result.push({
      name: 'localhost',
      ip: '127.0.0.1',
      url: `${protocol}://127.0.0.1:${port}`,
      isDefault: true,
    });
  } else {
    candidates.forEach((item, index) => {
      result.push({
        name: item.name,
        ip: item.ip,
        url: `${protocol}://${item.ip}:${port}`,
        isDefault: index === 0,
      });
    });
  }

  // 若需要包含 Bonjour 域名且非 localhost，添加至列表中
  if (includeBonjour) {
    const bonjourHost = getBonjourHost();
    if (bonjourHost !== 'localhost') {
      result.unshift({
        name: 'bonjour (.local)',
        ip: bonjourHost,
        url: `${protocol}://${bonjourHost}:${port}`,
        isDefault: false,
        isBonjour: true,
      });
    }
  }

  return result;
}
