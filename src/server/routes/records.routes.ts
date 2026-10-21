import { Router, Request, Response } from 'express';
import { nanoid } from 'nanoid';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import mime from 'mime-types';
import { fileDatabase } from '../database/file.database.js';
import { storageService } from '../services/storage.service.js';
import { wsService } from '../websocket/ws.server.js';
import { upload, checkFileSizeLimit } from '../middlewares/upload.middleware.js';
import { ShareItem, BatchFileItem } from '../../shared/types.js';
import { auditService } from '../services/audit.service.js';

export const recordsRouter: Router = Router();

/**
 * 密码单向哈希 (避免存储明文，且对外绝不泄露)
 */
function hashPassword(password: string): string {
  return crypto.createHash('sha256').update(password.trim()).digest('hex');
}

/**
 * 格式化文件名，解决部分环境下的 latin1 乱码
 */
function fixFileName(name: string): string {
  if (!name) return name;
  if (/[\u4e00-\u9fa5]/.test(name)) {
    return name;
  }
  try {
    const converted = Buffer.from(name, 'latin1').toString('utf8');
    if (!converted.includes('\ufffd') && /[\u4e00-\u9fa5]/.test(converted)) {
      return converted;
    }
  } catch {}
  return name;
}

const IMAGE_EXTENSIONS = new Set([
  'png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'ico', 'avif', 'tiff', 'tif', 'heic', 'heif'
]);

function isImageFile(fileName: string, mimeType?: string): boolean {
  const ext = path.extname(fileName).replace('.', '').toLowerCase();
  if (IMAGE_EXTENSIONS.has(ext)) return true;
  if (mimeType && mimeType.toLowerCase().startsWith('image/')) return true;
  return false;
}

/**
 * 对外输出记录时进行安全脱敏：
 * 1. 绝对不输出 passwordHash 或任何密码信息；
 * 2. 仅保留 hasPassword 标志；
 * 3. 若有密码保护，文本内容 content 隐藏，preview 替换为安全提示。
 */
function sanitizeRecord(item: ShareItem, options?: { hidePassword?: boolean }): ShareItem {
  const safe = { ...item };
  delete (safe as any).passwordHash;

  if (options?.hidePassword) {
    delete safe.password;
  }

  if (safe.hasPassword) {
    if (safe.content) {
      safe.content = undefined;
      safe.preview = '🔒 此内容已受访问密码保护，验证后可查看与复制';
    }
  }

  return safe;
}

/**
 * 获取所有记录 (全部经过脱敏过滤)
 */
recordsRouter.get('/', (req: Request, res: Response) => {
  const { type, search } = req.query;
  let items = fileDatabase.getAll();

  if (type && type !== 'all') {
    items = items.filter((item) => item.type === type);
  }

  if (search && typeof search === 'string') {
    const q = search.trim().toLowerCase();
    items = items.filter(
      (item) =>
        item.title.toLowerCase().includes(q) ||
        (item.customTitle && item.customTitle.toLowerCase().includes(q)) ||
        (item.content && item.content.toLowerCase().includes(q)) ||
        (item.fileName && item.fileName.toLowerCase().includes(q)) ||
        (item.senderName && item.senderName.toLowerCase().includes(q)) ||
        (item.nickname && item.nickname.toLowerCase().includes(q))
    );
  }

  res.json({
    success: true,
    data: items.map((item) => sanitizeRecord(item)),
  });
});

/**
 * 获取单条记录公开信息 (脱敏且隐藏密码，供下载与密码验证页面使用)
 */
recordsRouter.get('/:id', (req: Request, res: Response) => {
  const item = fileDatabase.getById(req.params.id);
  if (!item) {
    res.status(404).json({ success: false, error: '记录不存在或已被删除' });
    return;
  }
  res.json({
    success: true,
    data: sanitizeRecord(item, { hidePassword: true }),
  });
});

/**
 * 校验访问密码并获取解密文本内容
 */
recordsRouter.post('/:id/verify-password', (req: Request, res: Response) => {
  const { id } = req.params;
  const { password } = req.body;
  const item = fileDatabase.getById(id);

  if (!item) {
    res.status(404).json({ success: false, error: '记录不存在' });
    return;
  }

  if (!item.hasPassword) {
    res.json({ success: true, valid: true, content: item.content });
    return;
  }

  if (!password || typeof password !== 'string') {
    res.status(400).json({ success: false, error: '请输入访问密码' });
    return;
  }

  if (hashPassword(password) !== item.passwordHash) {
    res.status(403).json({ success: false, error: '密码错误，请重新输入' });
    return;
  }

  // 校验成功：若历史记录未存储明文密码，自动持久化存储以便在管理面板显示
  if (!item.password) {
    fileDatabase.update(item.id, { password: password.trim() });
    item.password = password.trim();
  }

  auditService.log(
    req,
    'verify_password',
    '验证访问密码',
    item.title || item.fileName || '加密记录',
    item.id,
    '密码验证通过'
  );
  wsService.broadcast('AUDIT_LOGS_UPDATED', {});

  res.json({
    success: true,
    valid: true,
    content: item.content,
  });
});

/**
 * 发送文本/代码/URL (支持可选密码)
 */
recordsRouter.post('/text', (req: Request, res: Response) => {
  const { content, title: customTitle, password } = req.body;
  if (!content || typeof content !== 'string' || !content.trim()) {
    res.status(400).json({ success: false, error: '内容不能为空' });
    return;
  }

  const trimmed = content.trim();
  const isUrl = /^(https?:\/\/|www\.)[^\s/$.?#].[^\s]*$/i.test(trimmed);

  const cleanCustomTitle = customTitle && typeof customTitle === 'string' && customTitle.trim()
    ? fixFileName(customTitle).trim()
    : undefined;

  let title = cleanCustomTitle;
  if (!title) {
    const oneLine = trimmed.replace(/\s+/g, ' ');
    title = oneLine.length > 20 ? `${oneLine.substring(0, 20)}...` : oneLine;
  }

  const preview = trimmed.length > 120 ? `${trimmed.substring(0, 120)}...` : trimmed;
  const sizeBytes = Buffer.byteLength(content, 'utf8');

  const now = new Date().toISOString();
  const hasPwd = Boolean(password && typeof password === 'string' && password.trim());
  const senderNickname = auditService.getClientNickname(req);

  const newItem: ShareItem = {
    id: nanoid(10),
    type: 'text',
    title,
    customTitle: cleanCustomTitle,
    content, // 保持完整内容，默认不裁剪
    preview,
    isUrl,
    fileSize: sizeBytes,
    createdAt: now,
    updatedAt: now,
    permission: 'all_can_copy',
    downloadCount: 0,
    hasPassword: hasPwd,
    password: hasPwd ? password.trim() : undefined,
    passwordHash: hasPwd ? hashPassword(password) : undefined,
    senderName: senderNickname,
    nickname: senderNickname,
  };

  fileDatabase.insert(newItem);
  auditService.log(req, 'create_text', '发送文本', newItem.title, newItem.id);
  wsService.broadcast('ITEM_CREATED', sanitizeRecord(newItem));
  wsService.broadcast('STATS_UPDATED', fileDatabase.getStats());
  wsService.broadcast('AUDIT_LOGS_UPDATED', {});

  res.json({
    success: true,
    data: sanitizeRecord(newItem),
  });
});

/**
 * 上传文件 (支持可选密码)
 */
recordsRouter.post(
  '/upload',
  upload.array('files'),
  checkFileSizeLimit,
  (req: Request, res: Response) => {
    const files = req.files as Express.Multer.File[] | undefined;
    if (!files || files.length === 0) {
      res.status(400).json({ success: false, error: '请选择要上传的文件' });
      return;
    }

    const { password } = req.body;
    const hasPwd = Boolean(password && typeof password === 'string' && password.trim());
    const pwdHash = hasPwd ? hashPassword(password) : undefined;
    const senderNickname = auditService.getClientNickname(req);
    const contentStr = req.body.content && typeof req.body.content === 'string' && req.body.content.trim()
      ? String(req.body.content)
      : '';

    // 1. 如果上传多个文件，或者携带正文说明（多文件合辑 / 图文附件条目），统一管理、呈现、查看与下载
    if (files.length > 1 || (files.length >= 1 && contentStr)) {
      const id = nanoid(10);
      const recordDir = storageService.getRecordStoragePath(id);
      fs.mkdirSync(recordDir, { recursive: true });

      let totalBytes = 0;
      const subFiles: BatchFileItem[] = [];
      const usedFileNames = new Set<string>();

      for (let i = 0; i < files.length; i++) {
        const f = files[i];
        let originalName = fixFileName(f.originalname);
        // 防同名文件重命名
        if (usedFileNames.has(originalName)) {
          const parsed = path.parse(originalName);
          originalName = `${parsed.name}_${i + 1}${parsed.ext}`;
        }
        usedFileNames.add(originalName);

        const safeTargetFilePath = path.join(recordDir, originalName);
        fs.copyFileSync(f.path, safeTargetFilePath);

        try {
          fs.unlinkSync(f.path);
        } catch (_) {}

        totalBytes += f.size;
        const ext = path.extname(originalName).replace('.', '').toLowerCase();
        const mimeType = (f.mimetype || mime.lookup(originalName) || 'application/octet-stream').toString();
        const isImg = isImageFile(originalName, mimeType);

        subFiles.push({
          id: `${id}_${i}`,
          name: originalName,
          size: f.size,
          mimeType,
          isImage: isImg,
          extension: ext,
        });
      }

      const allImages = subFiles.every((sf) => sf.isImage);
      const customTitle = req.body.title ? fixFileName(req.body.title).trim() : '';
      let defaultTitle = '';
      if (contentStr) {
        const firstLine = contentStr.trim().split('\n')[0].replace(/^[#\s*-_>]+/, '').trim();
        const summary = firstLine.length > 25 ? `${firstLine.substring(0, 25)}...` : firstLine;
        defaultTitle = summary
          ? summary
          : allImages
          ? `${subFiles[0].name} 等 ${subFiles.length} 张图片`
          : `${subFiles[0].name} 等 ${subFiles.length} 个文件`;
      } else {
        defaultTitle = allImages
          ? subFiles.length === 1
            ? subFiles[0].name
            : `${subFiles[0].name} 等 ${subFiles.length} 张图片`
          : subFiles.length === 1
          ? subFiles[0].name
          : `${subFiles[0].name} 等 ${subFiles.length} 个文件`;
      }
      const title = customTitle || defaultTitle;
      const now = new Date().toISOString();

      const newItem: ShareItem = {
        id,
        type: 'batch',
        title,
        customTitle: customTitle || undefined,
        content: contentStr || undefined,
        preview: contentStr
          ? (contentStr.trim().length > 120 ? `${contentStr.trim().substring(0, 120)}...` : contentStr.trim())
          : undefined,
        fileName: title,
        fileCount: subFiles.length,
        fileSize: totalBytes,
        files: subFiles,
        isImageBatch: allImages,
        createdAt: now,
        updatedAt: now,
        permission: 'all_can_download',
        downloadCount: 0,
        hasPassword: hasPwd,
        password: hasPwd ? password.trim() : undefined,
        passwordHash: pwdHash,
        senderName: senderNickname,
        nickname: senderNickname,
      };

      fileDatabase.insert(newItem);
      auditService.log(
        req,
        'upload_batch',
        contentStr ? '发送图文附件' : allImages ? '上传图片合辑' : '上传文件合辑',
        newItem.title,
        newItem.id
      );
      wsService.broadcast('ITEM_CREATED', sanitizeRecord(newItem));
      wsService.broadcast('STATS_UPDATED', fileDatabase.getStats());
      wsService.broadcast('AUDIT_LOGS_UPDATED', {});

      res.json({
        success: true,
        data: sanitizeRecord(newItem),
      });
      return;
    }

    // 2. 如果上传单个文件，保持原有轻量单文件/单图片记录结构
    const f = files[0];
    const id = nanoid(10);
    const originalName = fixFileName(f.originalname);
    const ext = path.extname(originalName).replace('.', '').toLowerCase();
    const mimeType = f.mimetype || mime.lookup(originalName) || 'application/octet-stream';

    const recordDir = storageService.getRecordStoragePath(id);
    fs.mkdirSync(recordDir, { recursive: true });

    const safeTargetFilePath = path.join(recordDir, originalName);
    fs.copyFileSync(f.path, safeTargetFilePath);

    try {
      fs.unlinkSync(f.path);
    } catch (_) {}

    const now = new Date().toISOString();
    const isImg = isImageFile(originalName, mimeType.toString());
    const customTitle = req.body.title ? fixFileName(req.body.title).trim() : '';
    const title = customTitle || originalName;
    const newItem: ShareItem = {
      id,
      type: isImg ? 'image' : 'file',
      title,
      customTitle: customTitle || undefined,
      fileName: originalName,
      mimeType: mimeType.toString(),
      extension: ext,
      fileSize: f.size,
      createdAt: now,
      updatedAt: now,
      permission: 'all_can_download',
      downloadCount: 0,
      hasPassword: hasPwd,
      password: hasPwd ? password.trim() : undefined,
      passwordHash: pwdHash,
      senderName: senderNickname,
      nickname: senderNickname,
    };

    fileDatabase.insert(newItem);
    auditService.log(
      req,
      isImg ? 'upload_image' : 'upload_file',
      isImg ? '上传图片' : '上传文件',
      newItem.title,
      newItem.id
    );
    wsService.broadcast('ITEM_CREATED', sanitizeRecord(newItem));
    wsService.broadcast('STATS_UPDATED', fileDatabase.getStats());
    wsService.broadcast('AUDIT_LOGS_UPDATED', {});

    res.json({
      success: true,
      data: sanitizeRecord(newItem),
    });
  }
);

/**
 * 上传文件夹 (支持可选密码)
 */
recordsRouter.post(
  '/upload-folder',
  upload.array('files'),
  checkFileSizeLimit,
  (req: Request, res: Response) => {
    const files = req.files as Express.Multer.File[] | undefined;
    if (!files || files.length === 0) {
      res.status(400).json({ success: false, error: '请选择要上传的文件夹' });
      return;
    }

    const { password } = req.body;
    const hasPwd = Boolean(password && typeof password === 'string' && password.trim());
    const pwdHash = hasPwd ? hashPassword(password) : undefined;
    const senderNickname = auditService.getClientNickname(req);
    const contentStr = req.body.content && typeof req.body.content === 'string' && req.body.content.trim()
      ? String(req.body.content)
      : '';

    const folderName = req.body.folderName ? fixFileName(req.body.folderName) : '上传文件夹';
    let paths: string[] = [];
    try {
      paths = req.body.paths ? JSON.parse(req.body.paths) : [];
    } catch {
      paths = [];
    }

    const id = nanoid(10);
    const recordDir = storageService.getRecordStoragePath(id);
    fs.mkdirSync(recordDir, { recursive: true });

    let totalBytes = 0;

    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      totalBytes += f.size;
      const relativePath = paths[i] ? fixFileName(paths[i]) : fixFileName(f.originalname);
      
      const normalizedRelative = path.normalize(relativePath).replace(/^(\.\.(\/|\\|$))+/, '');
      const targetFilePath = path.join(recordDir, normalizedRelative);

      const targetFileDir = path.dirname(targetFilePath);
      if (!fs.existsSync(targetFileDir)) {
        fs.mkdirSync(targetFileDir, { recursive: true });
      }

      fs.copyFileSync(f.path, targetFilePath);

      try {
        fs.unlinkSync(f.path);
      } catch (_) {}
    }

    const customTitle = req.body.title ? fixFileName(req.body.title).trim() : '';
    const title = customTitle || folderName;
    const now = new Date().toISOString();
    const newItem: ShareItem = {
      id,
      type: 'folder',
      title,
      customTitle: customTitle || undefined,
      content: contentStr || undefined,
      preview: contentStr
        ? (contentStr.trim().length > 120 ? `${contentStr.trim().substring(0, 120)}...` : contentStr.trim())
        : undefined,
      fileName: folderName,
      fileSize: totalBytes,
      fileCount: files.length,
      createdAt: now,
      updatedAt: now,
      permission: 'all_can_download',
      downloadCount: 0,
      hasPassword: hasPwd,
      password: hasPwd ? password.trim() : undefined,
      passwordHash: pwdHash,
      senderName: senderNickname,
      nickname: senderNickname,
    };

    fileDatabase.insert(newItem);
    auditService.log(req, 'upload_folder', '上传文件夹', newItem.title, newItem.id);
    wsService.broadcast('ITEM_CREATED', sanitizeRecord(newItem));
    wsService.broadcast('STATS_UPDATED', fileDatabase.getStats());
    wsService.broadcast('AUDIT_LOGS_UPDATED', {});

    res.json({
      success: true,
      data: sanitizeRecord(newItem),
    });
  }
);

/**
 * 下载文件或打包下载文件夹 (校验密码保护)
 */
recordsRouter.get('/:id/download', (req: Request, res: Response) => {
  const item = fileDatabase.getById(req.params.id);
  if (!item) {
    res.status(404).json({ success: false, error: '记录不存在' });
    return;
  }

  // 密码保护校验
  if (item.hasPassword) {
    const password = (req.query.password || req.headers['x-password'] || '') as string;
    const isValid = Boolean(password && hashPassword(password) === item.passwordHash);
    if (!isValid) {
      // 如果是浏览器访问 (如通过链接直接点击或地址栏打开)，重定向至密码输入与下载页面
      const acceptsHtml = Boolean(req.headers.accept && req.headers.accept.includes('text/html'));
      const isAjax = Boolean(req.xhr || req.headers['x-requested-with'] === 'XMLHttpRequest');
      if (acceptsHtml && !isAjax) {
        res.redirect(302, `/download/${item.id}`);
        return;
      }
      res.status(403).json({
        success: false,
        error: '此文件受密码保护，请输入正确访问密码后下载',
      });
      return;
    }
  }

  // 累加下载次数并记录操作审计
  fileDatabase.update(item.id, { downloadCount: (item.downloadCount || 0) + 1 });
  auditService.log(
    req,
    'download_file',
    item.type === 'folder'
      ? '打包下载文件夹'
      : item.type === 'batch'
      ? '打包下载文件合辑'
      : item.type === 'image'
      ? '下载图片'
      : '下载文件',
    item.title || item.fileName || '未知文件',
    item.id
  );
  wsService.broadcast('AUDIT_LOGS_UPDATED', {});

  // 如果是文本类型记录
  if (item.type === 'text') {
    // 浏览器直接访问时重定向至文本阅读页
    const acceptsHtml = Boolean(req.headers.accept && req.headers.accept.includes('text/html'));
    const isAjax = Boolean(req.xhr || req.headers['x-requested-with'] === 'XMLHttpRequest');
    if (acceptsHtml && !isAjax) {
      res.redirect(302, `/download/${item.id}`);
      return;
    }

    const isInline = req.query.inline === 'true' || req.query.preview === 'true';
    const rawContent = item.content || item.preview || '';
    const safeTitle = (item.title || 'Note').replace(/[\\/:*?"<>|]/g, '_').trim();
    const fileName = encodeURIComponent(safeTitle.toLowerCase().endsWith('.md') ? safeTitle : `${safeTitle}.md`);
    res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
    if (isInline) {
      res.setHeader('Content-Disposition', `inline; filename="${fileName}"; filename*=UTF-8''${fileName}`);
    } else {
      res.setHeader('Content-Disposition', `attachment; filename="${fileName}"; filename*=UTF-8''${fileName}`);
    }
    res.send(rawContent);
    return;
  }

  const recordDir = storageService.getRecordStoragePath(item.id);
  if (!fs.existsSync(recordDir)) {
    res.status(404).json({ success: false, error: '物理文件不存在' });
    return;
  }

  // 针对 batch 或 folder：支持通过 ?file=filename 单独下载或在线预览子文件
  const targetSubFileName = ((req.query.file as string) || '').trim();
  if (targetSubFileName) {
    const subFilePath = path.join(recordDir, targetSubFileName);
    // 严格防止 ../ 路径穿越安全漏洞
    if (path.resolve(subFilePath).startsWith(path.resolve(recordDir)) && fs.existsSync(subFilePath)) {
      const isInline = req.query.inline === 'true' || req.query.preview === 'true';
      const encodedName = encodeURIComponent(targetSubFileName);
      const mimeType = (mime.lookup(targetSubFileName) || 'application/octet-stream').toString();
      const contentType = mimeType.startsWith('text/') || targetSubFileName.toLowerCase().endsWith('.md')
        ? `${mimeType}; charset=utf-8`
        : mimeType;
      res.setHeader('Content-Type', contentType);
      if (isInline) {
        res.setHeader('Content-Disposition', `inline; filename="${encodedName}"; filename*=UTF-8''${encodedName}`);
      } else {
        res.setHeader('Content-Disposition', `attachment; filename="${encodedName}"; filename*=UTF-8''${encodedName}`);
      }
      res.sendFile(subFilePath);
      return;
    }
  }

  // 批量合辑或文件夹整包流式压缩下载 (同时自动包含正文 Markdown 与全部附件)
  if (item.type === 'folder' || item.type === 'batch') {
    const rawTitle = (item.title || 'Archive').replace(/[\\/:*?"<>|]/g, '_').trim();
    const safeTitle = rawTitle.toLowerCase().endsWith('.zip') ? rawTitle : `${rawTitle}.zip`;
    storageService.createZipArchiveStream(recordDir, safeTitle, res, item.content);
    return;
  }

  const isInline = req.query.inline === 'true' || req.query.preview === 'true';
  const targetFile = path.join(recordDir, item.fileName || item.title);
  if (fs.existsSync(targetFile)) {
    const rawName = item.fileName || item.title;
    const encodedName = encodeURIComponent(rawName);
    const mimeType = (mime.lookup(rawName) || 'application/octet-stream').toString();
    const contentType = mimeType.startsWith('text/') || rawName.toLowerCase().endsWith('.md')
      ? `${mimeType}; charset=utf-8`
      : mimeType;
    res.setHeader('Content-Type', contentType);
    if (isInline) {
      res.setHeader('Content-Disposition', `inline; filename="${encodedName}"; filename*=UTF-8''${encodedName}`);
    } else {
      res.setHeader('Content-Disposition', `attachment; filename="${encodedName}"; filename*=UTF-8''${encodedName}`);
    }
    res.sendFile(targetFile);
  } else {
    const files = fs.readdirSync(recordDir);
    if (files.length > 0) {
      const fallbackFile = files[0];
      const encodedName = encodeURIComponent(fallbackFile);
      const mimeType = (mime.lookup(fallbackFile) || 'application/octet-stream').toString();
      const contentType = mimeType.startsWith('text/') || fallbackFile.toLowerCase().endsWith('.md')
        ? `${mimeType}; charset=utf-8`
        : mimeType;
      res.setHeader('Content-Type', contentType);
      if (isInline) {
        res.setHeader('Content-Disposition', `inline; filename="${encodedName}"; filename*=UTF-8''${encodedName}`);
      } else {
        res.setHeader('Content-Disposition', `attachment; filename="${encodedName}"; filename*=UTF-8''${encodedName}`);
      }
      res.sendFile(path.join(recordDir, fallbackFile));
    } else {
      res.status(404).json({ success: false, error: '文件已丢失' });
    }
  }
});

/**
 * 批量打包下载多个选中的记录为单一 ZIP
 */
recordsRouter.post('/batch-download', (req: Request, res: Response) => {
  const { ids, password } = req.body;
  if (!Array.isArray(ids) || ids.length === 0) {
    res.status(400).json({ success: false, error: '请指定要下载的记录' });
    return;
  }

  const validItems: ShareItem[] = [];
  for (const id of ids) {
    const item = fileDatabase.getById(id);
    if (!item) continue;
    if (item.hasPassword) {
      if (!password || hashPassword(password) !== item.passwordHash) {
        res.status(403).json({
          success: false,
          error: `记录「${item.title}」受访问密码保护，请输入正确访问密码后下载`,
        });
        return;
      }
    }
    validItems.push(item);
  }

  if (validItems.length === 0) {
    res.status(404).json({ success: false, error: '未找到有效记录' });
    return;
  }

  auditService.log(
    req,
    'batch_download',
    '批量打包下载',
    `批量打包下载了 ${validItems.length} 条记录`
  );
  wsService.broadcast('AUDIT_LOGS_UPDATED', {});

  const now = new Date();
  const timeStr = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}_${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}`;
  const zipName = encodeURIComponent(`LightDrop_批量打包_${timeStr}.zip`);
  storageService.createMultiRecordsZipStream(validItems, `LightDrop_批量打包_${timeStr}.zip`, res);
});

/**
 * 记录复制事件 (更新计数与审计日志)
 */
recordsRouter.post('/:id/copy', (req: Request, res: Response) => {
  const item = fileDatabase.getById(req.params.id);
  if (item) {
    fileDatabase.update(item.id, { downloadCount: (item.downloadCount || 0) + 1 });
    auditService.log(req, 'copy_text', '复制文本', item.title, item.id);
    wsService.broadcast('AUDIT_LOGS_UPDATED', {});
  }
  res.json({ success: true });
});

/**
 * 记录复制分享链接事件 (支持含密码提取信息与直链)
 */
recordsRouter.post('/:id/copy-link', (req: Request, res: Response) => {
  const item = fileDatabase.getById(req.params.id);
  if (item) {
    const isPwd = Boolean(item.hasPassword);
    auditService.log(
      req,
      'copy_share_link',
      isPwd ? '复制加密分享链接' : '复制分享链接',
      item.title || item.fileName || '未知记录',
      item.id,
      isPwd ? '包含提取密码信息' : '公开直链'
    );
    wsService.broadcast('AUDIT_LOGS_UPDATED', {});
  }
  res.json({ success: true });
});

/**
 * 记录打开分享页面事件 (访问提取/下载页面)
 */
recordsRouter.post('/:id/open-page', (req: Request, res: Response) => {
  const item = fileDatabase.getById(req.params.id);
  if (item) {
    const isPwd = Boolean(item.hasPassword);
    auditService.log(
      req,
      'open_share_page',
      isPwd ? '打开加密分享页' : '打开分享页面',
      item.title || item.fileName || '未知记录',
      item.id,
      isPwd ? '受密码保护页面' : '公开分享页面'
    );
    wsService.broadcast('AUDIT_LOGS_UPDATED', {});
  }
  res.json({ success: true });
});

/**
 * 删除单条记录
 */
recordsRouter.delete('/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  const item = fileDatabase.getById(id);
  if (!item) {
    res.status(404).json({ success: false, error: '记录不存在' });
    return;
  }

  storageService.deleteRecordFiles(id);
  fileDatabase.delete(id);

  auditService.log(req, 'delete_record', '删除记录', item.title || item.fileName || '未知记录', item.id);
  wsService.broadcast('ITEM_DELETED', { id });
  wsService.broadcast('STATS_UPDATED', fileDatabase.getStats());
  wsService.broadcast('AUDIT_LOGS_UPDATED', {});

  res.json({ success: true });
});

/**
 * 批量删除
 */
recordsRouter.post('/batch-delete', (req: Request, res: Response) => {
  const { ids } = req.body;
  if (!Array.isArray(ids) || ids.length === 0) {
    res.status(400).json({ success: false, error: '请指定要删除的记录 ID' });
    return;
  }

  for (const id of ids) {
    storageService.deleteRecordFiles(id);
  }

  const count = fileDatabase.deleteMany(ids);
  auditService.log(req, 'batch_delete', '批量删除', `批量删除了 ${count} 条记录`);
  wsService.broadcast('ITEMS_BATCH_DELETED', { ids });
  wsService.broadcast('STATS_UPDATED', fileDatabase.getStats());
  wsService.broadcast('AUDIT_LOGS_UPDATED', {});

  res.json({ success: true, count });
});

/**
 * 一键清空全部 / 指定时间条件清理
 */
recordsRouter.post('/clear-all', (req: Request, res: Response) => {
  const { mode, timeMode, beforeDate, relativeUnit, relativeValue } = req.body || {};
  let targetItems = fileDatabase.getAll();

  let actionLabel = '清空全部';
  let detailDesc = `一键清空了 ${targetItems.length} 条记录`;

  const actualMode = timeMode || mode || 'all';

  if (actualMode === 'before_date' && beforeDate) {
    const cutoff = new Date(`${beforeDate}T00:00:00`).getTime();
    targetItems = targetItems.filter((item) => new Date(item.createdAt).getTime() < cutoff);
    actionLabel = '按指定日期清理';
    detailDesc = `清空了 ${beforeDate} 之前的 ${targetItems.length} 条记录`;
  } else if (actualMode === 'relative' && relativeValue && relativeUnit) {
    const val = Number(relativeValue);
    const now = Date.now();
    let ms = 0;
    if (relativeUnit === 'week') {
      ms = val * 7 * 24 * 60 * 60 * 1000;
      detailDesc = `清空了 ${val} 周前的 ${targetItems.length} 条记录`;
    } else if (relativeUnit === 'month') {
      ms = val * 30 * 24 * 60 * 60 * 1000;
      detailDesc = `清空了 ${val} 个月前的 ${targetItems.length} 条记录`;
    }
    const cutoff = now - ms;
    targetItems = targetItems.filter((item) => new Date(item.createdAt).getTime() < cutoff);
    actionLabel = '按时间范围清理';
  }

  for (const item of targetItems) {
    storageService.deleteRecordFiles(item.id);
  }

  const ids = targetItems.map((item) => item.id);
  const count = fileDatabase.deleteMany(ids);

  auditService.log(req, 'clear_records', actionLabel, detailDesc);
  wsService.broadcast('ITEMS_CLEARED', { count, ids });
  wsService.broadcast('STATS_UPDATED', fileDatabase.getStats());
  wsService.broadcast('AUDIT_LOGS_UPDATED', {});

  res.json({ success: true, count, deletedIds: ids });
});
