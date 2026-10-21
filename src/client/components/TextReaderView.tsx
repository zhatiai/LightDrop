import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import {
  X,
  Copy,
  Check,
  Download,
  FileText,
  Code2,
  Eye,
  FileDown,
  ArrowUp,
  ArrowLeft,
  Loader2,
  AlertCircle,
  ListTree,
  ChevronUp,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { ShareItem } from '@shared/types';
import { copyToClipboard } from '../utils/clipboard';
import { formatDisplayTime } from '../utils/format';
import { parseMarkdown, TocItem } from '../utils/markdown';
import { MarkdownRenderer } from './MarkdownRenderer';

export type { TocItem };

interface TextReaderViewProps {
  item: ShareItem;
  customContent?: string;
  password?: string;
  onClose?: () => void;
  isStandalone?: boolean;
}

export const TextReaderView: React.FC<TextReaderViewProps> = ({
  item,
  customContent,
  password,
  onClose,
  isStandalone = false,
}) => {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState<'preview' | 'raw'>('preview');

  // 异步获取的文件内容状态
  const [fetchedContent, setFetchedContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  // 下载为 .md / .txt 命名确认弹窗
  const [showRenameDialog, setShowRenameDialog] = useState(false);
  const [downloadFilename, setDownloadFilename] = useState('');

  // 长文本滚动状态与阅读进度
  const scrollRef = useRef<HTMLDivElement>(null);
  const [scrollProgress, setScrollProgress] = useState(0);
  const [showBackToTop, setShowBackToTop] = useState(false);

  // 加载远端文本内容 (针对上传的 .md/.txt 文件或合辑子文件)
  const fetchFileContent = useCallback(async () => {
    const parentId = (item as any).batchParentId;
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    const recordId = parentId || item.id;
    let url = `${origin}/api/records/${recordId}/download?inline=true`;
    if (parentId) {
      url += `&file=${encodeURIComponent(item.fileName || item.title)}`;
    }
    const pwd = password || item.password;
    if (pwd) {
      url += `&password=${encodeURIComponent(pwd)}`;
    }

    try {
      setLoading(true);
      setLoadError(null);
      const res = await fetch(url);
      if (!res.ok) {
        throw new Error(t('preview.loadFailed', '获取文档内容失败'));
      }
      const text = await res.text();
      setFetchedContent(text);
    } catch (err: any) {
      console.error('Failed to load text content:', err);
      setLoadError(err.message || t('preview.loadFailed', '获取文档内容失败'));
    } finally {
      setLoading(false);
    }
  }, [item, password, t]);

  useEffect(() => {
    if (customContent !== undefined) {
      setFetchedContent(null);
      return;
    }
    if (item.content && item.content.trim()) {
      setFetchedContent(null);
      return;
    }
    // 当没有直接传入内容且属于文件记录时，自动拉取流
    fetchFileContent();
  }, [item, customContent, fetchFileContent]);

  // 原始文本内容
  const rawContent = customContent ?? fetchedContent ?? item.content ?? item.preview ?? '';

  // 监听 ESC 键
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (showRenameDialog) {
          setShowRenameDialog(false);
        } else if (onClose) {
          onClose();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [showRenameDialog, onClose]);

  // 目录显示与隐藏状态 (可通过顶部按钮与文档内部目录按钮自由切换)
  const [showToc, setShowToc] = useState(true);

  // 解析 Markdown 与提取各级章节标题目录 (GFM 兼容、自动断行、章节锚点与 Mermaid 图表支持)
  const { markdownHtml, tocItems } = useMemo(() => {
    return parseMarkdown(rawContent);
  }, [rawContent]);

  // 平滑滚动回目录 (若目录被折叠隐藏则自动展开)
  const scrollToToc = () => {
    if (!showToc) {
      setShowToc(true);
    }
    scrollRef.current?.scrollTo({
      top: 0,
      behavior: 'smooth',
    });
  };

  // 顶部按钮切换目录显示 / 回到目录
  const handleToggleToc = () => {
    if (tocItems.length === 0) return;

    if (activeTab === 'raw') {
      setActiveTab('preview');
      setShowToc(true);
      scrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    const currentScroll = scrollRef.current?.scrollTop || 0;

    // 当目录已展开且正文已向下滚动时，点击顶部目录按钮优先平滑回到目录
    if (showToc && currentScroll > 120) {
      scrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    setShowToc((prev) => {
      const next = !prev;
      if (next) {
        scrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
      }
      return next;
    });
  };

  // 点击目录章节平滑滚动定位并高亮目标标题
  const handleJumpToHeading = (id: string) => {
    if (!scrollRef.current) return;
    const targetEl = document.getElementById(id);
    if (!targetEl) return;

    const container = scrollRef.current;
    const containerRect = container.getBoundingClientRect();
    const targetRect = targetEl.getBoundingClientRect();
    const offset = targetRect.top - containerRect.top + container.scrollTop - 20;

    container.scrollTo({
      top: Math.max(0, offset),
      behavior: 'smooth',
    });

    targetEl.classList.remove('heading-target-highlight');
    void targetEl.offsetWidth;
    targetEl.classList.add('heading-target-highlight');
    setTimeout(() => {
      targetEl.classList.remove('heading-target-highlight');
    }, 1800);
  };

  // 一键复制
  const handleCopy = async () => {
    const ok = await copyToClipboard(rawContent);
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  // 点击“下载”
  const handleStartDownload = () => {
    const ext = (item.extension || item.fileName?.split('.').pop() || '').toLowerCase();
    const isTxt = ['txt', 'log'].includes(ext);
    const targetExt = isTxt ? `.${ext}` : '.md';

    const baseTitle = item.fileName || item.title || t('markdownModal.defaultNote', '笔记');
    const sanitizedTitle = baseTitle
      .replace(/[\\/:*?"<>|]/g, '_')
      .replace(/\.+$/, '')
      .trim();
    const defaultName = sanitizedTitle.toLowerCase().endsWith(targetExt)
      ? sanitizedTitle
      : `${sanitizedTitle}${targetExt}`;
    setDownloadFilename(defaultName);
    setShowRenameDialog(true);
  };

  // 确认命名并下载
  const handleConfirmDownload = () => {
    let finalName = downloadFilename.trim();
    const ext = (item.extension || item.fileName?.split('.').pop() || '').toLowerCase();
    const isTxt = ['txt', 'log'].includes(ext);
    const targetExt = isTxt ? `.${ext}` : '.md';

    if (!finalName) {
      finalName = isTxt ? 'document.txt' : t('markdownModal.defaultDoc', '文档.md');
    }
    if (!finalName.toLowerCase().endsWith(targetExt)) {
      finalName += targetExt;
    }

    try {
      const mimeType = isTxt ? 'text/plain;charset=utf-8' : 'text/markdown;charset=utf-8';
      const blob = new Blob([rawContent], { type: mimeType });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = finalName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setShowRenameDialog(false);
    } catch (err) {
      console.error('Download error:', err);
    }
  };

  // 监听长文本滚动，计算阅读进度与“回到顶部”按钮显示
  const handleScroll = () => {
    if (!scrollRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
    const totalScroll = scrollHeight - clientHeight;
    if (totalScroll > 0) {
      const progress = Math.min(100, Math.max(0, (scrollTop / totalScroll) * 100));
      setScrollProgress(progress);
    } else {
      setScrollProgress(0);
    }
    setShowBackToTop(scrollTop > 240);
  };

  // 平滑滚动回顶部
  const scrollToTop = () => {
    scrollRef.current?.scrollTo({
      top: 0,
      behavior: 'smooth',
    });
  };

  const handleCloseClick = () => {
    if (onClose) {
      onClose();
    } else if (isStandalone) {
      window.location.href = '/';
    }
  };

  const fileExt = (item.extension || item.fileName?.split('.').pop() || '').toLowerCase();
  const isTxtFile = ['txt', 'log'].includes(fileExt);
  const displayTitle = item.fileName || item.title || t('markdownModal.defaultNote', '笔记');

  return (
    <div className="relative flex flex-col w-full h-full bg-white select-text overflow-hidden">
      {/* 顶部阅读进度条 (长文本滚动时的视觉指示器) */}
      <div className="absolute top-0 left-0 right-0 h-[2.5px] bg-transparent z-30 pointer-events-none">
        <div
          className="h-full bg-blue-600 transition-all duration-150 ease-out"
          style={{ width: `${scrollProgress}%` }}
        />
      </div>

      {/* 顶部标题栏与功能操作按钮组 */}
      <div className="flex items-center justify-between px-4 sm:px-6 py-3.5 border-b border-slate-100 bg-slate-50/70 shrink-0 z-10">
        <div className="flex items-center gap-2.5 min-w-0 pr-3">
          <div className="w-8 h-8 rounded-xl bg-blue-100/80 text-blue-600 flex items-center justify-center shrink-0 shadow-2xs">
            <FileText className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <h3 className="text-sm font-bold text-slate-800 truncate" title={displayTitle}>
              {displayTitle}
            </h3>
            <p className="text-[11px] text-slate-400 mt-0.5 font-mono">
              {loading
                ? t('records.loading', '正在加载文档内容...')
                : `${formatDisplayTime(item.createdAt)} · ${t('markdownModal.chars', { count: rawContent.length })}`}
            </p>
          </div>
        </div>

        {/* 右上角操作区：Markdown/原始切换、复制、下载、关闭 */}
        <div className="flex items-center gap-2 shrink-0">
          {/* 渲染视图切换 */}
          <div className="hidden sm:flex items-center bg-slate-200/60 p-0.5 rounded-lg border border-slate-200 text-xs">
            <button
              type="button"
              onClick={() => setActiveTab('preview')}
              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-medium transition ${
                activeTab === 'preview'
                  ? 'bg-white text-blue-600 shadow-2xs font-semibold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Eye className="w-3 h-3" />
              <span>{t('markdownModal.preview', '渲染预览')}</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('raw')}
              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-medium transition ${
                activeTab === 'raw'
                  ? 'bg-white text-blue-600 shadow-2xs font-semibold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Code2 className="w-3 h-3" />
              <span>{t('markdownModal.raw', '原始内容')}</span>
            </button>
          </div>

          {/* 目录显隐切换按钮 */}
          <button
            type="button"
            onClick={handleToggleToc}
            disabled={loading || Boolean(loadError) || tocItems.length === 0}
            className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border text-xs font-medium transition active:scale-95 shadow-2xs ${
              tocItems.length === 0
                ? 'bg-slate-50 text-slate-300 border-slate-200 cursor-not-allowed opacity-60'
                : showToc && activeTab === 'preview'
                ? 'bg-blue-50 text-blue-600 border-blue-200 font-semibold shadow-xs'
                : 'bg-white hover:bg-slate-100 border-slate-200 text-slate-700 hover:text-blue-600'
            }`}
            title={
              tocItems.length === 0
                ? t('markdownModal.tocEmpty', '本文档未包含章节标题')
                : showToc && showBackToTop
                ? t('markdownModal.backToToc', '回到目录')
                : showToc
                ? t('markdownModal.tocHide', '隐藏目录')
                : t('markdownModal.tocShow', '显示目录')
            }
          >
            <ListTree className="w-3.5 h-3.5" />
            <span className="hidden xs:inline sm:inline">{t('markdownModal.toc', '目录')}</span>
            {tocItems.length > 0 && (
              <span
                className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${
                  showToc && activeTab === 'preview'
                    ? 'bg-blue-200/60 text-blue-700 font-bold'
                    : 'bg-slate-100 text-slate-500'
                }`}
              >
                {tocItems.length}
              </span>
            )}
          </button>

          {/* 复制文本内容 */}
          <button
            type="button"
            onClick={handleCopy}
            disabled={loading || Boolean(loadError)}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 hover:text-blue-600 text-xs font-medium transition active:scale-95 shadow-2xs disabled:opacity-50"
            title="复制全部内容"
          >
            {copied ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-600" />
                <span className="text-emerald-600 font-semibold">{t('markdownModal.copied', '已复制')}</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5" />
                <span>{t('markdownModal.copy', '复制')}</span>
              </>
            )}
          </button>

          {/* 下载为文件 */}
          <button
            type="button"
            onClick={handleStartDownload}
            disabled={loading || Boolean(loadError)}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 text-xs font-semibold transition active:scale-95 shadow-2xs disabled:opacity-50"
            title={isTxtFile ? t('preview.downloadTxt', '下载文件') : t('markdownModal.downloadMd', '下载为 .md')}
          >
            <Download className="w-3.5 h-3.5 text-blue-600" />
            <span>{isTxtFile ? t('preview.downloadTxt', '下载文件') : t('markdownModal.downloadMd', '下载为 .md')}</span>
          </button>

          {/* 关闭 / 返回首页按钮 */}
          <button
            type="button"
            onClick={handleCloseClick}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 transition ml-1"
            title={isStandalone ? t('header.goHome', '返回首页') : t('records.close', '关闭')}
          >
            {isStandalone ? <ArrowLeft className="w-4 h-4" /> : <X className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* 内容展示主体区域 (长文本平滑滚动与排版优化) */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto bg-white selection:bg-blue-100 selection:text-blue-900 custom-scrollbar overscroll-contain relative scroll-smooth"
      >
        {loading ? (
          <div className="flex flex-col items-center justify-center py-24 text-slate-400 gap-3">
            <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
            <span className="text-xs font-medium text-slate-500">
              {t('records.loading', '正在加载文档内容...')}
            </span>
          </div>
        ) : loadError ? (
          <div className="flex flex-col items-center justify-center py-24 text-center p-6 gap-3">
            <div className="w-12 h-12 rounded-2xl bg-rose-50 text-rose-500 flex items-center justify-center border border-rose-100">
              <AlertCircle className="w-6 h-6" />
            </div>
            <p className="text-sm font-semibold text-slate-800">{loadError}</p>
            <button
              type="button"
              onClick={fetchFileContent}
              className="px-4 py-2 rounded-xl bg-blue-600 text-white text-xs font-medium hover:bg-blue-700 transition"
            >
              {t('preview.retry', '重新加载')}
            </button>
          </div>
        ) : (
          <div className="max-w-4xl mx-auto w-full p-5 sm:p-8 sm:px-12">
            {activeTab === 'preview' ? (
              <>
                {/* 文件顶部目录区域 (基于 Markdown 语法章节级别生成，可由顶部按钮或收起按钮控制) */}
                {showToc && tocItems.length > 0 && (
                  <div className="mb-8 p-4 sm:p-5 bg-gradient-to-b from-slate-50/90 to-slate-50/40 hover:bg-slate-50/90 border border-slate-200/90 rounded-2xl shadow-2xs transition-all animate-fade-in">
                    <div className="flex items-center justify-between pb-3 mb-3 border-b border-slate-200/70">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-xl bg-blue-100/90 text-blue-600 flex items-center justify-center shrink-0 shadow-2xs">
                          <ListTree className="w-4 h-4" />
                        </div>
                        <div className="flex items-baseline gap-2">
                          <span className="text-xs sm:text-sm font-bold text-slate-800">
                            {t('markdownModal.tocTitle', '文档目录')}
                          </span>
                          <span className="text-[11px] font-mono text-slate-400">
                            {t('markdownModal.tocCount', { count: tocItems.length })}
                          </span>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setShowToc(false)}
                        className="inline-flex items-center gap-1 text-[11px] text-slate-400 hover:text-slate-600 px-2.5 py-1 rounded-lg hover:bg-slate-200/60 transition font-medium"
                        title={t('markdownModal.tocHide', '隐藏目录')}
                      >
                        <span>{t('markdownModal.tocCollapse', '收起目录')}</span>
                        <ChevronUp className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    {/* 章节链接层级列表 */}
                    <nav className="max-h-72 sm:max-h-80 overflow-y-auto custom-scrollbar pr-1.5 space-y-0.5">
                      {tocItems.map((tocItem, idx) => {
                        const indentClass =
                          tocItem.level === 1
                            ? 'pl-2 font-semibold text-slate-800 text-xs sm:text-sm'
                            : tocItem.level === 2
                            ? 'pl-5 font-medium text-slate-700 text-xs sm:text-sm'
                            : tocItem.level === 3
                            ? 'pl-8 text-slate-600 text-xs'
                            : tocItem.level === 4
                            ? 'pl-11 text-slate-500 text-xs'
                            : 'pl-14 text-slate-400 text-[11px]';

                        return (
                          <button
                            key={`${tocItem.id}-${idx}`}
                            type="button"
                            onClick={() => handleJumpToHeading(tocItem.id)}
                            className={`w-full text-left py-1.5 px-2 rounded-lg hover:bg-blue-50/80 hover:text-blue-600 transition-colors flex items-center gap-2 group truncate ${indentClass}`}
                            title={tocItem.cleanText}
                          >
                            <span
                              className={`w-1.5 h-1.5 rounded-full shrink-0 transition-transform group-hover:scale-125 ${
                                tocItem.level === 1
                                  ? 'bg-blue-600 ring-2 ring-blue-100'
                                  : tocItem.level === 2
                                  ? 'bg-blue-400'
                                  : 'bg-slate-300 group-hover:bg-blue-400'
                              }`}
                            />
                            <span className="truncate">{tocItem.cleanText}</span>
                          </button>
                        );
                      })}
                    </nav>
                  </div>
                )}

                <MarkdownRenderer
                  html={markdownHtml}
                  className="markdown-content max-w-none text-slate-800 leading-relaxed text-sm selection:bg-blue-100"
                />
              </>
            ) : (
              <pre className="font-mono text-xs sm:text-sm text-slate-800 bg-slate-50/80 p-5 rounded-2xl border border-slate-200 whitespace-pre-wrap break-words leading-relaxed select-text shadow-inner">
                {rawContent}
              </pre>
            )}
          </div>
        )}

        {/* 浮动操作按钮组：“回到目录”与“回到顶部” */}
        {showBackToTop && (
          <div className="fixed sm:absolute bottom-12 right-4 sm:right-8 z-20 flex items-center gap-2 animate-fade-in">
            {tocItems.length > 0 && activeTab === 'preview' && (
              <button
                type="button"
                onClick={scrollToToc}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white shadow-lg shadow-blue-500/25 border border-blue-500/30 text-xs font-semibold transition-all active:scale-95"
                title={t('markdownModal.backToToc', '回到目录')}
              >
                <ListTree className="w-3.5 h-3.5" />
                <span>{t('markdownModal.backToToc', '回到目录')}</span>
              </button>
            )}
            <button
              type="button"
              onClick={scrollToTop}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white/95 hover:bg-slate-50 backdrop-blur-md border border-slate-200 text-slate-600 hover:text-blue-600 hover:border-blue-300 shadow-md text-xs font-medium transition-all active:scale-95"
              title={t('markdownModal.backToTop', '回到顶部')}
            >
              <ArrowUp className="w-3.5 h-3.5" />
              <span>{t('markdownModal.backToTop', '回到顶部')}</span>
            </button>
          </div>
        )}
      </div>

      {/* 底部信息条 (与设计图完全一致) */}
      <div className="px-5 py-2.5 bg-slate-50/80 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-400 shrink-0">
        <span>{t('markdownModal.footerEngine', 'LightDrop Markdown 渲染引擎 · 支持 GFM 语法')}</span>
        <span>
          {isStandalone
            ? t('downloadPage.backHomeHint', '点击右上角返回 LightDrop 首页')
            : t('markdownModal.escTip', '按 ESC 或点击右上角 X 关闭')}
        </span>
      </div>

      {/* 命名下载弹窗 (独立居中确认层) */}
      {showRenameDialog && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-slate-950/40 backdrop-blur-xs animate-fade-in">
          <div className="bg-white rounded-2xl max-w-md w-full p-5 shadow-2xl border border-slate-200 animate-scale-in">
            <div className="flex items-center gap-2.5 mb-3">
              <div className="w-9 h-9 rounded-xl bg-blue-100 text-blue-600 flex items-center justify-center">
                <FileDown className="w-5 h-5" />
              </div>
            <div>
              <h4 className="text-sm font-bold text-slate-800">
                {isTxtFile ? t('preview.dialogTitleTxt', '导出文本文件') : t('markdownModal.dialogTitle', '导出 Markdown 文件')}
              </h4>
              <p className="text-[11px] text-slate-400">
                {isTxtFile ? t('preview.dialogSubtitleTxt', '请为下载的文本文件命名') : t('markdownModal.dialogSubtitle', '请为下载的 .md 文件命名')}
              </p>
            </div>
          </div>

          <div className="mb-4">
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              {t('markdownModal.fileNameLabel', '文件名称')}
            </label>
            <div className="relative">
              <input
                type="text"
                autoFocus
                value={downloadFilename}
                onChange={(e) => setDownloadFilename(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleConfirmDownload();
                  if (e.key === 'Escape') setShowRenameDialog(false);
                }}
                placeholder={isTxtFile ? 'e.g. note.txt' : 'e.g. Note.md'}
                className="w-full px-3.5 py-2 text-xs bg-slate-50 border border-slate-200 focus:bg-white focus:border-blue-500 rounded-xl focus:outline-none focus:ring-1 focus:ring-blue-500 font-mono text-slate-800"
              />
            </div>
            <p className="text-[11px] text-slate-400 mt-1">
              {isTxtFile
                ? t('preview.autoExtTipTxt', '若未输入后缀，系统将自动补全为 .txt')
                : t('markdownModal.autoExtTip', '若未输入后缀，系统将自动补全为 .md')}
            </p>
          </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setShowRenameDialog(false)}
                className="px-3.5 py-1.5 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 text-xs font-medium transition"
              >
                {t('markdownModal.cancel', '取消')}
              </button>
              <button
                type="button"
                onClick={handleConfirmDownload}
                className="px-4 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold transition active:scale-95 shadow-sm shadow-blue-500/20"
              >
                {t('markdownModal.confirmDownload', '确认下载')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
