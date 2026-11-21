// packages/publisher/src/http-publisher.ts
// Connects directly to ytagent FastAPI service via /api/v1/videos/detect and /api/v1/videos/{id}/metadata.
// Specification: docs/YTAGENT_INTEGRATION.md

import { Publisher, PublishRequest, PublishResult } from './types.js';
import { statSync, existsSync } from 'fs';
import { basename } from 'path';

export interface HttpPublisherOptions {
  baseUrl: string; // e.g. http://127.0.0.1:8000
  channelName: string;
}

export class HttpPublisher implements Publisher {
  private baseUrl: string;
  private channelName: string;

  constructor(opts: HttpPublisherOptions) {
    this.baseUrl = opts.baseUrl.replace(/\/+$/, '');
    this.channelName = opts.channelName;
  }

  async submit(req: PublishRequest): Promise<PublishResult> {
    if (!existsSync(req.videoPath)) {
      throw new Error(`Video file does not exist: ${req.videoPath}`);
    }

    const fileSize = statSync(req.videoPath).size;
    const filename = basename(req.videoPath);

    // 1. Notify ytagent of detected video
    const detectUrl = `${this.baseUrl}/api/v1/videos/detect`;
    const detectPayload = {
      filename,
      file_path: req.videoPath,
      file_size_bytes: fileSize,
      channel_name: this.channelName,
    };

    const detectRes = await fetch(detectUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(detectPayload),
    });

    if (!detectRes.ok) {
      const errText = await detectRes.text();
      throw new Error(`ytagent detect failed (HTTP ${detectRes.status}): ${errText}`);
    }

    const videoData = (await detectRes.json()) as { id: number };
    const videoId = videoData.id;

    // 2. Pre-set custom metadata (title, description, tags, category=28 Science & Tech)
    const metaUrl = `${this.baseUrl}/api/v1/videos/${videoId}/metadata`;
    const metaPayload = {
      title: req.metadata.title,
      description: req.metadata.description,
      tags: req.metadata.tags,
      category_id: req.metadata.categoryId ?? '28',
      ai_generated: req.metadata.containsSyntheticMedia ?? true,
      made_for_kids: req.metadata.madeForKids ?? false,
    };

    try {
      await fetch(metaUrl, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(metaPayload),
      });
    } catch (err) {
      console.warn(`[publisher] Failed to patch metadata for video ${videoId}:`, err);
    }

    return {
      ref: String(videoId),
      status: 'queued',
      channelName: this.channelName,
    };
  }

  async checkStatus(ref: string): Promise<{ status: string; youtubeId?: string; error?: string }> {
    const url = `${this.baseUrl}/api/v1/videos/${ref}`;
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`ytagent status check failed for video ${ref} (HTTP ${res.status})`);
    }

    const data = (await res.json()) as any;
    return {
      status: data.status,
      youtubeId: data.youtube_video_id,
      error: data.last_error,
    };
  }
}
