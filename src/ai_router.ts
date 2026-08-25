import crypto from 'node:crypto';
import { getPgPool } from './db/dbClient';

export type AIProvider = 'GEMINI' | 'GROQ' | 'MISTRAL' | 'OPENROUTER';
export type AIRouteTask = 'document' | 'reasoning' | 'coding' | 'fast' | 'chat';

export interface AIRouteRequest {
  prompt: string;
  model?: string;
  task?: AIRouteTask;
  isJson?: boolean;
  accountId?: number;
  provider?: AIProvider;
}

export interface AIRouteResult {
  text: string;
  provider: AIProvider;
  model: string;
  accountId: number;
  accountName: string;
  fallbackCount: number;
}

const FREE_PROVIDERS = new Set<AIProvider>(['GEMINI', 'GROQ', 'MISTRAL', 'OPENROUTER']);

type GeminiModel = {
  id: string;
  name: string;
  family: string;
  status: 'stable' | 'preview' | 'deprecated';
  kind: 'text' | 'image' | 'audio' | 'video' | 'agent' | 'embedding' | 'robotics' | 'music';
  freeTier: boolean;
};

// Catalogue maintenu à partir de la documentation officielle Gemini API.
// freeTier=true signifie que Google documente un niveau gratuit pour ce modèle/capacité;
// l'accès réel reste contrôlé par le projet Google et ses quotas.
export const GEMINI_MODELS: GeminiModel[] = [
  {id:'gemini-3.7-flash',name:'Gemini 3.7 Flash',family:'Gemini 3',status:'stable',kind:'text',freeTier:true},
  {id:'gemini-3.6-flash',name:'Gemini 3.6 Flash',family:'Gemini 3',status:'stable',kind:'text',freeTier:true},
  {id:'gemini-3.5-flash',name:'Gemini 3.5 Flash',family:'Gemini 3',status:'stable',kind:'text',freeTier:true},
  {id:'gemini-3.5-flash-lite',name:'Gemini 3.5 Flash-Lite',family:'Gemini 3',status:'stable',kind:'text',freeTier:true},
  {id:'gemini-3.1-flash-lite',name:'Gemini 3.1 Flash-Lite',family:'Gemini 3',status:'stable',kind:'text',freeTier:true},
  {id:'gemini-3.1-flash-image',name:'Nano Banana 2',family:'Gemini 3',status:'stable',kind:'image',freeTier:false},
  {id:'gemini-3.1-flash-lite-image',name:'Nano Banana 2 Lite',family:'Gemini 3',status:'stable',kind:'image',freeTier:false},
  {id:'gemini-3-pro-image',name:'Nano Banana Pro',family:'Gemini 3',status:'stable',kind:'image',freeTier:false},
  {id:'gemini-3.1-pro-preview',name:'Gemini 3.1 Pro',family:'Gemini 3',status:'preview',kind:'text',freeTier:false},
  {id:'gemini-3-flash-preview',name:'Gemini 3 Flash',family:'Gemini 3',status:'preview',kind:'text',freeTier:false},
  {id:'gemini-3.5-live-translate-preview',name:'Gemini 3.5 Live Translate',family:'Gemini 3',status:'preview',kind:'audio',freeTier:true},
  {id:'gemini-3.1-flash-live-preview',name:'Gemini 3.1 Flash Live',family:'Gemini 3',status:'preview',kind:'audio',freeTier:false},
  {id:'gemini-3.1-flash-tts-preview',name:'Gemini 3.1 Flash TTS',family:'Gemini 3',status:'preview',kind:'audio',freeTier:false},
  {id:'gemini-omni-flash',name:'Gemini Omni Flash',family:'Gemini 3',status:'preview',kind:'video',freeTier:false},
  {id:'gemini-2.5-flash',name:'Gemini 2.5 Flash',family:'Gemini 2.5',status:'stable',kind:'text',freeTier:true},
  {id:'gemini-2.5-flash-image',name:'Nano Banana',family:'Gemini 2.5',status:'stable',kind:'image',freeTier:false},
  {id:'gemini-2.5-flash-native-audio-preview-12-2025',name:'Gemini 2.5 Flash Live',family:'Gemini 2.5',status:'preview',kind:'audio',freeTier:false},
  {id:'gemini-2.5-flash-preview-tts',name:'Gemini 2.5 Flash TTS',family:'Gemini 2.5',status:'preview',kind:'audio',freeTier:false},
  {id:'gemini-2.5-flash-lite',name:'Gemini 2.5 Flash-Lite',family:'Gemini 2.5',status:'stable',kind:'text',freeTier:true},
  {id:'gemini-2.5-pro',name:'Gemini 2.5 Pro',family:'Gemini 2.5',status:'stable',kind:'text',freeTier:false},
  {id:'gemini-2.5-pro-preview-tts',name:'Gemini 2.5 Pro TTS',family:'Gemini 2.5',status:'preview',kind:'audio',freeTier:false},
  {id:'veo-3.1-generate-preview',name:'Veo 3.1',family:'Media',status:'preview',kind:'video',freeTier:false},
  {id:'veo-3.1-lite-generate-preview',name:'Veo 3.1 Lite',family:'Media',status:'preview',kind:'video',freeTier:false},
  {id:'lyria-3-pro-preview',name:'Lyria 3 Pro',family:'Music',status:'preview',kind:'music',freeTier:false},
  {id:'lyria-3-clip-preview',name:'Lyria 3 Clip',family:'Music',status:'preview',kind:'music',freeTier:false},
  {id:'lyria-realtime-exp',name:'Lyria RealTime',family:'Music',status:'preview',kind:'music',freeTier:false},
  {id:'gemini-2.5-computer-use-preview-10-2025',name:'Gemini 2.5 Computer Use',family:'Tools',status:'preview',kind:'agent',freeTier:true},
  {id:'deep-research-preview-04-2026',name:'Gemini Deep Research',family:'Agents',status:'preview',kind:'agent',freeTier:false},
  {id:'deep-research-max-preview-04-2026',name:'Gemini Deep Research Max',family:'Agents',status:'preview',kind:'agent',freeTier:false},
  {id:'antigravity-preview-05-2026',name:'Antigravity Agent',family:'Agents',status:'preview',kind:'agent',freeTier:false},
  {id:'gemini-embedding-2-preview',name:'Gemini Embedding 2',family:'Embedding',status:'preview',kind:'embedding',freeTier:false},
  {id:'gemini-embedding-001',name:'Gemini Embedding',family:'Embedding',status:'stable',kind:'embedding',freeTier:false},
  {id:'gemini-robotics-er-2-preview',name:'Gemini Robotics ER 2',family:'Robotics',status:'preview',kind:'robotics',freeTier:false},
  {id:'gemini-robotics-er-1.6-preview',name:'Gemini Robotics ER 1.6',family:'Robotics',status:'preview',kind:'robotics',freeTier:false},
  // Conservés pour diagnostic historique uniquement : ces modèles sont arrêtés.
  {id:'gemini-2.0-flash',name:'Gemini 2.0 Flash (arrêté)',family:'Previous',status:'deprecated',kind:'text',freeTier:false},
  {id:'gemini-2.0-flash-lite',name:'Gemini 2.0 Flash-Lite (arrêté)',family:'Previous',status:'deprecated',kind:'text',freeTier:false},
  {id:'gemini-3.1-flash-lite-preview',name:'Gemini 3.1 Flash-Lite Preview (arrêté)',family:'Previous',status:'deprecated',kind:'text',freeTier:false},
  {id:'gemini-3-pro-preview',name:'Gemini 3 Pro Preview (arrêté)',family:'Previous',status:'deprecated',kind:'text',freeTier:false},
];

const GEMINI_MODEL_MAP = new Map(GEMINI_MODELS.map(m => [m.id, m]));

const PROVIDER_DEFAULTS: Record<AIProvider, { baseUrl: string; model: string; models: string[] }> = {
  GEMINI: {
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    model: 'gemini-3.7-flash',
    models: GEMINI_MODELS.filter(m => m.status !== 'deprecated').map(m => m.id)
  },
  GROQ: {
    baseUrl: 'https://api.groq.com/openai/v1',
    model: 'llama-3.1-8b-instant',
    models: ['llama-3.1-8b-instant']
  },
  MISTRAL: {
    baseUrl: 'https://api.mistral.ai/v1',
    model: 'mistral-small-latest',
    models: ['mistral-small-latest', 'ministral-3-8b-latest', 'ministral-3-14b-latest']
  },
  OPENROUTER: {
    baseUrl: 'https://openrouter.ai/api/v1',
    model: 'meta-llama/llama-3.3-70b-instruct:free',
    models: ['meta-llama/llama-3.3-70b-instruct:free','google/gemma-3-27b-it:free','qwen/qwen3-32b:free']
  }
};

const secretKey = () => {
  const s = process.env.AI_CONFIG_SECRET || process.env.JWT_SECRET || '';
  if (!s) throw new Error('AI_CONFIG_SECRET ou JWT_SECRET doit être configuré.');
  return crypto.createHash('sha256').update(s).digest();
};

const encrypt = (value: string) => {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', secretKey(), iv);
  const data = Buffer.concat([c.update(value, 'utf8'), c.final()]);
  return { enc: data.toString('base64'), iv: iv.toString('base64'), tag: c.getAuthTag().toString('base64') };
};

const decrypt = (row: any) => {
  if (!row.secret_enc || !row.secret_iv || !row.secret_tag) return '';
  try {
    const d = crypto.createDecipheriv('aes-256-gcm', secretKey(), Buffer.from(row.secret_iv, 'base64'));
    d.setAuthTag(Buffer.from(row.secret_tag, 'base64'));
    return Buffer.concat([d.update(Buffer.from(row.secret_enc, 'base64')), d.final()]).toString('utf8');
  } catch {
    return '';
  }
};

export function isFreeProvider(provider: string, model?: string) {
  if (!FREE_PROVIDERS.has(provider as AIProvider)) return false;
  if (provider === 'OPENROUTER') return String(model || '').endsWith(':free');
  if (provider === 'GEMINI') return GEMINI_MODEL_MAP.get(String(model || ''))?.freeTier === true;
  return true;
}

export function getGeminiModelCatalog() {
  return GEMINI_MODELS.map(m => ({ ...m }));
}

export function getGeminiFreeModels() {
  return GEMINI_MODELS.filter(m => m.status !== 'deprecated' && m.freeTier).map(m => m.id);
}

export async function ensureAIRouterTable() {
  const p = getPgPool();
  if (!p) return;
  await p.query(`
    CREATE TABLE IF NOT EXISTS ai_provider_accounts(
      id SERIAL PRIMARY KEY,
      name VARCHAR(120) NOT NULL,
      provider VARCHAR(40) NOT NULL,
      model VARCHAR(160) NOT NULL,
      base_url TEXT NOT NULL DEFAULT '',
      enabled BOOLEAN NOT NULL DEFAULT TRUE,
      priority INTEGER NOT NULL DEFAULT 100,
      auth_mode VARCHAR(30) NOT NULL DEFAULT 'API_KEY',
      secret_enc TEXT,
      secret_iv TEXT,
      secret_tag TEXT,
      account_email TEXT,
      last_error TEXT,
      last_used_at TIMESTAMPTZ,
      total_calls INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    ALTER TABLE ai_provider_accounts ADD COLUMN IF NOT EXISTS account_email TEXT;
    ALTER TABLE ai_provider_accounts ADD COLUMN IF NOT EXISTS disabled_until TIMESTAMPTZ;
    CREATE INDEX IF NOT EXISTS idx_ai_provider_accounts_route ON ai_provider_accounts(enabled,provider,priority);
    UPDATE ai_provider_accounts
      SET enabled=FALSE,
          last_error=COALESCE(last_error,'Provider désactivé : CLARITY fonctionne en mode FREE ONLY.')
      WHERE provider IN ('OPENAI','ANTHROPIC');
    UPDATE ai_provider_accounts
      SET enabled=FALSE,
          last_error=COALESCE(last_error,'Provider désactivé : modèle OpenRouter non marqué :free.')
      WHERE provider='OPENROUTER' AND model NOT LIKE '%:free';
  `);
}

function publicAccount(r: any) {
  return {
    id: Number(r.id), name: r.name, provider: r.provider, model: r.model,
    baseUrl: r.base_url || '', enabled: !!r.enabled, priority: Number(r.priority || 100),
    authMode: r.auth_mode, secretConfigured: !!r.secret_enc, accountEmail: r.account_email || null,
    lastError: r.last_error || null, lastUsedAt: r.last_used_at || null,
    totalCalls: Number(r.total_calls || 0), freeOnly: isFreeProvider(r.provider, r.model),
    disabledUntil: r.disabled_until || null
  };
}

export async function listAIRouterAccounts() {
  const p = getPgPool();
  if (!p) return [];
  await ensureAIRouterTable();
  const r = await p.query(`SELECT id,name,provider,model,base_url,enabled,priority,auth_mode,secret_enc,account_email,last_error,last_used_at,total_calls,disabled_until FROM ai_provider_accounts ORDER BY priority,id`);
  return r.rows.map(publicAccount);
}

export async function saveAIRouterAccount(input: {
  name: string; provider: AIProvider; model?: string; baseUrl?: string; secret: string; priority?: number; accountEmail?: string;
}) {
  if (!input.name || !input.provider || !input.secret) throw new Error('Nom, provider et credential sont obligatoires.');
  if (!FREE_PROVIDERS.has(input.provider)) throw new Error('Mode FREE ONLY : ce provider est désactivé.');
  const p = getPgPool();
  if (!p) throw new Error('PostgreSQL requis.');
  await ensureAIRouterTable();
  const defaults = PROVIDER_DEFAULTS[input.provider];
  const model = input.model?.trim() || defaults.model;
  if (input.provider === 'GEMINI' && !GEMINI_MODEL_MAP.has(model)) throw new Error(`Modèle Gemini inconnu: ${model}`);
  if (input.provider === 'GEMINI' && GEMINI_MODEL_MAP.get(model)?.status === 'deprecated') throw new Error(`Modèle Gemini arrêté: ${model}`);
  if (!isFreeProvider(input.provider, model)) throw new Error('Mode FREE ONLY : utilisez un modèle gratuit. OpenRouter doit utiliser un modèle suffixé :free.');
  const encrypted = encrypt(input.secret.trim());
  const baseUrl = (input.baseUrl?.trim() || defaults.baseUrl).replace(/\/+$/, '');
  const r = await p.query(`
    INSERT INTO ai_provider_accounts(name,provider,model,base_url,enabled,priority,auth_mode,secret_enc,secret_iv,secret_tag,account_email,disabled_until)
    VALUES ($1,$2,$3,$4,TRUE,$5,'API_KEY',$6,$7,$8,$9,NULL)
    RETURNING id,name,provider,model,base_url,enabled,priority,auth_mode,secret_enc,account_email,last_error,last_used_at,total_calls,disabled_until
  `, [input.name, input.provider, model, baseUrl, input.priority ?? 100, encrypted.enc, encrypted.iv, encrypted.tag, input.accountEmail || null]);
  return publicAccount(r.rows[0]);
}

export async function deleteAIRouterAccount(id: number) {
  const p = getPgPool();
  if (!p) throw new Error('PostgreSQL requis.');
  await p.query('DELETE FROM ai_provider_accounts WHERE id=$1', [id]);
}

function routeScore(provider: AIProvider, task: AIRouteTask) {
  const scores: Record<AIRouteTask, Partial<Record<AIProvider, number>>> = {
    document: { GEMINI: 100, MISTRAL: 92, OPENROUTER: 88, GROQ: 82 },
    reasoning: { GEMINI: 100, MISTRAL: 94, OPENROUTER: 90, GROQ: 80 },
    coding: { GEMINI: 100, GROQ: 96, MISTRAL: 92, OPENROUTER: 90 },
    fast: { GROQ: 100, GEMINI: 98, MISTRAL: 94, OPENROUTER: 85 },
    chat: { GEMINI: 100, MISTRAL: 94, GROQ: 92, OPENROUTER: 88 }
  };
  return scores[task][provider] || 0;
}

function inferTask(prompt: string): AIRouteTask {
  const p = prompt.toLowerCase();
  if (/(xlsx|excel|pdf|docx|document|fichier|feuille|tableau|jalon|tâche|tache|projet|risque)/.test(p)) return 'document';
  if (/(raisonne|raisonnement|architecture|analyse approfondie|compare|contradiction|diagnostic)/.test(p)) return 'reasoning';
  if (/(code|typescript|javascript|python|sql|bug|dévelop|develop|refactor)/.test(p)) return 'coding';
  if (/(rapide|résume|resume|classification|court)/.test(p)) return 'fast';
  return 'chat';
}

async function providerError(r: Response, provider: string) {
  const raw = await r.text();
  let d: any = {};
  try { d = raw ? JSON.parse(raw) : {}; } catch {}
  const message = d?.error?.message || d?.message || raw.slice(0, 700) || 'Erreur inconnue';
  const error: any = new Error(`${provider} HTTP ${r.status} — ${message}`);
  error.status = r.status;
  error.body = raw;
  return error;
}

async function callOpenAIStyle(baseUrl: string, apiKey: string, model: string, prompt: string, isJson: boolean, provider: AIProvider) {
  const r = await fetch(`${baseUrl.replace(/\/+$/, '')}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json',
      ...(provider === 'OPENROUTER' ? {'HTTP-Referer': process.env.APP_URL || 'https://clarity.ferjani.duckdns.org','X-Title':'CLARITY PM FREE AI Gateway'} : {})
    },
    body: JSON.stringify({
      model, messages: [{ role: 'user', content: prompt }], temperature: 0.2, max_tokens: 8192,
      ...(isJson ? { response_format: { type: 'json_object' } } : {})
    })
  });
  if (!r.ok) throw await providerError(r, provider);
  const d = await r.json() as any;
  return String(d?.choices?.[0]?.message?.content || '');
}

async function callGemini(baseUrl: string, apiKey: string, model: string, prompt: string, isJson: boolean) {
  const body: any = { contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: 0.2, maxOutputTokens: 8192 } };
  if (isJson) body.generationConfig.responseMimeType = 'application/json';
  const r = await fetch(`${baseUrl.replace(/\/+$/, '')}/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
  });
  if (!r.ok) throw await providerError(r, 'GEMINI');
  const d = await r.json() as any;
  return String(d?.candidates?.[0]?.content?.parts?.map((x:any) => x.text || '').join('') || '');
}

function isBillingExhausted(error: any) {
  const status = Number(error?.status || 0);
  const body = String(error?.body || error?.message || '').toLowerCase();
  return status === 402 || (status === 429 && /(no credits|credit balance|insufficient|billing|quota exceeded|exceeded your current quota|payment required)/.test(body));
}

function isRateLimited(error: any) {
  return Number(error?.status || 0) === 429 && !isBillingExhausted(error);
}

export async function routeAI(req: AIRouteRequest): Promise<AIRouteResult | null> {
  const p = getPgPool();
  if (!p) return null;
  await ensureAIRouterTable();
  const task = req.task || inferTask(req.prompt);
  const clauses = ['enabled=TRUE', `provider IN ('GEMINI','GROQ','MISTRAL','OPENROUTER')`, `(disabled_until IS NULL OR disabled_until <= NOW())`];
  const values: any[] = [];
  if (req.accountId) { values.push(req.accountId); clauses.push(`id=$${values.length}`); }
  if (req.provider) { values.push(req.provider); clauses.push(`provider=$${values.length}`); }

  const q = await p.query<any>(`SELECT * FROM ai_provider_accounts WHERE ${clauses.join(' AND ')}`, values);
  const rows = q.rows.filter((r:any) => isFreeProvider(r.provider, r.model)).sort((a,b) => {
    const sa = routeScore(a.provider, task) * 1000 - Number(a.priority || 100);
    const sb = routeScore(b.provider, task) * 1000 - Number(b.priority || 100);
    if (sb !== sa) return sb - sa;
    const la = a.last_used_at ? new Date(a.last_used_at).getTime() : 0;
    const lb = b.last_used_at ? new Date(b.last_used_at).getTime() : 0;
    if (la !== lb) return la - lb;
    return Number(a.total_calls || 0) - Number(b.total_calls || 0);
  });
  if (!rows.length) throw new Error('Aucun provider IA GRATUIT disponible. Ajoutez Gemini, Groq, Mistral ou un modèle OpenRouter :free dans Administration → AI Provider Hub.');

  let fallbackCount = 0;
  const errors: string[] = [];
  for (const row of rows) {
    const account = publicAccount(row);
    try {
      const secret = decrypt(row);
      if (!secret) throw new Error('Credential chiffrée indisponible.');
      const model = req.model || row.model;
      if (!isFreeProvider(row.provider, model)) throw new Error(`Modèle non gratuit refusé: ${model}`);
      let text = '';
      if (row.provider === 'GEMINI') text = await callGemini(row.base_url || PROVIDER_DEFAULTS.GEMINI.baseUrl, secret, model, req.prompt, !!req.isJson);
      else text = await callOpenAIStyle(row.base_url || PROVIDER_DEFAULTS[row.provider as AIProvider].baseUrl, secret, model, req.prompt, !!req.isJson, row.provider);
      if (!text.trim()) throw new Error('Réponse IA vide.');
      await p.query('UPDATE ai_provider_accounts SET last_error=NULL,last_used_at=NOW(),total_calls=total_calls+1,disabled_until=NULL,updated_at=NOW() WHERE id=$1', [row.id]);
      return { text, provider: row.provider, model, accountId: row.id, accountName: row.name, fallbackCount };
    } catch (e:any) {
      const msg = String(e?.message || e).slice(0, 1000);
      errors.push(`${row.name}: ${msg}`);
      if (Number(e?.status || 0) === 404) {
        await p.query(`UPDATE ai_provider_accounts SET last_error=$1,disabled_until=NOW()+INTERVAL '6 hours',updated_at=NOW() WHERE id=$2`, [`Modèle indisponible pour ce compte — nouvelle tentative dans 6h — ${msg}`, row.id]);
      } else if (isBillingExhausted(e)) {
        await p.query(`UPDATE ai_provider_accounts SET enabled=FALSE,last_error=$1,disabled_until=NULL,updated_at=NOW() WHERE id=$2`, [`Compte désactivé automatiquement — ${msg}`, row.id]);
      } else if (isRateLimited(e)) {
        await p.query(`UPDATE ai_provider_accounts SET last_error=$1,disabled_until=NOW()+INTERVAL '60 seconds',updated_at=NOW() WHERE id=$2`, [`Rate limit temporaire — retry après 60s — ${msg}`, row.id]);
      } else {
        await p.query('UPDATE ai_provider_accounts SET last_error=$1 WHERE id=$2', [msg, row.id]);
      }
      fallbackCount++;
    }
  }
  throw new Error(`Tous les providers IA GRATUITS ont échoué. ${errors.join(' | ')}`);
}

export function getFreeProviderCatalog() {
  return Object.entries(PROVIDER_DEFAULTS).map(([provider, v]) => ({ provider, baseUrl: v.baseUrl, defaultModel: v.model, models: v.models }));
}
