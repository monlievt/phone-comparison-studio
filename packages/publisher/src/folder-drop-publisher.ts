// packages/publisher/src/folder-drop-publisher.ts
// Implements FolderDropPublisher (copy to watched channel folder + optional HTTP notify) and ManualPublisher (local export).
// Specification: docs/MODULES.md §9 & docs/YTAGENT_INTEGRATION.md

import { copyFileSync, existsSync, mkdirSync, statSync, writeFileSync } from 'fs';
import { basename, join } from 'path';
import { Publisher, PublishRequest, PublishResult } from './types.js';

export interface FolderDropPublisherOptions {
  watchDir: string;
  channelName: string;
  ytagentBaseUrl?: string;
}

export class FolderDropPublisher implements Publisher {
  private watchDir: string;
  private channelName: string;
  private ytagentBaseUrl?: string;

  constructor(opts: FolderDropPublisherOptions) {
    this.watchDir = opts.watchDir;
    this.channelName = opts.channelName;
    this.ytagentBaseUrl = opts.ytagentBaseUrl?.replace(/\/+$/, '');
  }

  async submit(req: PublishRequest): Promise<PublishResult> {
    if (!existsSync(req.videoPath)) {
      throw new Error(`Video file does not exist: ${req.videoPath}`);
    }

    const channelDir = join(this.watchDir, this.channelName);
    mkdirSync(channelDir, { recursive: true });

    const filename = basename(req.videoPath);
    const destVideoPath = join(channelDir, filename);
    copyFileSync(req.videoPath, destVideoPath);

    if (req.thumbnailPath && existsSync(req.thumbnailPath)) {
      const thumbExt = req.thumbnailPath.split('.').pop() || 'png';
      const thumbDest = destVideoPath.replace(/\.[^.]+$/, `.${thumbExt}`);
      copyFileSync(req.thumbnailPath, thumbDest);
    }

    // Write sidecar metadata JSON (idempotent overwrite)
    const metaDest = destVideoPath.replace(/\.[^.]+$/, '.json');
    writeFileSync(
      metaDest,
      JSON.stringify(
        {
          format: req.format,
          visibility: req.visibility ?? 'private',
          publishAt: req.publishAt,
          linkedTo: req.linkedTo,
          metadata: req.metadata,
        },
        null,
        2
      ),
      'utf-8'
    );

    // Optional HTTP notify to ytagent /detect
    if (this.ytagentBaseUrl) {
      const fileSize = statSync(destVideoPath).size;
      const detectRes = await fetch(`${this.ytagentBaseUrl}/api/v1/videos/detect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filename,
          file_path: destVideoPath,
          file_size_bytes: fileSize,
          channel_name: channelDir,
        }),
      });

      if (detectRes.ok) {
        const videoData = (await detectRes.json()) as { id: number };
        const videoId = videoData.id;
        await fetch(`${this.ytagentBaseUrl}/api/v1/videos/${videoId}/metadata`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: req.metadata.title,
            description: req.metadata.description,
            tags: req.metadata.tags,
            category_id: req.metadata.categoryId ?? '28',
            ai_generated: req.metadata.containsSyntheticMedia ?? true,
            made_for_kids: req.metadata.madeForKids ?? false,
          }),
        });

        return {
          ref: String(videoId),
          status: 'queued',
          channelName: this.channelName,
        };
      }
    }

    return {
      ref: destVideoPath,
      status: 'queued',
      channelName: this.channelName,
    };
  }

  async checkStatus(ref: string): Promise<{ status: string; youtubeId?: string; error?: string }> {
    if (this.ytagentBaseUrl && /^\d+$/.test(ref)) {
      const res = await fetch(`${this.ytagentBaseUrl}/api/v1/videos/${ref}`);
      if (res.ok) {
        const data = (await res.json()) as {
          status: string;
          youtube_video_id?: string;
          last_error?: string;
        };
        return {
          status: data.status,
          youtubeId: data.youtube_video_id,
          error: data.last_error,
        };
      }
    }
    return { status: existsSync(ref) ? 'queued' : 'missing' };
  }
}

export class ManualPublisher implements Publisher {
  constructor(private exportDir: string) {}

  async submit(req: PublishRequest): Promise<PublishResult> {
    if (!existsSync(req.videoPath)) {
      throw new Error(`Video file does not exist: ${req.videoPath}`);
    }
    mkdirSync(this.exportDir, { recursive: true });
    const filename = basename(req.videoPath);
    const destPath = join(this.exportDir, filename);
    copyFileSync(req.videoPath, destPath);
    const metaPath = destPath.replace(/\.[^.]+$/, '.json');
    writeFileSync(metaPath, JSON.stringify(req.metadata, null, 2), 'utf-8');
    return { ref: destPath, status: 'queued' };
  }

  async checkStatus(ref: string): Promise<{ status: string; youtubeId?: string; error?: string }> {
    return { status: existsSync(ref) ? 'exported' : 'missing' };
  }
}
