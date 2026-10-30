import { configManager } from '../config/config.manager.js';
import { fileDatabase } from '../database/file.database.js';
import { storageService } from './storage.service.js';
import { wsService } from '../websocket/ws.server.js';

export class CleanupService {
  private timer: NodeJS.Timeout | null = null;

  public start(): void {
    // 启动时先执行一次检查
    this.runCleanup();

    // 随后每小时执行一次例行检查
    this.timer = setInterval(() => {
      this.runCleanup();
    }, 60 * 60 * 1000);
  }

  public stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  public runCleanup(): number {
    // 无论是否配置按天清理记录，均自动清理超过 1 小时的上传临时碎片与中断文件
    try {
      storageService.cleanTempUploads(60 * 60 * 1000);
    } catch (_) {}

    const settings = configManager.getSettings();
    if (!settings.autoCleanupDays || settings.autoCleanupDays <= 0) {
      return 0;
    }

    const maxAgeMs = settings.autoCleanupDays * 24 * 60 * 60 * 1000;
    const now = Date.now();
    const allRecords = fileDatabase.getAll();

    const expiredIds: string[] = [];
    for (const record of allRecords) {
      const createdTime = new Date(record.createdAt).getTime();
      if (now - createdTime > maxAgeMs) {
        expiredIds.push(record.id);
        // 清理对应的磁盘文件
        storageService.deleteRecordFiles(record.id);
      }
    }

    if (expiredIds.length > 0) {
      const removedCount = fileDatabase.deleteMany(expiredIds);
      console.log(`[CleanupService] Automatically purged ${removedCount} expired records (> ${settings.autoCleanupDays} days)`);
      wsService.broadcast('ITEMS_BATCH_DELETED', { ids: expiredIds });
      wsService.broadcast('STATS_UPDATED', fileDatabase.getStats());
      return removedCount;
    }

    return 0;
  }
}

export const cleanupService = new CleanupService();
