import { useState, useEffect, useCallback, useMemo } from 'react';
import { ShareItem, ShareItemType, SystemStats } from '@shared/types';
import { copyToClipboard } from '../utils/clipboard';
import { uploadWithProgress, UploadProgressInfo } from '../utils/uploader';
import { getUserNickname } from '../utils/nickname';
import {
  getLocalP2PRecords,
  deleteLocalP2PRecord,
  clearAllLocalP2PRecords,
  getP2PRecordBlob,
  P2P_RECORDS_CHANGED_EVENT,
} from '../utils/p2p/p2pRecordStorage';
import i18n from '../i18n';

export function useRecords() {
  const [records, setRecords] = useState<ShareItem[]>([]);
  const [p2pRecords, setP2pRecords] = useState<ShareItem[]>(() => getLocalP2PRecords());
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'all' | ShareItemType>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [stats, setStats] = useState<SystemStats>({
    totalRecords: 0,
    totalStorageBytes: 0,
    todaySentCount: 0,
    textCount: 0,
    imageCount: 0,
    fileCount: 0,
    folderCount: 0,
    onlineUsers: 1,
    serverTime: new Date().toISOString(),
    uptimeSeconds: 0,
  });
  const [accessUrl, setAccessUrl] = useState('');

  // 获取统计信息与局域网访问地址
  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch('/api/stats');
      const json = await res.json();
      if (json.success && json.data) {
        setStats(json.data);
        if (json.data.accessUrl) {
          setAccessUrl(json.data.accessUrl);
        }
      }
    } catch (err) {
      console.warn('Failed to fetch stats:', err);
    }
  }, []);

  // 获取记录列表
  const fetchRecords = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/records');
      const json = await res.json();
      if (json.success && Array.isArray(json.data)) {
        setRecords(json.data);
      }
    } catch (err) {
      console.error('Failed to fetch records:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRecords();
    fetchStats();
  }, [fetchRecords, fetchStats]);

  // 监听本地 P2P 传输记录变更事件 (双向秒级同步)
  useEffect(() => {
    const handleP2PChange = () => {
      setP2pRecords(getLocalP2PRecords());
    };
    window.addEventListener(P2P_RECORDS_CHANGED_EVENT, handleP2PChange);
    return () => window.removeEventListener(P2P_RECORDS_CHANGED_EVENT, handleP2PChange);
  }, []);

  // 将公共看板记录与本地 P2P 记录合并，并严格按真实时间倒序排序
  const allRecords = useMemo(() => {
    const merged = [...records, ...p2pRecords];
    return merged.sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }, [records, p2pRecords]);

  // 发送纯文本/代码/链接 (支持可选密码与昵称)
  const sendText = async (content: string, title?: string, password?: string) => {
    const nickname = getUserNickname();
    const res = await fetch('/api/records/text', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-nickname': encodeURIComponent(nickname),
      },
      body: JSON.stringify({ content, title, password, nickname }),
    });
    const json = await res.json();
    if (!json.success) {
      throw new Error(json.error || i18n.t('send.errSendTextFailed'));
    }
    await fetchRecords();
    await fetchStats();
    return json.data as ShareItem;
  };

  // 上传单个或多个文件 (带实时进度与取消支持，支持同时携带 Markdown 正文与发送标题合并上传)
  const uploadFiles = async (
    files: FileList | File[],
    password?: string,
    onProgress?: (info: UploadProgressInfo) => void,
    setAbortHandle?: (abortFn: () => void) => void,
    content?: string,
    title?: string
  ) => {
    const formData = new FormData();
    for (let i = 0; i < files.length; i++) {
      formData.append('files', files[i]);
    }
    if (password) {
      formData.append('password', password);
    }
    if (content && content.trim()) {
      formData.append('content', content);
    }
    if (title && title.trim()) {
      formData.append('title', title.trim());
    }
    formData.append('nickname', getUserNickname());

    const { promise, abort } = uploadWithProgress('/api/records/upload', formData, onProgress);
    if (setAbortHandle) {
      setAbortHandle(abort);
    }

    try {
      const res = await promise;
      await fetchRecords();
      await fetchStats();
      return res.data;
    } catch (err: any) {
      throw err;
    }
  };

  // 上传文件夹 (支持 input FileList 与可选密码，支持同时携带说明文本与发送标题)
  const uploadFolder = async (
    files: FileList,
    password?: string,
    onProgress?: (info: UploadProgressInfo) => void,
    setAbortHandle?: (abortFn: () => void) => void,
    content?: string,
    title?: string
  ) => {
    const fileArray: File[] = [];
    const relativePaths: string[] = [];

    let folderName = i18n.t('send.defaultFolderName');
    if (files.length > 0) {
      const firstPath = files[0].webkitRelativePath || files[0].name;
      const parts = firstPath.split('/');
      if (parts.length > 1) {
        folderName = parts[0];
      }
    }

    for (let i = 0; i < files.length; i++) {
      fileArray.push(files[i]);
      relativePaths.push(files[i].webkitRelativePath || files[i].name);
    }

    return uploadRawFolder(folderName, fileArray, relativePaths, password, onProgress, setAbortHandle, content, title);
  };

  // 上传指定名称与相对路径结构的文件夹 (带实时进度与取消支持)
  const uploadRawFolder = async (
    folderName: string,
    files: File[],
    paths: string[],
    password?: string,
    onProgress?: (info: UploadProgressInfo) => void,
    setAbortHandle?: (abortFn: () => void) => void,
    content?: string,
    title?: string
  ) => {
    const formData = new FormData();
    for (let i = 0; i < files.length; i++) {
      formData.append('files', files[i]);
    }
    formData.append('folderName', folderName);
    formData.append('paths', JSON.stringify(paths));
    if (password) {
      formData.append('password', password);
    }
    if (content && content.trim()) {
      formData.append('content', content);
    }
    if (title && title.trim()) {
      formData.append('title', title.trim());
    }
    formData.append('nickname', getUserNickname());

    const { promise, abort } = uploadWithProgress(
      '/api/records/upload-folder',
      formData,
      onProgress
    );
    if (setAbortHandle) {
      setAbortHandle(abort);
    }

    try {
      const res = await promise;
      await fetchRecords();
      await fetchStats();
      return res.data;
    } catch (err: any) {
      throw err;
    }
  };

  // 批量处理混合拖拽项 (多个文件和多个文件夹，带阶段进度与取消支持)
  const uploadMixedBatch = async (
    individualFiles: File[],
    folders: Array<{ name: string; files: File[]; paths: string[] }>,
    password?: string,
    onProgress?: (info: UploadProgressInfo) => void,
    setAbortHandle?: (abortFn: () => void) => void,
    content?: string,
    title?: string
  ) => {
    let uploadedFilesCount = 0;
    let uploadedFoldersCount = 0;
    let currentAbort: (() => void) | null = null;

    if (setAbortHandle) {
      setAbortHandle(() => {
        if (currentAbort) currentAbort();
      });
    }

    // 上传独立文件 (若有正文或标题，附加到独立文件上传中)
    if (individualFiles.length > 0) {
      await uploadFiles(
        individualFiles,
        password,
        onProgress,
        (abort) => {
          currentAbort = abort;
        },
        content,
        title
      );
      uploadedFilesCount += individualFiles.length;
    }

    // 上传每个文件夹 (若无独立文件且有正文/标题，附加到首个文件夹中)
    for (let idx = 0; idx < folders.length; idx++) {
      const folder = folders[idx];
      const folderContent = individualFiles.length === 0 && idx === 0 ? content : undefined;
      const folderTitle = individualFiles.length === 0 && idx === 0 ? title : undefined;
      await uploadRawFolder(
        folder.name,
        folder.files,
        folder.paths,
        password,
        onProgress,
        (abort) => {
          currentAbort = abort;
        },
        folderContent,
        folderTitle
      );
      uploadedFoldersCount++;
    }

    return { uploadedFilesCount, uploadedFoldersCount };
  };

  // 校验记录访问密码 (针对文本解锁全文，并自动缓存已解锁内容)
  const verifyPassword = async (id: string, password: string): Promise<string> => {
    const nickname = getUserNickname();
    const res = await fetch(`/api/records/${id}/verify-password`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-nickname': encodeURIComponent(nickname),
      },
      body: JSON.stringify({ password }),
    });
    const json = await res.json();
    if (!json.success) {
      throw new Error(json.error || i18n.t('passwordModal.incorrectError'));
    }
    const decryptedContent = json.content || '';
    // 成功校验后，自动更新本地 records 状态，免去后续反复输入密码
    setRecords((prev) =>
      prev.map((rec) =>
        rec.id === id ? { ...rec, content: decryptedContent, password: password.trim() } : rec
      )
    );
    return decryptedContent;
  };

  // 复制文本内容 (上报审计)
  const copyRecordContent = async (item: ShareItem, customText?: string): Promise<boolean> => {
    const textToCopy = customText || item.content || item.title;
    const ok = await copyToClipboard(textToCopy);
    if (ok) {
      const nickname = getUserNickname();
      fetch(`/api/records/${item.id}/copy`, {
        method: 'POST',
        headers: { 'x-user-nickname': encodeURIComponent(nickname) },
      }).catch(() => {});
    }
    return ok;
  };

  // 上报复制分享链接事件 (支持有密码内容的提取信息复制)
  const copyShareLink = async (id: string) => {
    try {
      const nickname = getUserNickname();
      await fetch(`/api/records/${id}/copy-link`, {
        method: 'POST',
        headers: { 'x-user-nickname': encodeURIComponent(nickname) },
      });
    } catch (_) {}
  };

  // 上报打开分享页面事件 (访问提取/下载页面)
  const openSharePage = async (id: string) => {
    try {
      const nickname = getUserNickname();
      await fetch(`/api/records/${id}/open-page`, {
        method: 'POST',
        headers: { 'x-user-nickname': encodeURIComponent(nickname) },
      });
    } catch (_) {}
  };

  // 下载文件/打包下载文件夹 (支持密码、P2P 本地存储提取与操作人昵称)
  const downloadRecord = async (item: ShareItem, password?: string) => {
    // 若为本地 P2P 记录，直接从 IndexedDB 取出二进制 Blob 触发下载，不走服务器
    if (item.isP2P) {
      try {
        const blob = await getP2PRecordBlob(item.id, 0);
        if (blob) {
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = item.fileName || item.title;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          setTimeout(() => URL.revokeObjectURL(url), 10000);
          return;
        }
      } catch (err) {
        console.warn('Failed to download local P2P blob:', err);
      }
    }

    const nickname = getUserNickname();
    const params = new URLSearchParams();
    if (password) params.set('password', password);
    if (nickname) params.set('nickname', nickname);
    const queryString = params.toString() ? `?${params.toString()}` : '';
    window.location.href = `/api/records/${item.id}/download${queryString}`;
  };

  // 删除单条 (区分局域网服务器记录与本地 P2P 缓存记录)
  const deleteRecord = async (id: string) => {
    if (id.startsWith('p2p_')) {
      await deleteLocalP2PRecord(id);
      setSelectedIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      return;
    }

    const nickname = getUserNickname();
    const res = await fetch(`/api/records/${id}`, {
      method: 'DELETE',
      headers: { 'x-user-nickname': encodeURIComponent(nickname) },
    });
    const json = await res.json();
    if (json.success) {
      setRecords((prev) => prev.filter((r) => r.id !== id));
      setSelectedIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      fetchStats();
    }
  };

  // 批量删除 (区分 P2P 本地记录与远程记录)
  const deleteBatch = async () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;

    const p2pIds = ids.filter((id) => id.startsWith('p2p_'));
    const remoteIds = ids.filter((id) => !id.startsWith('p2p_'));

    for (const pid of p2pIds) {
      await deleteLocalP2PRecord(pid);
    }

    if (remoteIds.length > 0) {
      const nickname = getUserNickname();
      const res = await fetch('/api/records/batch-delete', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-nickname': encodeURIComponent(nickname),
        },
        body: JSON.stringify({ ids: remoteIds }),
      });
      const json = await res.json();
      if (json.success) {
        setRecords((prev) => prev.filter((r) => !selectedIds.has(r.id)));
      }
    }
    setSelectedIds(new Set());
    fetchStats();
  };

  // 一键清空 / 指定条件清理 (同时清理公共服务器记录与本地 P2P 记录)
  const clearAllRecords = async (options?: {
    mode?: 'all' | 'by_time';
    timeMode?: 'relative' | 'before_date';
    relativeValue?: number;
    relativeUnit?: 'week' | 'month';
    beforeDate?: string;
  }) => {
    // 优先清空全部本地 P2P 缓存与 IndexedDB 文件
    await clearAllLocalP2PRecords();

    const payload = options || { mode: 'all' };
    const nickname = getUserNickname();
    const res = await fetch('/api/records/clear-all', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-nickname': encodeURIComponent(nickname),
      },
      body: JSON.stringify(payload),
    });
    const json = await res.json();
    if (json.success) {
      if (json.deletedIds && Array.isArray(json.deletedIds)) {
        const deletedSet = new Set(json.deletedIds);
        setRecords((prev) => prev.filter((r) => !deletedSet.has(r.id)));
      } else {
        await fetchRecords();
      }
      setSelectedIds(new Set());
      fetchStats();
      return json.count;
    } else {
      throw new Error(json.error || '清理失败');
    }
  };

  // 过滤后的记录 (作用于合并后的 allRecords，并严格按实际创建时间排序)
  const filteredRecords = allRecords.filter((item) => {
    if (activeTab !== 'all') {
      if (activeTab === 'image' && item.type === 'batch' && item.isImageBatch) {
        // 图片合辑在图片标签页下也展示
      } else if (activeTab === 'file' && item.type === 'batch') {
        // 文件合辑在文件标签页下展示
      } else if (activeTab === 'text' && item.type === 'batch' && item.content) {
        // 带有文本内容的图文附件合辑在文本标签页下也展示
      } else if (item.type !== activeTab) {
        return false;
      }
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      const matchTitle = item.title.toLowerCase().includes(q);
      const matchContent = item.content ? item.content.toLowerCase().includes(q) : false;
      const matchFile = item.fileName ? item.fileName.toLowerCase().includes(q) : false;
      const matchSubFiles = item.files ? item.files.some((f) => f.name.toLowerCase().includes(q)) : false;
      const matchSender =
        (item.senderName && item.senderName.toLowerCase().includes(q)) ||
        (item.nickname && item.nickname.toLowerCase().includes(q)) ||
        (item.p2pPeerName && item.p2pPeerName.toLowerCase().includes(q));
      return matchTitle || matchContent || matchFile || matchSubFiles || Boolean(matchSender);
    }
    return true;
  });

  // 处理多选切换
  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  // 全选/取消全选
  const toggleSelectAll = () => {
    if (selectedIds.size === filteredRecords.length && filteredRecords.length > 0) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredRecords.map((r) => r.id)));
    }
  };

  // 最近发送的文本与文件
  const latestText = allRecords.find((r) => r.type === 'text');
  const latestFile = allRecords.find((r) => r.type === 'file' || r.type === 'folder' || r.type === 'image');

  return {
    records: allRecords,
    filteredRecords,
    loading,
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
    uploadRawFolder,
    uploadMixedBatch,
    verifyPassword,
    copyRecordContent,
    copyShareLink,
    openSharePage,
    downloadRecord,
    deleteRecord,
    deleteBatch,
    clearAllRecords,
    fetchRecords,
    fetchStats,
    latestText,
    latestFile,
  };
}
