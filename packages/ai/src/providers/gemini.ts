// packages/ai/src/providers/gemini.ts
// Direct REST call to Google Gemini API (Google AI Studio)

import { ProviderCallParams } from '../types.js';

export async function callGemini(params: ProviderCallParams): Promise<string> {
  if (!params.apiKey) {
    throw new Error('Gemini API key is missing. Set GEMINI_API_KEY in .env');
  }

  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${params.model}:generateContent?key=${params.apiKey}`;

  const body: any = {
    contents: [
      {
        role: 'user',
        parts: [{ text: params.userPrompt }],
      },
    ],
    systemInstruction: {
      parts: [{ text: params.systemPrompt }],
    },
    generationConfig: {
      temperature: params.temperature,
      responseMimeType: 'application/json',
    },
  };

  if (params.supportsGrounding) {
    body.tools = [{ googleSearch: {} }];
  }

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Gemini API error (HTTP ${res.status}): ${errText}`);
  }

  const data = (await res.json()) as any;
  const candidate = data.candidates?.[0];
  if (!candidate || !candidate.content?.parts?.[0]?.text) {
    throw new Error('Gemini API returned an empty or invalid candidate');
  }

  return candidate.content.parts[0].text;
}
