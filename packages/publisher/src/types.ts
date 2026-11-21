// packages/publisher/src/types.ts
// Publisher interfaces and request/response types.
// Specification: docs/MODULES.md §9 and docs/YTAGENT_INTEGRATION.md

export interface YtMetadata {
  title: string;
  description: string;
  tags: string[];
  categoryId?: string; // '28' = Science & Technology
  language?: string;
  madeForKids?: boolean;
  containsSyntheticMedia?: boolean;
  chapters?: Array<{ t: number; label: string }>;
}

export interface PublishRequest {
  videoPath: string;
  format: 'long' | 'short';
  thumbnailPath?: string;
  metadata: YtMetadata;
  visibility?: 'private' | 'unlisted' | 'public';
  publishAt?: string;
  linkedTo?: string; // e.g. cross-link URL
}

export interface PublishResult {
  ref: string;
  status: 'queued' | 'uploaded' | 'scheduled';
  youtubeId?: string;
  channelName?: string;
}

export interface Publisher {
  submit(req: PublishRequest): Promise<PublishResult>;
  checkStatus(ref: string): Promise<{ status: string; youtubeId?: string; error?: string }>;
}
