import React, { useState, useCallback, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Header } from './components/Header';
import { SendCard } from './components/SendCard';
import { QuickPreviewCard } from './components/QuickPreviewCard';
import { RecordsTable } from './components/RecordsTable';
import { Footer } from './components/Footer';
import { SettingsModal } from './components/SettingsModal';
import { QrCodeModal } from './components/QrCodeModal';
import { DownloadModal } from './components/DownloadModal';
import { P2PReceiveModal } from './components/P2PReceiveModal';
import { P2PSessionRequestModal } from './components/P2PSessionRequestModal';
import { P2PSessionManagerModal } from './components/P2PSessionManagerModal';
import { useRecords } from './hooks/useRecords';
import { useWebSocket } from './hooks/useWebSocket';
import { useP2P } from './hooks/useP2P';
import { ShareItem, WsMessage } from '@shared/types';
import { X } from 'lucide-react';
import { sendDesktopNotification } from './utils/desktopNotification';

export const App: React.FC = () => {
  const { t } = useTranslation();
  const {
    records,
    filteredRecords,
    stats,
    accessUrl,
    activeTab,
    setActiveTab,
    searchQuery,
    setSearchQuery,
    selectedIds,
    toggleSelect,
    toggleSelectAll,
    sendText,
    uploadFiles,
    uploadFolder,
    uploadMixedBatch,
    copyRecordContent,
    copyShareLink,
    downloadRecord,
    deleteRecord,
    deleteBatch,
    clearAllRecords,
    fetchRecords,
    fetchStats,
    verifyPassword,
    latestText,
    latestFile,
  } = useRecords();

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [qrCodeOpen, setQrCodeOpen] = useState(false);
  const [sessionManagerOpen, setSessionManagerOpen] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [incomingToast, setIncomingToast] = useState<string | null>(null);

  const handleP2PToast = useCallback((type: 'success' | 'error' | 'info', text: string) => {
    setIncomingToast(text);
    setTimeout(() => setIncomingToast(null), 4000);
  }, []);

  const {
    onlinePeers,
    favoritePeers,
    activeSessions,
    activeSession,
    establishSession,
    disconnectSession,
    disconnectAllSessions,
    incomingSessionRequests,
    incomingSessionRequest,
    acceptSessionRequest,
    rejectSessionRequest,
    acceptAllSessionRequests,
    rejectAllSessionRequests,
    tasks,
    outgoingTransfer,
    incomingRequest,
    incomingTransfer,
    startP2PTransfer,
    cancelTransfer,
    cancelOutgoingTransfer,
    acceptIncomingTransfer,
    rejectIncomingTransfer,
    dismissOutgoingTransfer,
    dismissIncomingTransfer,
    toggleFavorite,
    updateFavoriteName,
    isReceiveMode,
    toggleReceiveMode,
    handleP2PWsMessage,
  } = useP2P(handleP2PToast);

  const handleP2PWsMessageRef = useRef(handleP2PWsMessage);
  handleP2PWsMessageRef.current = handleP2PWsMessage;

  // 本机下载目录弹窗与保存状态
  const [downloadModalItem, setDownloadModalItem] = useState<{
    item: ShareItem;
    password?: string;
  } | null>(null);

  const handleOpenDownloadModal = useCallback((item: ShareItem, password?: string) => {
    setDownloadModalItem({ item, password });
  }, []);

  const handleDownloadSuccess = useCallback(
    (dirName: string, fileName: string) => {
      const msg = t('downloadModal.saveSuccessToast', { dir: dirName, file: fileName });
      setIncomingToast(msg);
      setTimeout(() => setIncomingToast(null), 3500);

      sendDesktopNotification({
        title: t('downloadModal.completedTitle', '文件下载完成'),
        body: msg,
        tag: `lightdrop_download_${Date.now()}`,
      });
    },
    [t]
  );

  // 默认访问 IP 持久化缓存到当前浏览器 localStorage
  const PREFERRED_IP_KEY = 'lightdrop_preferred_ip_url';
  const [selectedAccessUrl, setSelectedAccessUrl] = useState<string>(() => {
    try {
      return localStorage.getItem(PREFERRED_IP_KEY) || '';
    } catch {
      return '';
    }
  });

  const handleSelectDefaultUrl = useCallback((url: string) => {
    setSelectedAccessUrl(url);
    try {
      localStorage.setItem(PREFERRED_IP_KEY, url);
    } catch (_) {}
  }, []);

  // 校验并同步缓存的默认 IP
  useEffect(() => {
    if (stats.ipList && stats.ipList.length > 0) {
      try {
        const cached = localStorage.getItem(PREFERRED_IP_KEY);
        if (cached) {
          const matched = stats.ipList.find(
            (item) => cached === item.url || cached.includes(item.ip)
          );
          if (matched) {
            setSelectedAccessUrl(matched.url);
            return;
          }
        }
        const defaultItem = stats.ipList.find((item) => item.isDefault) || stats.ipList[0];
        if (defaultItem) {
          setSelectedAccessUrl(defaultItem.url);
          localStorage.setItem(PREFERRED_IP_KEY, defaultItem.url);
        }
      } catch (_) {}
    }
  }, [stats.ipList]);

  const activeUrl = selectedAccessUrl || accessUrl;

  // 接收 WebSocket 广播消息，实时长连接推送
  const handleWsMessage = useCallback(
    (msg: WsMessage) => {
      // 优先拦截与处理 P2P 相关的单播信令与设备在线感知事件
      if (
        msg.type === 'PEER_ONLINE_LIST' ||
        msg.type === 'PEER_JOINED' ||
        msg.type === 'PEER_UPDATED' ||
        msg.type === 'PEER_LEFT' ||
        msg.type === 'P2P_DIRECT_MESSAGE'
      ) {
        handleP2PWsMessageRef.current(msg);

        // 如果是外部发起长连接请求，提供系统桌面通知
        if (
          msg.type === 'P2P_DIRECT_MESSAGE' &&
          (msg.payload?.messageType === 'SESSION_REQUEST' || msg.payload?.messageType === 'SESSION_ESTABLISH') &&
          msg.payload?.payload?.sender
        ) {
          sendDesktopNotification({
            title: 'LightDrop · 收到 P2P 长连接请求',
            body: `${msg.payload.payload.sender.nickname} 请求与您建立 P2P 长连接会话`,
            tag: `lightdrop_session_${Date.now()}`,
          });
        }

        // 如果是外部发起握手请求，提供系统桌面通知
        if (
          msg.type === 'P2P_DIRECT_MESSAGE' &&
          msg.payload?.messageType === 'HANDSHAKE_REQUEST' &&
          msg.payload?.payload?.sender
        ) {
          sendDesktopNotification({
            title: 'LightDrop · 收到 P2P 直传握手请求',
            body: `${msg.payload.payload.sender.nickname} 请求向您传输内容`,
            tag: `lightdrop_p2p_${Date.now()}`,
          });
        }
        return;
      }

      if (msg.type === 'ITEM_CREATED') {
        fetchRecords();
        fetchStats();
        if (msg.payload?.title) {
          setIncomingToast(t('app.incomingToast', { title: msg.payload.title }));
          setTimeout(() => setIncomingToast(null), 3500);

          sendDesktopNotification({
            title: t('app.desktopIncomingTitle', 'LightDrop · 接收到新共享内容'),
            body: msg.payload.title,
            tag: `lightdrop_incoming_${msg.payload.id || Date.now()}`,
          });
        }
      } else if (
        msg.type === 'ITEM_DELETED' ||
        msg.type === 'ITEMS_BATCH_DELETED' ||
        msg.type === 'ITEMS_CLEARED'
      ) {
        fetchRecords();
        fetchStats();
      } else if (msg.type === 'SETTINGS_UPDATED' || msg.type === 'STATS_UPDATED') {
        fetchStats();
      } else if (msg.type === 'NETWORK_CHANGED') {
        fetchStats();
        if (msg.payload?.newUrl) {
          const notifyMsg = t('app.networkChangedToast', {
            url: msg.payload.newUrl,
            bonjourUrl: msg.payload.bonjourUrl,
            defaultValue: `⚡ 局域网网络已切换！新访问地址: ${msg.payload.newUrl}`,
          });
          setIncomingToast(notifyMsg);
          setTimeout(() => setIncomingToast(null), 5000);

          sendDesktopNotification({
            title: 'LightDrop · 网络与 IP 已切换',
            body: `新访问地址: ${msg.payload.newUrl}\n稳定域名: ${msg.payload.bonjourUrl}`,
            tag: `lightdrop_net_${Date.now()}`,
          });
        }
      }
    },
    [fetchRecords, fetchStats, t]
  );

  const { isConnected, onlineCount } = useWebSocket(handleWsMessage);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await Promise.all([fetchRecords(), fetchStats()]);
    setTimeout(() => setIsRefreshing(false), 500);
  };

  const scrollToRecords = () => {
    const el = document.getElementById('records-section');
    if (el) {
      el.scrollIntoView({ behavior: 'smooth' });
    }
  };

  return (
    <div className="min-h-screen bg-[#f0f4f9] p-3 sm:p-6 lg:p-8 pb-[max(1rem,env(safe-area-inset-bottom))] flex flex-col justify-between selection:bg-blue-100 selection:text-blue-900 relative">
      {/* 局域网主动推送悬浮提示 (全视口精准居中) */}
      {incomingToast && (
        <div className="fixed top-5 inset-x-0 z-50 flex justify-center pointer-events-none px-4">
          <div className="pointer-events-auto bg-slate-900/95 backdrop-blur-md text-white px-4 py-2.5 rounded-2xl text-xs font-medium shadow-2xl border border-slate-700/60 flex items-center gap-2.5 max-w-xl animate-fade-in transition-all">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shrink-0" />
            <span className="truncate">{incomingToast}</span>
            <button
              type="button"
              onClick={() => setIncomingToast(null)}
              className="ml-1 p-0.5 text-slate-400 hover:text-white rounded-lg transition shrink-0 cursor-pointer"
              title={t('records.close', '关闭')}
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      <div className="max-w-[1440px] 2xl:max-w-[1560px] mx-auto w-full">
        {/* 顶部 Header */}
        <Header
          accessUrl={accessUrl}
          currentUrl={activeUrl}
          ipList={stats.ipList || []}
          onSelectUrl={handleSelectDefaultUrl}
          onRefresh={handleRefresh}
          onOpenSettings={() => setSettingsOpen(true)}
          onOpenQrCode={() => setQrCodeOpen(true)}
          isRefreshing={isRefreshing}
          isConnected={isConnected}
          isReceiveMode={isReceiveMode}
          onToggleReceiveMode={toggleReceiveMode}
          activeSession={activeSession}
          activeSessions={activeSessions}
          onDisconnectSession={disconnectSession}
          onOpenSessionManager={() => setSessionManagerOpen(true)}
        />

        {/* 长连接断开智能重连与 IP 变动恢复条 */}
        {!isConnected && (
          <div className="mb-4 p-2.5 sm:p-3 bg-amber-50/90 border border-amber-200/80 rounded-2xl text-xs text-amber-800 flex items-center justify-between flex-wrap gap-2 animate-fade-in shadow-2xs">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse shrink-0" />
              <span className="font-medium">
                {t('app.reconnectNotice', '与服务端的连接中断。若电脑切换了 Wi-Fi，IP 可能已变更。')}
              </span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {stats.bonjourUrl && (
                <a
                  href={stats.bonjourUrl}
                  className="px-2.5 py-1 bg-amber-600 hover:bg-amber-700 active:scale-95 text-white rounded-xl font-medium transition text-[11px] shadow-xs flex items-center gap-1"
                >
                  <span>✨</span>
                  <span>{t('app.reconnectLocalDomain', '尝试稳定域名 (.local) 重连')}</span>
                </a>
              )}
              <button
                type="button"
                onClick={() => setQrCodeOpen(true)}
                className="px-2.5 py-1 bg-white border border-amber-200 text-amber-800 hover:bg-amber-100/60 rounded-xl font-medium transition text-[11px] cursor-pointer"
              >
                {t('header.scanQr', '重新扫码')}
              </button>
            </div>
          </div>
        )}

        {/* 上半部分：左侧发送内容，右侧快速预览与统计 */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 mb-5 items-stretch">
          {/* 左侧发送卡片 (占 7 列) */}
          <div className="lg:col-span-7 flex flex-col">
            <SendCard
              onSendText={sendText}
              onUploadFiles={uploadFiles}
              onUploadFolder={uploadFolder}
              onUploadMixedBatch={uploadMixedBatch}
              onlinePeers={onlinePeers}
              favoritePeers={favoritePeers}
              onStartP2PTransfer={startP2PTransfer}
              outgoingTransfer={outgoingTransfer}
              onCancelP2PTransfer={cancelOutgoingTransfer}
              onDismissOutgoingTransfer={dismissOutgoingTransfer}
              onToggleFavorite={toggleFavorite}
              onUpdateFavoriteName={updateFavoriteName}
              activeSession={activeSession}
              activeSessions={activeSessions}
              onEstablishSession={establishSession}
              onDisconnectSession={disconnectSession}
              onOpenSessionManager={() => setSessionManagerOpen(true)}
            />
          </div>

          {/* 右侧快速预览与统计卡片 (占 5 列) */}
          <div className="lg:col-span-5 flex flex-col">
            <QuickPreviewCard
              recentRecords={records.slice(0, 3)}
              stats={stats}
              onScrollToRecords={scrollToRecords}
              onCopyText={copyRecordContent}
              onDownloadFile={handleOpenDownloadModal}
              verifyPassword={verifyPassword}
            />
          </div>
        </div>

        {/* 下半部分：共享记录表格卡片 */}
        <RecordsTable
          records={filteredRecords}
          stats={stats}
          currentAccessUrl={activeUrl}
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          searchQuery={searchQuery}
          setSearchQuery={setSearchQuery}
          selectedIds={selectedIds}
          toggleSelect={toggleSelect}
          toggleSelectAll={toggleSelectAll}
          onCopyText={copyRecordContent}
          onDownload={handleOpenDownloadModal}
          onDeleteOne={deleteRecord}
          onBatchDelete={deleteBatch}
          onClearAll={clearAllRecords}
          verifyPassword={verifyPassword}
          onCopyShareLink={copyShareLink}
          onCancelP2PTask={cancelTransfer}
        />

        {/* 底部状态栏 */}
        <Footer stats={stats} onlineCount={onlineCount} />
      </div>

      {/* 设置中心弹窗 */}
      <SettingsModal
        isOpen={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        onSettingsSaved={() => {
          fetchRecords();
          fetchStats();
        }}
      />

      {/* 手机扫码访问弹窗 (支持多网卡IP选择与稳定域名切换) */}
      <QrCodeModal
        isOpen={qrCodeOpen}
        onClose={() => setQrCodeOpen(false)}
        accessUrl={activeUrl}
        ipList={stats.ipList || []}
        bonjourUrl={stats.bonjourUrl}
        bonjourHost={stats.bonjourHost}
        onSelectUrl={handleSelectDefaultUrl}
      />

      {/* 本机下载目录选择与下载弹窗 */}
      <DownloadModal
        isOpen={Boolean(downloadModalItem)}
        item={downloadModalItem?.item || null}
        password={downloadModalItem?.password}
        onClose={() => setDownloadModalItem(null)}
        onSuccess={handleDownloadSuccess}
      />

      {/* P2P 接收模式确认与传输弹窗 */}
      <P2PReceiveModal
        request={incomingRequest}
        transfer={incomingTransfer}
        onAccept={acceptIncomingTransfer}
        onReject={rejectIncomingTransfer}
        onDismiss={dismissIncomingTransfer}
      />

      {/* P2P 长连接互信请求确认弹窗 (支持队列与批量处理) */}
      <P2PSessionRequestModal
        request={incomingSessionRequest}
        requests={incomingSessionRequests}
        onAccept={acceptSessionRequest}
        onReject={rejectSessionRequest}
        onAcceptAll={acceptAllSessionRequests}
        onRejectAll={rejectAllSessionRequests}
      />

      {/* P2P 多端长连接会话集中管理弹窗 */}
      <P2PSessionManagerModal
        isOpen={sessionManagerOpen}
        onClose={() => setSessionManagerOpen(false)}
        activeSessions={activeSessions}
        onDisconnectSession={disconnectSession}
        onDisconnectAllSessions={disconnectAllSessions}
      />
    </div>
  );
};
