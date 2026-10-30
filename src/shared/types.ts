/**
 * LightDrop 共享记录类型
 */
export type ShareItemType = 'text' | 'file' | 'folder' | 'image' | 'batch';

/**
 * 批量文件包中的子文件元数据
 */
export interface BatchFileItem {
  id: string;
  name: string;
  size: number;
  mimeType?: string;
  isImage?: boolean;
  extension?: string;
}

/**
 * 共享记录数据模型
 */
export interface ShareItem {
  id: string;
  type: ShareItemType;
  title: string;          // 文本标题或文件名/文件夹名/合辑名称
  customTitle?: string;   // 用户显式填写的发送标题/描述 (如有)
  content?: string;       // 针对文本类型：完整文本内容
  preview?: string;       // 针对文本类型：前100字符摘要或链接预览
  isUrl?: boolean;        // 是否是 URL 链接
  
  // 针对文件、文件夹与批量合辑
  fileName?: string;      // 原始文件名/文件夹名
  originalPath?: string;  // 内部存储文件路径
  mimeType?: string;      // MIME 类型
  fileSize: number;       // 文件字节数或文本字节数
  fileCount?: number;     // 针对文件夹与批量合辑：包含的文件数量
  extension?: string;     // 文件扩展名 (如 pdf, png, zip, etc.)
  files?: BatchFileItem[];// 针对批量合辑：包含的子文件列表
  isImageBatch?: boolean; // 针对批量合辑：是否全为图片
  
  createdAt: string;      // ISO 字符串或时间戳
  updatedAt: string;
  permission: 'all_can_copy' | 'all_can_download'; // 访问权限
  downloadCount: number;
  hasPassword?: boolean;  // 是否设置了访问密码 (仅作为标志，不透露任何密码)
  password?: string;     // 明文访问密码 (用于发送方或拥有者复制提取信息)
  passwordHash?: string; // 服务端内部密码哈希 (对外接口脱敏过滤)
  senderName?: string;   // 发送者/上传者昵称
  nickname?: string;     // 别名兼容
  
  // P2P 本地直传记录扩展字段 (仅存于浏览器本地缓存)
  isP2P?: boolean;
  p2pDirection?: 'send' | 'receive';
  p2pPeerName?: string;
  p2pPeerId?: string;
  p2pStatus?: 'transferring' | 'completed' | 'failed' | 'cancelled';
  p2pProgress?: number;  // 0 - 100
  p2pSpeed?: string;
  p2pTransferId?: string;
}

/**
 * 网络接口与 IP 信息
 */
export interface NetworkIpInfo {
  name: string;        // 网卡接口名称，如 'en0', 'en5' 或 'bonjour'
  ip: string;          // IPv4 地址或局域网主机名
  url: string;         // 完整访问地址，如 'http://192.168.1.100:8080'
  isDefault: boolean;  // 是否为系统推荐的默认IP
  isBonjour?: boolean; // 是否为 mDNS / Bonjour 局域网稳定域名 (.local)
}

/**
 * 系统统计信息
 */
export interface SystemStats {
  totalRecords: number;
  totalStorageBytes: number;
  todaySentCount: number;
  textCount: number;
  fileCount: number;
  folderCount: number;
  imageCount: number;
  batchCount?: number;
  onlineUsers: number;
  serverTime: string;
  uptimeSeconds: number;
  ipList?: NetworkIpInfo[];
  defaultUrl?: string;
  bonjourHost?: string;        // 如 'my-macbook.local'
  bonjourUrl?: string;         // 如 'http://my-macbook.local:8080'
  localHostName?: string;      // 本地主机名
  udpDiscoveryPort?: number;   // UDP 发现服务端口
}

/**
 * 系统设置模型
 */
export interface SystemSettings {
  storageDir: string;           // 存储目录绝对路径
  port: number;                 // 运行端口
  maxFileSizeMB: number;        // 单文件限制 (MB, 0为无限制)
  autoCleanupDays: number;      // 自动清理周期 (天, 0为永不清理)
  allowAnonymousDelete: boolean;// 是否允许访客删除记录
  siteTitle: string;            // 站点标题
  adminIps?: string[];          // 允许修改服务器配置的管理员 IP 列表
  notifyOnIpChange?: boolean;   // IP 变动时是否广播/通知 (默认 true)
  enableMacNotification?: boolean; // 是否启用 macOS 原生桌面通知 (默认 true)
  webhookUrl?: string;          // 手机推送 Webhook / Bark URL (可选)
  enableUdpDiscovery?: boolean; // 是否启用 UDP 局域网广播发现 (默认 true)
}

/**
 * 网络变更事件负载
 */
export interface NetworkChangePayload {
  oldIp?: string;
  newIp: string;
  oldUrl?: string;
  newUrl: string;
  bonjourUrl: string;
  ipList: NetworkIpInfo[];
  timestamp: string;
}

/**
 * 服务端响应通用包装
 */
export interface ApiResponse<T = any> {
  success: boolean;
  message?: string;
  data?: T;
  error?: string;
}

/**
 * WebSocket 实时事件
 */
export type WsEventType = 
  | 'INIT_STATE'
  | 'ITEM_CREATED'
  | 'ITEM_DELETED'
  | 'ITEMS_BATCH_DELETED'
  | 'ITEMS_CLEARED'
  | 'ONLINE_COUNT_CHANGED'
  | 'SETTINGS_UPDATED'
  | 'STATS_UPDATED'
  | 'AUDIT_LOGS_UPDATED'
  | 'NETWORK_CHANGED'
  // P2P 设备发现与信令事件
  | 'PEER_REGISTER'
  | 'PEER_UPDATE'
  | 'PEER_ONLINE_LIST'
  | 'PEER_JOINED'
  | 'PEER_LEFT'
  | 'PEER_UPDATED'
  | 'P2P_DIRECT_MESSAGE';

export interface WsMessage<T = any> {
  type: WsEventType;
  payload: T;
  timestamp: string;
}

/**
 * P2P 在线设备信息
 */
export interface PeerInfo {
  deviceId: string;          // 设备唯一稳定持久化 UUID
  nickname: string;          // 角色昵称
  os: string;                // 操作系统 (windows, macos, linux, android, ios)
  browser?: string;          // 浏览器标识
  clientIp?: string;         // 局域网 IP
  isReceiveMode?: boolean;   // 是否处于专有接收模式
  avatarEmoji?: string;      // 头像 Emoji
  avatarColor?: string;      // 头像背景色
  connectedAt?: string;      // 连接时间戳
}

/**
 * 收藏的设备节点（持久化于本地存储）
 */
export interface FavoritePeer {
  deviceId: string;          // 设备唯一 ID
  customName?: string;       // 用户配置的自定义备注名称 (如 "我的办公电脑")
  nickname: string;          // 对端原始昵称
  os: string;                // 操作系统
  createdAt: string;         // 收藏时间
}

/**
 * P2P 长连接会话状态
 */
export interface P2PSession {
  peerId: string;
  peerName: string;
  peerOs?: string;
  peerAvatarEmoji?: string;
  peerAvatarColor?: string;
  establishedAt: string;
}

/**
 * P2P 直传单播消息类型
 */
export type P2PDirectMessageType =
  | 'HANDSHAKE_REQUEST'      // 发送方发起握手：询问对端是否接收
  | 'HANDSHAKE_RESPONSE'     // 接收方回复握手：确认接收或拒绝
  | 'HANDSHAKE_CANCEL'       // 发送方取消握手
  | 'SIGNAL'                 // WebRTC SDP Offer/Answer 及 ICE Candidates
  | 'TRANSFER_START'         // 传输开始通知 (协商通道)
  | 'TRANSFER_DATA_CHUNK'    // 流式分片数据传输 (WebSocket 中继或 DataChannel)
  | 'TRANSFER_COMPLETE'      // 传输完成通知
  | 'TRANSFER_COMPLETE_ACK'  // 传输完成确认应答 (接收端文件保存就绪)
  | 'TRANSFER_ACK'           // 传输进度确认应答 (真实送达对端)
  | 'TRANSFER_CANCEL'        // 传输中断取消
  | 'TRANSFER_ERROR'         // 传输错误告警
  | 'SESSION_REQUEST'        // 请求建立长连接会话
  | 'SESSION_ESTABLISH'      // 请求建立长连接会话 (兼容)
  | 'SESSION_ESTABLISHED'    // 确认建立长连接会话
  | 'SESSION_REJECT'         // 拒绝建立长连接会话
  | 'SESSION_DISCONNECT'     // 主动断开长连接会话
  | 'SESSION_DIRECT_TEXT';   // 长连接极速单向文本直发 (0 握手，0 延迟)

/**
 * 握手请求数据载荷
 */
export interface P2PHandshakeRequestPayload {
  transferId: string;
  sender: PeerInfo;
  targetDeviceId: string;
  isSessionTransfer?: boolean; // 是否处于长连接会话中免握手直传
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

/**
 * 握手响应数据载荷
 */
export interface P2PHandshakeResponsePayload {
  transferId: string;
  accepted: boolean;
  reason?: 'rejected' | 'busy' | 'timeout' | 'cancelled' | 'offline';
  receiver?: PeerInfo;
  timestamp: string;
}

/**
 * 握手取消数据载荷
 */
export interface P2PHandshakeCancelPayload {
  transferId: string;
  senderDeviceId: string;
  reason?: string;
}

/**
 * WebRTC 信令数据载荷
 */
export interface P2PSignalPayload {
  transferId: string;
  senderDeviceId: string;
  targetDeviceId: string;
  signalType: 'offer' | 'answer' | 'candidate';
  signal: any;
}

/**
 * 降级中继分片数据载荷 (保证在特殊环境下的 100% 传输成功率)
 */
export interface P2PRelayChunkPayload {
  transferId: string;
  senderDeviceId: string;
  targetDeviceId: string;
  chunkIndex: number;
  totalChunks: number;
  data: string; // Base64 或纯文本
  fileName?: string;
  fileSize?: number;
  isEnd?: boolean;
}

/**
 * P2P 单播传输统一封装
 */
export interface P2PDirectMessage<T = any> {
  messageType: P2PDirectMessageType;
  targetDeviceId: string;
  senderDeviceId: string;
  payload: T;
}

/**
 * 操作审计类型
 */
export type AuditActionType =
  | 'create_text'
  | 'upload_file'
  | 'upload_image'
  | 'upload_folder'
  | 'upload_batch'
  | 'copy_text'
  | 'copy_share_link'
  | 'open_share_page'
  | 'verify_password'
  | 'download_file'
  | 'batch_download'
  | 'delete_record'
  | 'batch_delete'
  | 'clear_records';

/**
 * 操作审计记录条目
 */
export interface AuditLogItem {
  id: string;
  ip: string;             // 操作者 IP
  nickname?: string;      // 操作者昵称
  time: string;           // 操作时间
  targetTitle: string;    // 操作的记录
  targetId?: string;      // 记录 ID
  action: AuditActionType;// 什么操作
  actionLabel: string;    // 操作名称 (中文)
  details?: string;       // 备注详情
}

/**
 * 操作审计查询响应
 */
export interface AuditLogResponse {
  isLocalHost: boolean;   // 是否为服务启动所在设备访问
  clientIp: string;       // 当前客户端 IP
  logs: AuditLogItem[];
}
