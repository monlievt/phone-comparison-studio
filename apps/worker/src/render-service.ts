// apps/worker/src/render-service.ts
// Handles actual video rendering using Remotion CLI and @remotion/renderer.
// Specification: docs/ARCHITECTURE.md §4 and docs/VIDEO_SPEC.md §7

import { spawn } from 'child_process';
import { existsSync, mkdirSync, writeFileSync, unlinkSync } from 'fs';
import { dirname, resolve } from 'path';

export interface RenderOptions {
  compositionId: string;
  inputProps: { comparison: Record<string, unknown>; format?: string; text?: string; [key: string]: unknown };
  outputPath: string;
  isThumbnail?: boolean;
  scale?: number;
  crf?: number;
  onProgress?: (progress: number) => void;
}

export class RemotionRenderService {
  private videoEntryPath: string;
  private rendersDir: string;

  constructor(videoEntryPath: string, rendersDir: string) {
    this.videoEntryPath = videoEntryPath;
    this.rendersDir = rendersDir;

    if (!existsSync(this.rendersDir)) {
      mkdirSync(this.rendersDir, { recursive: true });
    }
  }

  /**
   * Renders a still image (YouTube thumbnail 1280x720).
   */
  async renderThumbnail(opts: RenderOptions): Promise<string> {
    const absOutputPath = resolve(opts.outputPath);
    const parentDir = dirname(absOutputPath);
    if (!existsSync(parentDir)) {
      mkdirSync(parentDir, { recursive: true });
    }

    const tempPropsFile = `${absOutputPath}.props.json`;
    writeFileSync(tempPropsFile, JSON.stringify(opts.inputProps), 'utf-8');

    console.log(`[render-service] Rendering thumbnail (${opts.compositionId}) to: ${absOutputPath}`);

    const args = [
      'remotion',
      'still',
      'src/index.ts',
      opts.compositionId,
      absOutputPath,
      `--props=${tempPropsFile}`,
      '--image-format=png',
    ];

    try {
      await this.runProcess('npx', args, opts.onProgress);
      return absOutputPath;
    } finally {
      if (existsSync(tempPropsFile)) {
        try { unlinkSync(tempPropsFile); } catch {}
      }
    }
  }

  /**
   * Renders an MP4 video (Long 16:9 or Short 9:16).
   */
  async renderVideo(opts: RenderOptions): Promise<string> {
    const absOutputPath = resolve(opts.outputPath);
    const parentDir = dirname(absOutputPath);
    if (!existsSync(parentDir)) {
      mkdirSync(parentDir, { recursive: true });
    }

    const tempPropsFile = `${absOutputPath}.props.json`;
    writeFileSync(tempPropsFile, JSON.stringify(opts.inputProps), 'utf-8');

    const isPreview = opts.scale && opts.scale < 1.0;
    const concurrency = isPreview ? 2 : 1; // Final render strictly concurrency 1 per ARCHITECTURE.md §1
    const crf = opts.crf ?? (isPreview ? 30 : 18);
    const scale = opts.scale ?? 1.0;

    console.log(`[render-service] Rendering video (${opts.compositionId}) to: ${absOutputPath}`);

    const args = [
      'remotion',
      'render',
      'src/index.ts',
      opts.compositionId,
      absOutputPath,
      `--props=${tempPropsFile}`,
      '--codec=h264',
      `--concurrency=${concurrency}`,
      `--crf=${crf}`,
      `--scale=${scale}`,
    ];

    try {
      await this.runProcess('npx', args, opts.onProgress);
      console.log(`[render-service] Video render completed: ${absOutputPath}`);
      return absOutputPath;
    } finally {
      if (existsSync(tempPropsFile)) {
        try { unlinkSync(tempPropsFile); } catch {}
      }
    }
  }

  private runProcess(cmd: string, args: string[], onProgress?: (pct: number) => void): Promise<void> {
    const pkgVideoDir = dirname(dirname(this.videoEntryPath));
    const quotedArgs = args.map((a) => (a.includes(' ') || a.includes('"') ? `"${a.replace(/"/g, '\\"')}"` : a));
    const commandLine = `${cmd} ${quotedArgs.join(' ')}`;

    return new Promise((resolve, reject) => {
      const proc = spawn(commandLine, {
        cwd: pkgVideoDir,
        shell: true,
      });

      let fullOutput = '';
      let errOutput = '';

      proc.stdout?.on('data', (data) => {
        const text = data.toString();
        fullOutput += text;
        // Parse progress e.g. "Rendering frames 120/750" or "Encoding video 50/750"
        const match = text.match(/(?:Rendering frames|Encoding video)\s+(\d+)\/(\d+)/);
        if (match && onProgress) {
          const current = parseInt(match[1], 10);
          const total = parseInt(match[2], 10);
          if (total > 0) {
            const pct = Math.round((current / total) * 100);
            onProgress(pct);
          }
        }
      });

      proc.stderr?.on('data', (data) => {
        const text = data.toString();
        errOutput += text;
        fullOutput += text;
      });

      proc.on('close', (code) => {
        if (code === 0) {
          resolve();
        } else {
          console.error(`[render-service] Command failed (exit code ${code}):\n${fullOutput}`);
          reject(new Error(`Remotion CLI exited with code ${code}:\n${(errOutput || fullOutput).slice(-2000)}`));
        }
      });

      proc.on('error', (err) => {
        reject(err);
      });
    });
  }
}
