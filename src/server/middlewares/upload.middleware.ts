import multer from 'multer';
import os from 'os';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { Request, Response, NextFunction } from 'express';
import { configManager } from '../config/config.manager.js';
import { storageService } from '../services/storage.service.js';

// 严谨的磁盘存储：将临时文件存储在与 storageDir 相同的分区，确保后续落地为 0 毫秒原子 rename
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    try {
      const tempDir = storageService.getTempUploadDir();
      cb(null, tempDir);
    } catch (err: any) {
      cb(err, os.tmpdir());
    }
  },
  filename: (req, file, cb) => {
    const randomHex = crypto.randomBytes(16).toString('hex');
    const safeExt = path.extname(file.originalname).slice(0, 10).replace(/[^a-zA-Z0-9.]/g, '');
    cb(null, `upload-${Date.now()}-${randomHex}${safeExt}`);
  },
});

export const upload = multer({
  storage,
  limits: {
    // 支持大文件与多文件文件夹
    fileSize: 10 * 1024 * 1024 * 1024, // 10 GB
    fieldSize: 50 * 1024 * 1024,      // 50 MB (支持上传上万个文件时超大的 paths JSON)
    files: 20000,                     // 支持单个文件夹内包含多达 20000 个文件
    fields: 20000,
  },
});

/**
 * 校验文件大小是否超出系统配置限额
 */
export function checkFileSizeLimit(req: Request, res: Response, next: NextFunction): void {
  const settings = configManager.getSettings();
  if (settings.maxFileSizeMB > 0) {
    const maxBytes = settings.maxFileSizeMB * 1024 * 1024;
    const files = req.files as Express.Multer.File[] | undefined;
    const file = req.file;

    if (file && file.size > maxBytes) {
      res.status(400).json({
        success: false,
        error: `文件 [${file.originalname}] 大小超出系统限制 (最大允许 ${settings.maxFileSizeMB} MB)`,
      });
      return;
    }

    if (files && Array.isArray(files)) {
      for (const f of files) {
        if (f.size > maxBytes) {
          res.status(400).json({
            success: false,
            error: `文件 [${f.originalname}] 大小超出系统限制 (最大允许 ${settings.maxFileSizeMB} MB)`,
          });
          return;
        }
      }
    }
  }
  next();
}
