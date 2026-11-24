// packages/ai/src/providers/openai-compat.ts
// Provider for Groq and OpenAI-compatible JSON mode APIs

import { ProviderCallParams } from '../types.js';

export async function callOpenAiCompat(params: ProviderCallParams): Promise<string> {
  const baseUrl = params.baseUrl ?? 'https://api.groq.com/openai/v1';
  if (!params.apiKey) {
    throw new Error(`API key is missing for OpenAI-compatible provider (${baseUrl})`);
  }

  const endpoint = `${baseUrl.replace(/\/+$/, '')}/chat/completions`;

  const body = {
    model: params.model,
    messages: [
      { role: 'system', content: params.systemPrompt },
      { role: 'user', content: params.userPrompt },
    ],
    temperature: params.temperature ?? 0.1,
    response_format: { type: 'json_object' },
  };

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${params.apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`OpenAI-compatible API error (${baseUrl}) (HTTP ${res.status}): ${errText}`);
  }

  const data = (await res.json()) as any;
  const content = data.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error('OpenAI-compatible API returned empty message content');
  }

  let text = content.trim();
  if (text.startsWith('```')) {
    text = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
  }

  return text;
}
