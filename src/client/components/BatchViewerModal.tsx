import React, { useState, useMemo, useCallback } from 'react';
import {
  X,
  Download,
  Layers,
  Images,
  File,
  FileText,
  Eye,
  Link2,
  Check,
  Lock,
  QrCode,
  HardDrive,
  Calendar,
  Grid,
  List,
  Sparkles,
  ExternalLink,
  Loader2,
  ChevronDown,
  ChevronUp,
  Copy,
  Paperclip,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { ShareItem, BatchFileItem } from '@shared/types';
import { parseMarkdown } from '../utils/markdown';
import { MarkdownRenderer } from './MarkdownRenderer';
import {
  formatBytes,
  formatDisplayTime,
  getFileTypeLabel,
  isImageItem,
  isMarkdownItem,
  isTextDocItem,
  isPdfItem,
  isDocPreviewable,
  getItemDisplayTitle,
} from '../utils/format';
import { copyToClipboard } from '../utils/clipboard';
import { ImageViewerModal } from './ImageViewerModal';
import { FileQrModal } from './FileQrModal';
import { PdfViewerModal } from './PdfViewerModal';
import { TextMarkdownModal } from './TextMarkdownModal';
import { getCharacterInfo, getDisplayNickname } from '../utils/nickname';

export interface BatchViewerModalProps {
  isOpen: boolean;
  onClose: () => void;
  item: ShareItem | null;
  password?: string;
  onDownloadBatch?: (item: ShareItem, password?: string) => void;
  currentAccessUrl?: string;
  verifyPassword?: (id: string, pwd: string) => Promise<string>;
}

export const BatchViewerModal: React.FC<BatchViewerModalProps> = ({
  isOpen,
  onClose,
  item,
  password,
  onDownloadBatch,
  currentAccessUrl,
  verifyPassword,
}) => {
  const { t, i18n } = useTranslation();

  const [activeViewTab, setActiveViewTab] = useState<'gallery' | 'list'>('gallery');
  const [copiedFileId, setCopiedFileId] = useState<string | null>(null);
  const [copiedBatchLink, setCopiedBatchLink] = useState(false);
  const [selectedImage, setSelectedImage] = useState<ShareItem | null>(null);
  const [selectedDoc, setSelectedDoc] = useState<ShareItem | null>(null);
  const [selectedPdf, setSelectedPdf] = useState<ShareItem | null>(null);
  const [qrModalOpen, setQrModalOpen] = useState(false);

  // 正文说明展示状态与截断展开控制
  const [unlockedContent, setUnlockedContent] = useState<string | null>(null);
  const [isContentExpanded, setIsContentExpanded] = useState(false);
  const [copiedText, setCopiedText] = useState(false);

  // 密码校验相关状态
  const [unlocked, setUnlocked] = useState(false);
  const [inputPassword, setInputPassword] = useState(password || '');
  const [verifying, setVerifying] = useState(false);
  const [verifyError, setVerifyError] = useState<string | null>(null);

  const effectivePassword = password || item?.password || (unlocked ? inputPassword : '');

  // 获取有效正文说明内容 (包含密码解锁后解密的内容)
  const displayContent = unlockedContent || item?.content || '';

  // 超过 250 字符或多于 5 行时进行默认折叠截断
  const isContentLong = useMemo(() => {
    if (!displayContent) return false;
    return displayContent.length > 250 || (displayContent.match(/\n/g) || []).length > 5;
  }, [displayContent]);

  // Markdown 渲染 HTML (支持 GFM 语法与 Mermaid 图表)
  const markdownHtml = useMemo(() => {
    if (!displayContent) return '';
    return parseMarkdown(displayContent).html;
  }, [displayContent]);

  // 复制正文内容
  const handleCopyText = async () => {
    if (!displayContent) return;
    const ok = await copyToClipboard(displayContent);
    if (ok) {
      setCopiedText(true);
      setTimeout(() => setCopiedText(false), 2000);
    }
  };

  // 导出 Markdown 文件
  const handleDownloadMarkdown = () => {
    if (!displayContent) return;
    const blob = new Blob([displayContent], { type: 'text/markdown;charset=utf-8' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const fileName = `${(item?.title || '文档').replace(/[\\/:*?"<>|]/g, '_')}.md`;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);
  };

  // 获取子文件列表
  const subFiles: BatchFileItem[] = useMemo(() => {
    if (!item) return [];
    if (item.files && item.files.length > 0) return item.files;
    return [];
  }, [item]);

  // 检查是否全为图片或包含图片
  const hasImages = useMemo(() => {
    return subFiles.some((f) => f.isImage);
  }, [subFiles]);

  const isAllImages = useMemo(() => {
    return item?.isImageBatch || (subFiles.length > 0 && subFiles.every((f) => f.isImage));
  }, [item, subFiles]);

  // 整理所有图片项，供大图灯箱轮播画廊使用
  const allImageItemsForViewer: ShareItem[] = useMemo(() => {
    if (!item) return [];
    return subFiles
      .filter((f) => f.isImage)
      .map((f) => ({
        id: `${item.id}_${f.name}`,
        type: 'image',
        title: f.name,
        fileName: f.name,
        fileSize: f.size,
        extension: f.extension || f.name.split('.').pop() || 'png',
        mimeType: f.mimeType,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
        permission: 'all_can_download',
        downloadCount: 0,
        password: effectivePassword,
        batchParentId: item.id,
      } as any));
  }, [item, subFiles, effectivePassword]);

  // 获取指定子文件的下载或在线预览直链
  const getSubFileUrl = useCallback(
    (fileName: string, isInline: boolean = false): string => {
      if (!item) return '';
      const origin = (currentAccessUrl || window.location.origin).replace(/\/+$/, '');
      const baseUrl = `${origin}/api/records/${item.id}/download?file=${encodeURIComponent(fileName)}`;
      const queryParts: string[] = [];
      if (isInline) queryParts.push('inline=true');
      if (effectivePassword) queryParts.push(`password=${encodeURIComponent(effectivePassword)}`);
      return queryParts.length > 0 ? `${baseUrl}&${queryParts.join('&')}` : baseUrl;
    },
    [item, currentAccessUrl, effectivePassword]
  );

  // 获取整个合辑打包下载直链
  const getBatchDownloadUrl = useCallback((): string => {
    if (!item) return '';
    const origin = (currentAccessUrl || window.location.origin).replace(/\/+$/, '');
    const baseUrl = `${origin}/api/records/${item.id}/download`;
    return effectivePassword ? `${baseUrl}?password=${encodeURIComponent(effectivePassword)}` : baseUrl;
  }, [item, currentAccessUrl, effectivePassword]);

  // 获取整个合辑在前端查看直链
  const getBatchViewUrl = useCallback((): string => {
    if (!item) return '';
    const origin = (currentAccessUrl || window.location.origin).replace(/\/+$/, '');
    const baseUrl = `${origin}/view/${item.id}`;
    return effectivePassword ? `${baseUrl}?pwd=${encodeURIComponent(effectivePassword)}` : baseUrl;
  }, [item, currentAccessUrl, effectivePassword]);

  // 点击单张图片卡片打开全屏灯箱
  const handleOpenImageLightbox = (subFile: BatchFileItem) => {
    if (!item) return;
    const target = allImageItemsForViewer.find((img) => img.fileName === subFile.name) || {
      id: `${item.id}_${subFile.name}`,
      type: 'image',
      title: subFile.name,
      fileName: subFile.name,
      fileSize: subFile.size,
      extension: subFile.extension,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
      permission: 'all_can_download',
      downloadCount: 0,
      password: effectivePassword,
      batchParentId: item.id,
    } as any;
    setSelectedImage(target);
  };

  // 点击预览文档类子文件 (Markdown / 纯文本 / PDF)
  const handlePreviewSubFile = (subFile: BatchFileItem) => {
    if (!item) return;
    const subShareItem: ShareItem = {
      id: `${item.id}_${subFile.name}`,
      type: 'file',
      title: subFile.name,
      fileName: subFile.name,
      fileSize: subFile.size,
      extension: subFile.extension || subFile.name.split('.').pop() || '',
      mimeType: subFile.mimeType,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
      permission: 'all_can_download',
      downloadCount: 0,
      password: effectivePassword,
      batchParentId: item.id,
    } as any;

    if (isPdfItem(subFile)) {
      setSelectedPdf(subShareItem);
    } else if (isMarkdownItem(subFile) || isTextDocItem(subFile)) {
      setSelectedDoc(subShareItem);
    }
  };

  // 下载整个合辑 ZIP
  const handleDownloadAll = () => {
    if (!item) return;
    if (onDownloadBatch) {
      onDownloadBatch(item, effectivePassword);
    } else {
      window.location.href = getBatchDownloadUrl();
    }
  };

  // 复制单个文件的直链
  const handleCopySubFileLink = async (subFile: BatchFileItem) => {
    const link = getSubFileUrl(subFile.name, false);
    const ok = await copyToClipboard(link);
    if (ok) {
      setCopiedFileId(subFile.id);
      setTimeout(() => setCopiedFileId(null), 2000);
    }
  };

  // 复制合辑分享链接
  const handleCopyBatchLink = async () => {
    const link = getBatchViewUrl();
    const ok = await copyToClipboard(link);
    if (ok) {
      setCopiedBatchLink(true);
      setTimeout(() => setCopiedBatchLink(false), 2000);
    }
  };

  // 密码校验处理
  const handleVerifyPassword = async () => {
    if (!item || !inputPassword.trim() || !verifyPassword) return;
    try {
      setVerifying(true);
      setVerifyError(null);
      const decrypted = await verifyPassword(item.id, inputPassword.trim());
      if (decrypted) {
        setUnlockedContent(decrypted);
      }
      setUnlocked(true);
    } catch (err: any) {
      setVerifyError(err?.message || t('passwordModal.incorrectError', '密码错误，请重新输入'));
    } finally {
      setVerifying(false);
    }
  };

  if (!isOpen || !item) return null;

  const isPasswordProtected = Boolean(item.hasPassword && !effectivePassword && !unlocked);

  return (
    <>
      <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-5 animate-fade-in">
        <div
          onClick={(e) => e.stopPropagation()}
          className="w-full max-w-4xl bg-white rounded-2xl shadow-2xl border border-slate-200/90 flex flex-col max-h-[90vh] overflow-hidden animate-scale-up"
        >
          {/* 模态框顶部 Header */}
          <div className="p-4 sm:p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/60 shrink-0">
            <div className="flex items-center gap-3 min-w-0">
              <div
                className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 shadow-2xs ${
                  displayContent
                    ? 'bg-blue-100/80 text-blue-600'
                    : isAllImages
                    ? 'bg-purple-100/80 text-purple-600'
                    : 'bg-indigo-100/80 text-indigo-600'
                }`}
              >
                {displayContent ? (
                  <FileText className="w-5 h-5" />
                ) : isAllImages ? (
                  <Images className="w-5 h-5" />
                ) : (
                  <Layers className="w-5 h-5" />
                )}
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="text-base font-bold text-slate-800 tracking-tight truncate max-w-md sm:max-w-lg" title={getItemDisplayTitle(item)}>
                    {getItemDisplayTitle(item)}
                  </h3>
                  <span
                    className={`inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold border ${
                      displayContent
                        ? 'bg-blue-50 text-blue-700 border-blue-200/80'
                        : isAllImages
                        ? 'bg-purple-50 text-purple-700 border-purple-200/80'
                        : 'bg-indigo-50 text-indigo-700 border-indigo-200/80'
                    }`}
                  >
                    {displayContent
                      ? t('records.typeWithAttachments', '图文附件')
                      : isAllImages
                      ? t('records.typeImageBatch', '图片合辑')
                      : t('records.typeBatch', '文件合辑')}
                  </span>
                  {item.hasPassword && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium bg-amber-50 text-amber-700 border border-amber-200/80">
                      <Lock className="w-3 h-3 text-amber-600" />
                      <span>{t('records.passwordProtected', '密码保护')}</span>
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2 text-xs text-slate-400 font-mono mt-0.5">
                  <span>{t('records.batchCountSummary', { count: subFiles.length, size: formatBytes(item.fileSize) })}</span>
                  <span>•</span>
                  <span>{formatDisplayTime(item.createdAt)}</span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={onClose}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition active:scale-95"
                title={t('records.close', '关闭')}
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* 操作工具栏 */}
          <div className="px-4 py-2.5 bg-white border-b border-slate-100 flex flex-wrap items-center justify-between gap-3 shrink-0">
            {/* 视图切换按钮 (仅在存在图片时提供切换) */}
            {hasImages ? (
              <div className="inline-flex items-center p-1 rounded-xl bg-slate-100 border border-slate-200/70 text-xs font-medium">
                <button
                  type="button"
                  onClick={() => setActiveViewTab('gallery')}
                  className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-lg transition ${
                    activeViewTab === 'gallery'
                      ? 'bg-white text-indigo-700 font-semibold shadow-2xs'
                      : 'text-slate-600 hover:text-slate-800'
                  }`}
                >
                  <Grid className="w-3.5 h-3.5" />
                  <span>{t('records.galleryView', '画廊模式')}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveViewTab('list')}
                  className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-lg transition ${
                    activeViewTab === 'list'
                      ? 'bg-white text-indigo-700 font-semibold shadow-2xs'
                      : 'text-slate-600 hover:text-slate-800'
                  }`}
                >
                  <List className="w-3.5 h-3.5" />
                  <span>{t('records.listView', '列表模式')}</span>
                </button>
              </div>
            ) : (
              <div className="text-xs font-medium text-slate-500 flex items-center gap-1.5">
                <FileText className="w-4 h-4 text-indigo-500" />
                <span>{t('records.fileListTitle', '合辑文件列表')}</span>
              </div>
            )}

            {/* 核心操作按钮 */}
            <div className="flex items-center gap-2">
              {/* 复制合辑分享链接 */}
              <button
                type="button"
                onClick={handleCopyBatchLink}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl border border-slate-200 text-slate-700 hover:text-indigo-600 hover:border-indigo-200 hover:bg-indigo-50/50 bg-white text-xs font-medium shadow-2xs transition active:scale-95"
                title={t('records.copyLink', '复制链接')}
              >
                {copiedBatchLink ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-500" />
                    <span className="text-emerald-600">{t('records.copied', '已复制')}</span>
                  </>
                ) : (
                  <>
                    <Link2 className="w-3.5 h-3.5 text-slate-400" />
                    <span>{t('records.copyLink', '复制链接')}</span>
                  </>
                )}
              </button>

              {/* 扫码二维码 */}
              <button
                type="button"
                onClick={() => setQrModalOpen(true)}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl border border-slate-200 text-slate-700 hover:text-indigo-600 hover:border-indigo-200 hover:bg-indigo-50/50 bg-white text-xs font-medium shadow-2xs transition active:scale-95"
                title={t('records.qr', '二维码')}
              >
                <QrCode className="w-3.5 h-3.5 text-slate-400" />
                <span className="hidden sm:inline">{t('records.qr', '二维码')}</span>
              </button>

              {/* 一键打包下载全部 ZIP 按钮 */}
              <button
                type="button"
                onClick={handleDownloadAll}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white text-xs font-semibold shadow-sm shadow-blue-500/20 transition active:scale-95"
                title={t('records.downloadZipAll', '一键打包下载全部 (.zip)')}
              >
                <Download className="w-3.5 h-3.5" />
                <span>{t('records.downloadZipAll', '打包下载全部 (.zip)')}</span>
              </button>
            </div>
          </div>

          {/* 模态框主体内容 (带滚动条) */}
          <div className="flex-1 overflow-y-auto p-4 sm:p-5 bg-[#fafbfd]">
            {/* 密码未解锁时提示输入访问密码 */}
            {isPasswordProtected ? (
              <div className="max-w-md mx-auto my-8 p-6 bg-white rounded-2xl border border-amber-200 shadow-sm text-center animate-fade-in">
                <div className="w-12 h-12 rounded-2xl bg-amber-100 text-amber-600 flex items-center justify-center mx-auto mb-3">
                  <Lock className="w-6 h-6" />
                </div>
                <h4 className="text-base font-bold text-slate-800 mb-1">
                  {t('records.pwdVerifyTitle', '该合辑受访问密码保护')}
                </h4>
                <p className="text-xs text-slate-500 mb-4">
                  {t('records.pwdVerifyDesc', '请输入发起者设置的访问密码后查看所有子文件或下载')}
                </p>
                <div className="flex items-center gap-2">
                  <input
                    type="password"
                    value={inputPassword}
                    onChange={(e) => setInputPassword(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleVerifyPassword()}
                    placeholder={t('records.pwdInputPlaceholder', '输入访问密码')}
                    className="flex-1 px-3.5 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-blue-500 focus:bg-white font-mono"
                  />
                  <button
                    type="button"
                    onClick={handleVerifyPassword}
                    disabled={verifying || !inputPassword.trim()}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-xl transition disabled:opacity-50 flex items-center gap-1.5"
                  >
                    {verifying ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : t('passwordModal.confirm', '确认')}
                  </button>
                </div>
                {verifyError && <p className="text-xs text-rose-600 font-medium mt-2">{verifyError}</p>}
              </div>
            ) : (
              <>
                {/* 1. 若存在正文说明，顶部优先渲染 Markdown 格式正文 (支持长文本截断与展开/折叠) */}
                {displayContent && (
                  <div className="mb-5 bg-white rounded-2xl border border-slate-200/90 shadow-2xs overflow-hidden transition-all">
                    {/* 正文说明顶部操作栏 */}
                    <div className="px-4 py-2.5 bg-slate-50/80 border-b border-slate-100 flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2 font-semibold text-slate-700">
                        <FileText className="w-4 h-4 text-blue-600 shrink-0" />
                        <span>{t('batchViewer.textContent', '正文说明')}</span>
                        <span className="text-[11px] font-normal text-slate-400 font-mono">
                          ({t('markdownModal.chars', { count: displayContent.length })})
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={handleCopyText}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-medium bg-white hover:bg-slate-100 text-slate-600 border border-slate-200 shadow-2xs transition active:scale-95"
                          title={t('markdownModal.copy', '复制正文')}
                        >
                          {copiedText ? (
                            <>
                              <Check className="w-3 h-3 text-emerald-500 shrink-0" />
                              <span className="text-emerald-600 font-semibold">{t('markdownModal.copied', '已复制')}</span>
                            </>
                          ) : (
                            <>
                              <Copy className="w-3 h-3 text-slate-400 shrink-0" />
                              <span>{t('markdownModal.copy', '复制正文')}</span>
                            </>
                          )}
                        </button>
                        <button
                          type="button"
                          onClick={handleDownloadMarkdown}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-medium bg-white hover:bg-slate-100 text-slate-600 border border-slate-200 shadow-2xs transition active:scale-95"
                          title={t('markdownModal.downloadMd', '下载为 .md')}
                        >
                          <Download className="w-3 h-3 text-slate-400 shrink-0" />
                          <span>{t('batchViewer.exportMd', '导出 .md')}</span>
                        </button>
                      </div>
                    </div>

                    {/* Markdown 正文内容 */}
                    <div className="relative p-4 sm:p-5">
                      <MarkdownRenderer
                        html={markdownHtml}
                        className={`markdown-content max-w-none text-slate-800 leading-relaxed text-sm selection:bg-blue-100 transition-all ${
                          !isContentExpanded && isContentLong ? 'max-h-[160px] overflow-hidden' : ''
                        }`}
                      />

                      {/* 截断渐变与展开/折叠按钮 */}
                      {isContentLong && (
                        <div
                          className={`${
                            !isContentExpanded
                              ? 'absolute inset-x-0 bottom-0 pt-12 pb-2 bg-gradient-to-t from-white via-white/95 to-transparent flex justify-center'
                              : 'pt-3 flex justify-center border-t border-slate-100/80 mt-3'
                          }`}
                        >
                          <button
                            type="button"
                            onClick={() => setIsContentExpanded(!isContentExpanded)}
                            className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-blue-50 hover:bg-blue-100 text-blue-600 border border-blue-200/80 shadow-2xs transition active:scale-95 cursor-pointer"
                          >
                            {isContentExpanded ? (
                              <>
                                <ChevronUp className="w-3.5 h-3.5 shrink-0" />
                                <span>{t('batchViewer.collapseContent', '收起完整内容')}</span>
                              </>
                            ) : (
                              <>
                                <ChevronDown className="w-3.5 h-3.5 shrink-0" />
                                <span>{t('batchViewer.expandContent', '展开完整内容')}</span>
                              </>
                            )}
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* 2. 附件列表区域 (如果存在正文说明，显示清晰的附件标头) */}
                {displayContent && (
                  <div className="flex items-center justify-between pb-3 pt-1">
                    <div className="flex items-center gap-2">
                      <Paperclip className="w-4 h-4 text-indigo-600 shrink-0" />
                      <h4 className="text-xs font-bold text-slate-700 tracking-tight">
                        {t('batchViewer.attachmentsTitle', '附件列表')}
                      </h4>
                      <span className="text-[11px] font-mono text-slate-400">
                        ({subFiles.length} {t('records.fileUnit', '个文件')} · {formatBytes(item.fileSize)})
                      </span>
                    </div>
                  </div>
                )}

                {/* 附件展示：画廊模式 / 列表模式 */}
                {hasImages && activeViewTab === 'gallery' ? (
              /* 画廊模式：图片响应式网格瀑布流呈现，悬浮操作与点击大图预览 */
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 sm:gap-4">
                {subFiles.map((subFile) => {
                  const subFileUrl = getSubFileUrl(subFile.name, true);
                  const isImage = subFile.isImage;

                  return (
                    <div
                      key={subFile.id}
                      className="group relative aspect-square rounded-2xl overflow-hidden border border-slate-200/80 bg-white shadow-2xs hover:shadow-md transition-all duration-200 flex flex-col justify-between"
                    >
                      {isImage ? (
                        <>
                          {/* 图片真实预览 */}
                          <img
                            src={subFileUrl}
                            alt={subFile.name}
                            loading="lazy"
                            className="w-full h-full object-cover transition duration-300 group-hover:scale-105 cursor-pointer bg-slate-100"
                            onClick={() => handleOpenImageLightbox(subFile)}
                          />

                          {/* 悬浮覆盖操作栏 */}
                          <div
                            onClick={() => handleOpenImageLightbox(subFile)}
                            className="absolute inset-0 bg-gradient-to-t from-slate-900/80 via-transparent to-black/30 opacity-0 group-hover:opacity-100 transition-opacity duration-200 p-2.5 flex flex-col justify-between cursor-pointer"
                          >
                            <div className="flex items-center justify-between">
                              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-black/40 text-white backdrop-blur-md">
                                {formatBytes(subFile.size)}
                              </span>
                              <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                                <a
                                  href={getSubFileUrl(subFile.name, false)}
                                  download={subFile.name}
                                  className="p-1.5 rounded-lg bg-black/40 hover:bg-blue-600 text-white backdrop-blur-md transition"
                                  title={t('records.downloadSingle', '下载此文件')}
                                >
                                  <Download className="w-3.5 h-3.5" />
                                </a>
                              </div>
                            </div>

                            <div className="min-w-0">
                              <p className="text-xs font-semibold text-white truncate drop-shadow-sm" title={subFile.name}>
                                {subFile.name}
                              </p>
                              <p className="text-[10px] text-white/70 flex items-center gap-1 mt-0.5">
                                <Eye className="w-3 h-3" />
                                <span>{t('records.clickToLightbox', '点击全屏大图预览')}</span>
                              </p>
                            </div>
                          </div>
                        </>
                      ) : (
                        /* 非图片文件的卡片化展示 */
                        <div
                          className={`w-full h-full p-4 flex flex-col items-center justify-center text-center bg-slate-50 hover:bg-slate-100/70 transition ${
                            isDocPreviewable(subFile) ? 'cursor-pointer' : ''
                          }`}
                          onClick={() => {
                            if (isDocPreviewable(subFile)) {
                              handlePreviewSubFile(subFile);
                            }
                          }}
                        >
                          <div
                            className={`w-12 h-12 rounded-2xl flex items-center justify-center mb-2 ${
                              isPdfItem(subFile)
                                ? 'bg-rose-50 border border-rose-100 text-rose-600'
                                : isMarkdownItem(subFile) || isTextDocItem(subFile)
                                ? 'bg-blue-50 border border-blue-100 text-blue-600'
                                : 'bg-indigo-50 border border-indigo-100 text-indigo-600'
                            }`}
                          >
                            <FileText className="w-6 h-6" />
                          </div>
                          <span className="text-xs font-semibold text-slate-800 line-clamp-2 max-w-full mb-1" title={subFile.name}>
                            {subFile.name}
                          </span>
                          <span className="text-[11px] font-mono text-slate-400 mb-2">
                            {formatBytes(subFile.size)}
                          </span>
                          <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                            {isDocPreviewable(subFile) && (
                              <button
                                type="button"
                                onClick={() => handlePreviewSubFile(subFile)}
                                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-blue-50 text-blue-600 hover:bg-blue-100 border border-blue-200 text-xs font-medium transition active:scale-95"
                                title={t('preview.view', '预览')}
                              >
                                <Eye className="w-3 h-3" />
                                <span>{t('preview.view', '预览')}</span>
                              </button>
                            )}
                            <a
                              href={getSubFileUrl(subFile.name, false)}
                              download={subFile.name}
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white border border-slate-200 text-xs font-medium text-slate-700 hover:text-blue-600 hover:border-blue-200 transition"
                            >
                              <Download className="w-3 h-3" />
                              <span>{t('records.download', '下载')}</span>
                            </a>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              /* 列表模式：清晰列表、独立直链、按需单一下载 */
              <div className="bg-white rounded-2xl border border-slate-200/80 shadow-2xs divide-y divide-slate-100 overflow-hidden">
                {subFiles.map((subFile, idx) => {
                  const subFileUrl = getSubFileUrl(subFile.name, false);
                  const isImage = subFile.isImage;

                  return (
                    <div
                      key={subFile.id}
                      className="p-3 sm:px-4 flex items-center justify-between gap-3 hover:bg-slate-50/80 transition group"
                    >
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        {/* 序号与图标 */}
                        <span className="text-xs font-mono text-slate-400 w-5 text-right shrink-0">
                          {idx + 1}
                        </span>
                        {isImage ? (
                          <img
                            src={getSubFileUrl(subFile.name, true)}
                            alt={subFile.name}
                            className="w-10 h-10 rounded-xl object-cover border border-slate-200/90 shrink-0 bg-slate-100 cursor-pointer hover:opacity-90 transition"
                            onClick={() => handleOpenImageLightbox(subFile)}
                          />
                        ) : (
                          <div
                            className={`w-10 h-10 rounded-xl border flex items-center justify-center shrink-0 ${
                              isPdfItem(subFile)
                                ? 'bg-rose-50 border-rose-100 text-rose-600'
                                : isMarkdownItem(subFile) || isTextDocItem(subFile)
                                ? 'bg-blue-50 border-blue-100 text-blue-600'
                                : 'bg-indigo-50 border-indigo-100 text-indigo-600'
                            }`}
                          >
                            <FileText className="w-5 h-5" />
                          </div>
                        )}

                        {/* 文件名与大小 */}
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span
                              onClick={() => {
                                if (isImage) handleOpenImageLightbox(subFile);
                                else if (isDocPreviewable(subFile)) handlePreviewSubFile(subFile);
                              }}
                              className={`text-xs font-semibold text-slate-800 truncate ${
                                isImage || isDocPreviewable(subFile) ? 'cursor-pointer hover:text-blue-600' : ''
                              }`}
                              title={subFile.name}
                            >
                              {subFile.name}
                            </span>
                            {isImage && (
                              <span className="text-[10px] font-sans px-1.5 py-0.2 rounded bg-purple-50 text-purple-600 border border-purple-200/60 shrink-0">
                                {t('send.imageBadge', '图片')}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-2 text-[11px] font-mono text-slate-400 mt-0.5">
                            <span>{formatBytes(subFile.size)}</span>
                            <span>•</span>
                            <span>{getFileTypeLabel(subFile.name, subFile.extension, subFile.mimeType)}</span>
                          </div>
                        </div>
                      </div>

                      {/* 单文件独立操作 */}
                      <div className="flex items-center gap-1.5 shrink-0">
                        {isImage && (
                          <button
                            type="button"
                            onClick={() => handleOpenImageLightbox(subFile)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-slate-200 hover:border-blue-200 text-slate-600 hover:text-blue-600 hover:bg-blue-50/50 text-[11px] font-medium transition active:scale-95"
                            title={t('records.preview', '预览')}
                          >
                            <Eye className="w-3.5 h-3.5" />
                            <span className="hidden sm:inline">{t('records.preview', '预览')}</span>
                          </button>
                        )}
                        {isDocPreviewable(subFile) && (
                          <button
                            type="button"
                            onClick={() => handlePreviewSubFile(subFile)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-slate-200 hover:border-blue-200 text-slate-600 hover:text-blue-600 hover:bg-blue-50/50 text-[11px] font-medium transition active:scale-95"
                            title={t('preview.view', '预览')}
                          >
                            <Eye className="w-3.5 h-3.5" />
                            <span className="hidden sm:inline">{t('preview.view', '预览')}</span>
                          </button>
                        )}

                        <button
                          type="button"
                          onClick={() => handleCopySubFileLink(subFile)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-slate-200 hover:border-blue-200 text-slate-600 hover:text-blue-600 hover:bg-blue-50/50 text-[11px] font-medium transition active:scale-95"
                          title={t('records.copyLink', '复制直链')}
                        >
                          {copiedFileId === subFile.id ? (
                            <>
                              <Check className="w-3.5 h-3.5 text-emerald-500" />
                              <span className="text-emerald-600">{t('records.copied', '已复制')}</span>
                            </>
                          ) : (
                            <>
                              <Link2 className="w-3.5 h-3.5" />
                              <span className="hidden sm:inline">{t('records.copyLink', '复制链接')}</span>
                            </>
                          )}
                        </button>

                        <a
                          href={subFileUrl}
                          download={subFile.name}
                          className="inline-flex items-center gap-1 px-3 py-1 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200/80 text-[11px] font-semibold transition active:scale-95"
                          title={t('records.download', '下载')}
                        >
                          <Download className="w-3.5 h-3.5" />
                          <span>{t('records.download', '下载')}</span>
                        </a>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
          </div>

          {/* 模态框底部 Footer */}
          <div className="p-3.5 sm:px-5 border-t border-slate-100 bg-slate-50/60 flex items-center justify-between text-xs text-slate-500 shrink-0">
            <div className="flex items-center gap-2">
              <span className="text-xs">
                {getCharacterInfo(item.senderName || item.nickname).emoji}
              </span>
              <span className="font-medium text-slate-700">
                {getDisplayNickname(item.senderName || item.nickname, i18n.language)}
              </span>
              <span>•</span>
              <span className="font-mono text-[11px]">
                {t('records.batchCountSummary', { count: subFiles.length, size: formatBytes(item.fileSize) })}
              </span>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="px-4 py-1.5 rounded-xl border border-slate-200 hover:bg-white text-slate-600 text-xs font-medium transition active:scale-95"
            >
              {t('records.close', '关闭')}
            </button>
          </div>
        </div>
      </div>

      {/* 图片全屏灯箱轮播画廊 */}
      {selectedImage && (
        <ImageViewerModal
          isOpen={Boolean(selectedImage)}
          onClose={() => setSelectedImage(null)}
          item={selectedImage}
          allImageItems={allImageItemsForViewer}
          password={effectivePassword}
          currentAccessUrl={currentAccessUrl}
        />
      )}

      {/* 整个合辑二维码弹窗 */}
      {qrModalOpen && (
        <FileQrModal
          isOpen={qrModalOpen}
          onClose={() => setQrModalOpen(false)}
          item={item}
          downloadUrl={getBatchViewUrl()}
          mode="view"
        />
      )}

      {/* 文档 / Markdown 渲染弹窗 */}
      {selectedDoc && (
        <TextMarkdownModal
          isOpen={Boolean(selectedDoc)}
          onClose={() => setSelectedDoc(null)}
          item={selectedDoc}
          password={effectivePassword}
        />
      )}

      {/* PDF 文件在线预览大弹窗 */}
      {selectedPdf && (
        <PdfViewerModal
          isOpen={Boolean(selectedPdf)}
          onClose={() => setSelectedPdf(null)}
          item={selectedPdf}
          password={effectivePassword}
          currentAccessUrl={currentAccessUrl}
        />
      )}
    </>
  );
};
