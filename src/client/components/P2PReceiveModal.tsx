import React from 'react';
import {
  X,
  Download,
  AlertCircle,
  CheckCircle2,
  Loader2,
  FileText,
  Folder,
  File as FileIcon,
  Image as ImageIcon,
  ArrowDownToLine,
  Smartphone,
  Laptop,
  Sparkles,
  ShieldCheck,
  Radio,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  IncomingTransferRequest,
  IncomingTransferProgressState,
} from '../hooks/useP2P';
import { formatBytes } from '../utils/format';
import { getOsDisplayName } from '../utils/platform';

interface P2PReceiveModalProps {
  request: IncomingTransferRequest | null;
  transfer: IncomingTransferProgressState | null;
  onAccept: () => void;
  onReject: () => void;
  onDismiss: () => void;
}

export const P2PReceiveModal: React.FC<P2PReceiveModalProps> = ({
  request,
  transfer,
  onAccept,
  onReject,
  onDismiss,
}) => {
  const { t } = useTranslation();

  if (!request && !transfer) return null;

  const getDeviceIcon = (osStr?: string) => {
    const os = (osStr || '').toLowerCase();
    if (os === 'ios' || os === 'android') {
      return <Smartphone className="w-4 h-4 text-slate-500" />;
    }
    return <Laptop className="w-4 h-4 text-slate-500" />;
  };

  const getFileIcon = (name: string) => {
    const ext = name.split('.').pop()?.toLowerCase() || '';
    if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'avif'].includes(ext)) {
      return <ImageIcon className="w-4 h-4 text-purple-500 shrink-0" />;
    }
    if (['zip', 'rar', '7z', 'tar', 'gz'].includes(ext)) {
      return <Folder className="w-4 h-4 text-amber-500 shrink-0" />;
    }
    if (['txt', 'md', 'doc', 'docx', 'pdf', 'json', 'ts', 'js'].includes(ext)) {
      return <FileText className="w-4 h-4 text-blue-500 shrink-0" />;
    }
    return <FileIcon className="w-4 h-4 text-slate-500 shrink-0" />;
  };

  // 1. 握手阶段：收到对方发来的传输请求，询问是否进入接收模式并接收
  if (request && !transfer) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
        <div className="bg-white rounded-3xl shadow-2xl border border-slate-200/80 w-full max-w-md overflow-hidden animate-scale-up">
          {/* 顶部彩色装饰条 */}
          <div className="h-2 bg-gradient-to-r from-blue-500 via-indigo-500 to-emerald-500" />

          <div className="p-6">
            {/* 发送方信息卡片 */}
            <div className="flex items-center gap-3.5 mb-5 pb-4 border-b border-slate-100">
              <div
                className={`w-12 h-12 rounded-2xl bg-gradient-to-br ${
                  request.sender.avatarColor || 'from-blue-500 to-indigo-600'
                } flex items-center justify-center text-2xl shadow-md shrink-0`}
              >
                {request.sender.avatarEmoji || '✨'}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-bold text-slate-900 truncate">
                    {request.sender.nickname}
                  </h3>
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-blue-50 text-blue-700 border border-blue-200/60">
                    {getDeviceIcon(request.sender.os)}
                    {getOsDisplayName(request.sender.os as any)}
                  </span>
                </div>
                <p className="text-xs text-slate-400 mt-0.5 flex items-center gap-1.5">
                  <span>{request.sender.clientIp || '局域网'}</span>
                  <span>•</span>
                  <span className="text-blue-600 font-medium">
                    {t('p2p.requestingTransfer', '请求向您传输内容')}
                  </span>
                </p>
              </div>
            </div>

            {/* 传输内容清单 */}
            <div className="mb-6 rounded-2xl bg-slate-50/80 border border-slate-200/80 p-4">
              <div className="flex items-center justify-between text-xs text-slate-500 mb-2 font-medium">
                <span>{t('p2p.transferDetails', '传输详情')}</span>
                <span className="font-mono font-semibold text-slate-700">
                  {formatBytes(request.totalSize)}
                </span>
              </div>

              {request.itemType === 'text' ? (
                <div className="space-y-1.5">
                  <div className="text-xs font-semibold text-slate-800">
                    {request.title || t('p2p.textMessage', '文本内容')}
                  </div>
                  {request.textPreview && (
                    <div className="text-xs font-mono text-slate-600 bg-white p-2.5 rounded-xl border border-slate-200 line-clamp-3">
                      {request.textPreview}
                    </div>
                  )}
                  <div className="text-[11px] text-slate-400 font-mono">
                    {t('p2p.totalChars', { count: request.textLength || 0 })}
                  </div>
                </div>
              ) : (
                <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
                  {request.files?.map((file, idx) => (
                    <div
                      key={idx}
                      className="flex items-center justify-between p-2 rounded-xl bg-white border border-slate-200/80 text-xs shadow-2xs"
                    >
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        {getFileIcon(file.name)}
                        <span className="truncate text-slate-800 font-medium" title={file.name}>
                          {file.name}
                        </span>
                      </div>
                      <span className="text-[11px] font-mono text-slate-400 ml-2 shrink-0">
                        {formatBytes(file.size)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* 安全提示 */}
            <div className="flex items-center gap-2 text-[11px] text-slate-400 mb-6 bg-emerald-50/50 p-2.5 rounded-xl border border-emerald-100">
              <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>
                {t(
                  'p2p.secureNotice',
                  '点对点局域网直传，数据不经由服务器存储，确认后立即进入接收模式。'
                )}
              </span>
            </div>

            {/* 操作按钮组 (拒绝 / 进入接收模式并开始接收) */}
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={onReject}
                className="py-2.5 px-4 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700 font-medium text-xs transition active:scale-95"
              >
                {t('p2p.btnReject', '拒绝')}
              </button>

              <button
                type="button"
                onClick={onAccept}
                className="py-2.5 px-4 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-semibold text-xs shadow-md shadow-blue-500/20 transition active:scale-95 flex items-center justify-center gap-1.5"
              >
                <ArrowDownToLine className="w-4 h-4" />
                <span>{t('p2p.btnAccept', '进入接收模式并接收')}</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // 2. 接收与传输进度阶段
  if (transfer) {
    const isCompleted = transfer.status === 'completed';
    const isFailed = transfer.status === 'failed';
    const progress = transfer.progress;

    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
        <div className="bg-white rounded-3xl shadow-2xl border border-slate-200/80 w-full max-w-md overflow-hidden animate-scale-up">
          <div className="p-6">
            {/* 状态图标与标题 */}
            <div className="text-center mb-5">
              {isCompleted ? (
                <div className="w-14 h-14 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-600 flex items-center justify-center mx-auto mb-3 shadow-inner">
                  <CheckCircle2 className="w-8 h-8 animate-bounce" />
                </div>
              ) : isFailed ? (
                <div className="w-14 h-14 rounded-2xl bg-rose-50 border border-rose-200 text-rose-600 flex items-center justify-center mx-auto mb-3 shadow-inner">
                  <AlertCircle className="w-8 h-8" />
                </div>
              ) : (
                <div className="w-14 h-14 rounded-2xl bg-blue-50 border border-blue-200 text-blue-600 flex items-center justify-center mx-auto mb-3 shadow-inner">
                  <Radio className="w-8 h-8 animate-pulse text-blue-600" />
                </div>
              )}

              <h3 className="text-base font-bold text-slate-800">
                {isCompleted
                  ? t('p2p.receiveSuccessTitle', '接收完成！')
                  : isFailed
                  ? t('p2p.receiveFailedTitle', '传输中断')
                  : t('p2p.receivingTitle', '正在接收数据...')}
              </h3>

              <p className="text-xs text-slate-400 mt-1">
                {isCompleted
                  ? t('p2p.receiveSuccessDesc', '文件已成功保存到您的本地设备')
                  : isFailed
                  ? transfer.errorMessage || t('p2p.receiveFailedDesc', '对端连接异常断开')
                  : t('p2p.receivingFrom', { name: transfer.sender.nickname })}
              </p>
            </div>

            {/* 进度条与速率 (传输中) */}
            {!isCompleted && !isFailed && progress && (
              <div className="mb-6 bg-blue-50/60 border border-blue-200/70 rounded-2xl p-4">
                <div className="flex items-center justify-between text-xs font-semibold text-blue-900 mb-2">
                  <span className="truncate max-w-[200px]">
                    {progress.currentFileName || t('p2p.transferringData', '传输中...')}
                  </span>
                  <span className="font-mono">{progress.percent}%</span>
                </div>

                <div className="w-full bg-blue-200/50 rounded-full h-2.5 overflow-hidden mb-2">
                  <div
                    className="bg-gradient-to-r from-blue-500 to-indigo-600 h-2.5 rounded-full transition-all duration-150"
                    style={{ width: `${Math.max(2, progress.percent)}%` }}
                  />
                </div>

                <div className="flex items-center justify-between text-[11px] font-mono text-slate-500">
                  <span>
                    {formatBytes(progress.transferredBytes)} / {formatBytes(progress.totalBytes)}
                  </span>
                  <span className="font-semibold text-blue-600">{progress.speedText}</span>
                </div>
              </div>
            )}

            {/* 接收成果展示 (完成阶段) */}
            {isCompleted && transfer.result && (
              <div className="mb-6 rounded-2xl bg-slate-50 border border-slate-200 p-3.5 max-h-48 overflow-y-auto space-y-2">
                {transfer.result.type === 'text' ? (
                  <div className="text-xs font-mono bg-white p-3 rounded-xl border border-slate-200 select-all">
                    {transfer.result.textContent}
                  </div>
                ) : (
                  transfer.result.files?.map((file, idx) => (
                    <div
                      key={idx}
                      className="flex items-center justify-between p-2 rounded-xl bg-white border border-slate-200 text-xs"
                    >
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        {getFileIcon(file.name)}
                        <span className="truncate font-medium text-slate-800">{file.name}</span>
                      </div>
                      <span className="text-[11px] font-mono text-slate-400 shrink-0 ml-2">
                        {formatBytes(file.size)}
                      </span>
                    </div>
                  ))
                )}
              </div>
            )}

            {/* 关闭按钮 */}
            <button
              type="button"
              onClick={onDismiss}
              className="w-full py-2.5 px-4 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-medium text-xs transition active:scale-95"
            >
              {isCompleted ? t('common.done', 'Done') : t('common.close', 'Close')}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return null;
};
