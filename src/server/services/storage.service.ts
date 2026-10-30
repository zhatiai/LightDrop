import fs from 'fs';
import path from 'path';
import os from 'os';
import { pipeline } from 'stream/promises';
import archiver from 'archiver';
import { configManager } from '../config/config.manager.js';
import { STORAGE_FILES_DIRNAME, STORAGE_RECORDS_FILENAME, STORAGE_SETTINGS_FILENAME } from '../../shared/constants.js';

export class StorageService {
  /**
   * 获取文件存储根路径
   */
  public getFilesDir(): string {
    const baseDir = configManager.getSettings().storageDir;
    const filesDir = path.join(baseDir, STORAGE_FILES_DIRNAME);
    if (!fs.existsSync(filesDir)) {
      fs.mkdirSync(filesDir, { recursive: true });
    }
    return filesDir;
  }

  /**
   * 获取与文件存储根路径同分区的临时上传目录 (确保跨文件移动为 0 毫秒原子 rename)
   */
  public getTempUploadDir(): string {
    try {
      const baseDir = configManager.getSettings().storageDir;
      const tempDir = path.join(baseDir, '.temp-uploads');
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
      }
      return tempDir;
    } catch {
      const fallback = path.join(os.tmpdir(), 'lightdrop-temp-uploads');
      if (!fs.existsSync(fallback)) {
        fs.mkdirSync(fallback, { recursive: true });
      }
      return fallback;
    }
  }

  /**
   * 安全、高性能地将临时上传文件移动至正式记录目录
   * 优先尝试原子 rename（同分区 0 毫秒极速移动，零额外磁盘读写），跨设备时自动降级为异步流式复制并清理源文件
   */
  public async moveUploadedFile(sourcePath: string, targetPath: string): Promise<void> {
    const targetDir = path.dirname(targetPath);
    if (!fs.existsSync(targetDir)) {
      await fs.promises.mkdir(targetDir, { recursive: true });
    }

    try {
      await fs.promises.rename(sourcePath, targetPath);
    } catch (err: any) {
      if (err.code === 'EXDEV' || err.code === 'EACCES' || err.code === 'EBUSY') {
        // 跨设备挂载或权限问题，使用异步非阻塞管道流复制，不阻塞主线程
        const readStream = fs.createReadStream(sourcePath);
        const writeStream = fs.createWriteStream(targetPath);
        await pipeline(readStream, writeStream);
        try {
          await fs.promises.unlink(sourcePath);
        } catch (_) {}
      } else {
        throw err;
      }
    }
  }

  /**
   * 定期清理临时上传目录中的孤儿或残留碎片文件（默认清理 > 1 小时的文件）
   */
  public cleanTempUploads(maxAgeMs: number = 60 * 60 * 1000): number {
    let cleanedCount = 0;
    try {
      const tempDir = this.getTempUploadDir();
      if (!fs.existsSync(tempDir)) return 0;
      const now = Date.now();
      const files = fs.readdirSync(tempDir);
      for (const file of files) {
        const fullPath = path.join(tempDir, file);
        try {
          const stat = fs.statSync(fullPath);
          if (stat.isFile() && now - stat.mtimeMs > maxAgeMs) {
            fs.unlinkSync(fullPath);
            cleanedCount++;
          }
        } catch (_) {}
      }
    } catch (_) {}
    return cleanedCount;
  }

  /**
   * 为某条记录创建专用存放路径
   */
  public getRecordStoragePath(recordId: string): string {
    return path.join(this.getFilesDir(), recordId);
  }

  /**
   * 删除某条记录关联的物理磁盘文件
   */
  public deleteRecordFiles(recordId: string): void {
    const targetPath = this.getRecordStoragePath(recordId);
    if (fs.existsSync(targetPath)) {
      try {
        fs.rmSync(targetPath, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
      } catch (err) {
        console.error(`[StorageService] Failed to delete file for record ${recordId}:`, err);
      }
    }
  }

  /**
   * 打包某个记录目录为 zip 流下载
   */
  public createZipArchiveStream(sourceDir: string, zipName: string, res: any, textContent?: string): void {
    const archive = archiver('zip', {
      zlib: { level: 6 },
    });

    const cleanName = (zipName || 'Archive').replace(/[\\/:*?"<>|]/g, '_').trim();
    const safeZipName = cleanName.toLowerCase().endsWith('.zip') ? cleanName : `${cleanName}.zip`;
    const encodedName = encodeURIComponent(safeZipName);

    // 标准 RFC 5987 / RFC 6266 头：确保 Safari、Chrome、Edge、Firefox 均能正确解析 UTF-8 中文文件名与 .zip 后缀
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="archive.zip"; filename*=UTF-8''${encodedName}`
    );

    archive.on('error', (err) => {
      console.error('[StorageService] Zip stream error:', err);
      if (!res.headersSent) {
        res.status(500).send({ error: 'Failed to compress archive' });
      }
    });

    archive.pipe(res);

    // 1. 如果存在物理文件目录，将目录内所有文件加入压缩包根目录
    if (fs.existsSync(sourceDir)) {
      archive.directory(sourceDir, false);
    }

    // 2. 如果包含文字说明内容，将正文内容导出为 Markdown 文件置入压缩包根目录
    if (textContent && textContent.trim()) {
      const firstLine = textContent.split('\n')[0].replace(/^[#\s*-_>]+/, '').replace(/[\\/:*?"<>|]/g, '_').trim();
      let cleanTitle = (
        firstLine.substring(0, 40) ||
        safeZipName.replace(/\.zip$/i, '').replace(/\s*\(含\d+个附件\)/, '') ||
        '说明文档'
      ).replace(/[\\/:*?"<>|]/g, '_').trim();
      let mdFileName = cleanTitle.toLowerCase().endsWith('.md') ? cleanTitle : `${cleanTitle || '说明文档'}.md`;

      // 若已有同名文件，添加 _说明 后缀避免重名覆盖
      if (fs.existsSync(sourceDir) && fs.existsSync(path.join(sourceDir, mdFileName))) {
        mdFileName = `${cleanTitle.replace(/\.md$/i, '')}_说明.md`;
      }
      archive.append(textContent, { name: mdFileName });
    }

    archive.finalize();
  }

  /**
   * 将多条记录打包为一个统一的 zip 流下载
   */
  public createMultiRecordsZipStream(
    records: Array<{ id: string; title: string; type: string; fileName?: string; content?: string }>,
    zipName: string,
    res: any
  ): void {
    const archive = archiver('zip', {
      zlib: { level: 6 },
    });

    const cleanName = (zipName || 'LightDrop_Archive').replace(/[\\/:*?"<>|]/g, '_').trim();
    const safeZipName = cleanName.toLowerCase().endsWith('.zip') ? cleanName : `${cleanName}.zip`;
    const encodedName = encodeURIComponent(safeZipName);

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="archive.zip"; filename*=UTF-8''${encodedName}`
    );

    archive.on('error', (err) => {
      console.error('[StorageService] Multi-records zip stream error:', err);
      if (!res.headersSent) {
        res.status(500).send({ error: 'Failed to compress archive' });
      }
    });

    archive.pipe(res);

    for (const item of records) {
      if (item.type === 'text') {
        const textContent = item.content || item.title || '';
        const safeName = (item.title || 'Note').replace(/[\\/:*?"<>|]/g, '_').trim();
        const mdName = safeName.toLowerCase().endsWith('.md') ? safeName : `${safeName}.md`;
        archive.append(textContent, { name: mdName });
      } else {
        const itemDir = this.getRecordStoragePath(item.id);
        if (fs.existsSync(itemDir)) {
          if (item.type === 'folder' || item.type === 'batch') {
            const folderName = (item.title || 'Collection').replace(/[\\/:*?"<>|]/g, '_').trim();
            archive.directory(itemDir, folderName);

            // 如果该合辑或文件夹包含文字说明内容，生成 Markdown 文件并置入对应文件夹内
            if (item.content && item.content.trim()) {
              const firstLine = item.content.split('\n')[0].replace(/^[#\s*-_>]+/, '').replace(/[\\/:*?"<>|]/g, '_').trim();
              let cleanTitle = (
                firstLine.substring(0, 40) ||
                folderName.replace(/\s*\(含\d+个附件\)/, '') ||
                '说明文档'
              ).replace(/[\\/:*?"<>|]/g, '_').trim();
              let mdFileName = cleanTitle.toLowerCase().endsWith('.md') ? cleanTitle : `${cleanTitle || '说明文档'}.md`;

              if (fs.existsSync(path.join(itemDir, mdFileName))) {
                mdFileName = `${cleanTitle.replace(/\.md$/i, '')}_说明.md`;
              }
              archive.append(item.content, { name: path.posix.join(folderName, mdFileName) });
            }
          } else {
            const fileName = item.fileName || item.title;
            const filePath = path.join(itemDir, fileName);
            if (fs.existsSync(filePath)) {
              archive.file(filePath, { name: fileName });
            } else {
              const files = fs.readdirSync(itemDir);
              if (files.length > 0) {
                archive.file(path.join(itemDir, files[0]), { name: files[0] });
              }
            }
            if (item.content && item.content.trim()) {
              const firstLine = item.content.split('\n')[0].replace(/^[#\s*-_>]+/, '').replace(/[\\/:*?"<>|]/g, '_').trim();
              const mdFileName = `${(firstLine.substring(0, 30) || item.title || '说明文档').replace(/[\\/:*?"<>|]/g, '_').trim()}_说明.md`;
              archive.append(item.content, { name: mdFileName });
            }
          }
        }
      }
    }

    archive.finalize();
  }

  /**
   * 迁移现有存储目录到新存储目录
   */
  public migrateStorage(oldDir: string, newDir: string): { success: boolean; message?: string } {
    try {
      if (path.resolve(oldDir) === path.resolve(newDir)) {
        return { success: true, message: 'Source and target directories are identical' };
      }

      configManager.ensureStorageDirExists(newDir);

      // 拷贝 records.json
      const oldRecords = path.join(oldDir, STORAGE_RECORDS_FILENAME);
      const newRecords = path.join(newDir, STORAGE_RECORDS_FILENAME);
      if (fs.existsSync(oldRecords)) {
        fs.copyFileSync(oldRecords, newRecords);
      }

      // 拷贝 settings.json
      const oldSettings = path.join(oldDir, STORAGE_SETTINGS_FILENAME);
      const newSettings = path.join(newDir, STORAGE_SETTINGS_FILENAME);
      if (fs.existsSync(oldSettings)) {
        fs.copyFileSync(oldSettings, newSettings);
      }

      // 拷贝 files 目录内容
      const oldFiles = path.join(oldDir, STORAGE_FILES_DIRNAME);
      const newFiles = path.join(newDir, STORAGE_FILES_DIRNAME);
      if (fs.existsSync(oldFiles)) {
        if (!fs.existsSync(newFiles)) {
          fs.mkdirSync(newFiles, { recursive: true });
        }
        this.copyFolderRecursive(oldFiles, newFiles);
      }

      return { success: true };
    } catch (err: any) {
      console.error('[StorageService] Migration failed:', err);
      return { success: false, message: err?.message || 'Migration failed' };
    }
  }

  private copyFolderRecursive(source: string, target: string): void {
    const files = fs.readdirSync(source);
    for (const file of files) {
      const curSource = path.join(source, file);
      const curTarget = path.join(target, file);
      if (fs.lstatSync(curSource).isDirectory()) {
        if (!fs.existsSync(curTarget)) {
          fs.mkdirSync(curTarget, { recursive: true });
        }
        this.copyFolderRecursive(curSource, curTarget);
      } else {
        fs.copyFileSync(curSource, curTarget);
      }
    }
  }

  /**
   * 计算指定目录的真实物理大小 (递归字节数)
   */
  public getDirectorySize(dirPath: string): number {
    let size = 0;
    if (!fs.existsSync(dirPath)) return 0;

    const stats = fs.statSync(dirPath);
    if (!stats.isDirectory()) return stats.size;

    try {
      const files = fs.readdirSync(dirPath);
      for (const file of files) {
        const fullPath = path.join(dirPath, file);
        const fileStat = fs.statSync(fullPath);
        if (fileStat.isDirectory()) {
          size += this.getDirectorySize(fullPath);
        } else {
          size += fileStat.size;
        }
      }
    } catch (e) {
      console.warn('[StorageService] Error calculating dir size:', e);
    }
    return size;
  }
}

export const storageService = new StorageService();
