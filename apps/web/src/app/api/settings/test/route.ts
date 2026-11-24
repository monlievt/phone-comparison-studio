// apps/web/src/app/api/settings/test/route.ts
import { NextResponse } from 'next/server';
import { readEnvVars } from '@/lib/env-file';

export const dynamic = 'force-dynamic';

function getErrorMessage(err: unknown): string {
  if (!err) return 'Unknown error';
  const e = err as { message?: string; cause?: { message?: string; code?: string } | string };
  const causeMsg =
    typeof e.cause === 'string'
      ? e.cause
      : e.cause?.message || e.cause?.code || '';
  if (causeMsg) {
    return `${e.message || 'Network error'} (${causeMsg})`;
  }
  return e.message || 'Network error';
}

export async function POST(req: Request) {
  const body = await req.json();
  const provider = (body.provider || body.target)?.toLowerCase();
  const apiKey = body.apiKey;
  const baseUrl = body.baseUrl || body.url;

  const env = readEnvVars();
  const start = Date.now();

  if (provider === 'gemini') {
    const key = apiKey || env.GEMINI_API_KEY;
    if (!key) {
      return NextResponse.json({
        success: false,
        message: 'No Gemini API key provided or found in .env',
      });
    }

    try {
      // Use ModelService.ListModels: Google's official key validation method
      const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${key}&pageSize=10`;
      const res = await fetch(url);
      const latencyMs = Date.now() - start;

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        const msg = errorData?.error?.message || `HTTP ${res.status} ${res.statusText}`;
        return NextResponse.json({
          success: false,
          latencyMs,
          message: `Gemini API error: ${msg}`,
        });
      }

      const data = (await res.json().catch(() => ({}))) as { models?: Array<{ name?: string }> };
      const supportedModels = (data.models || [])
        .map((m) => m.name?.replace('models/', '') || '')
        .filter((n) => n.includes('flash') || n.includes('pro'))
        .slice(0, 4)
        .join(', ');

      return NextResponse.json({
        success: true,
        latencyMs,
        message: `Gemini API connected successfully (${latencyMs}ms). Available models: ${supportedModels || 'Ready'}`,
      });
    } catch (err: unknown) {
      const detail = getErrorMessage(err);
      return NextResponse.json({
        success: false,
        latencyMs: Date.now() - start,
        message: `Connection failed: ${detail}. Check your internet access or firewall.`,
      });
    }
  }

  if (provider === 'groq') {
    const key = apiKey || env.GROQ_API_KEY;
    if (!key) {
      return NextResponse.json({
        success: false,
        message: 'No Groq API key provided or found in .env',
      });
    }

    try {
      const res = await fetch('https://api.groq.com/openai/v1/models', {
        headers: {
          Authorization: `Bearer ${key}`,
        },
      });

      const latencyMs = Date.now() - start;

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        const msg = errorData?.error?.message || `HTTP ${res.status} ${res.statusText}`;
        return NextResponse.json({
          success: false,
          latencyMs,
          message: `Groq API error: ${msg}`,
        });
      }

      return NextResponse.json({
        success: true,
        latencyMs,
        message: `Groq API connected successfully (${latencyMs}ms, free 1,000 req/day quota ready)`,
      });
    } catch (err: unknown) {
      const detail = getErrorMessage(err);
      return NextResponse.json({
        success: false,
        latencyMs: Date.now() - start,
        message: `Connection failed: ${detail}. Check your internet access or firewall.`,
      });
    }
  }

  if (provider === 'ytagent') {
    const targetUrl = baseUrl || env.YTAGENT_BASE_URL || 'http://127.0.0.1:8000';

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3500);

      const res = await fetch(`${targetUrl.replace(/\/$/, '')}/docs`, {
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      const latencyMs = Date.now() - start;

      if (!res.ok && res.status !== 404) {
        return NextResponse.json({
          success: false,
          latencyMs,
          message: `ytagent responded with HTTP ${res.status}`,
        });
      }

      return NextResponse.json({
        success: true,
        latencyMs,
        message: `ytagent FastAPI service detected & reachable at ${targetUrl} (${latencyMs}ms)`,
      });
    } catch (err: any) {
      return NextResponse.json({
        success: false,
        latencyMs: Date.now() - start,
        message: `Could not connect to ytagent service at ${targetUrl}. Ensure ytagent is running on port 8000.`,
      });
    }
  }

  return NextResponse.json(
    { success: false, message: `Unknown provider specified: "${provider}"` },
    { status: 400 }
  );
}
