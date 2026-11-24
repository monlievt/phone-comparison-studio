// apps/web/src/app/api/renders/[file]/route.ts
import { NextResponse } from 'next/server';
import { createReadStream, existsSync, statSync } from 'fs';
import { join } from 'path';

export async function GET(
  req: Request,
  { params }: { params: Promise<{ file: string }> }
) {
  const { file } = await params;
  // Security sanitize: only allow alphanumeric, dash, underscore, dot
  const sanitized = file.replace(/[^a-zA-Z0-9_\-\.]/g, '');
  const rootDir = process.cwd().includes('apps/web')
    ? join(process.cwd(), '../..')
    : process.cwd();

  const filePath = join(rootDir, 'data', 'renders', sanitized);

  if (!existsSync(filePath)) {
    return NextResponse.json({ error: 'Render file not found' }, { status: 404 });
  }

  const stat = statSync(filePath);
  const fileSize = stat.size;
  const contentType = sanitized.endsWith('.png')
    ? 'image/png'
    : sanitized.endsWith('.jpg') || sanitized.endsWith('.jpeg')
    ? 'image/jpeg'
    : 'video/mp4';

  const range = req.headers.get('range');

  if (range && contentType === 'video/mp4') {
    const parts = range.replace(/bytes=/, '').split('-');
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
    const chunksize = end - start + 1;
    const fileStream = createReadStream(filePath, { start, end });

    // Stream range response for smooth video seeking
    return new Response(fileStream as any, {
      status: 206,
      headers: {
        'Content-Range': `bytes ${start}-${end}/${fileSize}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunksize.toString(),
        'Content-Type': contentType,
      },
    });
  }

  const fileStream = createReadStream(filePath);
  return new Response(fileStream as any, {
    headers: {
      'Content-Length': fileSize.toString(),
      'Content-Type': contentType,
      'Accept-Ranges': 'bytes',
    },
  });
}
