// apps/web/src/app/api/upload/route.ts
import { NextResponse } from 'next/server';
import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // 10 MB

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    const rawPhoneId = String(formData.get('phoneId') || 'custom');
    const safePhoneId = rawPhoneId.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 48) || 'custom';

    if (!file) {
      return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });
    }

    if (file.size > MAX_UPLOAD_BYTES) {
      return NextResponse.json({ error: 'Image exceeds 10 MB limit' }, { status: 413 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const rawExt = file.name.split('.').pop()?.toLowerCase() || 'png';
    const ext = ['png', 'jpg', 'jpeg', 'webp'].includes(rawExt) ? rawExt : 'png';
    const filename = `${safePhoneId}-photo-${Date.now()}.${ext}`;

    // Single source of truth: packages/video/public/phones (served by both Remotion staticFile and /api/phones/[file])
    const rootDir = process.cwd().includes('apps/web')
      ? join(process.cwd(), '../..')
      : process.cwd();
    const destDir = join(rootDir, 'packages', 'video', 'public', 'phones');

    await mkdir(destDir, { recursive: true });
    await writeFile(join(destDir, filename), buffer);

    const relativePath = `phones/${filename}`;

    return NextResponse.json({
      success: true,
      filePath: relativePath,
      filename,
    });
  } catch (err: unknown) {
    console.error('File upload failed:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Upload failed' },
      { status: 500 }
    );
  }
}
