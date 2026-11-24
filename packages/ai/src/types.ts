// packages/ai/src/types.ts
import { z } from 'zod';

export interface CallJsonOptions<T> {
  task: string;                       // e.g. 'spec_extract', 'copy_all'
  promptId: string;                   // e.g. 'spec_extract@v1'
  systemPrompt: string;
  userPrompt: string;
  schema: z.ZodType<T>;
  temperature?: number;
  skipCache?: boolean;
  cacheTtlDays?: number;              // default 30 days per ARCHITECTURE.md §5
  comparisonId?: string;              // tracks per-video LLM call cap (<= 8)
  requireGrounding?: boolean;         // prioritize providers with supportsGrounding: true
}

export interface LlmCallResult<T> {
  data: T;
  rawJson: string;
  provider: string;
  model: string;
  fromCache: boolean;
  attempts: number;
}

export interface ProviderCallParams {
  systemPrompt: string;
  userPrompt: string;
  temperature: number;
  apiKey?: string;
  baseUrl?: string;
  model: string;
  supportsGrounding?: boolean;
}
