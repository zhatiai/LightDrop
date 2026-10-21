import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  Workflow,
  Copy,
  Check,
  Download,
  Eye,
  Code2,
  Maximize2,
  X,
  AlertTriangle,
  Loader2,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { getMermaidInstance } from '../utils/mermaidLoader';
import { copyToClipboard } from '../utils/clipboard';

interface MermaidBlockProps {
  code: string;
}

export const MermaidBlock: React.FC<MermaidBlockProps> = ({ code }) => {
  const { t } = useTranslation();
  const [svgHtml, setSvgHtml] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [showErrorDetail, setShowErrorDetail] = useState(false);
  const [viewMode, setViewMode] = useState<'chart' | 'code'>('chart');
  const [copied, setCopied] = useState<boolean>(false);
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const modalContainerRef = useRef<HTMLDivElement>(null);

  // 识别图表类型
  const diagramTypeKey = useMemo(() => {
    const lines = code.split('\n');
    for (const rawLine of lines) {
      const line = rawLine.trim().toLowerCase();
      if (!line || line.startsWith('%%')) continue;
      if (line.startsWith('graph') || line.startsWith('flowchart')) return 'flowchart';
      if (line.startsWith('sequencediagram')) return 'sequence';
      if (line.startsWith('classdiagram')) return 'class';
      if (line.startsWith('statediagram')) return 'state';
      if (line.startsWith('erdiagram')) return 'er';
      if (line.startsWith('gantt')) return 'gantt';
      if (line.startsWith('pie')) return 'pie';
      if (line.startsWith('gitgraph')) return 'git';
      if (line.startsWith('mindmap')) return 'mindmap';
      break;
    }
    return 'diagram';
  }, [code]);

  const typeLabel = useMemo(() => {
    const labelKey = `markdownModal.mermaid.${diagramTypeKey}`;
    return t(labelKey, t('markdownModal.mermaid.diagram', 'Mermaid 图表'));
  }, [diagramTypeKey, t]);

  // 渲染 Mermaid SVG
  useEffect(() => {
    let isMounted = true;
    const cleanId = Math.random().toString(36).slice(2, 9);
    const renderId = `mermaid_${cleanId}_${Date.now()}`;

    async function renderChart() {
      setLoading(true);
      setError(null);

      try {
        const mermaid = await getMermaidInstance();
        if (!isMounted) return;

        const { svg } = await mermaid.render(renderId, code);
        if (!isMounted) return;

        setSvgHtml(svg);
        setLoading(false);
      } catch (err: any) {
        if (!isMounted) return;
        console.warn('Mermaid rendering failed:', err);
        setError(err.message || String(err));
        setLoading(false);
      } finally {
        // 清理 mermaid 在出错时可能留下的全局临时元素
        const tempEl = document.getElementById(renderId);
        if (tempEl?.parentNode) {
          tempEl.parentNode.removeChild(tempEl);
        }
        const tempErr = document.getElementById(`d${renderId}`);
        if (tempErr?.parentNode) {
          tempErr.parentNode.removeChild(tempErr);
        }
      }
    }

    renderChart();

    return () => {
      isMounted = false;
      const tempEl = document.getElementById(renderId);
      if (tempEl?.parentNode) {
        tempEl.parentNode.removeChild(tempEl);
      }
      const tempErr = document.getElementById(`d${renderId}`);
      if (tempErr?.parentNode) {
        tempErr.parentNode.removeChild(tempErr);
      }
    };
  }, [code]);

  // 复制代码
  const handleCopyCode = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const ok = await copyToClipboard(code);
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  // 下载 SVG
  const handleDownloadSvg = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!svgHtml) return;
    const blob = new Blob([svgHtml], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${diagramTypeKey}-${Date.now()}.svg`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // 监听 ESC 键关闭全屏弹窗
  useEffect(() => {
    if (!isModalOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsModalOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isModalOpen]);

  return (
    <div className="mermaid-block-wrapper my-5 rounded-2xl border border-slate-200/90 bg-white shadow-2xs overflow-hidden transition-all duration-200 hover:border-slate-300 leading-normal text-slate-800">
      {/* 顶部工具栏 */}
      <div className="flex items-center justify-between px-3.5 py-2.5 bg-slate-50/90 border-b border-slate-200/70 text-xs">
        {/* 左侧：图标与图表类型 */}
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-6 h-6 rounded-lg bg-blue-100/90 text-blue-600 flex items-center justify-center shrink-0">
            <Workflow className="w-3.5 h-3.5" />
          </div>
          <span className="font-semibold text-slate-700 truncate">{typeLabel}</span>
          <span className="hidden sm:inline-block text-[10px] uppercase font-mono px-1.5 py-0.5 rounded bg-slate-200/60 text-slate-500">
            mermaid
          </span>
        </div>

        {/* 右侧：视图切换、复制、下载、全屏 */}
        <div className="flex items-center gap-1.5 shrink-0">
          {/* 模式切换 (Chart / Code) */}
          <div className="flex items-center bg-slate-200/60 p-0.5 rounded-lg border border-slate-200 text-[11px]">
            <button
              type="button"
              onClick={() => setViewMode('chart')}
              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md font-medium transition ${
                viewMode === 'chart'
                  ? 'bg-white text-blue-600 shadow-2xs font-semibold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
              title={t('markdownModal.mermaid.viewChart', '图表视图')}
            >
              <Eye className="w-3 h-3" />
              <span className="hidden xs:inline">{t('markdownModal.mermaid.viewChart', '图表')}</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode('code')}
              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md font-medium transition ${
                viewMode === 'code'
                  ? 'bg-white text-blue-600 shadow-2xs font-semibold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
              title={t('markdownModal.mermaid.viewCode', '查看源码')}
            >
              <Code2 className="w-3 h-3" />
              <span className="hidden xs:inline">{t('markdownModal.mermaid.viewCode', '源码')}</span>
            </button>
          </div>

          {/* 复制源码 */}
          <button
            type="button"
            onClick={handleCopyCode}
            className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-white hover:bg-slate-100 border border-slate-200 text-slate-600 hover:text-blue-600 text-[11px] font-medium transition shadow-2xs active:scale-95"
            title={t('markdownModal.mermaid.copyCode', '复制源码')}
          >
            {copied ? (
              <>
                <Check className="w-3 h-3 text-emerald-600" />
                <span className="text-emerald-600 font-semibold">{t('markdownModal.mermaid.copied', '已复制')}</span>
              </>
            ) : (
              <>
                <Copy className="w-3 h-3" />
                <span className="hidden sm:inline">{t('markdownModal.mermaid.copyCode', '复制')}</span>
              </>
            )}
          </button>

          {/* 导出 SVG */}
          {svgHtml && !error && (
            <button
              type="button"
              onClick={handleDownloadSvg}
              className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-white hover:bg-slate-100 border border-slate-200 text-slate-600 hover:text-blue-600 text-[11px] font-medium transition shadow-2xs active:scale-95"
              title={t('markdownModal.mermaid.downloadSvg', '导出 SVG')}
            >
              <Download className="w-3 h-3" />
              <span className="hidden sm:inline">{t('markdownModal.mermaid.downloadSvg', '导出 SVG')}</span>
            </button>
          )}

          {/* 全屏放大查看 */}
          {svgHtml && !error && viewMode === 'chart' && (
            <button
              type="button"
              onClick={() => setIsModalOpen(true)}
              className="p-1 rounded-lg bg-white hover:bg-slate-100 border border-slate-200 text-slate-500 hover:text-blue-600 transition shadow-2xs active:scale-95"
              title={t('markdownModal.mermaid.fullscreen', '全屏预览')}
            >
              <Maximize2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* 内容主体区域 */}
      <div className="relative">
        {viewMode === 'code' ? (
          <pre className="font-mono text-xs text-slate-800 bg-slate-900 text-slate-100 p-4 m-0 overflow-x-auto custom-scrollbar leading-relaxed">
            <code>{code}</code>
          </pre>
        ) : loading ? (
          <div className="flex flex-col items-center justify-center py-10 text-slate-400 gap-2 min-h-[140px] bg-slate-50/40">
            <Loader2 className="w-5 h-5 text-blue-600 animate-spin" />
            <span className="text-xs text-slate-500">
              {t('markdownModal.mermaid.rendering', '正在渲染图表...')}
            </span>
          </div>
        ) : error ? (
          <div className="p-4 bg-rose-50/60 border-t border-rose-100">
            <div className="flex items-start gap-2.5">
              <div className="w-6 h-6 rounded-lg bg-rose-100 text-rose-600 flex items-center justify-center shrink-0 mt-0.5">
                <AlertTriangle className="w-3.5 h-3.5" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between">
                  <h5 className="text-xs font-semibold text-rose-800">
                    {t('markdownModal.mermaid.renderError', 'Mermaid 语法解析失败')}
                  </h5>
                  <button
                    type="button"
                    onClick={() => setShowErrorDetail((prev) => !prev)}
                    className="inline-flex items-center gap-1 text-[11px] text-rose-600 hover:text-rose-700 font-medium"
                  >
                    <span>
                      {showErrorDetail
                        ? t('markdownModal.mermaid.hideDetails', '隐藏详情')
                        : t('markdownModal.mermaid.errorDetails', '错误详情')}
                    </span>
                    {showErrorDetail ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                  </button>
                </div>
                {showErrorDetail && (
                  <pre className="mt-2 p-2 bg-rose-100/70 text-rose-900 text-[11px] rounded-lg overflow-x-auto font-mono whitespace-pre-wrap break-all">
                    {error}
                  </pre>
                )}
                {/* 错误时展示源码 */}
                <div className="mt-2.5">
                  <pre className="font-mono text-xs text-slate-800 bg-white/90 p-3 rounded-xl border border-rose-200 overflow-x-auto leading-relaxed">
                    <code>{code}</code>
                  </pre>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="p-4 sm:p-6 overflow-x-auto custom-scrollbar flex items-center justify-center bg-white min-h-[100px]">
            <div
              ref={containerRef}
              className="mermaid-svg-container max-w-full flex justify-center [&>svg]:max-w-full [&>svg]:h-auto [&>svg]:select-text"
              dangerouslySetInnerHTML={{ __html: svgHtml }}
            />
          </div>
        )}
      </div>

      {/* 全屏放大查看弹窗 */}
      {isModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-slate-900/60 backdrop-blur-xs animate-fade-in"
          onClick={(e) => {
            if (e.target === e.currentTarget) setIsModalOpen(false);
          }}
        >
          <div className="bg-white rounded-2xl w-full max-w-6xl max-h-[90vh] shadow-2xl border border-slate-200/90 flex flex-col overflow-hidden animate-scale-in">
            {/* 模态框顶部 */}
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100 bg-slate-50/80">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-xl bg-blue-100 text-blue-600 flex items-center justify-center shrink-0">
                  <Workflow className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-slate-800">{typeLabel}</h4>
                  <p className="text-[11px] text-slate-400 font-mono">
                    {t('markdownModal.mermaid.fullscreen', '全屏预览')}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleDownloadSvg}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 text-xs font-semibold transition active:scale-95"
                >
                  <Download className="w-3.5 h-3.5 text-blue-600" />
                  <span>{t('markdownModal.mermaid.downloadSvg', '导出 SVG')}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 transition ml-1"
                  title={t('markdownModal.mermaid.closeFullscreen', '退出全屏')}
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* 模态框内容区 (自适应大画布平滑滚动) */}
            <div
              ref={modalContainerRef}
              className="flex-1 overflow-auto p-6 sm:p-10 flex items-center justify-center bg-slate-50/30 custom-scrollbar"
            >
              <div
                className="mermaid-svg-container max-w-full flex justify-center [&>svg]:max-w-none [&>svg]:h-auto [&>svg]:select-text"
                dangerouslySetInnerHTML={{ __html: svgHtml }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
