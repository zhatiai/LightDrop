import React from 'react';
import {
  X,
  Link2,
  Laptop,
  Smartphone,
  ShieldCheck,
  CheckCircle2,
  XCircle,
  CheckCheck,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { PeerInfo } from '@shared/types';
import { getOsDisplayName } from '../utils/platform';

interface P2PSessionRequestModalProps {
  request?: { sender: PeerInfo } | null;
  requests?: Array<{ sender: PeerInfo; requestedAt?: string }>;
  onAccept: (peerId?: string) => void;
  onReject: (peerId?: string) => void;
  onAcceptAll?: () => void;
  onRejectAll?: () => void;
}

export const P2PSessionRequestModal: React.FC<P2PSessionRequestModalProps> = ({
  request,
  requests,
  onAccept,
  onReject,
  onAcceptAll,
  onRejectAll,
}) => {
  const { t } = useTranslation();

  // 统一解析当前待处理的请求列表
  const reqList = requests && requests.length > 0
    ? requests
    : request ? [request] : [];

  if (reqList.length === 0) return null;

  const currentReq = reqList[0];
  const { sender } = currentReq;
  const hasMultiple = reqList.length > 1;

  const getDeviceIcon = (osStr?: string) => {
    const os = (osStr || '').toLowerCase();
    if (os === 'ios' || os === 'android') {
      return <Smartphone className="w-4 h-4 text-slate-500" />;
    }
    return <Laptop className="w-4 h-4 text-slate-500" />;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
      <div className="bg-white rounded-3xl shadow-2xl border border-slate-200/90 w-full max-w-md overflow-hidden flex flex-col animate-scale-in">
        {/* 顶部标题栏 */}
        <div className="px-6 py-4.5 border-b border-slate-100 flex items-center justify-between bg-gradient-to-r from-blue-50/60 via-indigo-50/40 to-slate-50/50">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-blue-600 text-white flex items-center justify-center shadow-xs">
              <Link2 className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-slate-800">
                  {t('p2p.sessionRequestTitle', '收到 P2P 长连接会话请求')}
                </h3>
                {hasMultiple && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 text-blue-700">
                    待处理 (1/{reqList.length})
                  </span>
                )}
              </div>
              <p className="text-[11px] text-slate-500 mt-0.5">
                {t('p2p.sessionRequestSubtitle', '建立免握手双向直连信道')}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => onReject(sender.deviceId)}
            className="p-1 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* 发送者设备卡片 */}
        <div className="p-6 space-y-4">
          <div className="p-3.5 rounded-2xl border border-blue-200/80 bg-blue-50/40 flex items-center gap-3.5 shadow-2xs">
            <div
              className={`w-12 h-12 rounded-xl bg-gradient-to-br ${
                sender.avatarColor || 'from-blue-500 to-indigo-600'
              } text-white flex items-center justify-center text-2xl shadow-xs shrink-0`}
            >
              {sender.avatarEmoji || '✨'}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-slate-800 truncate" title={sender.nickname}>
                  {sender.nickname}
                </span>
                <span className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded-full text-[10px] bg-emerald-100 text-emerald-700 font-medium">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  {t('p2p.online', '在线')}
                </span>
              </div>
              <div className="text-xs text-slate-500 flex items-center gap-2 mt-1">
                <span className="inline-flex items-center gap-1 font-medium text-slate-600">
                  {getDeviceIcon(sender.os)}
                  {getOsDisplayName(sender.os as any)}
                </span>
                <span>•</span>
                <span>{sender.clientIp || '局域网'}</span>
              </div>
            </div>
          </div>

          {/* 会话模式说明 */}
          <div className="p-3 bg-slate-50 border border-slate-200/70 rounded-2xl flex items-start gap-2.5 text-xs text-slate-600">
            <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
            <div className="space-y-1 text-[11px] leading-relaxed">
              <p className="font-semibold text-slate-800">
                {t('p2p.sessionFeatureTitle', '长连接会话特性：')}
              </p>
              <ul className="list-disc pl-4 space-y-0.5 text-slate-500">
                <li>双方可随时彼此发送文本或文件，免除逐次握手弹窗确认。</li>
                <li>传输数据仅保留在彼此浏览器缓存，安全且零服务器存储。</li>
                <li>您可同时与多个设备保持长连接，并随时在管理面板中独立断开。</li>
              </ul>
            </div>
          </div>
        </div>

        {/* 底部按钮栏 */}
        <div className="px-6 py-4 bg-slate-50/80 border-t border-slate-100 flex flex-col gap-2">
          {hasMultiple && onAcceptAll && (
            <button
              type="button"
              onClick={onAcceptAll}
              className="w-full py-2 px-3 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white transition flex items-center justify-center gap-1.5 shadow-xs"
            >
              <CheckCheck className="w-4 h-4" />
              <span>全部同意 ({reqList.length} 个请求)</span>
            </button>
          )}

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => onReject(sender.deviceId)}
              className="flex-1 py-2.5 px-4 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100 border border-slate-200 transition flex items-center justify-center gap-1.5"
            >
              <XCircle className="w-4 h-4" />
              <span>{t('common.reject', '拒绝')}</span>
            </button>
            <button
              type="button"
              onClick={() => onAccept(sender.deviceId)}
              className="flex-1 py-2.5 px-4 rounded-xl text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 shadow-md shadow-blue-500/20 transition flex items-center justify-center gap-1.5"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>{t('p2p.btnAcceptSession', '同意建立长连接')}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
