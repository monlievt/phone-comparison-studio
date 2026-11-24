// apps/web/src/app/api/settings/keys/route.ts
import { NextResponse } from 'next/server';
import { readEnvVars, updateEnvVars } from '@/lib/env-file';
import { writeAuditLog } from '@phone-studio/core';
import { getDb } from '@/lib/db';

export const dynamic = 'force-dynamic';

function maskSecret(val?: string): string {
  if (!val || val.length < 8) return val ? '••••••••' : '';
  return `${val.slice(0, 4)}••••${val.slice(-4)}`;
}

export async function GET() {
  const env = readEnvVars();

  return NextResponse.json({
    geminiApiKeyMasked: maskSecret(env.GEMINI_API_KEY),
    groqApiKeyMasked: maskSecret(env.GROQ_API_KEY),
    telegramBotTokenMasked: maskSecret(env.TELEGRAM_BOT_TOKEN),
    telegramChatId: env.TELEGRAM_CHAT_ID || '',
    appBaseUrl: env.APP_BASE_URL || 'http://127.0.0.1:3000',
    ytagentBaseUrl: env.YTAGENT_BASE_URL || 'http://127.0.0.1:8000',
    ytagentChannelName: env.YTAGENT_CHANNEL_NAME || '',
    hasGemini: Boolean(env.GEMINI_API_KEY),
    hasGroq: Boolean(env.GROQ_API_KEY),
    hasTelegram: Boolean(env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_CHAT_ID),
  });
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      geminiApiKey?: string;
      groqApiKey?: string;
      telegramBotToken?: string;
      telegramChatId?: string;
      appBaseUrl?: string;
      ytagentBaseUrl?: string;
      ytagentChannelName?: string;
    };

    const updates: Record<string, string> = {};
    if (typeof body.geminiApiKey === 'string' && !body.geminiApiKey.includes('••••')) {
      updates.GEMINI_API_KEY = body.geminiApiKey.trim();
    }
    if (typeof body.groqApiKey === 'string' && !body.groqApiKey.includes('••••')) {
      updates.GROQ_API_KEY = body.groqApiKey.trim();
    }
    if (typeof body.telegramBotToken === 'string' && !body.telegramBotToken.includes('••••')) {
      updates.TELEGRAM_BOT_TOKEN = body.telegramBotToken.trim();
    }
    if (typeof body.telegramChatId === 'string') {
      updates.TELEGRAM_CHAT_ID = body.telegramChatId.trim();
    }
    if (typeof body.appBaseUrl === 'string') {
      updates.APP_BASE_URL = body.appBaseUrl.trim();
    }
    if (typeof body.ytagentBaseUrl === 'string') {
      updates.YTAGENT_BASE_URL = body.ytagentBaseUrl.trim();
    }
    if (typeof body.ytagentChannelName === 'string') {
      updates.YTAGENT_CHANNEL_NAME = body.ytagentChannelName.trim();
    }

    updateEnvVars(updates);
    writeAuditLog(getDb(), 'owner', 'update_api_keys', '.env', { keysUpdated: Object.keys(updates) });

    return NextResponse.json({ success: true, message: 'Configuration saved to .env' });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to update .env';
    return NextResponse.json(
      { success: false, error: { code: 'ENV_UPDATE_FAILED', message } },
      { status: 500 }
    );
  }
}
