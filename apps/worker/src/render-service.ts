// apps/worker/src/render-service.ts
// Handles actual video rendering using @remotion/bundler and @remotion/renderer.
// Specification: docs/ARCHITECTURE.md §4 and docs/VIDEO_SPEC.md §7

import { bundle } from '@remotion/bundler';
import { renderMedia, renderStill, selectComposition } from '@remotion/renderer';
import { join } from 'path';
import { existsSync, mkdirSync } from 'fs';

export interface RenderOptions {
  compositionId: string;
  inputProps: { comparison: any };
  outputPath: string;
  isThumbnail?: boolean;
  scale?: number;
  crf?: number;
  onProgress?: (progress: number) => void;
}

export class RemotionRenderService {
  private bundleLocation: string | null = null;
  private videoEntryPath: string;
  private rendersDir: string;
  private isBundling = false;

  constructor(videoEntryPath: string, rendersDir: string) {
    this.videoEntryPath = videoEntryPath;
    this.rendersDir = rendersDir;

    if (!existsSync(this.rendersDir)) {
      mkdirSync(this.rendersDir, { recursive: true });
    }
  }

  /**
   * Bundles the Remotion project once and reuses the bundle location across renders.
   */
  async ensureBundled(): Promise<string> {
    if (this.bundleLocation) return this.bundleLocation;
    if (this.isBundling) {
      // Wait for ongoing bundling to complete
      while (this.isBundling) {
        await new Promise((r) => setTimeout(r, 500));
      }
      if (this.bundleLocation) return this.bundleLocation;
    }

    this.isBundling = true;
    console.log('[render-service] Bundling Remotion video project (one-time operation)...');

    try {
      this.bundleLocation = await bundle({
        entryPoint: this.videoEntryPath,
        webpackOverride: (config) => config,
      });
      console.log('[render-service] Remotion project bundled successfully at:', this.bundleLocation);
      return this.bundleLocation;
    } finally {
      this.isBundling = false;
    }
  }

  /**
   * Renders a still image (YouTube thumbnail 1280x720).
   */
  async renderThumbnail(opts: RenderOptions): Promise<string> {
    const bundleLocation = await this.ensureBundled();

    const composition = await selectComposition({
      serveUrl: bundleLocation,
      id: opts.compositionId,
      inputProps: opts.inputProps,
    });

    console.log(`[render-service] Rendering thumbnail (${opts.compositionId}) to: ${opts.outputPath}`);

    await renderStill({
      composition,
      serveUrl: bundleLocation,
      output: opts.outputPath,
      inputProps: opts.inputProps,
      imageFormat: 'png',
    });

    return opts.outputPath;
  }

  /**
   * Renders an MP4 video (Long 16:9 or Short 9:16).
   */
  async renderVideo(opts: RenderOptions): Promise<string> {
    const bundleLocation = await this.ensureBundled();

    const composition = await selectComposition({
      serveUrl: bundleLocation,
      id: opts.compositionId,
      inputProps: opts.inputProps,
    });

    console.log(`[render-service] Rendering video (${opts.compositionId}) to: ${opts.outputPath}`);

    const isPreview = opts.scale && opts.scale < 1.0;

    await renderMedia({
      composition,
      serveUrl: bundleLocation,
      codec: 'h264',
      outputLocation: opts.outputPath,
      inputProps: opts.inputProps,
      crf: opts.crf ?? (isPreview ? 30 : 18),
      scale: opts.scale ?? 1.0,
      concurrency: isPreview ? 2 : 1, // Final render strictly concurrency 1 per ARCHITECTURE.md §1
      onProgress: ({ renderedFrames, totalFrames }) => {
        if (totalFrames > 0 && opts.onProgress) {
          const pct = Math.round((renderedFrames / totalFrames) * 100);
          opts.onProgress(pct);
        }
      },
    });

    console.log(`[render-service] Video render completed: ${opts.outputPath}`);
    return opts.outputPath;
  }
}
