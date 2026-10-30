import React, { useState } from 'react';
import {
  X,
  Laptop,
  Smartphone,
  Star,
  Check,
  Edit2,
  Trash2,
  Radio,
  Search,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  Link2,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { PeerInfo, FavoritePeer, P2PSession } from '@shared/types';
import { isPeerFavorite } from '../utils/p2p/favoriteStorage';
import { getOsDisplayName } from '../utils/platform';

interface P2PDevicePickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onlinePeers: PeerInfo[];
  favoritePeers: FavoritePeer[];
  selectedDeviceId: string | null;
  onSelectDevice: (peer: { deviceId: string; displayName: string; isOnline: boolean }) => void;
  onToggleFavorite: (peer: PeerInfo, customName?: string) => void;
  onUpdateFavoriteName: (deviceId: string, name: string) => void;
  activeSession?: P2PSession | null;
  activeSessions?: P2PSession[];
  onEstablishSession?: (peer: PeerInfo) => void;
  onDisconnectSession?: (peerId?: string) => void;
}

export const P2PDevicePickerModal: React.FC<P2PDevicePickerModalProps> = ({
  isOpen,
  onClose,
  onlinePeers,
  favoritePeers,
  selectedDeviceId,
  onSelectDevice,
  onToggleFavorite,
  onUpdateFavoriteName,
  activeSession,
  activeSessions,
  onEstablishSession,
  onDisconnectSession,
}) => {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<'discovered' | 'favorites' | 'sessions'>('discovered');
  const [searchQuery, setSearchQuery] = useState('');
  const [editingDeviceId, setEditingDeviceId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');

  if (!isOpen) return null;

  // 获取 OS 图标
  const getDeviceIcon = (osStr?: string) => {
    const os = (osStr || '').toLowerCase();
    if (os === 'ios' || os === 'android') {
      return <Smartphone className="w-4 h-4 text-slate-500" />;
    }
    return <Laptop className="w-4 h-4 text-slate-500" />;
  };

  const isPeerFavorite = (deviceId: string) => favoritePeers.some((f) => f.deviceId === deviceId);

  const isSessionActive = (peerId: string) => {
    return Boolean(
      (activeSessions && activeSessions.some((s) => s.peerId === peerId)) ||
      (activeSession && activeSession.peerId === peerId)
    );
  };

  // 整理已收藏设备视图（结合实时在线状态）
  const enrichedFavorites = favoritePeers.map((fav) => {
    const matchedOnline = onlinePeers.find((p) => p.deviceId === fav.deviceId);
    return {
      ...fav,
      isOnline: Boolean(matchedOnline),
      peerInfo: matchedOnline,
      displayName: fav.customName || fav.nickname,
    };
  });

  // 过滤搜索
  const filteredDiscovered = onlinePeers.filter((peer) => {
    const fav = favoritePeers.find((f) => f.deviceId === peer.deviceId);
    const name = fav?.customName || peer.nickname;
    const q = searchQuery.trim().toLowerCase();
    return !q || name.toLowerCase().includes(q) || (peer.clientIp && peer.clientIp.includes(q));
  });

  const filteredFavorites = enrichedFavorites.filter((fav) => {
    const q = searchQuery.trim().toLowerCase();
    return !q || fav.displayName.toLowerCase().includes(q) || fav.nickname.toLowerCase().includes(q);
  });

  const allActiveSessions = activeSessions || (activeSession ? [activeSession] : []);
  const filteredSessions = allActiveSessions.filter((s) => {
    const q = searchQuery.trim().toLowerCase();
    return !q || s.peerName.toLowerCase().includes(q) || s.peerId.toLowerCase().includes(q);
  });

  const handleSaveRename = (deviceId: string) => {
    if (editingName.trim()) {
      onUpdateFavoriteName(deviceId, editingName.trim());
    }
    setEditingDeviceId(null);
    setEditingName('');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
      <div className="bg-white rounded-2xl sm:rounded-3xl shadow-2xl border border-slate-200/80 w-full max-w-lg overflow-hidden flex flex-col max-h-[88vh]">
        {/* 顶部标题栏 */}
        <div className="px-4 sm:px-5 py-3.5 sm:py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-blue-100/80 text-blue-600 flex items-center justify-center shadow-xs">
              <Radio className="w-4 h-4 animate-pulse" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-800">
                {t('p2p.selectDeviceTitle', '选择目标传输设备')}
              </h3>
              <p className="text-[11px] text-slate-400">
                {t('p2p.selectDeviceDesc', '从在线发现或已收藏设备中选择建立 P2P 直传')}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* 标签栏与搜索框 (移动端上下堆叠自适应，桌面端水平排列) */}
        <div className="px-4 sm:px-5 pt-3 pb-2 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-2 bg-white">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setActiveTab('discovered')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition relative ${
                activeTab === 'discovered'
                  ? 'text-blue-600 bg-blue-50'
                  : 'text-slate-500 hover:text-slate-800 hover:bg-slate-50'
              }`}
            >
              {t('p2p.tabDiscovered', '发现设备')}
              <span className="ml-1.5 px-1.5 py-0.5 rounded-full text-[10px] bg-slate-100 text-slate-600 font-normal">
                {onlinePeers.length}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('favorites')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition relative ${
                activeTab === 'favorites'
                  ? 'text-amber-600 bg-amber-50'
                  : 'text-slate-500 hover:text-slate-800 hover:bg-slate-50'
              }`}
            >
              {t('p2p.tabFavorites', '已收藏')}
              <span className="ml-1.5 px-1.5 py-0.5 rounded-full text-[10px] bg-amber-100 text-amber-700 font-normal">
                {favoritePeers.length}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('sessions')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition relative ${
                activeTab === 'sessions'
                  ? 'text-emerald-700 bg-emerald-50'
                  : 'text-slate-500 hover:text-slate-800 hover:bg-slate-50'
              }`}
            >
              {t('p2p.tabSessions', '长连接')}
              <span className="ml-1.5 px-1.5 py-0.5 rounded-full text-[10px] bg-emerald-100 text-emerald-800 font-normal">
                {allActiveSessions.length}
              </span>
            </button>
          </div>

          {/* 搜索框 (移动端全宽，输入更便捷) */}
          <div className="relative w-full sm:w-44">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t('p2p.searchPlaceholder', '搜索设备...')}
              className="w-full pl-8 pr-2.5 py-1.5 sm:py-1 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-blue-500 focus:bg-white transition"
            />
          </div>
        </div>

        {/* 设备列表展示区域 */}
        <div className="p-3 sm:p-4 overflow-y-auto space-y-2.5 flex-1">
          {activeTab === 'discovered' && (
            <>
              {filteredDiscovered.length === 0 ? (
                <div className="py-12 text-center text-slate-400 text-xs">
                  <Radio className="w-8 h-8 text-slate-300 mx-auto mb-2 animate-pulse" />
                  <p>{t('p2p.noOnlinePeers', '当前局域网暂无其他在线设备')}</p>
                  <p className="text-[11px] text-slate-400 mt-1">
                    {t('p2p.noOnlinePeersTip', '请确保对方已打开 EasyDrop 页面并接入同一 Wi-Fi')}
                  </p>
                </div>
              ) : (
                filteredDiscovered.map((peer) => {
                  const isFav = isPeerFavorite(peer.deviceId);
                  const favItem = favoritePeers.find((f) => f.deviceId === peer.deviceId);
                  const displayName = favItem?.customName || peer.nickname;
                  const isSelected = selectedDeviceId === peer.deviceId;

                  return (
                    <div
                      key={peer.deviceId}
                      className={`p-3 rounded-2xl border transition flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 ${
                        isSelected
                          ? 'bg-blue-50/70 border-blue-400 shadow-sm'
                          : 'bg-white hover:bg-slate-50 border-slate-200/80 shadow-2xs'
                      }`}
                    >
                      {/* 上半部分 / 左侧：头像 + 描述 + 移动端状态徽章 */}
                      <div className="flex items-center justify-between gap-2.5 min-w-0 flex-1">
                        <div className="flex items-center gap-2.5 min-w-0 flex-1">
                          {/* 角色头像 */}
                          <div
                            className={`w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-gradient-to-br ${
                              peer.avatarColor || 'from-blue-400 to-indigo-500'
                            } flex items-center justify-center text-lg shadow-2xs shrink-0`}
                          >
                            {peer.avatarEmoji || '✨'}
                          </div>

                          {/* 设备描述 */}
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="text-xs font-bold text-slate-800 truncate" title={displayName}>
                                {displayName}
                              </span>
                              {favItem?.customName && (
                                <span className="text-[10px] text-slate-400 truncate">
                                  ({peer.nickname})
                                </span>
                              )}
                            </div>

                            <div className="flex items-center gap-1.5 text-[11px] text-slate-400 mt-0.5">
                              <span className="inline-flex items-center gap-1 font-medium text-slate-600 shrink-0">
                                {getDeviceIcon(peer.os)}
                                {getOsDisplayName(peer.os as any)}
                              </span>
                              <span>•</span>
                              <span className="font-mono text-[10px] sm:text-[11px] truncate">
                                {peer.clientIp || '局域网'}
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* 移动端右上角状态徽章 (严格禁止换行挤压，保证美观自适应) */}
                        <div className="shrink-0 sm:hidden">
                          {peer.isReceiveMode ? (
                            <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-600 bg-emerald-50 border border-emerald-200/80 px-2 py-0.5 rounded-full whitespace-nowrap shadow-2xs">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                              {t('p2p.readyToReceive', '接收就绪')}
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[10px] font-medium text-emerald-600 bg-emerald-50/60 border border-emerald-100 px-2 py-0.5 rounded-full whitespace-nowrap">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                              {t('p2p.online', '在线')}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* 下半部分 / 右侧操作栏 (移动端整齐底部分割行，桌面端平铺右侧) */}
                      <div className="flex items-center justify-between sm:justify-end gap-1.5 pt-2 sm:pt-0 border-t border-slate-100 sm:border-t-0 shrink-0">
                        {/* 桌面端内嵌展示的状态指示 */}
                        <div className="hidden sm:flex items-center mr-2 shrink-0">
                          {peer.isReceiveMode ? (
                            <span className="text-emerald-600 font-semibold text-xs flex items-center gap-1 whitespace-nowrap">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                              {t('p2p.readyToReceive', '接收就绪')}
                            </span>
                          ) : (
                            <span className="text-emerald-500 text-xs flex items-center gap-1 whitespace-nowrap">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                              {t('p2p.online', '在线')}
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-1.5 ml-auto sm:ml-0">
                          {/* 收藏按钮 */}
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onToggleFavorite(peer);
                            }}
                            className={`p-1.5 rounded-lg border transition ${
                              isFav
                                ? 'bg-amber-50 text-amber-500 border-amber-200 hover:bg-amber-100'
                                : 'text-slate-400 hover:text-amber-500 hover:bg-slate-100 border-transparent'
                            }`}
                            title={isFav ? t('p2p.unstar', '取消收藏') : t('p2p.star', '收藏此设备')}
                          >
                            <Star className={`w-4 h-4 ${isFav ? 'fill-amber-400 text-amber-400' : ''}`} />
                          </button>

                          {/* 长连接会话按钮 */}
                          {isSessionActive(peer.deviceId) ? (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                onDisconnectSession?.(peer.deviceId);
                              }}
                              className="px-2.5 py-1.5 rounded-xl text-xs font-medium bg-rose-50 text-rose-600 hover:bg-rose-100 border border-rose-200 transition whitespace-nowrap"
                              title={t('p2p.disconnectSession', '断开长连接')}
                            >
                              {t('p2p.disconnect', '断开')}
                            </button>
                          ) : onEstablishSession ? (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                onEstablishSession(peer);
                              }}
                              className="px-2.5 py-1.5 rounded-xl text-xs font-medium bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200 transition flex items-center gap-1 whitespace-nowrap"
                              title={t('p2p.establishSessionTip', '建立免握手双向长连接')}
                            >
                              <Link2 className="w-3 h-3 shrink-0" />
                              <span>{t('p2p.connectSession', '长连接')}</span>
                            </button>
                          ) : null}

                          <button
                            type="button"
                            onClick={() => {
                              onSelectDevice({
                                deviceId: peer.deviceId,
                                displayName,
                                isOnline: true,
                              });
                              onClose();
                            }}
                            className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition active:scale-95 whitespace-nowrap ${
                              isSelected
                                ? 'bg-blue-600 text-white shadow-xs'
                                : 'bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200/80'
                            }`}
                          >
                            {isSelected ? t('p2p.selected', '已选择') : t('p2p.select', '选择')}
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </>
          )}

          {activeTab === 'favorites' && (
            <>
              {filteredFavorites.length === 0 ? (
                <div className="py-12 text-center text-slate-400 text-xs">
                  <Star className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                  <p>{t('p2p.noFavorites', '暂无已收藏的节点')}</p>
                  <p className="text-[11px] text-slate-400 mt-1">
                    {t('p2p.noFavoritesTip', '可在“发现设备”中点击星标收藏常用设备并自定义名称')}
                  </p>
                </div>
              ) : (
                filteredFavorites.map((fav) => {
                  const isSelected = selectedDeviceId === fav.deviceId;
                  const isEditing = editingDeviceId === fav.deviceId;

                  return (
                    <div
                      key={fav.deviceId}
                      className={`p-3 rounded-2xl border transition flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 ${
                        isSelected
                          ? 'bg-blue-50/70 border-blue-400 shadow-sm'
                          : fav.isOnline
                          ? 'bg-white hover:bg-slate-50 border-slate-200/80 shadow-2xs'
                          : 'bg-slate-50/60 border-slate-200/60 opacity-80'
                      }`}
                    >
                      {/* 上半部分 / 左侧：图标 + 备注名 + 移动端状态徽章 */}
                      <div className="flex items-center justify-between gap-2.5 min-w-0 flex-1">
                        <div className="flex items-center gap-2.5 min-w-0 flex-1">
                          <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-amber-50 border border-amber-200/80 flex items-center justify-center text-amber-500 shadow-2xs shrink-0">
                            <Star className="w-5 h-5 fill-amber-400 text-amber-400" />
                          </div>

                          <div className="min-w-0 flex-1">
                            {isEditing ? (
                              <div className="flex items-center gap-1.5">
                                <input
                                  type="text"
                                  value={editingName}
                                  onChange={(e) => setEditingName(e.target.value)}
                                  autoFocus
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') handleSaveRename(fav.deviceId);
                                    if (e.key === 'Escape') setEditingDeviceId(null);
                                  }}
                                  className="px-2 py-0.5 text-xs bg-white border border-blue-400 rounded-lg focus:outline-none"
                                />
                                <button
                                  type="button"
                                  onClick={() => handleSaveRename(fav.deviceId)}
                                  className="p-1 rounded-md bg-blue-600 text-white"
                                >
                                  <Check className="w-3 h-3" />
                                </button>
                              </div>
                            ) : (
                              <div className="flex items-center gap-1.5">
                                <span className="text-xs font-bold text-slate-800 truncate" title={fav.displayName}>
                                  {fav.displayName}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setEditingDeviceId(fav.deviceId);
                                    setEditingName(fav.customName || fav.nickname);
                                  }}
                                  className="p-0.5 text-slate-400 hover:text-slate-600"
                                  title={t('p2p.rename', '修改备注名')}
                                >
                                  <Edit2 className="w-3 h-3" />
                                </button>
                              </div>
                            )}

                            <div className="flex items-center gap-1.5 text-[11px] text-slate-400 mt-0.5">
                              <span className="inline-flex items-center gap-1 font-medium text-slate-600 shrink-0">
                                {getDeviceIcon(fav.os)}
                                {getOsDisplayName(fav.os as any)}
                              </span>
                              <span>•</span>
                              <span className="text-slate-400 truncate">原昵称: {fav.nickname}</span>
                            </div>
                          </div>
                        </div>

                        {/* 移动端右上角状态徽章 */}
                        <div className="shrink-0 sm:hidden">
                          {fav.isOnline ? (
                            <span className="inline-flex items-center gap-1 text-[10px] font-medium text-emerald-600 bg-emerald-50/60 border border-emerald-100 px-2 py-0.5 rounded-full whitespace-nowrap">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                              {t('p2p.online', '在线')}
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[10px] text-slate-400 bg-slate-100 border border-slate-200/60 px-2 py-0.5 rounded-full whitespace-nowrap">
                              <span className="w-1.5 h-1.5 rounded-full bg-slate-300" />
                              {t('p2p.offline', '离线')}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* 下半部分 / 右侧操作栏 */}
                      <div className="flex items-center justify-between sm:justify-end gap-1.5 pt-2 sm:pt-0 border-t border-slate-100 sm:border-t-0 shrink-0">
                        {/* 桌面端状态指示 */}
                        <div className="hidden sm:flex items-center mr-2 shrink-0">
                          {fav.isOnline ? (
                            <span className="text-emerald-500 text-xs flex items-center gap-1 whitespace-nowrap">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                              {t('p2p.online', '在线')}
                            </span>
                          ) : (
                            <span className="text-slate-400 text-xs flex items-center gap-1 whitespace-nowrap">
                              <span className="w-1.5 h-1.5 rounded-full bg-slate-300" />
                              {t('p2p.offline', '离线')}
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-1.5 ml-auto sm:ml-0">
                          <button
                            type="button"
                            onClick={() => {
                              if (fav.peerInfo) {
                                onToggleFavorite(fav.peerInfo);
                              } else {
                                onToggleFavorite({
                                  deviceId: fav.deviceId,
                                  nickname: fav.nickname,
                                  os: fav.os,
                                });
                              }
                            }}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-rose-500 hover:bg-rose-50 transition"
                            title={t('p2p.removeFavorite', '删除收藏')}
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>

                          {/* 收藏列表中在线设备的长连接按钮 */}
                          {fav.isOnline && (
                            isSessionActive(fav.deviceId) ? (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onDisconnectSession?.(fav.deviceId);
                                }}
                                className="px-2.5 py-1.5 rounded-xl text-xs font-medium bg-rose-50 text-rose-600 hover:bg-rose-100 border border-rose-200 transition whitespace-nowrap"
                                title={t('p2p.disconnectSession', '断开长连接')}
                              >
                                {t('p2p.disconnect', '断开')}
                              </button>
                            ) : fav.peerInfo && onEstablishSession ? (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onEstablishSession(fav.peerInfo!);
                                }}
                                className="px-2.5 py-1.5 rounded-xl text-xs font-medium bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200 transition flex items-center gap-1 whitespace-nowrap"
                                title={t('p2p.establishSessionTip', '建立免握手双向长连接')}
                              >
                                <Link2 className="w-3 h-3 shrink-0" />
                                <span>{t('p2p.connectSession', '长连接')}</span>
                              </button>
                            ) : null
                          )}

                          <button
                            type="button"
                            disabled={!fav.isOnline}
                            onClick={() => {
                              if (fav.isOnline) {
                                onSelectDevice({
                                  deviceId: fav.deviceId,
                                  displayName: fav.displayName,
                                  isOnline: true,
                                });
                                onClose();
                              }
                            }}
                            className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap ${
                              isSelected
                                ? 'bg-blue-600 text-white shadow-xs'
                                : 'bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200/80'
                            }`}
                          >
                            {isSelected
                              ? t('p2p.selected', '已选择')
                              : fav.isOnline
                              ? t('p2p.select', '选择')
                              : t('p2p.offline', '离线')}
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </>
          )}

          {/* 3. 已建立长连接会话设备列表 */}
          {activeTab === 'sessions' && (
            <>
              {filteredSessions.length === 0 ? (
                <div className="py-12 text-center text-slate-400 text-xs">
                  <Link2 className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                  <p>{t('p2p.noActiveSessions', '当前暂无已建立的长连接节点')}</p>
                  <p className="text-[11px] text-slate-400 mt-1">
                    在「发现设备」或「已收藏」列表中点击「长连接」即可建立
                  </p>
                </div>
              ) : (
                filteredSessions.map((session) => {
                  const isSelected = selectedDeviceId === session.peerId;
                  return (
                    <div
                      key={session.peerId}
                      className={`p-3 rounded-2xl border transition flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 ${
                        isSelected
                          ? 'bg-blue-50/70 border-blue-400 shadow-sm'
                          : 'bg-white hover:bg-slate-50 border-slate-200/80 shadow-2xs'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0 flex-1">
                        <div
                          className={`w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-gradient-to-br ${
                            session.peerAvatarColor || 'from-emerald-400 to-teal-500'
                          } flex items-center justify-center text-lg shadow-2xs shrink-0`}
                        >
                          {session.peerAvatarEmoji || '⚡'}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs font-bold text-slate-800 truncate" title={session.peerName}>
                              {session.peerName}
                            </span>
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded-full text-[10px] bg-emerald-100 text-emerald-800 font-medium shrink-0">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                              直连活跃
                            </span>
                          </div>
                          <div className="flex items-center gap-1.5 text-[11px] text-slate-400 mt-0.5">
                            <span className="inline-flex items-center gap-1 font-medium text-slate-600 shrink-0">
                              {getDeviceIcon(session.peerOs)}
                              {getOsDisplayName(session.peerOs as any)}
                            </span>
                            <span>•</span>
                            <span className="text-[10px] sm:text-[11px] font-mono text-slate-400">
                              {session.establishedAt
                                ? `已连接于 ${new Date(session.establishedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
                                : '已连接'}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center justify-end gap-1.5 pt-2 sm:pt-0 border-t border-slate-100 sm:border-t-0 shrink-0">
                        <button
                          type="button"
                          onClick={() => onDisconnectSession?.(session.peerId)}
                          className="px-2.5 py-1.5 rounded-xl text-xs font-medium bg-rose-50 text-rose-600 hover:bg-rose-100 border border-rose-200 transition whitespace-nowrap"
                        >
                          {t('p2p.disconnect', '断开')}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            onSelectDevice({
                              deviceId: session.peerId,
                              displayName: session.peerName,
                              isOnline: true,
                            });
                            onClose();
                          }}
                          className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition active:scale-95 whitespace-nowrap ${
                            isSelected
                              ? 'bg-blue-600 text-white shadow-xs'
                              : 'bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200/80'
                          }`}
                        >
                          {isSelected ? t('p2p.selected', '当前选中') : t('p2p.select', '选择直传')}
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </>
          )}
        </div>

        {/* 底部关闭栏 */}
        <div className="px-5 py-3 border-t border-slate-100 bg-slate-50/50 flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-[11px] text-slate-500">
            <HelpCircle className="w-3.5 h-3.5 text-slate-400" />
            <span>{t('p2p.handshakeNotice', '选择后发送将发起握手请求，对端确认后才开始直传数据')}</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded-xl bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 text-xs font-medium transition"
          >
            {t('common.close', '关闭')}
          </button>
        </div>
      </div>
    </div>
  );
};
