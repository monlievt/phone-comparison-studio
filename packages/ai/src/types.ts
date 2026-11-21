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
