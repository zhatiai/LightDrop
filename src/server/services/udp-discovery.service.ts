import dgram from 'dgram';
import os from 'os';
import crypto from 'crypto';
import { DEFAULT_UDP_PORT } from '../../shared/constants.js';
import { configManager } from '../config/config.manager.js';
import {
  getLocalIpAddress,
  getBonjourHost,
  getBonjourUrl,
} from './ip.service.js';
import { networkWatcherService } from './network-watcher.service.js';

export class UdpDiscoveryService {
  private socket: dgram.Socket | null = null;
  private isListening: boolean = false;
  private port: number = DEFAULT_UDP_PORT;
  // 唯一实例 ID，用于在收到广播或回路包时严格识别是否为自身发出的报文
  private readonly instanceId: string = crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2);
  // 信标数据缓存（5秒 TTL，避免收到嗅探时频繁调用 os.networkInterfaces() 产生系统调用高 CPU）
  private cachedBeaconData: Map<string, { data: string; timestamp: number }> = new Map();
  // 本地网卡 IP 集合缓存（5秒 TTL）
  private localIpsCache: Set<string> = new Set();
  private localIpsCacheTime: number = 0;
  // 防刷频限流：记录每个对端 IP 最近一次响应时间
  private lastResponseTimes: Map<string, number> = new Map();

  /**
   * 启动 UDP 局域网服务自发现与广播信标
   */
  public start(port: number = DEFAULT_UDP_PORT): void {
    if (this.isListening) return;
    this.port = port;

    const settings = configManager.getSettings();
    if (settings.enableUdpDiscovery === false) {
      console.log('[UDP] Discovery service disabled in settings.');
      return;
    }

    try {
      this.socket = dgram.createSocket({ type: 'udp4', reuseAddr: true });

      this.socket.on('error', (err) => {
        console.warn('[UDP] Discovery socket error:', err.message);
        try {
          this.socket?.close();
        } catch (_) {}
        this.isListening = false;
      });

      this.socket.on('message', (msg, rinfo) => {
        try {
          const text = msg.toString().trim();
          if (!text) return;

          // 1. 结构化 JSON 识别：如果包含自身的 instanceId，坚决忽略（自身广播回环）
          if (text.startsWith('{') && text.endsWith('}')) {
            try {
              const parsed = JSON.parse(text);
              if (parsed.instanceId && parsed.instanceId === this.instanceId) {
                return; // 来自本进程，直接忽略
              }
              // 绝对不响应任何宣告包（ANNOUNCE）或响应包（PONG），防止多实例/回环相互轰炸
              if (
                parsed.event === 'LIGHTDROP_ANNOUNCE' ||
                parsed.event === 'LIGHTDROP_PONG' ||
                parsed.event?.endsWith('_PONG') ||
                parsed.event?.endsWith('_ANNOUNCE')
              ) {
                return;
              }
            } catch (_) {}
          }

          // 2. 避免对自身端口的回路包进行响应
          if (rinfo.port === this.port) {
            const localIps = this.getLocalIps();
            if (localIps.has(rinfo.address) || rinfo.address === '127.0.0.1' || rinfo.address === '::1') {
              return;
            }
          }

          // 3. 严格匹配发现请求（必须包含 DISCOVER、PING、SCAN，且绝不能包含 PONG 或 ANNOUNCE）
          const upperText = text.toUpperCase();
          if (upperText.includes('PONG') || upperText.includes('ANNOUNCE')) {
            return;
          }

          const isDiscoveryQuery =
            upperText.includes('DISCOVER') ||
            upperText.includes('PING') ||
            upperText.includes('SCAN') ||
            upperText.includes('QUERY');

          if (!isDiscoveryQuery) {
            return;
          }

          // 4. 防抖与限流：同客户端 IP 500ms 内最多回复 1 次，防止网络风暴
          const now = Date.now();
          const lastTime = this.lastResponseTimes.get(rinfo.address) || 0;
          if (now - lastTime < 500) {
            return;
          }
          this.lastResponseTimes.set(rinfo.address, now);

          // 清理历史超期限流记录，防止 Map 泄露
          if (this.lastResponseTimes.size > 1000) {
            for (const [ip, time] of this.lastResponseTimes.entries()) {
              if (now - time > 10000) this.lastResponseTimes.delete(ip);
            }
          }

          this.respondToClient(rinfo);
        } catch (_) {}
      });

      this.socket.bind(this.port, () => {
        this.isListening = true;
        try {
          this.socket?.setBroadcast(true);
        } catch (_) {}
        console.log(`[UDP] Discovery beacon listening on 0.0.0.0:${this.port}`);
        // 启动时主动广播一次信标
        this.broadcastAnnouncement();
      });

      // 监听网络变动事件，网络变更时刷新信标缓存并广播新地址信标
      networkWatcherService.on('networkChanged', () => {
        this.cachedBeaconData.clear();
        this.localIpsCache.clear();
        this.broadcastAnnouncement();
      });
    } catch (err: any) {
      console.warn('[UDP] Failed to start discovery service:', err.message);
    }
  }

  /**
   * 获取本地网卡 IP 集合（带 TTL 缓存）
   */
  private getLocalIps(): Set<string> {
    const now = Date.now();
    if (now - this.localIpsCacheTime < 5000 && this.localIpsCache.size > 0) {
      return this.localIpsCache;
    }

    const ips = new Set<string>(['127.0.0.1', '::1', '0.0.0.0']);
    try {
      const ifaces = os.networkInterfaces();
      for (const list of Object.values(ifaces)) {
        if (!list) continue;
        for (const item of list) {
          if (item.address) {
            ips.add(item.address);
          }
        }
      }
    } catch (_) {}

    this.localIpsCache = ips;
    this.localIpsCacheTime = now;
    return ips;
  }

  /**
   * 获取当前服务宣告包（带 5 秒轻量缓存）
   */
  private getBeaconData(event: string = 'LIGHTDROP_ANNOUNCE'): string {
    const now = Date.now();
    const cached = this.cachedBeaconData.get(event);
    if (cached && now - cached.timestamp < 5000) {
      return cached.data;
    }

    const settings = configManager.getSettings();
    const httpPort = Number(process.env.PORT) || settings.port || 8080;
    const ip = getLocalIpAddress();
    const bonjourHost = getBonjourHost();
    const bonjourUrl = getBonjourUrl(httpPort);
    const url = `http://${ip}:${httpPort}`;

    const data = JSON.stringify({
      event,
      service: 'LightDrop',
      instanceId: this.instanceId,
      siteTitle: settings.siteTitle || 'LightDrop',
      ip,
      httpPort,
      url,
      bonjourHost,
      bonjourUrl,
      timestamp: new Date().toISOString(),
    });

    this.cachedBeaconData.set(event, { data, timestamp: now });
    return data;
  }

  /**
   * 回复发起发现请求的局域网客户端
   */
  private respondToClient(rinfo: dgram.RemoteInfo): void {
    if (!this.socket || !this.isListening) return;

    try {
      const responseData = this.getBeaconData('LIGHTDROP_PONG');
      const buffer = Buffer.from(responseData);
      this.socket.send(buffer, 0, buffer.length, rinfo.port, rinfo.address, (err) => {
        if (err) {
          console.warn('[UDP] Failed to send discovery response:', err.message);
        }
      });
    } catch (_) {}
  }

  /**
   * 向局域网全网广播信标
   */
  public broadcastAnnouncement(): void {
    if (!this.socket || !this.isListening) return;

    try {
      const data = this.getBeaconData('LIGHTDROP_ANNOUNCE');
      const buffer = Buffer.from(data);
      this.socket.send(buffer, 0, buffer.length, this.port, '255.255.255.255', (err) => {
        if (err) {
          // 局域网广播受防火墙限制时静默忽略
        }
      });
    } catch (_) {}
  }

  /**
   * 停止 UDP 发现服务
   */
  public stop(): void {
    if (this.socket) {
      try {
        this.socket.close();
      } catch (_) {}
      this.socket = null;
    }
    this.isListening = false;
    this.cachedBeaconData.clear();
    this.lastResponseTimes.clear();
  }
}

export const udpDiscoveryService = new UdpDiscoveryService();
