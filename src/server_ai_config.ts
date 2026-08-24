import crypto from 'node:crypto';
import { getPgPool } from './db/dbClient';

export type AIProvider = 'GEMINI' | 'OPENAI_COMPATIBLE' | 'ANTHROPIC';

export interface AIConfig {
  enabled: boolean;
  provider: AIProvider;
  model: string;
  baseUrl: string;
  apiKeyConfigured: boolean;
  temperature: number;
  maxOutputTokens: number;
  updatedAt?: string;
}

type StoredRow = {
  enabled: boolean;
  provider: AIProvider;
  model: string;
  base_url: string;
  api_key_enc: string | null;
  api_key_iv: string | null;
  api_key_tag: string | null;
  temperature: number;
  max_output_tokens: number;
  updated_at: string;
};

const secretKey = () => {
  const raw = process.env.AI_CONFIG_SECRET || process.env.JWT_SECRET || '';
  if (!raw) throw new Error('AI_CONFIG_SECRET ou JWT_SECRET doit être configuré pour stocker la clé IA.');
  return crypto.createHash('sha256').update(raw).digest();
};

function encryptSecret(value: string) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', secretKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    enc: encrypted.toString('base64'),
    iv: iv.toString('base64'),
    tag: tag.toString('base64'),
  };
}

function decryptSecret(row: StoredRow) {
  if (!row.api_key_enc || !row.api_key_iv || !row.api_key_tag) return '';
  try {
    const decipher = crypto.createDecipheriv('aes-256-gcm', secretKey(), Buffer.from(row.api_key_iv, 'base64'));
    decipher.setAuthTag(Buffer.from(row.api_key_tag, 'base64'));
    return Buffer.concat([
      decipher.update(Buffer.from(row.api_key_enc, 'base64')),
      decipher.final(),
    ]).toString('utf8');
  } catch {
    return '';
  }
}

function fallbackConfig(): AIConfig {
  const provider = (process.env.AI_PROVIDER || 'OPENAI_COMPATIBLE').toUpperCase() as AIProvider;
  return {
    enabled: process.env.AI_ENABLED !== 'false',
    provider: ['GEMINI', 'OPENAI_COMPATIBLE', 'ANTHROPIC'].includes(provider) ? provider : 'OPENAI_COMPATIBLE',
    model: process.env.AI_MODEL || 'gpt-5.6',
    baseUrl: process.env.AI_BASE_URL || '',
    apiKeyConfigured: Boolean(process.env.AI_API_KEY),
    temperature: Number(process.env.AI_TEMPERATURE || 0.2),
    maxOutputTokens: Number(process.env.AI_MAX_OUTPUT_TOKENS || 4096),
  };
}

export async function ensureAIConfigTable() {
  const pool = getPgPool();
  if (!pool) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS ai_provider_config (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      enabled BOOLEAN NOT NULL DEFAULT TRUE,
      provider VARCHAR(32) NOT NULL DEFAULT 'OPENAI_COMPATIBLE',
      model VARCHAR(160) NOT NULL DEFAULT 'gpt-5.6',
      base_url TEXT NOT NULL DEFAULT 'https://api.openai.com/v1',
      api_key_enc TEXT,
      api_key_iv TEXT,
      api_key_tag TEXT,
      temperature NUMERIC(4,3) NOT NULL DEFAULT 0.2,
      max_output_tokens INTEGER NOT NULL DEFAULT 4096,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  const exists = await pool.query('SELECT 1 FROM ai_provider_config WHERE id=1');
  if (exists.rowCount) {
    // Migration des anciennes installations : le Copilot n'est plus dépendant de Gemini.
    const current = await pool.query<{provider:string}>('SELECT provider FROM ai_provider_config WHERE id=1');
    if (current.rows[0]?.provider === 'GEMINI' || current.rows[0]?.provider === 'ANTHROPIC') {
      const rawKey = process.env.AI_API_KEY || '';
      const encrypted = rawKey ? encryptSecret(rawKey) : null;
      await pool.query(`UPDATE ai_provider_config SET provider='OPENAI_COMPATIBLE', model=$1, base_url=$2, api_key_enc=$3, api_key_iv=$4, api_key_tag=$5, enabled=$6, updated_at=NOW() WHERE id=1`, [
        process.env.AI_MODEL || 'gpt-5.6', process.env.AI_BASE_URL || 'https://api.openai.com/v1', encrypted?.enc || null, encrypted?.iv || null, encrypted?.tag || null, process.env.AI_ENABLED !== 'false'
      ]);
    }
  }
  if (!exists.rowCount) {
    const fallback = fallbackConfig();
    const rawKey = process.env.AI_API_KEY || '';
    const encrypted = rawKey ? encryptSecret(rawKey) : null;
    await pool.query(
      `INSERT INTO ai_provider_config(id,enabled,provider,model,base_url,api_key_enc,api_key_iv,api_key_tag,temperature,max_output_tokens)
       VALUES(1,$1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [fallback.enabled, fallback.provider, fallback.model, fallback.baseUrl, encrypted?.enc || null, encrypted?.iv || null, encrypted?.tag || null, fallback.temperature, fallback.maxOutputTokens]
    );
  }
}

async function getStoredRow(): Promise<StoredRow | null> {
  const pool = getPgPool();
  if (!pool) return null;
  const result = await pool.query<StoredRow>('SELECT enabled,provider,model,base_url,api_key_enc,api_key_iv,api_key_tag,temperature,max_output_tokens,updated_at FROM ai_provider_config WHERE id=1');
  return result.rows[0] || null;
}

export async function getAIConfig(): Promise<AIConfig> {
  const row = await getStoredRow();
  if (!row) return fallbackConfig();
  return {
    enabled: Boolean(row.enabled),
    provider: row.provider,
    model: row.model,
    baseUrl: row.base_url || '',
    apiKeyConfigured: Boolean(row.api_key_enc),
    temperature: Number(row.temperature),
    maxOutputTokens: Number(row.max_output_tokens),
    updatedAt: row.updated_at,
  };
}

export async function getAISecret(): Promise<string> {
  const row = await getStoredRow();
  if (row) {
    const value = decryptSecret(row);
    if (value) return value;
  }
  return process.env.AI_API_KEY || '';
}

export async function saveAIConfig(input: Partial<AIConfig> & { apiKey?: string }) {
  const pool = getPgPool();
  if (!pool) throw new Error('PostgreSQL requis pour enregistrer la configuration IA.');
  await ensureAIConfigTable();
  const currentRow = await getStoredRow();
  const provider = input.provider || currentRow?.provider || 'OPENAI_COMPATIBLE';
  if (!['GEMINI', 'OPENAI_COMPATIBLE', 'ANTHROPIC'].includes(provider)) throw new Error('Fournisseur IA non supporté.');
  const model = input.model?.trim() || currentRow?.model || 'gpt-4o-mini';
  const baseUrl = (input.baseUrl ?? currentRow?.base_url ?? '').trim();
  const enabled = input.enabled ?? currentRow?.enabled ?? true;
  const temperature = Number.isFinite(input.temperature) ? Number(input.temperature) : Number(currentRow?.temperature ?? 0.2);
  const maxOutputTokens = Number.isFinite(input.maxOutputTokens) ? Math.max(128, Number(input.maxOutputTokens)) : Number(currentRow?.max_output_tokens ?? 4096);

  let encrypted = currentRow && currentRow.api_key_enc ? {
    enc: currentRow.api_key_enc,
    iv: currentRow.api_key_iv || '',
    tag: currentRow.api_key_tag || '',
  } : null;
  if (typeof input.apiKey === 'string' && input.apiKey.trim()) encrypted = encryptSecret(input.apiKey.trim());

  await pool.query(
    `INSERT INTO ai_provider_config(id,enabled,provider,model,base_url,api_key_enc,api_key_iv,api_key_tag,temperature,max_output_tokens,updated_at)
     VALUES(1,$1,$2,$3,$4,$5,$6,$7,$8,$9,NOW())
     ON CONFLICT(id) DO UPDATE SET enabled=EXCLUDED.enabled,provider=EXCLUDED.provider,model=EXCLUDED.model,base_url=EXCLUDED.base_url,
       api_key_enc=EXCLUDED.api_key_enc,api_key_iv=EXCLUDED.api_key_iv,api_key_tag=EXCLUDED.api_key_tag,
       temperature=EXCLUDED.temperature,max_output_tokens=EXCLUDED.max_output_tokens,updated_at=NOW()`,
    [enabled, provider, model, baseUrl, encrypted?.enc || null, encrypted?.iv || null, encrypted?.tag || null, temperature, maxOutputTokens]
  );
  return getAIConfig();
}

export function publicAIConfig(config: AIConfig) {
  return { ...config, apiKeyConfigured: config.apiKeyConfigured };
}
