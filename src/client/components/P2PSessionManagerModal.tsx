import React from 'react';
import {
  X,
  Link2,
  Laptop,
  Smartphone,
  Send,
  Unlink,
  Plus,
  ShieldCheck,
  AlertCircle,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { P2PSession } from '@shared/types';
import { getOsDisplayName } from '../utils/platform';

interface P2PSessionManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  activeSessions: P2PSession[];
  onDisconnectSession: (peerId?: string) => void;
  onDisconnectAllSessions: () => void;
  onSelectPeerToSend?: (peer: { deviceId: string; displayName: string }) => void;
  onOpenDevicePicker?: () => void;
}

export const P2PSessionManagerModal: React.FC<P2PSessionManagerModalProps> = ({
  isOpen,
  onClose,
  activeSessions,
  onDisconnectSession,
  onDisconnectAllSessions,
  onSelectPeerToSend,
  onOpenDevicePicker,
}) => {
  const { t } = useTranslation();

  if (!isOpen) return null;

  const getDeviceIcon = (osStr?: string) => {
    const os = (osStr || '').toLowerCase();
    if (os === 'ios' || os === 'android') {
      return <Smartphone className="w-4 h-4 text-slate-500" />;
    }
    return <Laptop className="w-4 h-4 text-slate-500" />;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
      <div className="bg-white rounded-3xl shadow-2xl border border-slate-200/90 w-full max-w-lg max-h-[85vh] overflow-hidden flex flex-col animate-scale-in">
        {/* 顶部标题栏 */}
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between bg-gradient-to-r from-emerald-50/70 via-teal-50/40 to-slate-50/50 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-emerald-600 text-white flex items-center justify-center shadow-xs">
              <Link2 className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-slate-800">
                  {t('p2p.sessionManagerTitle', 'P2P 直连会话管理')}
                </h3>
                <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-100 text-emerald-800">
                  {activeSessions.length} 个节点
                </span>
              </div>
              <p className="text-[11px] text-slate-500 mt-0.5">
                {t('p2p.sessionManagerSubtitle', '多端免握手双向直连通道，即发即收')}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* 顶部特性提示条 */}
        <div className="px-5 py-2.5 bg-emerald-50/50 border-b border-emerald-100/70 flex items-center justify-between gap-3 text-[11px] text-emerald-800 shrink-0">
          <div className="flex items-center gap-1.5 min-w-0 truncate">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
            <span className="truncate">已建立会话的节点间传输无需对方每次弹窗确认</span>
          </div>
          {activeSessions.length > 1 && (
            <button
              type="button"
              onClick={() => {
                if (window.confirm(t('p2p.disconnectAllConfirm', '确定断开所有已建立的 P2P 直连会话吗？'))) {
                  onDisconnectAllSessions();
                }
              }}
              className="text-rose-600 hover:text-rose-700 hover:underline font-semibold shrink-0"
            >
              {t('p2p.disconnectAllSessions', '全部断开')}
            </button>
          )}
        </div>

        {/* 会话列表区域 */}
        <div className="p-4 sm:p-5 overflow-y-auto space-y-3 flex-1 custom-scrollbar">
          {activeSessions.length === 0 ? (
            <div className="py-12 flex flex-col items-center justify-center text-center">
              <div className="w-14 h-14 rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center mb-3">
                <Unlink className="w-7 h-7" />
              </div>
              <p className="text-sm font-semibold text-slate-700">
                {t('p2p.noActiveSessions', '当前暂无已连接的 P2P 会话')}
              </p>
              <p className="text-xs text-slate-400 mt-1 max-w-xs leading-relaxed">
                {t('p2p.sessionEmptyDesc', '建立长连接后，双端可互发文本与大文件，直接写入本地缓存，零服务器存储。')}
              </p>
              {onOpenDevicePicker && (
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onOpenDevicePicker();
                  }}
                  className="mt-5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-xl shadow-xs transition flex items-center gap-1.5"
                >
                  <Plus className="w-4 h-4" />
                  <span>{t('p2p.goDiscoverToConnect', '去发现设备建立长连接')}</span>
                </button>
              )}
            </div>
          ) : (
            activeSessions.map((session) => (
              <div
                key={session.peerId}
                className="p-3.5 sm:p-4 rounded-2xl border border-slate-200/90 hover:border-emerald-300 bg-white hover:bg-emerald-50/20 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-2xs"
              >
                {/* 节点基本信息 */}
                <div className="flex items-center gap-3 min-w-0">
                  <div
                    className={`w-11 h-11 rounded-xl bg-gradient-to-br ${
                      session.peerAvatarColor || 'from-emerald-500 to-teal-600'
                    } text-white flex items-center justify-center text-xl shadow-xs shrink-0`}
                  >
                    {session.peerAvatarEmoji || '⚡'}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs sm:text-sm font-bold text-slate-800 truncate" title={session.peerName}>
                        {session.peerName}
                      </span>
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded-full text-[10px] bg-emerald-100 text-emerald-800 font-semibold shrink-0">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                        {t('p2p.directActive', '直连活跃')}
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-500 flex items-center gap-2 mt-0.5">
                      <span className="inline-flex items-center gap-1 font-medium text-slate-600">
                        {getDeviceIcon(session.peerOs)}
                        {getOsDisplayName(session.peerOs as any)}
                      </span>
                      <span>•</span>
                      <span className="font-mono text-slate-400">
                        {session.establishedAt
                          ? `连接于 ${new Date(session.establishedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
                          : '已连接'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* 操作按钮组 */}
                <div className="flex items-center gap-2 justify-end pt-2 sm:pt-0 border-t border-slate-100 sm:border-t-0 shrink-0">
                  {onSelectPeerToSend && (
                    <button
                      type="button"
                      onClick={() => {
                        onSelectPeerToSend({
                          deviceId: session.peerId,
                          displayName: session.peerName,
                        });
                        onClose();
                      }}
                      className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200 transition flex items-center gap-1 shadow-2xs"
                    >
                      <Send className="w-3 h-3" />
                      <span>{t('p2p.sendToThisPeer', '设为目标')}</span>
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => onDisconnectSession(session.peerId)}
                    className="px-3 py-1.5 rounded-xl text-xs font-medium bg-rose-50 text-rose-600 hover:bg-rose-100 border border-rose-200 transition shadow-2xs"
                  >
                    {t('p2p.disconnect', '断开')}
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        {/* 底部功能条 */}
        <div className="px-5 py-3 border-t border-slate-100 bg-slate-50/70 flex items-center justify-between gap-3 shrink-0">
          <div className="text-[11px] text-slate-500 flex items-center gap-1">
            <AlertCircle className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            <span>{t('p2p.tabCloseTip', '刷新或关闭当前标签页时，长连接会话将自动清理')}</span>
          </div>
          {onOpenDevicePicker && (
            <button
              type="button"
              onClick={() => {
                onClose();
                onOpenDevicePicker();
              }}
              className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 transition flex items-center gap-1 shadow-2xs shrink-0"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>{t('p2p.discoverMore', '发现更多设备')}</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
