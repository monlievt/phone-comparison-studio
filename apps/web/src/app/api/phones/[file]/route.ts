// apps/web/src/app/api/phones/[file]/route.ts
import { NextResponse } from 'next/server';
import { createReadStream, existsSync, statSync } from 'fs';
import { join } from 'path';

export async function GET(
  req: Request,
  { params }: { params: Promise<{ file: string }> }
) {
  const { file } = await params;
  const sanitized = file.replace(/[^a-zA-Z0-9_\-\.]/g, '');

  const rootDir = process.cwd().includes('apps/web')
    ? join(process.cwd(), '../..')
    : process.cwd();

  // Search candidate paths in order
  const candidatePaths = [
    join(rootDir, 'apps', 'web', 'public', 'phones', sanitized),
    join(rootDir, 'packages', 'video', 'public', 'phones', sanitized),
    join(rootDir, 'data', 'assets', 'phones', sanitized),
  ];

  let foundPath: string | null = null;
  for (const p of candidatePaths) {
    if (existsSync(p)) {
      foundPath = p;
      break;
    }
  }

  if (!foundPath) {
    return NextResponse.json({ error: 'Phone image not found' }, { status: 404 });
  }

  const stat = statSync(foundPath);
  const ext = sanitized.split('.').pop()?.toLowerCase();
  const contentType = ext === 'png'
    ? 'image/png'
    : ext === 'webp'
    ? 'image/webp'
    : 'image/jpeg';

  const fileStream = createReadStream(foundPath);

  return new Response(fileStream as any, {
    status: 200,
    headers: {
      'Content-Length': stat.size.toString(),
      'Content-Type': contentType,
      'Cache-Control': 'public, max-age=86400, stale-while-revalidate=604800',
    },
  });
}
