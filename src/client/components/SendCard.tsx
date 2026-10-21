import React, { useState, useRef, useEffect } from 'react';
import {
  Edit3,
  UploadCloud,
  FolderUp,
  Send,
  CheckCircle2,
  AlertCircle,
  FolderTree,
  FileCheck2,
  Lock,
  Eye,
  EyeOff,
  XCircle,
  X,
  Loader2,
  ClipboardPaste,
  Paperclip,
  Trash2,
  Folder,
  File as FileIcon,
  FileText,
  Image as ImageIcon,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { extractDroppedItems, ProcessedFolder } from '../utils/dragDrop';
import { UploadProgressInfo } from '../utils/uploader';
import { formatBytes } from '../utils/format';

export interface PendingUploadFile {
  id: string;
  file: File;
  name: string;
  size: number;
  type: string;
  isImage: boolean;
  previewUrl?: string;
}

export interface PendingUploadFolder {
  id: string;
  folder: ProcessedFolder;
}

interface SendCardProps {
  onSendText: (content: string, title?: string, password?: string) => Promise<any>;
  onUploadFiles: (
    files: FileList | File[],
    password?: string,
    onProgress?: (info: UploadProgressInfo) => void,
    setAbortHandle?: (abortFn: () => void) => void,
    content?: string,
    title?: string
  ) => Promise<any>;
  onUploadFolder: (
    files: FileList,
    password?: string,
    onProgress?: (info: UploadProgressInfo) => void,
    setAbortHandle?: (abortFn: () => void) => void,
    content?: string,
    title?: string
  ) => Promise<any>;
  onUploadMixedBatch: (
    individualFiles: File[],
    folders: ProcessedFolder[],
    password?: string,
    onProgress?: (info: UploadProgressInfo) => void,
    setAbortHandle?: (abortFn: () => void) => void,
    content?: string,
    title?: string
  ) => Promise<{ uploadedFilesCount: number; uploadedFoldersCount: number }>;
}

export const SendCard: React.FC<SendCardProps> = ({
  onSendText,
  onUploadFiles,
  onUploadMixedBatch,
}) => {
  const { t } = useTranslation();
  const [title, setTitle] = useState('');
  const [text, setText] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [passwordReadOnly, setPasswordReadOnly] = useState(true);

  // 待上传文件与文件夹列表（复制/粘贴/选择/拖拽的文件在此暂存，点击上传后统一执行）
  const [pendingFiles, setPendingFiles] = useState<PendingUploadFile[]>([]);
  const [pendingFolders, setPendingFolders] = useState<PendingUploadFolder[]>([]);

  const [submitting, setSubmitting] = useState(false);
  const [submittingStatus, setSubmittingStatus] = useState<string>('');
  const [uploadProgress, setUploadProgress] = useState<UploadProgressInfo | null>(null);

  const [dragActive, setDragActive] = useState(false);
  const [toastMsg, setToastMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const dragCounterRef = useRef(0);
  const abortRef = useRef<(() => void) | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const passwordInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // 用于在组件卸载时及时回收所有创建的 Object URL，杜绝内存泄漏
  const pendingFilesRef = useRef<PendingUploadFile[]>([]);
  pendingFilesRef.current = pendingFiles;

  useEffect(() => {
    return () => {
      pendingFilesRef.current.forEach((item) => {
        if (item.previewUrl) {
          URL.revokeObjectURL(item.previewUrl);
        }
      });
    };
  }, []);

  // 严格杜绝任何浏览器自动填充凭证注入：初次挂载与延时强制清空
  useEffect(() => {
    setPassword('');
    const timer = setTimeout(() => {
      setPassword('');
      if (passwordInputRef.current) {
        passwordInputRef.current.value = '';
      }
    }, 150);
    return () => clearTimeout(timer);
  }, []);

  const getEffectivePassword = () => (password.trim() ? password.trim() : undefined);

  const resetFormPassword = () => {
    setPassword('');
    setPasswordReadOnly(true);
  };

  const showToast = (type: 'success' | 'error', message: string) => {
    setToastMsg({ type, text: message });
    setTimeout(() => setToastMsg(null), 4000);
  };

  // 添加文件到待上传列表 (支持图片生成预览图)
  const addFilesToPending = (files: File[]) => {
    const newItems: PendingUploadFile[] = files.map((file) => {
      let name = file.name;
      const isImg = file.type.startsWith('image/') || /\.(png|jpe?g|gif|webp|bmp|svg|avif)$/i.test(name);
      if (!name || name === 'image.png' || name === 'blob') {
        const now = new Date();
        const timeStr = `${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}${String(now.getSeconds()).padStart(2, '0')}_${Math.random().toString(36).slice(2, 5)}`;
        const ext = file.type.split('/')[1]?.replace('jpeg', 'jpg') || 'png';
        name = `${t('send.clipboardImagePrefix')}_${timeStr}.${ext}`;
      }
      const previewUrl = isImg ? URL.createObjectURL(file) : undefined;
      return {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        file,
        name,
        size: file.size,
        type: file.type,
        isImage: isImg,
        previewUrl,
      };
    });
    setPendingFiles((prev) => [...prev, ...newItems]);
  };

  // 添加文件夹到待上传列表
  const addFolderToPending = (folder: ProcessedFolder) => {
    setPendingFolders((prev) => [
      ...prev,
      {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        folder,
      },
    ]);
  };

  // 添加混合条目到待上传列表
  const addMixedToPending = (files: File[], folders: ProcessedFolder[]) => {
    if (files.length > 0) {
      addFilesToPending(files);
    }
    if (folders.length > 0) {
      folders.forEach((fld) => addFolderToPending(fld));
    }
  };

  // 移除单个待上传文件
  const handleRemovePendingFile = (id: string) => {
    setPendingFiles((prev) => {
      const target = prev.find((item) => item.id === id);
      if (target?.previewUrl) {
        URL.revokeObjectURL(target.previewUrl);
      }
      return prev.filter((item) => item.id !== id);
    });
  };

  // 移除单个待上传文件夹
  const handleRemovePendingFolder = (id: string) => {
    setPendingFolders((prev) => prev.filter((item) => item.id !== id));
  };

  // 清空全部待上传文件与文件夹
  const handleClearAllPending = () => {
    pendingFiles.forEach((item) => {
      if (item.previewUrl) {
        URL.revokeObjectURL(item.previewUrl);
      }
    });
    setPendingFiles([]);
    setPendingFolders([]);
  };

  // 获取文件展示对应图标
  const getFileIcon = (name: string, isFolder?: boolean) => {
    if (isFolder) return <Folder className="w-5 h-5 text-amber-500 shrink-0" />;
    const ext = name.split('.').pop()?.toLowerCase() || '';
    if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'avif'].includes(ext)) {
      return <ImageIcon className="w-5 h-5 text-purple-500 shrink-0" />;
    }
    if (['zip', 'rar', '7z', 'tar', 'gz'].includes(ext)) {
      return <Folder className="w-5 h-5 text-amber-500 shrink-0" />;
    }
    if (['txt', 'md', 'doc', 'docx', 'pdf', 'json', 'ts', 'js', 'html', 'css', 'csv'].includes(ext)) {
      return <FileText className="w-5 h-5 text-blue-500 shrink-0" />;
    }
    return <FileIcon className="w-5 h-5 text-slate-500 shrink-0" />;
  };

  // 用户点击取消当前上传过程
  const handleCancelUpload = () => {
    if (abortRef.current) {
      abortRef.current();
      abortRef.current = null;
    }
    setSubmitting(false);
    setUploadProgress(null);
    setSubmittingStatus('');
    showToast('error', t('send.toastCancelUpload'));
  };

  // 计算待上传项总大小与总数量
  const totalPendingSize =
    pendingFiles.reduce((acc, f) => acc + f.file.size, 0) +
    pendingFolders.reduce(
      (acc, fld) => acc + fld.folder.files.reduce((fa, f) => fa + f.size, 0),
      0
    );

  const totalPendingItemsCount = pendingFiles.length + pendingFolders.length;
  const hasPending = totalPendingItemsCount > 0;
  const hasText = Boolean(text.trim());
  const hasTitle = Boolean(title.trim());

  // 主发送 / 上传处理函数
  const handleSend = async () => {
    if (!hasText && !hasPending && !hasTitle) {
      showToast('error', t('send.toastEmpty'));
      return;
    }

    const currentPwd = getEffectivePassword();

    try {
      setSubmitting(true);

      const titleValue = hasTitle ? title.trim() : undefined;

      // 1. 若存在待上传的文件或文件夹，执行上传 (若同时输入了文字则作为正文合并上传)
      if (hasPending) {
        setUploadProgress({ percent: 0, loaded: 0, total: 0 });
        setSubmittingStatus(
          hasText
            ? t('send.uploadingMerged', '正在合并发送正文与附件...')
            : t('send.uploadingFilesCount', { count: totalPendingItemsCount })
        );

        const textContent = hasText ? text : undefined;

        if (pendingFolders.length > 0) {
          await onUploadMixedBatch(
            pendingFiles.map((i) => i.file),
            pendingFolders.map((i) => i.folder),
            currentPwd,
            (info) => setUploadProgress(info),
            (abortFn) => {
              abortRef.current = abortFn;
            },
            textContent,
            titleValue
          );
        } else {
          await onUploadFiles(
            pendingFiles.map((i) => i.file),
            currentPwd,
            (info) => setUploadProgress(info),
            (abortFn) => {
              abortRef.current = abortFn;
            },
            textContent,
            titleValue
          );
        }

        // 文件上传成功后清理已上传项与释放预览内存
        pendingFiles.forEach((f) => {
          if (f.previewUrl) URL.revokeObjectURL(f.previewUrl);
        });
        setPendingFiles([]);
        setPendingFolders([]);
        if (hasText) {
          setText('');
        }
        if (hasTitle) {
          setTitle('');
        }
      } else if (hasText || hasTitle) {
        // 2. 纯文本发送 (若仅填写了标题未填正文，正文以标题填充；默认保留原始完整文本不裁剪)
        setSubmittingStatus(t('send.processing'));
        const textContent = hasText ? text : title.trim();
        await onSendText(textContent, titleValue, currentPwd);
        setText('');
        setTitle('');
      }

      resetFormPassword();

      if (hasText && hasPending) {
        showToast(
          'success',
          t('send.toastSendAndUploadSuccess', {
            count: totalPendingItemsCount,
            extra: currentPwd ? t('send.toastEncrypted') : '',
          })
        );
      } else if (hasPending) {
        showToast(
          'success',
          t('send.toastUploadSuccess', {
            count: totalPendingItemsCount,
            extra: currentPwd ? t('send.toastEncrypted') : '',
          })
        );
      } else {
        showToast(
          'success',
          currentPwd ? t('send.toastSentProtected') : t('send.toastSent')
        );
      }
    } catch (err: any) {
      if (err?.message !== t('send.toastCancelUpload')) {
        showToast('error', err?.message || t('send.errUploadFailed'));
      }
    } finally {
      setSubmitting(false);
      setSubmittingStatus('');
      setUploadProgress(null);
      abortRef.current = null;
    }
  };

  // 选择常规文件 -> 添加到待上传列表
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const files = Array.from(e.target.files);
      addFilesToPending(files);
      showToast('success', t('send.toastAddedToPending', { count: files.length }));
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // 选择文件夹 -> 添加到待上传列表
  const handleFolderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const files = Array.from(e.target.files);
      const folderName = files[0]?.webkitRelativePath?.split('/')[0] || t('send.defaultFolderName');
      const paths = files.map((f) => f.webkitRelativePath || f.name);
      addFolderToPending({
        name: folderName,
        files,
        paths,
      });
      showToast('success', t('send.toastAddedFolderToPending', { name: folderName }));
      if (folderInputRef.current) folderInputRef.current.value = '';
    }
  };

  // 严谨的拖拽进入/移出事件
  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current += 1;
    if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
      setDragActive(true);
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current -= 1;
    if (dragCounterRef.current <= 0) {
      dragCounterRef.current = 0;
      setDragActive(false);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'copy';
  };

  // 探测 File 对象是否真实为不可读的操作系统目录
  const isDirectoryFile = async (file: File): Promise<boolean> => {
    try {
      // 尝试读取切片的 1 字节数据，如果是目录，现代浏览器网络/文件引擎会立即抛出 NotReadableError
      await file.slice(0, 1).arrayBuffer();
      return false;
    } catch {
      return true;
    }
  };

  // 从剪贴板中严格提取真实常规文件，并精确识别拦截操作系统文件夹
  const extractClipboardFiles = async (
    clipboardData: DataTransfer
  ): Promise<{ validFiles: File[]; detectedDirectories: string[] }> => {
    const validFiles: File[] = [];
    const detectedDirectories: string[] = [];

    // 1. 优先检查 DataTransferItem.webkitGetAsEntry
    if (clipboardData.items) {
      for (let i = 0; i < clipboardData.items.length; i++) {
        const item = clipboardData.items[i];
        if (item.kind === 'file') {
          const entry = item.webkitGetAsEntry ? item.webkitGetAsEntry() : null;
          if (entry && entry.isDirectory) {
            if (!detectedDirectories.includes(entry.name)) {
              detectedDirectories.push(entry.name);
            }
          }
        }
      }
    }

    // 2. 收集所有原始文件项
    const rawFiles: File[] = [];
    if (clipboardData.files && clipboardData.files.length > 0) {
      for (let i = 0; i < clipboardData.files.length; i++) {
        rawFiles.push(clipboardData.files[i]);
      }
    } else if (clipboardData.items) {
      for (let i = 0; i < clipboardData.items.length; i++) {
        const item = clipboardData.items[i];
        if (item.kind === 'file') {
          const f = item.getAsFile();
          if (f) rawFiles.push(f);
        }
      }
    }

    // 3. 异步探测每一个文件，精准剥离不可读的目录壳
    for (const file of rawFiles) {
      const isDir = await isDirectoryFile(file);
      if (isDir) {
        if (!detectedDirectories.includes(file.name)) {
          detectedDirectories.push(file.name);
        }
      } else {
        validFiles.push(file);
      }
    }

    return { validFiles, detectedDirectories };
  };

  // 检测纯文本是否为本地文件或本地路径 (防止浏览器沙箱导致的“复制文件只拿到了文件名”被误当成文本发送)
  const isLocalFileOrPathText = (str: string): boolean => {
    const trimmed = str.trim();
    if (!trimmed) return false;
    // file:///... 或以斜杠开头的路径
    if (/^(file:\/\/\/|[a-zA-Z]:\\|\/)/.test(trimmed)) return true;
    // 单行且以常见文件扩展名结尾 (例如 "明信片反.png", "doc.pdf", "project.zip")
    if (
      !trimmed.includes('\n') &&
      trimmed.length < 256 &&
      /\.(png|jpe?g|gif|webp|bmp|svg|pdf|docx?|xlsx?|pptx?|txt|md|zip|tar|gz|7z|rar|mp4|mov|mp3|wav|dmg|pkg|exe|apk|ipa)$/i.test(
        trimmed
      )
    ) {
      return true;
    }
    return false;
  };

  // 深度解析拖拽内容：文件、文件夹、混合项 -> 添加至待上传列表
  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current = 0;
    setDragActive(false);

    try {
      const { individualFiles, folders } = await extractDroppedItems(e.dataTransfer);
      if (individualFiles.length > 0 || folders.length > 0) {
        addMixedToPending(individualFiles, folders);
        const totalCount = individualFiles.length + folders.length;
        showToast('success', t('send.toastAddedMixedToPending', { count: totalCount }));
      }
    } catch (err: any) {
      showToast('error', err?.message || t('send.errDropFailed'));
    }
  };

  // 剪贴板快捷键粘贴拦截处理 (Ctrl+V / Cmd+V)
  const handlePaste = async (e: React.ClipboardEvent) => {
    e.stopPropagation();
    if (submitting) return;
    const clipboardData = e.clipboardData;
    if (!clipboardData) return;

    // 同步检查剪贴板是否携带文件、图像或本地操作系统文件路径
    // 必须在任何 await 异步之前同步执行 e.preventDefault()，防止浏览器原生将文件名文本粘贴进 textarea
    const hasFiles = Boolean(
      (clipboardData.files && clipboardData.files.length > 0) ||
      (clipboardData.items && Array.from(clipboardData.items).some((item) => item.kind === 'file')) ||
      (clipboardData.types && (clipboardData.types.includes('Files') || Array.from(clipboardData.types).includes('Files')))
    );

    const pastedText = clipboardData.getData('text/plain');
    const isFileText = Boolean(
      pastedText &&
      !pastedText.startsWith('http://') &&
      !pastedText.startsWith('https://') &&
      isLocalFileOrPathText(pastedText)
    );

    if (hasFiles || isFileText) {
      e.preventDefault();
    }

    // 1. 深度探测并提取真实文件与文件夹条目
    const { validFiles, detectedDirectories } = await extractClipboardFiles(clipboardData);

    // 如果检测到操作系统文件夹，绝对不发起 XHR 上传，直接拦截并给出专业指导！
    if (detectedDirectories.length > 0) {
      e.preventDefault();
      const dirName = detectedDirectories[0] || t('send.defaultFolderName');
      showToast('error', t('send.errClipboardFolder', { name: dirName }));
      return;
    }

    // 如果包含常规真实文件，加入待上传列表，不要直接触发上传！
    if (validFiles.length > 0) {
      e.preventDefault();
      addFilesToPending(validFiles);
      showToast('success', t('send.toastAddedToPending', { count: validFiles.length }));
      return;
    }

    // 2. 尝试解析拖拽/剪贴板混合项
    try {
      const { individualFiles, folders } = await extractDroppedItems(clipboardData);
      if (individualFiles.length > 0 || folders.length > 0) {
        e.preventDefault();
        addMixedToPending(individualFiles, folders);
        showToast('success', t('send.toastAddedMixedToPending', { count: individualFiles.length + folders.length }));
        return;
      }
    } catch (err) {
      // ignore
    }

    // 3. 检查纯文本内容 (如果之前探测到是本地路径字符串但无二进制流)
    if (isFileText && pastedText) {
      e.preventDefault();
      showToast('error', t('send.errClipboardLocalFile', { name: pastedText.trim() }));
      setTimeout(() => {
        fileInputRef.current?.click();
      }, 200);
      return;
    }

    // 4. 若为普通文字、代码或链接，允许浏览器默认将文字粘贴进 textarea
    // 若当前触发事件的不是 textarea（例如聚焦在卡片外部或按钮上），则主动将文本追加至输入框
    if (e.target !== textareaRef.current && pastedText) {
      e.preventDefault();
      setText((prev) => (prev ? `${prev}\n${pastedText}` : pastedText));
      showToast('success', t('send.toastClipboardTextPasted'));
    }
  };

  // 主动点击【粘贴剪切板】按钮处理：图片加入待上传列表，文字填入输入框 (默认不裁剪，传输完整内容)
  const handlePasteFromClipboard = async () => {
    if (submitting) return;

    if (!navigator.clipboard) {
      showToast('error', t('send.errClipboardNotSupported'));
      return;
    }

    try {
      // 1. 优先尝试读取富媒体 (图片、截图等)
      if (typeof navigator.clipboard.read === 'function') {
        try {
          const clipboardItems = await navigator.clipboard.read();
          const imageFiles: File[] = [];

          for (const item of clipboardItems) {
            for (const type of item.types) {
              if (type.startsWith('image/')) {
                const blob = await item.getType(type);
                const ext = type.split('/')[1]?.replace('jpeg', 'jpg') || 'png';
                const file = new File(
                  [blob],
                  `${t('send.clipboardImagePrefix')}_${new Date().toISOString().slice(11, 19).replace(/:/g, '')}.${ext}`,
                  { type }
                );
                imageFiles.push(file);
              }
            }
          }

          if (imageFiles.length > 0) {
            addFilesToPending(imageFiles);
            showToast('success', t('send.toastAddedToPending', { count: imageFiles.length }));
            return;
          }
        } catch (readErr) {
          console.warn('[Clipboard] read() fallback to readText():', readErr);
        }
      }

      // 2. 读取剪贴板纯文本 (默认不裁剪，保留原始完整内容)
      const textContent = await navigator.clipboard.readText();
      if (textContent && textContent.trim()) {
        if (isLocalFileOrPathText(textContent.trim())) {
          showToast('error', t('send.errClipboardLocalFile', { name: textContent.trim() }));
          setTimeout(() => {
            fileInputRef.current?.click();
          }, 200);
          return;
        }

        // 普通文本：填入输入框（已有内容则追加换行），默认不裁剪，传输完整内容
        setText((prev) => (prev ? `${prev}\n${textContent}` : textContent));
        showToast('success', t('send.toastClipboardTextPasted'));
        return;
      }

      showToast('error', t('send.errClipboardEmpty'));
    } catch (err: any) {
      showToast('error', t('send.errClipboardReadFailed'));
    }
  };

  // 窗口全局快捷键粘贴监听 (未聚焦输入框时，在页面按 Cmd+V / Ctrl+V 也添加至待上传列表)
  useEffect(() => {
    const handleGlobalPaste = async (e: ClipboardEvent) => {
      if (submitting) return;
      const activeEl = document.activeElement;
      if (
        activeEl &&
        activeEl !== document.body &&
        activeEl !== document.documentElement &&
        (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA')
      ) {
        return;
      }

      if (e.clipboardData) {
        const { validFiles, detectedDirectories } = await extractClipboardFiles(e.clipboardData);
        if (detectedDirectories.length > 0) {
          e.preventDefault();
          showToast(
            'error',
            t('send.errClipboardFolder', { name: detectedDirectories[0] || t('send.defaultFolderName') })
          );
          return;
        }

        if (validFiles.length > 0) {
          e.preventDefault();
          addFilesToPending(validFiles);
          showToast('success', t('send.toastAddedToPending', { count: validFiles.length }));
          return;
        }

        // 全局粘贴文本（用户在页面任意位置按 Ctrl+V / Cmd+V，填入输入框，默认不裁剪）
        const pastedText = e.clipboardData.getData('text/plain');
        if (pastedText && !isLocalFileOrPathText(pastedText)) {
          e.preventDefault();
          setText((prev) => (prev ? `${prev}\n${pastedText}` : pastedText));
          showToast('success', t('send.toastClipboardTextPasted'));
        }
      }
    };

    window.addEventListener('paste', handleGlobalPaste);
    return () => window.removeEventListener('paste', handleGlobalPaste);
  }, [submitting, t]);

  // 动态生成操作按钮文案
  const getButtonText = () => {
    if (submitting) {
      return submittingStatus || t('send.processing');
    }
    if (hasText && hasPending) {
      return pendingFolders.length > 0
        ? t('send.sendAndUploadMixedBtn', { count: totalPendingItemsCount })
        : t('send.sendAndUploadBtn', { count: totalPendingItemsCount });
    }
    if (hasPending) {
      return pendingFolders.length > 0
        ? t('send.uploadPendingMixedBtn', { count: totalPendingItemsCount })
        : t('send.uploadPendingBtn', { count: totalPendingItemsCount });
    }
    return t('send.sendBtn');
  };

  // 动态生成操作按钮图标
  const getButtonIcon = () => {
    if (submitting) {
      return <Loader2 className="w-4 h-4 animate-spin text-white" />;
    }
    if (hasPending && !hasText) {
      return <UploadCloud className="w-4 h-4 text-white" />;
    }
    return <Send className="w-4 h-4 fill-white stroke-none" />;
  };

  return (
    <div
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      onPaste={handlePaste}
      tabIndex={0}
      className="bg-white rounded-2xl p-5 shadow-sm border border-slate-200/80 transition-all duration-200 relative overflow-hidden h-full flex flex-col justify-between focus:outline-none"
    >
      {/* 拖拽悬浮覆盖层 */}
      {dragActive && (
        <div className="absolute inset-0 z-30 bg-blue-600/95 backdrop-blur-md rounded-2xl p-6 flex flex-col items-center justify-center text-white text-center animate-fade-in border-2 border-dashed border-white/60 pointer-events-none select-none">
          <div className="w-16 h-16 rounded-2xl bg-white/20 flex items-center justify-center mb-3 shadow-inner">
            <FolderTree className="w-9 h-9 text-white animate-bounce" />
          </div>
          <h3 className="text-base font-bold tracking-tight">{t('send.dropTitle')}</h3>
          <p className="text-xs text-blue-100 mt-1.5 max-w-sm">
            {t('send.dropDesc')}
          </p>
          <div className="mt-4 flex items-center gap-3 text-[11px] bg-white/10 px-3.5 py-1.5 rounded-full border border-white/20">
            <span className="flex items-center gap-1">
              <FileCheck2 className="w-3.5 h-3.5" /> {t('send.dropFiles')}
            </span>
            <span>•</span>
            <span className="flex items-center gap-1">
              <FolderUp className="w-3.5 h-3.5" /> {t('send.dropFolders')}
            </span>
          </div>
        </div>
      )}

      {/* 实时上传进度面板 (上传过程中展示，带取消按钮) */}
      {submitting && uploadProgress !== null && (
        <div className="mb-4 bg-blue-50/80 border border-blue-200/80 rounded-xl p-3.5 animate-fade-in">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2 min-w-0">
              <Loader2 className="w-4 h-4 text-blue-600 animate-spin shrink-0" />
              <span className="text-xs font-semibold text-blue-900 truncate">
                {submittingStatus || t('send.uploading')}
              </span>
            </div>
            <div className="flex items-center gap-3 shrink-0">
              <span className="text-xs font-mono font-bold text-blue-600">
                {uploadProgress.percent}%
              </span>
              <button
                type="button"
                onClick={handleCancelUpload}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-rose-50 hover:bg-rose-100 border border-rose-200 text-rose-600 text-[11px] font-medium transition active:scale-95"
                title={t('send.cancelUpload')}
              >
                <XCircle className="w-3 h-3" />
                {t('send.cancel')}
              </button>
            </div>
          </div>

          {/* 进度条指示器 */}
          <div className="w-full bg-blue-200/50 rounded-full h-2 overflow-hidden mb-1.5">
            <div
              className="bg-gradient-to-r from-blue-500 to-indigo-600 h-2 rounded-full transition-all duration-150 ease-out"
              style={{ width: `${Math.max(2, uploadProgress.percent)}%` }}
            />
          </div>

          <div className="flex items-center justify-between text-[11px] text-slate-500 font-mono">
            <span>
              {uploadProgress.total > 0
                ? `${formatBytes(uploadProgress.loaded)} / ${formatBytes(uploadProgress.total)}`
                : t('send.transferring')}
            </span>
            {uploadProgress.speedText && <span>{uploadProgress.speedText}</span>}
          </div>
        </div>
      )}

      {/* 消息提示浮层 */}
      {toastMsg && (
        <div
          className={`absolute top-3 right-5 z-40 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium shadow-sm animate-fade-in ${
            toastMsg.type === 'success'
              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
              : 'bg-rose-50 text-rose-700 border border-rose-200'
          }`}
        >
          {toastMsg.type === 'success' ? (
            <CheckCircle2 className="w-3.5 h-3.5" />
          ) : (
            <AlertCircle className="w-3.5 h-3.5" />
          )}
          {toastMsg.text}
        </div>
      )}

      {/* 头部标题与剪贴板操作 */}
      <div className="flex items-center justify-between mb-3.5">
        <div className="flex items-center gap-2">
          <Edit3 className="w-4 h-4 text-blue-600" />
          <h2 className="text-sm font-bold text-slate-800 tracking-tight">{t('send.title')}</h2>
          <span className="hidden sm:inline-block text-[11px] text-slate-400 font-normal">
            {t('send.subtitle')}
          </span>
        </div>

        {/* 粘贴剪切板按钮 */}
        <button
          type="button"
          onClick={handlePasteFromClipboard}
          disabled={submitting}
          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-blue-50/80 hover:bg-blue-100 text-blue-700 border border-blue-200/80 text-xs font-medium transition active:scale-95 disabled:opacity-50 shadow-2xs"
          title={t('send.pasteClipboardTitle')}
        >
          <ClipboardPaste className="w-3.5 h-3.5 text-blue-600" />
          <span>{t('send.pasteClipboard')}</span>
        </button>
      </div>

      {/* 发送标题 / 描述输入框（可选，用于在列表中展示该标题） */}
      <div className="mb-2.5">
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
              e.preventDefault();
              if (!submitting && (hasText || hasPending || Boolean(title.trim()))) {
                handleSend();
              }
            }
          }}
          placeholder={t('send.titleInputPlaceholder', '发送标题 / 描述（可选，用于在列表中展示该标题）')}
          maxLength={100}
          disabled={submitting}
          className="w-full text-xs sm:text-sm px-3.5 py-2 bg-slate-50/60 hover:bg-slate-50 focus:bg-white border border-slate-200 rounded-xl focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-slate-700 placeholder-slate-400 transition disabled:opacity-50"
        />
      </div>

      {/* 文本输入框 (默认不裁剪，支持完整长文本传输) */}
      <div className="relative mb-3">
        <textarea
          ref={textareaRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
              e.preventDefault();
              if (!submitting && (hasText || hasPending || Boolean(title.trim()))) {
                handleSend();
              }
            }
          }}
          onPaste={handlePaste}
          placeholder={t('send.placeholder')}
          rows={4}
          disabled={submitting}
          className="w-full text-xs sm:text-sm p-3.5 bg-slate-50/60 hover:bg-slate-50 focus:bg-white border border-slate-200 rounded-xl focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-slate-700 placeholder-slate-400 transition resize-none disabled:opacity-50"
        />
        {text.length > 0 && (
          <div className="absolute right-3 bottom-3 text-[11px] font-mono text-slate-400 select-none pointer-events-none bg-white/80 backdrop-blur-xs px-1.5 py-0.5 rounded">
            {t('send.charCount', { count: text.length.toLocaleString() })}
          </div>
        )}
      </div>

      {/* 待上传文件/图片列表 (复制或选择的文件在输入框下方清晰呈现，支持实时预览与移除) */}
      {hasPending && (
        <div className="mb-3.5 rounded-xl border border-blue-200/90 bg-blue-50/30 p-3 animate-fade-in shadow-2xs">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-1.5 min-w-0">
              <Paperclip className="w-3.5 h-3.5 text-blue-600 shrink-0" />
              <span className="text-xs font-bold text-slate-800">
                {t('send.pendingListTitle')}
              </span>
              <span className="text-[11px] font-mono text-slate-500 bg-white/90 px-2 py-0.5 rounded-full border border-slate-200/80">
                {pendingFolders.length > 0
                  ? t('send.pendingMixedSummary', {
                      filesCount: pendingFiles.length,
                      foldersCount: pendingFolders.length,
                      size: formatBytes(totalPendingSize),
                    })
                  : t('send.pendingFilesSummary', {
                      count: pendingFiles.length,
                      size: formatBytes(totalPendingSize),
                    })}
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={submitting}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium text-blue-600 hover:text-blue-700 hover:bg-blue-100/60 border border-transparent hover:border-blue-200 transition active:scale-95 disabled:opacity-50"
                title={t('send.uploadFiles')}
              >
                <UploadCloud className="w-3 h-3" />
                <span>+ {t('send.uploadFiles')}</span>
              </button>
              <button
                type="button"
                onClick={handleClearAllPending}
                disabled={submitting}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium text-slate-500 hover:text-rose-600 hover:bg-rose-50 border border-transparent hover:border-rose-200 transition active:scale-95 disabled:opacity-50"
                title={t('send.clearPendingTitle')}
              >
                <Trash2 className="w-3 h-3" />
                <span>{t('send.clearPending')}</span>
              </button>
            </div>
          </div>

          {/* 列表项内容，支持多项时纵向平滑滚动 */}
          <div className="space-y-1.5 max-h-56 overflow-y-auto pr-0.5">
            {/* 待上传文件夹 */}
            {pendingFolders.map((item) => {
              const folderTotalSize = item.folder.files.reduce((acc, f) => acc + f.size, 0);
              return (
                <div
                  key={item.id}
                  className="flex items-center justify-between p-2 rounded-xl bg-white hover:bg-slate-50/90 border border-slate-200/80 transition group shadow-2xs"
                >
                  <div className="flex items-center gap-2.5 min-w-0 flex-1">
                    <div className="w-10 h-10 rounded-lg bg-amber-50 border border-amber-200/80 flex items-center justify-center shrink-0 text-amber-600">
                      <Folder className="w-5 h-5 fill-amber-500/20 stroke-amber-600" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-semibold text-slate-800 truncate" title={item.folder.name}>
                        {item.folder.name}
                      </div>
                      <div className="flex items-center gap-2 text-[11px] font-mono text-slate-400">
                        <span>{t('send.filesCount', { count: item.folder.files.length })}</span>
                        <span>•</span>
                        <span>{formatBytes(folderTotalSize)}</span>
                        <span>•</span>
                        <span className="text-amber-600 font-sans font-medium">{t('send.folderBadge')}</span>
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleRemovePendingFolder(item.id)}
                    disabled={submitting}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition shrink-0 ml-2 disabled:opacity-50"
                    title={t('send.removePendingItem')}
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              );
            })}

            {/* 待上传文件 (图片展示缩略图，普通文件展示扩展名图标) */}
            {pendingFiles.map((item) => (
              <div
                key={item.id}
                className="flex items-center justify-between p-2 rounded-xl bg-white hover:bg-slate-50/90 border border-slate-200/80 transition group shadow-2xs"
              >
                <div className="flex items-center gap-2.5 min-w-0 flex-1">
                  {item.isImage && item.previewUrl ? (
                    <img
                      src={item.previewUrl}
                      alt={item.name}
                      className="w-10 h-10 rounded-lg object-cover border border-slate-200/90 shrink-0 bg-slate-100 shadow-2xs"
                    />
                  ) : (
                    <div className="w-10 h-10 rounded-lg bg-blue-50 border border-blue-200/80 flex items-center justify-center shrink-0 text-blue-600">
                      {getFileIcon(item.name)}
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-semibold text-slate-800 truncate" title={item.name}>
                      {item.name}
                    </div>
                    <div className="flex items-center gap-2 text-[11px] font-mono text-slate-400">
                      <span>{formatBytes(item.size)}</span>
                      {item.isImage && (
                        <>
                          <span>•</span>
                          <span className="text-purple-600 font-sans font-medium">{t('send.imageBadge')}</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => handleRemovePendingFile(item.id)}
                  disabled={submitting}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition shrink-0 ml-2 disabled:opacity-50"
                  title={t('send.removePendingItem')}
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 访问密码设置栏 (常驻显示，默认为空，输入即生效，带清空图标) */}
      <div
        className={`mb-3.5 rounded-xl p-2.5 border transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 ${
          password.trim()
            ? 'bg-amber-50/70 border-amber-200/90 shadow-sm'
            : 'bg-slate-50/70 hover:bg-slate-50 border-slate-200/80'
        }`}
      >
        <div className="flex items-center gap-2 min-w-0">
          <div
            className={`w-6 h-6 rounded-lg flex items-center justify-center shrink-0 transition ${
              password.trim() ? 'bg-amber-100 text-amber-700' : 'bg-slate-200/70 text-slate-500'
            }`}
          >
            <Lock className="w-3.5 h-3.5" />
          </div>
          <div className="flex flex-col sm:flex-row sm:items-center sm:gap-2">
            <span
              className={`text-xs font-semibold tracking-tight ${
                password.trim() ? 'text-amber-900' : 'text-slate-700'
              }`}
            >
              {t('send.passwordLabel')}
            </span>
            <span className="text-[11px] text-slate-400">
              {password.trim()
                ? t('send.passwordProtected')
                : t('send.passwordPublic')}
            </span>
          </div>
        </div>

        <div className="relative w-full sm:w-60 shrink-0">
          <input
            ref={passwordInputRef}
            type={showPassword ? 'text' : 'password'}
            name="lightdrop_custom_token_no_fill"
            id="lightdrop_custom_token_no_fill"
            autoComplete="new-password"
            autoCorrect="off"
            autoCapitalize="none"
            spellCheck={false}
            readOnly={passwordReadOnly}
            onFocus={() => setPasswordReadOnly(false)}
            onBlur={() => {
              if (!password) setPasswordReadOnly(true);
            }}
            data-lpignore="true"
            data-1p-ignore="true"
            data-form-type="other"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={t('send.passwordPlaceholder')}
            disabled={submitting}
            className={`w-full pl-3 pr-16 py-1.5 text-xs bg-white border rounded-lg focus:outline-none font-mono text-slate-800 shadow-sm transition disabled:opacity-50 ${
              password.trim()
                ? 'border-amber-300 focus:border-amber-500 focus:ring-1 focus:ring-amber-400'
                : 'border-slate-200 hover:border-slate-300 focus:border-blue-500 focus:ring-1 focus:ring-blue-500'
            }`}
          />
          <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1 text-slate-400">
            {password.length > 0 && (
              <button
                type="button"
                onClick={() => setPassword('')}
                disabled={submitting}
                className="p-1 rounded-md hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition"
                title={t('send.clearPassword')}
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              disabled={submitting}
              className="p-1 rounded-md hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition"
              title={showPassword ? t('send.hidePassword') : t('send.showPassword')}
            >
              {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
            </button>
          </div>
        </div>
      </div>

      {/* 上传文件与上传文件夹两列按钮 */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        {/* 上传文件 */}
        <input
          ref={fileInputRef}
          type="file"
          multiple
          onChange={handleFileChange}
          className="hidden"
        />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={submitting}
          className="flex items-center justify-center gap-2.5 p-3 rounded-xl border border-dashed border-blue-200 bg-blue-50/40 hover:bg-blue-50 text-blue-600 transition group active:scale-[0.99] disabled:opacity-50"
        >
          <div className="w-8 h-8 rounded-lg bg-blue-100/80 flex items-center justify-center group-hover:scale-105 transition">
            <UploadCloud className="w-4 h-4 text-blue-600" />
          </div>
          <div className="text-left">
            <div className="text-xs font-semibold text-blue-700">{t('send.uploadFiles')}</div>
            <div className="text-[10px] text-slate-400">{t('send.uploadFilesDesc')}</div>
          </div>
        </button>

        {/* 上传文件夹 */}
        <input
          ref={folderInputRef}
          type="file"
          // @ts-ignore
          webkitdirectory=""
          // @ts-ignore
          directory=""
          multiple
          onChange={handleFolderChange}
          className="hidden"
        />
        <button
          type="button"
          onClick={() => folderInputRef.current?.click()}
          disabled={submitting}
          className="flex items-center justify-center gap-2.5 p-3 rounded-xl border border-dashed border-sky-200 bg-sky-50/40 hover:bg-sky-50 text-sky-600 transition group active:scale-[0.99] disabled:opacity-50"
        >
          <div className="w-8 h-8 rounded-lg bg-sky-100/80 flex items-center justify-center group-hover:scale-105 transition">
            <FolderUp className="w-4 h-4 text-sky-600" />
          </div>
          <div className="text-left">
            <div className="text-xs font-semibold text-sky-700">{t('send.uploadFolder')}</div>
            <div className="text-[10px] text-slate-400">{t('send.uploadFolderDesc')}</div>
          </div>
        </button>
      </div>

      {/* 主操作按钮 (发送文本 / 上传文件 / 发送并上传) */}
      <button
        type="button"
        onClick={handleSend}
        disabled={submitting || (!hasText && !hasPending)}
        className="w-full py-2.5 px-4 bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-700 hover:to-blue-600 active:scale-[0.99] text-white rounded-xl font-medium text-xs sm:text-sm flex items-center justify-center gap-2 shadow-sm shadow-blue-500/25 transition disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none"
      >
        {getButtonIcon()}
        <span>{getButtonText()}</span>
      </button>
    </div>
  );
};
