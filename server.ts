import 'dotenv/config';
import express, { Request, Response, NextFunction } from 'express';
import path from 'path';
import fs from 'fs';
import crypto from 'node:crypto';
import multer from 'multer';
import * as XLSX from 'xlsx';
import { createServer as createViteServer } from 'vite';
import { dbStore, getPgPool } from './src/db/dbClient';
import { UserRole, MicrosoftUser, UserProfile, Project } from './src/types';
import { ensureAIConfigTable, getAIConfig, getAISecret, publicAIConfig, saveAIConfig } from './src/server_ai_config';
import { ensureAIGatewayTable, callGatewayText } from './src/ai_gateway';
import { ensureAIRouterTable, listAIRouterAccounts, saveAIRouterAccount, deleteAIRouterAccount, getGeminiModelCatalog } from './src/ai_router';

const app = express();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });
const PORT = Number(process.env.PORT || 3000);
const SESSION_COOKIE = 'pm_session';
const SESSION_TTL_SECONDS = 8 * 60 * 60;
const OAUTH_STATE_TTL_MS = 10 * 60 * 1000;

app.disable('x-powered-by');
app.use(express.json({ limit: '2mb' }));
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  next();
});

interface MicrosoftSessionUser {
  id: string; displayName: string; email: string; role: UserRole;
  jobTitle?: string; department?: string; officeLocation?: string; avatarUrl?: string;
  tenantId?: string; authProvider: 'MICROSOFT_ENTRA' | 'MICROSOFT_LIVE' | 'LOCAL' | 'DEMO'; connectedAt: string;
}

const ROLE_VALUES: UserRole[] = ['ADMINISTRATEUR','DIRECTEUR_PROJETS','PMO','CHEF_PROJET','CONTRIBUTEUR'];
const roleForEmail = (email: string): UserRole => {
  const normalized = email.toLowerCase();
  const adminEmails = (process.env.ADMIN_EMAILS || '').split(',').map(v=>v.trim().toLowerCase()).filter(Boolean);
  const directorEmails = (process.env.DIRECTOR_EMAILS || '').split(',').map(v=>v.trim().toLowerCase()).filter(Boolean);
  const pmoEmails = (process.env.PMO_EMAILS || '').split(',').map(v=>v.trim().toLowerCase()).filter(Boolean);
  if (adminEmails.includes(normalized)) return 'ADMINISTRATEUR';
  if (directorEmails.includes(normalized)) return 'DIRECTEUR_PROJETS';
  if (pmoEmails.includes(normalized)) return 'PMO';
  return 'CHEF_PROJET';
};

const secret = () => process.env.JWT_SECRET || (process.env.NODE_ENV === 'production' ? '' : 'development-only-change-me');
function signSession(user: MicrosoftSessionUser) {
  const key = secret(); if (!key) throw new Error('JWT_SECRET doit être configuré en production.');
  const payload = Buffer.from(JSON.stringify({ user, exp: Math.floor(Date.now()/1000)+SESSION_TTL_SECONDS })).toString('base64url');
  const sig = crypto.createHmac('sha256', key).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}
function verifySession(token?: string): MicrosoftSessionUser | null {
  if (!token) return null; const key=secret(); if(!key) return null;
  const [payload,sig]=token.split('.'); if(!payload||!sig)return null;
  const expected=crypto.createHmac('sha256',key).update(payload).digest('base64url');
  if(sig.length!==expected.length || !crypto.timingSafeEqual(Buffer.from(sig),Buffer.from(expected)))return null;
  try { const data=JSON.parse(Buffer.from(payload,'base64url').toString()); if(data.exp < Math.floor(Date.now()/1000)) return null; return data.user as MicrosoftSessionUser; } catch { return null; }
}
function parseCookies(header='') { return Object.fromEntries(header.split(';').map(v=>v.trim().split('=').map(decodeURIComponent)).filter(v=>v.length===2)); }
function setSession(res: Response, user: MicrosoftSessionUser) {
  const appUrl = process.env.APP_URL || '';
  const secureCookie = process.env.COOKIE_SECURE === 'true' || (process.env.COOKIE_SECURE !== 'false' && appUrl.startsWith('https://'));
  const secure = secureCookie ? '; Secure' : '';
  res.setHeader('Set-Cookie', `${SESSION_COOKIE}=${encodeURIComponent(signSession(user))}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_TTL_SECONDS}${secure}`);
}
function clearSession(res: Response) { res.setHeader('Set-Cookie', `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`); }
function getUserFromRequest(req: Request): MicrosoftSessionUser | null { return verifySession(parseCookies(req.headers.cookie || '')[SESSION_COOKIE]); }
function requireAuth(req: Request, res: Response, next: NextFunction) {
  const user=getUserFromRequest(req); if(!user)return res.status(401).json({error:'Authentification requise.'});
  (req as any).user=user; next();
}
const currentUser = (req: Request) => (req as any).user as MicrosoftSessionUser;

const RBAC = {
  canCreateOrDeleteProject:(r:UserRole)=>r==='DIRECTEUR_PROJETS',
  canManageProject:(r:UserRole)=>r==='DIRECTEUR_PROJETS'||r==='CHEF_PROJET'||r==='PMO',
  canManageResources:(r:UserRole)=>r==='DIRECTEUR_PROJETS'||r==='CHEF_PROJET',
  canManageTasks:(r:UserRole)=>r==='DIRECTEUR_PROJETS'||r==='CHEF_PROJET'||r==='PMO'||r==='CONTRIBUTEUR',
  canManageRisks:(r:UserRole)=>r==='DIRECTEUR_PROJETS'||r==='CHEF_PROJET'||r==='PMO',
  canAccessAdmin:(r:UserRole)=>r==='ADMINISTRATEUR',
  canAccessPortfolio:(r:UserRole)=>r==='DIRECTEUR_PROJETS'||r==='PMO'||r==='ADMINISTRATEUR',
};
const requireRole=(check:(r:UserRole)=>boolean)=>(req:Request,res:Response,next:NextFunction)=>{ const u=currentUser(req); if(!check(u.role))return res.status(403).json({error:'Droits insuffisants.',userRole:u.role}); next(); };
const requireOrigin=(req:Request,res:Response,next:NextFunction)=>{
  if(['GET','HEAD','OPTIONS'].includes(req.method))return next();
  const origin=req.headers.origin; const appUrl=process.env.APP_URL;
  if(origin && appUrl && origin !== appUrl.replace(/\/$/,'')) return res.status(403).json({error:'Origine non autorisée.'});
  next();
};

const oauthStates = new Map<string,{createdAt:number; origin:string; userId?:string}>();
const rememberOAuthState=(state:string,origin:string,userId?:string)=>oauthStates.set(state,{createdAt:Date.now(),origin,userId});
const consumeOAuthState=(state:string)=>{const v=oauthStates.get(state);oauthStates.delete(state);return v&&Date.now()-v.createdAt<OAUTH_STATE_TTL_MS?v:null;};
function getMicrosoftRedirectUri(req:Request){
  const configured = String(process.env.MICROSOFT_REDIRECT_URI || '').trim();
  if (configured) return configured;
  const appUrl=process.env.APP_URL || `${req.protocol}://${req.get('host')}`;
  return `${appUrl.replace(/\/$/,'')}/auth/microsoft/callback`;
}



// Copilot Studio / Direct Line integration
const COPILOT_AGENT_ID = String(process.env.COPILOT_AGENT_ID || 'cr299_clarity_tB6p_X').trim();
const COPILOT_ENVIRONMENT_ID = String(process.env.COPILOT_ENVIRONMENT_ID || 'Default-1d593042-a69d-49e0-8d1c-0daf8ac1717b').trim();
const COPILOT_TENANT_ID = String(process.env.COPILOT_TENANT_ID || process.env.MICROSOFT_TENANT_ID || '').trim();
const COPILOT_DIRECTLINE_TOKEN_ENDPOINT = String(process.env.COPILOT_DIRECTLINE_TOKEN_ENDPOINT || '').trim();
const CLARITY_API_KEY = String(process.env.CLARITY_API_KEY || '').trim();

function requireClarityApiKey(req: Request, res: Response, next: NextFunction) {
  if (!CLARITY_API_KEY) return res.status(503).json({ error: 'CLARITY_API_KEY non configurée.' });
  const auth = String(req.headers.authorization || '');
  const supplied = auth.startsWith('Bearer ') ? auth.slice(7).trim() : String(req.headers['x-clarity-api-key'] || '').trim();
  if (!supplied || Buffer.byteLength(supplied) !== Buffer.byteLength(CLARITY_API_KEY) || !crypto.timingSafeEqual(Buffer.from(supplied), Buffer.from(CLARITY_API_KEY))) {
    return res.status(401).json({ error: 'Clé API CLARITY invalide.' });
  }
  next();
}

async function getCopilotStudioToken() {
  if (!COPILOT_DIRECTLINE_TOKEN_ENDPOINT) {
    throw new Error('COPILOT_DIRECTLINE_TOKEN_ENDPOINT n’est pas configuré. Dans Copilot Studio, ouvrez Canaux → Application mobile et copiez le Point de terminaison du jeton.');
  }
  const r = await fetch(COPILOT_DIRECTLINE_TOKEN_ENDPOINT, { method: 'GET', headers: { Accept: 'application/json' } });
  const text = await r.text();
  if (!r.ok) throw new Error(`Copilot Studio token endpoint HTTP ${r.status}: ${text.slice(0,500)}`);
  const data = JSON.parse(text);
  if (!data.token || !data.conversationId) throw new Error('Copilot Studio n’a pas retourné token + conversationId.');
  return { token: String(data.token), conversationId: String(data.conversationId), expiresIn: Number(data.expires_in || 1800) };
}

async function sendCopilotStudioMessage(token: string, conversationId: string, text: string, userId: string) {
  const base = 'https://directline.botframework.com/v3/directline';
  const send = await fetch(`${base}/conversations/${encodeURIComponent(conversationId)}/activities`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'message', from: { id: `clarity-${userId}` }, text })
  });
  if (!send.ok) throw new Error(`Copilot Studio Direct Line send HTTP ${send.status}: ${(await send.text()).slice(0,500)}`);
  const sendData = await send.json().catch(() => ({}));
  let watermark = '0';
  const deadline = Date.now() + Math.max(10000, Number(process.env.COPILOT_POLL_TIMEOUT_MS || 45000));
  while (Date.now() < deadline) {
    const r = await fetch(`${base}/conversations/${encodeURIComponent(conversationId)}/activities?watermark=${encodeURIComponent(watermark)}`, { headers: { Authorization: `Bearer ${token}` } });
    if (!r.ok) throw new Error(`Copilot Studio Direct Line receive HTTP ${r.status}: ${(await r.text()).slice(0,500)}`);
    const data = await r.json();
    watermark = String(data.watermark || watermark);
    const replies = (Array.isArray(data.activities) ? data.activities : [])
      .filter((a:any) => a?.type === 'message' && a?.from?.id && a.from.id !== `clarity-${userId}` && String(a.text || '').trim())
      .map((a:any) => String(a.text).trim());
    if (replies.length) return { reply: replies.join('\n\n'), activityId: String(sendData.id || '') };
    await new Promise(resolve => setTimeout(resolve, 700));
  }
  throw new Error('Délai dépassé : Copilot Studio n’a pas répondu dans le délai configuré.');
}

const M365_COPILOT_GRAPH = 'https://graph.microsoft.com/beta';
const M365_COPILOT_SCOPES = [
  'Sites.Read.All','Mail.Read','People.Read.All','OnlineMeetingTranscript.Read.All',
  'Chat.Read','ChannelMessage.Read.All','ExternalItem.Read.All'
];

function getBearerToken(req: Request): string {
  const value = String(req.headers.authorization || '');
  if (!value.startsWith('Bearer ')) throw new Error('Token Microsoft 365 manquant. Reconnectez votre compte Microsoft.');
  const token = value.slice(7).trim();
  if (!token) throw new Error('Token Microsoft 365 vide.');
  return token;
}

function inspectJwtForDiagnostics(token: string) {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return { validJwt: false };
    const payload = JSON.parse(Buffer.from(parts[1].replace(/-/g,'+').replace(/_/g,'/'), 'base64').toString('utf8'));
    const scopes = String(payload.scp || '').split(/\s+/).filter(Boolean);
    const required = M365_COPILOT_SCOPES;
    return {
      validJwt: true,
      aud: payload.aud || null,
      tid: payload.tid || null,
      clientId: payload.azp || payload.appid || null,
      account: payload.preferred_username || payload.upn || payload.email || null,
      scopes,
      missingScopes: required.filter((scope) => !scopes.includes(scope)),
    };
  } catch {
    return { validJwt: false };
  }
}

function assertGraphDelegatedToken(token: string) {
  const info = inspectJwtForDiagnostics(token);
  if (!info.validJwt) throw new Error('Le jeton Microsoft reçu par CLARITY n’est pas un JWT valide. Reconnectez-vous avec Microsoft.');
  if (info.aud !== '00000003-0000-0000-c000-000000000000') {
    throw new Error(`Le jeton Microsoft n’est pas destiné à Microsoft Graph (aud=${String(info.aud || 'absent')}). CLARITY doit demander les permissions Graph au compte connecté.`);
  }
  if (info.missingScopes?.length) {
    throw new Error(`Le jeton Graph ne contient pas toutes les permissions Copilot requises. Manquantes: ${info.missingScopes.join(', ')}. Reconnectez-vous et acceptez les autorisations Microsoft.`);
  }
  return info;
}

async function graphCopilotRequest(token: string, endpoint: string, body: any) {
  const tokenInfo = inspectJwtForDiagnostics(token);
  const response = await fetch(`${M365_COPILOT_GRAPH}${endpoint}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body ?? {}),
  });
  const text = await response.text();
  let data: any = {};
  try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }
  if (!response.ok) {
    const detail = data?.error?.message || data?.message || text || `HTTP ${response.status}`;
    const requestId = response.headers.get('request-id') || response.headers.get('client-request-id') || '';
    const suffix = response.status === 401
      ? ` Vérifiez le token Graph (aud=${String(tokenInfo.aud || 'absent')}, scopes=${(tokenInfo.scopes || []).join(' ')}). Reconnectez-vous si le token a été émis avant le consentement.`
      : '';
    const err = new Error(`Microsoft 365 Copilot: HTTP ${response.status} — ${detail.slice(0, 1200)}${requestId ? ` [request-id=${requestId}]` : ''}${suffix}`);
    (err as any).status = response.status;
    throw err;
  }
  return data;
}

async function extractDocumentEvidenceForCopilot(files: Express.Multer.File[]) {
  const sections: string[] = [];
  for (const file of files) {
    const ext = path.extname(file.originalname || '').toLowerCase();
    try {
      if (['.xlsx','.xls','.csv'].includes(ext)) {
        const workbook = XLSX.read(file.buffer, { type:'buffer', cellDates:true, dense:false });
        const pack = buildSheetEvidence(workbook);
        sections.push(`SOURCE DOCUMENT: ${file.originalname}\nTYPE: Excel\n${pack.text}`);
      } else if (['.txt','.md','.json'].includes(ext)) {
        sections.push(`SOURCE DOCUMENT: ${file.originalname}\nTYPE: text\n${file.buffer.toString('utf8')}`);
      } else if (ext === '.pdf') {
        const mod: any = await import('pdf-parse');
        const parser: any = mod.default || mod;
        const parsed = await parser(file.buffer);
        sections.push(`SOURCE DOCUMENT: ${file.originalname}\nTYPE: PDF\n${String(parsed?.text || '')}`);
      } else if (ext === '.docx') {
        const mammoth: any = await import('mammoth');
        const parsed = await mammoth.extractRawText({ buffer: file.buffer });
        sections.push(`SOURCE DOCUMENT: ${file.originalname}\nTYPE: DOCX\n${String(parsed?.value || '')}`);
      } else {
        sections.push(`SOURCE DOCUMENT: ${file.originalname}\nTYPE: ${file.mimetype || 'unknown'}\n[Fichier non textuel: contenu non extrait]`);
      }
    } catch (e:any) {
      sections.push(`SOURCE DOCUMENT: ${file.originalname}\n[Extraction du contenu impossible: ${e?.message || 'erreur'}]`);
    }
  }
  const joined = sections.join('\n\n');
  // We only extract the bytes into text here; no local semantic analysis is performed.
  return joined.length > 180000 ? `${joined.slice(0, 180000)}\n[Contenu tronqué par CLARITY pour respecter la taille de la requête; les premières feuilles/lignes sont conservées.]` : joined;
}

const M365_COPILOT_SYSTEM_PROMPT = `Tu es Microsoft 365 Copilot utilisé comme moteur IA du Copilot Projet de CLARITY PM.
Tu dois analyser réellement le contenu documentaire fourni dans additionalContext et le croiser avec le projet CLARITY.
Le contenu documentaire a été extrait techniquement par CLARITY (Excel/PDF/DOCX) mais aucune analyse sémantique n'a été faite localement. Ton moteur est responsable du raisonnement, de la comparaison et de l'identification des éléments.

RÈGLES: analyse toutes les feuilles/sections/lignes pertinentes; cite les preuves avec fichier/feuille/ligne ou page lorsqu'elles sont disponibles; distingue faits, déductions et recommandations; détecte doublons, contradictions, dates, budgets, responsables, risques, dépendances et livrables; ne fabrique rien. Compare avec le projet courant et ne propose que ce qui est nouveau ou doit être corrigé.

IMPORTANT: tu ne modifies jamais CLARITY directement. Tu proposes des actions CRUD qui seront montrées à l'utilisateur puis appliquées uniquement après confirmation explicite.

Réponds STRICTEMENT en JSON: {"reply":"...","analysis":{"summary":"...","findings":[],"contradictions":[],"recommendations":[],"elements":{"tasks":[],"milestones":[],"risks":[],"dates":[],"budgets":[],"decisions":[],"corrections":[],"missing":[]}},"actions":[]}.
Actions autorisées: update_project {patch}, add_task {task}, update_task {id,patch}, add_milestone {milestone}, update_milestone {id,patch}, add_risk {risk}, update_risk {id,patch}. Ne supprime jamais. Pour CHAQUE action, retourne un objet JSON complet avec type, id si modification d'un élément existant, patch/task/milestone/risk, reason, source et targetProjectId égal à l'identifiant exact du projet fourni. Pour une création, ne fabrique pas d'id de tâche/jalon/risque: CLARITY le générera. Pour rattacher une tâche à un jalon créé dans la même réponse, utilise task.milestoneProposalId égal au proposalId du add_milestone correspondant; pour un jalon existant, utilise task.milestoneId exact ou milestoneTitle. Ne crée jamais une action destinée à un autre projet. Le JSON doit être directement exploitable par le backend, sans markdown.

`;

function normalizeCopilotAction(raw:any, project:Project, index:number){
  const type=String(raw?.type||'').trim().toLowerCase();
  const allowed=['update_project','add_task','update_task','add_milestone','update_milestone','add_risk','update_risk'];
  if(!allowed.includes(type)) return null;
  const payload=raw?.patch||raw?.task||raw?.milestone||raw?.risk||{};
  const declaredProjectId=raw?.targetProjectId==null?'':String(raw.targetProjectId);
  if(declaredProjectId && declaredProjectId!==String(project.id)) return null;
  const targetId=type==='update_project' ? String(project.id) : String(raw?.id || payload?.id || '');
  const proposalId=String(raw?.proposalId||`pm-${crypto.randomUUID()}`);
  return {
    ...raw,
    proposalId,
    _key:proposalId,
    type,
    targetProjectId:String(project.id),
    targetType:type.replace(/^add_|^update_/,'').toUpperCase(),
    targetId,
    patch: raw?.patch && typeof raw.patch==='object' ? raw.patch : undefined,
    task: raw?.task && typeof raw.task==='object' ? raw.task : undefined,
    milestone: raw?.milestone && typeof raw.milestone==='object' ? raw.milestone : undefined,
    risk: raw?.risk && typeof raw.risk==='object' ? raw.risk : undefined,
  };
}

function copilotActionKey(a:any, index=0){
  return String(a?.proposalId || a?._key || `legacy-${String(a?.type||'action')}-${String(a?.id||index)}`);
}

async function runGatewayCopilot(project: Project, files: Express.Multer.File[], message: string, user: MicrosoftSessionUser) {
  const memory = await loadCopilotMemory(project.id, user.id);
  const evidence = files.length ? await extractDocumentEvidenceForCopilot(files) : (memory.evidence || '');
  const effectiveMessage = message || (files.length ? 'Analyse en profondeur tous les fichiers joints, compare-les au projet et identifie précisément ce qui doit être ajouté ou corrigé.' : 'Continue avec le contexte documentaire précédent et réponds à ma demande.');
  const context = {
    connectedUser: { id:user.id, email:user.email, displayName:user.displayName, role:user.role },
    project: { id:project.id, code:project.code, name:project.name, description:project.description, client:project.client, status:project.status, priority:project.priority, startDate:project.startDate, endDate:project.endDate, budget:project.budget, tasks:project.tasks||[], milestones:project.milestones||[], risks:project.risks||[] },
    previousAnalysis: memory.analysis || {}, previousFiles: memory.files || [], conversation: (memory.history || []).slice(-12),
  };
  const prompt = `${COPILOT_SYSTEM_PROMPT}\n\nCONTEXTE PROJET CLARITY:\n${JSON.stringify(context,null,2)}\n\nDOCUMENTS FOURNIS PAR L'UTILISATEUR:\n${evidence || '[Aucun fichier fourni]'}\n\nRÈGLE DOCUMENTAIRE: le contenu ci-dessus est l'extraction technique des fichiers réels. Ton moteur IA doit effectuer tout le raisonnement sémantique, comparer les sources entre elles et avec CLARITY, citer les preuves (fichier/feuille/page/ligne si disponibles), détecter doublons et contradictions et ne rien inventer.\n\nDEMANDE:\n${effectiveMessage}`;
  const gateway = await callGatewayText({prompt,isJson:true});
  if (!gateway?.text) throw new Error('Aucun provider IA opérationnel. Configure au moins un compte dans Administration → AI Provider Hub.');
  let result:any;
  try { result=cleanCopilotJson(gateway.text); }
  catch { result={reply:gateway.text,analysis:{summary:gateway.text,findings:[],contradictions:[],recommendations:[],elements:{tasks:[],milestones:[],risks:[],dates:[],budgets:[],decisions:[],corrections:[],missing:[]}},actions:[]}; }
  const filesMeta=files.map(f=>({name:f.originalname,size:f.size,type:f.mimetype}));
  const incomingActions=(Array.isArray(result.actions)?result.actions:[]).map((a:any,i:number)=>normalizeCopilotAction(a,project,i)).filter(Boolean).sort((a:any,b:any)=>{const rank=(x:any)=>x?.type==='add_milestone'?0:x?.type==='add_task'?1:2; return rank(a)-rank(b);});
  const previousActions=Array.isArray(memory.pendingActions)?memory.pendingActions:[];
  const actionMap=new Map(previousActions.map((a:any,i:number)=>[copilotActionKey(a,i),{...a,_key:copilotActionKey(a,i)}]));
  incomingActions.forEach((a:any)=>actionMap.set(a.proposalId,a));
  const pendingActions=Array.from(actionMap.values());
  const proposalSet={version:1,projectId:String(project.id),projectCode:String(project.code||''),projectName:String(project.name||''),generatedAt:new Date().toISOString(),proposals:pendingActions};
  const history=[...(memory.history||[]),{role:'user',text:effectiveMessage,files:filesMeta,userEmail:user.email},{role:'assistant',text:String(result.reply||''),analysis:result.analysis||{},proposalSet}];
  await saveCopilotMemory(project.id,user.id,{evidence:files.length?evidence:memory.evidence,files:files.length?filesMeta:memory.files,analysis:result.analysis||memory.analysis||{},pendingActions,history});
  return {...result,actions:pendingActions,proposalSet,provider:gateway.account.provider,account:gateway.account.name,model:gateway.account.model};
}

function applyCopilotActions(project: Project, actions: any[], user: MicrosoftSessionUser) {
  const applied:any[]=[]; const failed:any[]=[]; const createdMilestones=new Map<string,string>();
  for (const action of Array.isArray(actions) ? actions : []) {
    const proposalId=String(action?.proposalId||action?._key||'');
    try {
      if(String(action?.targetProjectId||project.id)!==String(project.id)) { failed.push({proposalId,type:action?.type,error:'Projet cible différent du projet courant.'}); continue; }
      const type=String(action?.type||'').toLowerCase();
      switch(type) {
        case 'update_project': {
          const patch=action.patch&&typeof action.patch==='object'?action.patch:{};
          const allowed=['name','code','description','client','managerName','managerId','status','priority','methodology','startDate','endDate','totalBudget','currency'];
          const safe=Object.fromEntries(Object.entries(patch).filter(([k,v])=>allowed.includes(k)&&v!==undefined));
          const out=Object.keys(safe).length?dbStore.updateProject(project.id,safe as any,user as any):null;
          if(out) applied.push({proposalId,type,data:out}); else failed.push({proposalId,type,error:'Projet introuvable ou aucune modification valide.'});
          break;
        }
        case 'add_task': {
          if(!RBAC.canManageTasks(user.role)){failed.push({proposalId,type,error:'Droits insuffisants pour les tâches.'});break;}
          const t=action.task||{};
          const requestedMilestoneId=String(t.milestoneId||'');
          const proposalMilestoneId=String(t.milestoneProposalId||'');
          const resolvedProposalMilestoneId=proposalMilestoneId ? createdMilestones.get(proposalMilestoneId) : undefined;
          const milestoneId=resolvedProposalMilestoneId || (requestedMilestoneId && project.milestones?.some(m=>String(m.id)===requestedMilestoneId) ? requestedMilestoneId : undefined);
          const milestoneTitle=String(t.milestoneTitle||'').trim();
          const milestoneByTitle=!milestoneId && milestoneTitle ? project.milestones?.find(m=>m.title.trim().toLowerCase()===milestoneTitle.toLowerCase())?.id : undefined;
          const out=dbStore.addTask(project.id,{id:`tsk-ai-${crypto.randomUUID()}`,projectId:project.id,milestoneId:milestoneId||milestoneByTitle,title:String(t.title||'Tâche IA'),description:String(t.description||''),status:['TODO','IN_PROGRESS','REVIEW','DONE','BLOCKED'].includes(t.status)?t.status:'TODO',priority:['LOW','MEDIUM','HIGH','CRITICAL'].includes(t.priority)?t.priority:'MEDIUM',assigneeId:t.assigneeId,startDate:normalizeDate(t.startDate)||project.startDate,dueDate:normalizeDate(t.dueDate)||project.endDate,estimatedHours:Number(t.estimatedHours)||0,actualHours:0,completionPercent:Number(t.completionPercent)||0,costEstimated:Number(t.costEstimated)||0,costActual:0,category:String(t.category||'DOCUMENT-IA'),tags:Array.isArray(t.tags)?t.tags.map(String):['DOCUMENT-IA'],subtasks:[],predecessorIds:Array.isArray(t.predecessorIds)?t.predecessorIds:[]},user as any);
          if(out) applied.push({proposalId,type,data:out}); else failed.push({proposalId,type,error:'Création de tâche refusée par le stockage.'}); break;
        }
        case 'update_task': {
          if(!RBAC.canManageTasks(user.role)){failed.push({proposalId,type,error:'Droits insuffisants pour les tâches.'});break;}
          const id=String(action.targetId||action.id||'');
          if(!project.tasks?.some(t=>String(t.id)===id)){failed.push({proposalId,type,error:`Tâche ${id} absente du projet ${project.id}.`});break;}
          const out=dbStore.updateTask(project.id,id,action.patch||{},user as any);
          if(out) applied.push({proposalId,type,data:out}); else failed.push({proposalId,type,error:'Tâche non modifiée.'}); break;
        }
        case 'add_milestone': {
          const m=action.milestone||{};
          const generatedId=`ms-ai-${crypto.randomUUID()}`;
          const out=dbStore.addMilestone(project.id,{id:generatedId,projectId:project.id,title:String(m.title||'Jalon IA'),targetDate:normalizeDate(m.targetDate)||project.endDate,completed:Boolean(m.completed),description:String(m.description||''),deliverable:String(m.deliverable||'')},user as any);
          if(out) { createdMilestones.set(String(action.proposalId||''),String(out.id)); applied.push({proposalId,type,data:out}); } else failed.push({proposalId,type,error:'Création de jalon refusée par le stockage.'}); break;
        }
        case 'update_milestone': {
          const id=String(action.targetId||action.id||'');
          if(!project.milestones?.some(m=>String(m.id)===id)){failed.push({proposalId,type,error:`Jalon ${id} absent du projet ${project.id}.`});break;}
          const out=dbStore.updateMilestone(project.id,id,action.patch||{},user as any);
          if(out) applied.push({proposalId,type,data:out}); else failed.push({proposalId,type,error:'Jalon non modifié.'}); break;
        }
        case 'add_risk': {
          if(!RBAC.canManageRisks(user.role)){failed.push({proposalId,type,error:'Droits insuffisants pour les risques.'});break;}
          const r=action.risk||{};
          const out=dbStore.addRisk(project.id,{id:`rsk-ai-${crypto.randomUUID()}`,projectId:project.id,title:String(r.title||'Risque IA'),description:String(r.description||''),category:['TECHNIQUE','BUDGET','DELAIS','RESSOURCES','JURIDIQUE','EXTERNE'].includes(r.category)?r.category:'TECHNIQUE',probability:Math.min(5,Math.max(1,Number(r.probability)||3)),impact:Math.min(5,Math.max(1,Number(r.impact)||3)),mitigationPlan:String(r.mitigationPlan||''),contingencyPlan:String(r.contingencyPlan||''),status:['ACTIVE','MITIGATED','CLOSED','OCCURRED'].includes(r.status)?r.status:'ACTIVE',identifiedDate:new Date().toISOString().split('T')[0]},user as any);
          if(out) applied.push({proposalId,type,data:out}); else failed.push({proposalId,type,error:'Création de risque refusée par le stockage.'}); break;
        }
        case 'update_risk': {
          if(!RBAC.canManageRisks(user.role)){failed.push({proposalId,type,error:'Droits insuffisants pour les risques.'});break;}
          const id=String(action.targetId||action.id||'');
          if(!project.risks?.some(r=>String(r.id)===id)){failed.push({proposalId,type,error:`Risque ${id} absent du projet ${project.id}.`});break;}
          const out=dbStore.updateRisk(project.id,id,action.patch||{},user as any);
          if(out) applied.push({proposalId,type,data:out}); else failed.push({proposalId,type,error:'Risque non modifié.'}); break;
        }
        default: failed.push({proposalId,type,error:'Type de proposition non supporté.'});
      }
    } catch(e:any) { failed.push({proposalId,type:action?.type,error:e?.message||'Erreur inconnue lors de l’application.'}); }
  }
  return {applied,failed};
}

async function runM365Copilot(project: Project, files: Express.Multer.File[], message: string, user: MicrosoftSessionUser, token: string, conversationId?: string) {
  const memory = await loadCopilotMemory(project.id, user.id);
  assertGraphDelegatedToken(token);
  const evidence = files.length ? await extractDocumentEvidenceForCopilot(files) : '';
  const effectiveMessage = message || (files.length ? 'Analyse en profondeur tous les fichiers joints, compare-les au projet et identifie précisément ce qui doit être ajouté ou corrigé.' : 'Continue avec le contexte du projet et réponds à ma demande.');
  const projectContext = JSON.stringify({
    id: project.id, code: project.code, name: project.name, description: project.description, client: project.client, status: project.status, priority: project.priority, startDate: project.startDate, endDate: project.endDate, budget: project.budget,
    tasks: project.tasks, milestones: project.milestones, risks: project.risks,
    user: { id:user.id, email:user.email, displayName:user.displayName, role:user.role },
    previousAnalysis: memory.analysis || {}, previousFiles: memory.files || []
  }, null, 2);
  const additionalContext = [
    { text: `CONTEXTE PROJET CLARITY\n${projectContext}` },
    ...(evidence ? [{ text: `CONTENU DES DOCUMENTS FOURNIS\n${evidence}` }] : []),
  ];
  const text = `${M365_COPILOT_SYSTEM_PROMPT}\n\nDEMANDE UTILISATEUR: ${effectiveMessage}`;

  let convId = conversationId;
  if (!convId) {
    const created = await graphCopilotRequest(token, '/copilot/conversations', {});
    convId = String(created?.id || '');
    if (!convId) throw new Error('Microsoft 365 Copilot n’a pas retourné d’identifiant de conversation.');
  }
  const result = await graphCopilotRequest(token, `/copilot/conversations/${encodeURIComponent(convId)}/chat`, {
    message: { text },
    additionalContext,
    locationHint: { timeZone: 'Europe/Paris' },
    contextualResources: { webContext: { isWebEnabled: false } },
  });
  const messages = Array.isArray(result?.messages) ? result.messages : [];
  const reply = String(messages.slice().reverse().find((m:any) => String(m?.text || '').trim())?.text || '');
  if (!reply) throw new Error('Microsoft 365 Copilot a renvoyé une réponse vide.');
  let parsed: any;
  try { parsed = cleanCopilotJson(reply); } catch {
    parsed = { reply, analysis:{summary:reply,findings:[],contradictions:[],recommendations:[],elements:{tasks:[],milestones:[],risks:[],dates:[],budgets:[],decisions:[],corrections:[],missing:[]}}, actions:[] };
  }
  const filesMeta = files.map(f=>({name:f.originalname,size:f.size,type:f.mimetype}));
  const history=[...(memory.history||[]),{role:'user',text:effectiveMessage,files:filesMeta,userEmail:user.email},{role:'assistant',text:String(parsed.reply||reply),analysis:parsed.analysis||{}}];
  await saveCopilotMemory(project.id,user.id,{evidence,files:filesMeta,analysis:parsed.analysis||{},pendingActions:Array.isArray(parsed.actions)?parsed.actions:[],history});
  return { ...parsed, conversationId: convId };
}

// Runtime AI provider abstraction: semantic processing is delegated to the OAuth Gateway.
async function callAIResilient(params: { prompt: string; isJson?: boolean; model?: string }): Promise<string | null> {
  const gateway = await callGatewayText(params);
  return gateway?.text || null;
}
const callGeminiResilient = callAIResilient;

// Les anciens endpoints IA restent disponibles pour les fonctions historiques. Le Copilot Projet est intégré directement à Microsoft Copilot Studio côté navigateur.


async function callGeminiWithFiles(files: Express.Multer.File[], prompt: string): Promise<string | null> {
  const config = await getAIConfig();
  const apiKey = await getAISecret();
  if (!config.enabled || config.provider !== 'GEMINI' || !apiKey) return null;
  const model = config.model || 'gemini-3.7-flash';
  const totalBytes = files.reduce((n, f) => n + f.size, 0);
  if (totalBytes > 25 * 1024 * 1024) throw new Error('La taille totale des fichiers dépasse 25 Mo.');
  const parts: any[] = [{ text: prompt }];
  for (const file of files) {
    if (file.size > 10 * 1024 * 1024) throw new Error(`Fichier trop volumineux: ${file.originalname}`);
    parts.push({ inline_data: { mime_type: file.mimetype || 'application/octet-stream', data: file.buffer.toString('base64') } });
  }
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts }],
      generationConfig: { temperature: config.temperature, maxOutputTokens: Math.max(config.maxOutputTokens, 8192), responseMimeType: 'application/json' }
    })
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(`Gemini fichiers: HTTP ${response.status}${detail ? ` — ${detail.slice(0, 300)}` : ''}`);
  }
  const data: any = await response.json();
  return data?.candidates?.[0]?.content?.parts?.map((x:any) => x.text || '').join('') || null;
}


async function ensureCopilotMemoryTable() {
  const pool = getPgPool();
  if (!pool) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS copilot_memory (
      project_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      evidence TEXT NOT NULL DEFAULT '',
      files_json JSONB NOT NULL DEFAULT '[]'::jsonb,
      analysis_json JSONB NOT NULL DEFAULT '{}'::jsonb,
      pending_actions_json JSONB NOT NULL DEFAULT '[]'::jsonb,
      history_json JSONB NOT NULL DEFAULT '[]'::jsonb,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY(project_id,user_id)
    );
    ALTER TABLE copilot_memory ADD COLUMN IF NOT EXISTS pending_actions_json JSONB NOT NULL DEFAULT '[]'::jsonb;
  `);
}
async function loadCopilotMemory(projectId: string, userId: string) {
  const pool = getPgPool(); if (!pool) return { evidence:'', files:[], analysis:{}, pendingActions:[], history:[] };
  const r = await pool.query(`SELECT evidence,files_json,analysis_json,pending_actions_json,history_json FROM copilot_memory WHERE project_id=$1 AND user_id=$2`, [projectId,userId]);
  if (!r.rows[0]) return { evidence:'', files:[], analysis:{}, pendingActions:[], history:[] };
  return { evidence:String(r.rows[0].evidence||''), files:r.rows[0].files_json||[], analysis:r.rows[0].analysis_json||{}, pendingActions:r.rows[0].pending_actions_json||[], history:r.rows[0].history_json||[] };
}
async function saveCopilotMemory(projectId:string,userId:string,memory:any) {
  const pool=getPgPool(); if(!pool) return;
  const history=Array.isArray(memory.history)?memory.history.slice(-16):[];
  await pool.query(`INSERT INTO copilot_memory(project_id,user_id,evidence,files_json,analysis_json,pending_actions_json,history_json,updated_at)
    VALUES($1,$2,$3,$4::jsonb,$5::jsonb,$6::jsonb,$7::jsonb,NOW())
    ON CONFLICT(project_id,user_id) DO UPDATE SET evidence=EXCLUDED.evidence,files_json=EXCLUDED.files_json,analysis_json=EXCLUDED.analysis_json,pending_actions_json=EXCLUDED.pending_actions_json,history_json=EXCLUDED.history_json,updated_at=NOW()`,
    [projectId,userId,String(memory.evidence||''),JSON.stringify(memory.files||[]),JSON.stringify(memory.analysis||{}),JSON.stringify(memory.pendingActions||[]),JSON.stringify(history)]);
}

function splitEvidence(text:string,maxChars=45000){
  const chunks:string[]=[]; let pos=0;
  while(pos<text.length){ let end=Math.min(pos+maxChars,text.length); const br=text.lastIndexOf('\n',end); if(br>pos+15000) end=br; chunks.push(text.slice(pos,end)); pos=end; }
  return chunks;
}

async function callOpenAIResponsesWithFiles(
  files: Express.Multer.File[],
  prompt: string,
  model?: string,
): Promise<string> {
  const config = await getAIConfig();
  const apiKey = await getAISecret();
  if (!config.enabled) throw new Error('Le Copilot IA est désactivé dans Administration → IA.');
  if (config.provider !== 'OPENAI_COMPATIBLE') throw new Error('Le Copilot Projet utilise OpenAI. Configure le fournisseur OpenAI dans Administration → IA.');
  if (!apiKey) throw new Error('Aucune clé API OpenAI n’est configurée pour le Copilot.');

  const base = (config.baseUrl || 'https://api.openai.com/v1').replace(/\/$/, '');
  const uploaded: string[] = [];
  try {
    for (const file of files) {
      const form = new FormData();
      form.append('purpose', 'user_data');
      form.append('file', new Blob([file.buffer], { type: file.mimetype || 'application/octet-stream' }), file.originalname);
      const uploadResponse = await fetch(`${base}/files`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}` },
        body: form,
      });
      if (!uploadResponse.ok) {
        const detail = await uploadResponse.text().catch(() => '');
        throw new Error(`OpenAI — impossible d’envoyer « ${file.originalname} » (HTTP ${uploadResponse.status}). ${detail.slice(0, 500)}`);
      }
      const uploadedFile: any = await uploadResponse.json();
      uploaded.push(String(uploadedFile.id));
    }

    const response = await fetch(`${base}/responses`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: model || config.model,
        input: [{
          role: 'user',
          content: [
            { type: 'input_text', text: prompt },
            ...uploaded.map(file_id => ({ type: 'input_file', file_id })),
          ],
        }],
        temperature: config.temperature,
        max_output_tokens: Math.max(config.maxOutputTokens, 8192),
        store: false,
      }),
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      throw new Error(`OpenAI Responses: HTTP ${response.status}. ${detail.slice(0, 800)}`);
    }
    const data: any = await response.json();
    const text = String(data?.output_text || '');
    if (!text.trim()) throw new Error('Le moteur OpenAI Copilot a renvoyé une réponse vide.');
    return text;
  } finally {
    await Promise.all(uploaded.map(id => fetch(`${base}/files/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${apiKey}` },
    }).catch(() => undefined)));
  }
}

const COPILOT_SYSTEM_PROMPT = `Tu es le Copilot Projet de CLARITY PM. Tu es un véritable assistant de gestion de projet intégré à l'application.
Tu reçois le projet courant et, lorsqu'ils sont joints, les fichiers réels de l'utilisateur. Tu dois analyser le contenu des fichiers directement avec ton moteur IA. Ne fais jamais semblant d'avoir analysé un document si son contenu n'est pas réellement accessible.

IDENTITÉ ET CONTEXTE:
- L'utilisateur connecté est identifié par son compte CLARITY; son e-mail est fourni par le serveur et ne doit jamais être demandé à l'utilisateur.
- Le projet fourni est le seul projet que tu peux modifier.
- Les fichiers joints appartiennent à la demande courante et doivent être considérés comme des sources de vérité documentaire.

ANALYSE APPROFONDIE:
- Pour XLSX/XLS: parcours toutes les feuilles, tableaux, lignes et colonnes pertinentes. Repère les références projet, descriptions, actions, tâches, jalons, dates, responsables, budgets, décisions, risques, contraintes, dépendances, livrables, statuts, doublons et contradictions.
- Pour PDF/DOCX: lis le document en profondeur, y compris les sections, tableaux, décisions, actions et dates disponibles.
- Croise toujours les fichiers entre eux et avec le projet actuel.
- Ne te limite jamais à un résumé général.
- Pour chaque élément important, donne une preuve/source (nom du fichier et feuille/page/ligne quand elle est disponible).
- Distingue clairement les faits, les déductions et les recommandations.
- Ne fabrique aucune information absente.

COMPARAISON PROJET:
- Identifie ce qui existe déjà dans CLARITY et ce qui est nouveau.
- Détecte les doublons avant de proposer une création.
- Détecte les incohérences de dates, budget, responsable, statut et périmètre.
- Propose les corrections lorsqu'un document fiable contredit le projet.

ACTIONS:
- Une analyse de document doit produire des PROPOSITIONS d'actions, mais jamais les appliquer elle-même.
- Si l'utilisateur demande une analyse seulement, actions=[] sauf si des modifications pertinentes sont explicitement proposées pour validation.
- Si l'utilisateur demande d'ajouter/corriger/modifier, génère des actions CRUD précises à soumettre à la validation de l'utilisateur.
- Le serveur demandera ensuite une confirmation explicite avant toute écriture dans CLARITY.
- Pour modifier un élément existant, utilise son identifiant exact fourni dans le contexte.
- Ne supprime jamais un élément existant.
- Les tâches, jalons et risques créés doivent être concrets et dédupliqués.
- Toute action doit être justifiée par une preuve documentaire ou la demande explicite de l'utilisateur.

RÉPONSE:
- Réponds en français.
- Commence par une synthèse utile, puis détaille les éléments trouvés.
- Quand l'utilisateur demande « sortir les éléments », donne les éléments réellement trouvés, classés en Tâches, Jalons, Risques, Dates, Budget, Décisions, Corrections et Informations manquantes.
- Ne réponds jamais « analyse locale terminée » : l'analyse est effectuée par le moteur Copilot OpenAI.
- Une réponse d'analyse documentaire doit être substantielle: synthèse exécutive, faits vérifiés, comparaison avec CLARITY, écarts, éléments nouveaux, contradictions, impacts, recommandations et sources. Ne te contente jamais de 3-5 puces génériques.
- Pour chaque tâche/jalon/risque/correction important, indique si possible le titre, statut, date, responsable, impact, priorité et source.
- Si le document ne correspond pas au projet courant, dis-le clairement dès la synthèse, puis analyse quand même le document et fournis une section « Document vs projet » avec les identifiants détectés des deux côtés.
- Pour Excel, conserve les coordonnées de preuve exactes sous la forme « Fichier / Feuille / Lx / cellule ».

Retourne STRICTEMENT ce JSON:
{
  "reply":"...",
  "analysis": {
    "summary":"...",
    "findings":[],
    "contradictions":[],
    "recommendations":[],
    "elements": {
      "tasks":[], "milestones":[], "risks":[], "dates":[], "budgets":[], "decisions":[], "corrections":[], "missing":[]
    }
  },
  "actions": []
}`;

function cleanCopilotJson(text: string): any {
  const cleaned = cleanJsonResponse(text);
  try { return JSON.parse(cleaned); } catch {
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (match) return JSON.parse(match[0]);
    throw new Error('La réponse du moteur Copilot n’est pas un JSON exploitable.');
  }
}

async function runCopilot(project: Project, files: Express.Multer.File[], message: string, user: MicrosoftSessionUser) {
  const memory = await loadCopilotMemory(project.id, user.id);
  const fileNames = files.length ? files.map(f => f.originalname) : (Array.isArray(memory.files) ? memory.files.map((x:any) => String(x.name || x)) : []);
  const effectiveMessage = message || (files.length
    ? 'Analyse en profondeur tous les fichiers joints, compare-les au projet et identifie précisément ce qui doit être ajouté ou corrigé.'
    : 'Continue avec le contexte documentaire précédent et réponds à ma demande.');

  const context = {
    connectedUser: { id: user.id, email: user.email, displayName: user.displayName, role: user.role },
    project: {
      ...project,
      tasks: project.tasks,
      milestones: project.milestones,
      risks: project.risks,
    },
    previousCopilotAnalysis: memory.analysis || {},
    previousFiles: memory.files || [],
    conversation: (memory.history || []).slice(-12),
    currentFiles: fileNames,
    request: effectiveMessage,
  };

  const prompt = `${COPILOT_SYSTEM_PROMPT}\n\nCONTEXTE CLARITY:\n${JSON.stringify(context, null, 2)}\n\nIMPORTANT: Les fichiers joints sont extraits techniquement par CLARITY puis transmis au moteur OAuth sélectionné dans AI Provider Hub. L'analyse sémantique est effectuée par ce moteur, pas localement. Si aucun fichier n'est joint, utilise uniquement l'analyse précédente conservée dans le contexte. Ne prétends jamais avoir accès à un fichier qui n'est pas présent ou mémorisé.\n\nDEMANDE UTILISATEUR:\n${effectiveMessage}`;

  const documentEvidence = files.length ? await extractDocumentEvidenceForCopilot(files) : '';
  const gatewayPrompt = `${prompt}\n\nCONTENU DES DOCUMENTS À ANALYSER SÉMANTIQUEMENT PAR LE MOTEUR IA:\n${documentEvidence || '[aucun nouveau document]'}`;
  const raw = await callAIResilient({ prompt: gatewayPrompt, isJson: true });
  if (!raw) throw new Error('Aucun compte IA OAuth disponible dans AI Provider Hub.');
  let result: any;
  try {
    result = cleanCopilotJson(raw);
  } catch {
    // Le moteur reste la source de la réponse: aucun fallback local.
    result = {
      reply: raw,
      analysis: { summary: 'Réponse Copilot reçue mais non structurée.', findings: [], contradictions: [], recommendations: [], elements: { tasks: [], milestones: [], risks: [], dates: [], budgets: [], decisions: [], corrections: [], missing: [] } },
      actions: [],
    };
  }

  const history = [
    ...(memory.history || []),
    { role: 'user', text: effectiveMessage, files: fileNames, userEmail: user.email },
    { role: 'assistant', text: String(result.reply || ''), analysis: result.analysis || {} },
  ];
  await saveCopilotMemory(project.id, user.id, {
    evidence: '',
    files: fileNames.map(name => ({ name })),
    analysis: result.analysis || {},
    pendingActions: Array.isArray(result.actions) ? result.actions : [],
    history,
  });
  return result;
}


async function uploadToOpenAIAndExtractFiles(files: Express.Multer.File[], prompt: string) {
  const config = await getAIConfig();
  const apiKey = await getAISecret();
  if (!config.enabled || config.provider !== 'OPENAI_COMPATIBLE' || !apiKey) return null;
  const base = (config.baseUrl || 'https://api.openai.com/v1').replace(/\/$/,'');
  const uploaded: string[] = [];
  try {
    for (const file of files) {
      const form = new FormData();
      form.append('purpose', 'user_data');
      form.append('file', new Blob([file.buffer], { type: file.mimetype || 'application/octet-stream' }), file.originalname);
      const uploadResponse = await fetch(`${base}/files`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}` },
        body: form,
      });
      if (!uploadResponse.ok) throw new Error(`Upload OpenAI ${file.originalname}: HTTP ${uploadResponse.status}`);
      const uploadedFile: any = await uploadResponse.json();
      uploaded.push(String(uploadedFile.id));
    }

    const schema = {
      type: 'object',
      additionalProperties: false,
      properties: {
        projectPatch: {
          type: 'object', additionalProperties: false,
          properties: {
            code:{type:'string'}, name:{type:'string'}, description:{type:'string'}, client:{type:'string'}, managerName:{type:'string'}, managerEmail:{type:'string'}, status:{type:'string'}, priority:{type:'string'}, methodology:{type:'string'}, startDate:{type:'string'}, endDate:{type:'string'}, totalBudget:{type:'number'}, currency:{type:'string'}
          }, required:['code','name','description','client','managerName','managerEmail','status','priority','methodology','startDate','endDate','totalBudget','currency']
        },
        tasks:{type:'array',items:{type:'object',additionalProperties:false,properties:{title:{type:'string'},description:{type:'string'},status:{type:'string'},priority:{type:'string'},startDate:{type:'string'},dueDate:{type:'string'},estimatedHours:{type:'number'},category:{type:'string'},tags:{type:'array',items:{type:'string'}},confidence:{type:'number'},evidence:{type:'string'}},required:['title','description','status','priority','startDate','dueDate','estimatedHours','category','tags','confidence','evidence']}},
        milestones:{type:'array',items:{type:'object',additionalProperties:false,properties:{title:{type:'string'},targetDate:{type:'string'},description:{type:'string'},deliverable:{type:'string'},confidence:{type:'number'},evidence:{type:'string'}},required:['title','targetDate','description','deliverable','confidence','evidence']}},
        risks:{type:'array',items:{type:'object',additionalProperties:false,properties:{title:{type:'string'},description:{type:'string'},category:{type:'string'},probability:{type:'number'},impact:{type:'number'},mitigationPlan:{type:'string'},contingencyPlan:{type:'string'},status:{type:'string'},confidence:{type:'number'},evidence:{type:'string'}},required:['title','description','category','probability','impact','mitigationPlan','contingencyPlan','status','confidence','evidence']}},
        members:{type:'array',items:{type:'object',additionalProperties:false,properties:{name:{type:'string'},role:{type:'string'},email:{type:'string'},hourlyRate:{type:'number'},maxWeeklyHours:{type:'number'},confidence:{type:'number'},evidence:{type:'string'}},required:['name','role','email','hourlyRate','maxWeeklyHours','confidence','evidence']}},
        sourceSummary:{type:'string'}, warnings:{type:'array',items:{type:'string'}}
      },
      required:['projectPatch','tasks','milestones','risks','members','sourceSummary','warnings']
    };

    const response = await fetch(`${base}/responses`, {
      method:'POST',
      headers:{'Content-Type':'application/json', Authorization:`Bearer ${apiKey}`},
      body: JSON.stringify({
        model: config.model,
        input:[{role:'user',content:[
          {type:'input_text',text:prompt},
          ...uploaded.map(file_id => ({type:'input_file', file_id}))
        ]}],
        temperature: config.temperature,
        max_output_tokens: config.maxOutputTokens,
        store: false,
        text:{format:{type:'json_schema',name:'clarity_project_ingestion',strict:true,schema}}
      })
    });
    if (!response.ok) throw new Error(`OpenAI Responses: HTTP ${response.status}`);
    const data:any = await response.json();
    const text = data?.output_text;
    if (!text) throw new Error('Réponse OpenAI vide.');
    return JSON.parse(text);
  } finally {
    // Files are temporary inputs. Best-effort deletion to limit retention.
    await Promise.all(uploaded.map(id => fetch(`${base}/files/${encodeURIComponent(id)}`, { method:'DELETE', headers:{Authorization:`Bearer ${apiKey}`} }).catch(()=>undefined)));
  }
}

// Health check endpoint
app.get('/api/health', (req: Request, res: Response) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

// --- MICROSOFT OAUTH & AUTHENTICATION SERVICES ---
app.get('/api/auth/me', (req,res)=>{
  const user=getUserFromRequest(req);
  res.json({isAuthenticated:Boolean(user), user, isConfigured:Boolean(process.env.MICROSOFT_CLIENT_ID && process.env.MICROSOFT_CLIENT_SECRET), clientIdAvailable:Boolean(process.env.MICROSOFT_CLIENT_ID)});
});

app.get('/api/auth/microsoft/url', (req,res)=>{
  const clientId=process.env.MICROSOFT_CLIENT_ID;
  const tenant=process.env.MICROSOFT_TENANT_ID || 'common';
  const redirectUri=getMicrosoftRedirectUri(req);
  if(!clientId) return res.json({isConfigured:false,url:null,message:'MICROSOFT_CLIENT_ID non configuré.',redirectUri});
  const configuredOrigin = String(process.env.APP_URL || '').trim();
  const requestedOrigin = typeof req.query.origin === 'string' ? req.query.origin.trim() : '';
  const origin = configuredOrigin || `${req.protocol}://${req.get('host')}`;
  // The login route is intentionally unauthenticated: do not dereference currentUser(req).
  // Accept only the configured public origin for the postMessage target.
  const postMessageOrigin = requestedOrigin && requestedOrigin === origin.replace(/\/$/,'') ? requestedOrigin : origin.replace(/\/$/,'');
  const state=crypto.randomBytes(32).toString('hex');
  const existingUser=getUserFromRequest(req);
  rememberOAuthState(state,postMessageOrigin,existingUser?.id);
  const params=new URLSearchParams({client_id:clientId,response_type:'code',redirect_uri:redirectUri,response_mode:'query',scope:'openid profile email User.Read',state,prompt:'select_account'});
  res.json({isConfigured:true,url:`https://login.microsoftonline.com/${tenant}/oauth2/v2.0/authorize?${params}`,redirectUri,postMessageOrigin});
});

app.get('/auth/microsoft/login', async (req,res)=>{
  const clientId=process.env.MICROSOFT_CLIENT_ID;
  const tenant=process.env.MICROSOFT_TENANT_ID || 'common';
  const redirectUri=getMicrosoftRedirectUri(req);
  if(!clientId) return res.status(503).send('Microsoft Entra ID n’est pas configuré.');
  const origin=(process.env.APP_URL || `${req.protocol}://${req.get('host')}`).replace(/\/$/,'');
  const state=crypto.randomBytes(32).toString('hex');
  rememberOAuthState(state,origin,getUserFromRequest(req)?.id);
  const params=new URLSearchParams({client_id:clientId,response_type:'code',redirect_uri:redirectUri,response_mode:'query',scope:'openid profile email User.Read',state,prompt:'select_account'});
  res.redirect(`https://login.microsoftonline.com/${tenant}/oauth2/v2.0/authorize?${params}`);
});

app.get(['/auth/microsoft/callback','/auth/microsoft/callback/'],async(req,res)=>{
  const state=typeof req.query.state==='string'?req.query.state:'';
  const stateInfo=consumeOAuthState(state);
  const safeOrigin=stateInfo?.origin || process.env.APP_URL || `${req.protocol}://${req.get('host')}`;
  const safeJson=(value:any)=>JSON.stringify(value).replace(/</g,'\\u003c').replace(/>/g,'\\u003e').replace(/&/g,'\\u0026');
  const post=(data:any)=>`<script>if(window.opener){window.opener.postMessage(${safeJson(data)},${safeJson(safeOrigin)});}setTimeout(()=>window.close(),500);</script>`;
  if(!stateInfo) return res.status(400).send(`<!doctype html><p>Session OAuth invalide ou expirée.</p>${post({type:'OAUTH_AUTH_ERROR',error:'État OAuth invalide ou expiré.'})}`);
  if(req.query.error) return res.status(400).send(`<!doctype html><p>Authentification Microsoft annulée.</p>${post({type:'OAUTH_AUTH_ERROR',error:String(req.query.error_description||req.query.error)})}`);
  const code=typeof req.query.code==='string'?req.query.code:null;
  const clientId=process.env.MICROSOFT_CLIENT_ID, clientSecret=process.env.MICROSOFT_CLIENT_SECRET, tenant=process.env.MICROSOFT_TENANT_ID||'common';
  if(!code || !clientId || !clientSecret) return res.status(500).send(`<!doctype html><p>Configuration Microsoft incomplète.</p>${post({type:'OAUTH_AUTH_ERROR',error:'Configuration Microsoft incomplète.'})}`);
  try {
    const redirectUri=getMicrosoftRedirectUri(req);
    const tokenResponse=await fetch(`https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:clientId,client_secret:clientSecret,code,redirect_uri:redirectUri,grant_type:'authorization_code',scope:'openid profile email User.Read'}).toString()});
    const tokenData:any=await tokenResponse.json();
    if(!tokenResponse.ok||!tokenData.access_token) throw new Error(tokenData.error_description||'Échec OAuth');
    const graph=await fetch('https://graph.microsoft.com/v1.0/me',{headers:{Authorization:`Bearer ${tokenData.access_token}`}});
    const profile:any=await graph.json(); if(!graph.ok||!profile.id) throw new Error('Impossible de récupérer le profil Microsoft.');
    const email=String(profile.mail||profile.userPrincipalName||'').toLowerCase();
    if(!email) throw new Error('Le compte Microsoft ne fournit pas d’adresse e-mail.');
    const syncedProfile = await dbStore.upsertEntraUser({
      azureOid: String(profile.id),
      email,
      displayName: profile.displayName || email,
      jobTitle: profile.jobTitle,
      department: profile.department,
      officeLocation: profile.officeLocation,
      avatarUrl: `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(profile.displayName||email)}`,
    });
    if (!syncedProfile) throw new Error('Votre profil CLARITY PM n’est pas encore autorisé. Demandez à un administrateur de créer ou activer votre profil.');
    if (!syncedProfile.isActive) throw new Error('Votre profil CLARITY PM est désactivé. Contactez un administrateur.');
    const user:MicrosoftSessionUser={id:syncedProfile.id,displayName:syncedProfile.displayName,email:syncedProfile.email,role:syncedProfile.role,jobTitle:syncedProfile.jobTitle,department:syncedProfile.department,officeLocation:syncedProfile.officeLocation,avatarUrl:syncedProfile.avatarUrl,tenantId:tenant,authProvider:'MICROSOFT_ENTRA',connectedAt:new Date().toISOString()};
    setSession(res,user);
    res.send(`<!doctype html><p>Connexion Microsoft réussie.</p>${post({type:'OAUTH_AUTH_SUCCESS',provider:'microsoft',user})}`);
  } catch(e:any) {
    res.status(502).send(`<!doctype html><p>Échec de l'authentification Microsoft.</p>${post({type:'OAUTH_AUTH_ERROR',error:e?.message||'Erreur OAuth'})}`);
  }
});

app.post('/api/auth/logout',(req,res)=>{clearSession(res);res.json({success:true});});

// Local administrator authentication. This is intentionally independent from Entra ID
// so the first administrator can configure the tenant/SSO before Microsoft OAuth is ready.
const localAdminEnabled = () => process.env.LOCAL_ADMIN_ENABLED !== 'false';
const localAdminEmail = () => (process.env.LOCAL_ADMIN_EMAIL || 'admin@local').trim().toLowerCase();
const localAdminPassword = () => process.env.LOCAL_ADMIN_PASSWORD || '';
const localAdminDisplayName = () => process.env.LOCAL_ADMIN_NAME || 'Administrateur local';
const localLoginAttempts = new Map<string, { count: number; resetAt: number }>();

function sameSecret(a: string, b: string): boolean {
  const ah = crypto.createHash('sha256').update(a).digest();
  const bh = crypto.createHash('sha256').update(b).digest();
  return crypto.timingSafeEqual(ah, bh);
}

function localLoginAllowed(ip: string): boolean {
  const now = Date.now();
  const current = localLoginAttempts.get(ip);
  if (!current || current.resetAt <= now) {
    localLoginAttempts.set(ip, { count: 1, resetAt: now + 60_000 });
    return true;
  }
  if (current.count >= 10) return false;
  current.count += 1;
  return true;
}

app.post('/api/auth/login-password',(req,res)=>{
  if (!localAdminEnabled()) {
    return res.status(404).json({ success:false, error:'Connexion locale désactivée.' });
  }

  const email = String(req.body?.email || '').trim().toLowerCase();
  const password = String(req.body?.password || '');
  const ip = req.ip || req.socket.remoteAddress || 'unknown';

  if (!localLoginAllowed(ip)) {
    return res.status(429).json({ success:false, error:'Trop de tentatives. Réessayez dans une minute.' });
  }

  const configuredPassword = localAdminPassword();
  if (!configuredPassword) {
    return res.status(503).json({ success:false, error:'LOCAL_ADMIN_PASSWORD n’est pas configuré.' });
  }

  if (email !== localAdminEmail() || !sameSecret(password, configuredPassword)) {
    return res.status(401).json({ success:false, error:'Identifiant ou mot de passe incorrect.' });
  }

  const user: MicrosoftSessionUser = {
    id: 'local-admin',
    displayName: localAdminDisplayName(),
    email: localAdminEmail(),
    role: 'ADMINISTRATEUR',
    jobTitle: 'Administrateur',
    department: 'CLARITY PM',
    tenantId: 'local',
    authProvider: 'LOCAL',
    connectedAt: new Date().toISOString(),
  };

  setSession(res, user);
  res.json({ success:true, user });
});

app.post('/api/auth/microsoft/demo-login',(req,res)=>{
  if(process.env.DEMO_MODE!=='true') return res.status(404).json({error:'Mode démo désactivé.'});
  const user:MicrosoftSessionUser={id:'demo-user',displayName:'Alexandre Dupont',email:'demo@example.invalid',role:'CHEF_PROJET',jobTitle:'Chef de Projet (DEMO)',department:'DEMO',tenantId:'demo',authProvider:'DEMO',connectedAt:new Date().toISOString()};
  setSession(res,user); res.json({success:true,user});
});

app.get('/api/auth/config-info',(req,res)=>{const appUrl=process.env.APP_URL||`${req.protocol}://${req.get('host')}`;const redirectUri=getMicrosoftRedirectUri(req);res.json({devCallbackUrl:redirectUri,sharedCallbackUrl:redirectUri,isConfigured:Boolean(process.env.MICROSOFT_CLIENT_ID&&process.env.MICROSOFT_CLIENT_SECRET),clientId:process.env.MICROSOFT_CLIENT_ID?'Configuré':'Non configuré',tenantId:process.env.MICROSOFT_TENANT_ID?'Configuré':'Non configuré',demoMode:process.env.DEMO_MODE==='true',localAuthEnabled:localAdminEnabled(),localAdminEmail:localAdminEmail()});});

// API: Admin Settings & Integration Tests
app.post('/api/admin/ad/test-connection', (req: Request, res: Response) => {
  const configured=Boolean(process.env.MICROSOFT_CLIENT_ID&&process.env.MICROSOFT_CLIENT_SECRET);
  if(!configured) return res.status(503).json({success:false,error:'Microsoft Entra ID n’est pas configuré.'});
  res.json({success:true,message:'Configuration Microsoft Entra ID détectée.',tenantId:process.env.MICROSOFT_TENANT_ID||'common',timestamp:new Date().toISOString()});
});

app.post('/api/admin/postgres/test-connection', async (req: Request, res: Response) => {
  const pool = getPgPool();
  if (!pool) return res.status(503).json({success:false,error:'PostgreSQL n’est pas configuré.'});
  const started=Date.now();
  try {
    const result=await pool.query(`SELECT COUNT(*)::int AS count FROM information_schema.tables WHERE table_schema='public'`);
    res.json({success:true,message:'Connexion PostgreSQL vérifiée.',latencyMs:Date.now()-started,tablesCount:result.rows[0]?.count||0,timestamp:new Date().toISOString()});
  } catch(e:any) { res.status(503).json({success:false,error:e?.message||'Connexion PostgreSQL impossible.'}); }
});

app.get('/api/admin/ai/config', requireAuth, requireRole(RBAC.canAccessAdmin), async (_req, res) => {
  try {
    const config = await getAIConfig();
    res.json({ success: true, config: publicAIConfig(config) });
  } catch (e:any) {
    res.status(500).json({ success:false, error:e?.message || 'Impossible de charger la configuration IA.' });
  }
});

app.put('/api/admin/ai/config', requireAuth, requireRole(RBAC.canAccessAdmin), async (req, res) => {
  try {
    const config = await saveAIConfig(req.body || {});
    await profileAudit(req, 'UPDATE_AI_CONFIG', 'ai-provider', { provider: config.provider, model: config.model, enabled: config.enabled });
    res.json({ success:true, config: publicAIConfig(config) });
  } catch (e:any) {
    res.status(400).json({ success:false, error:e?.message || 'Impossible d’enregistrer la configuration IA.' });
  }
});

app.get('/api/admin/ai/gateway/catalog', requireAuth, requireRole(RBAC.canAccessAdmin), async (_req, res) => {
  try { res.json({success:true, gemini:getGeminiModelCatalog()}); }
  catch (e:any) { res.status(500).json({success:false,error:e?.message||'Catalogue Gemini indisponible.'}); }
});

app.get('/api/admin/ai/gateway/providers', requireAuth, requireRole(RBAC.canAccessAdmin), async (_req, res) => {
  try { await ensureAIRouterTable(); res.json({success:true, providers: await listAIRouterAccounts()}); }
  catch (e:any) { res.status(500).json({success:false,error:e?.message||'Impossible de charger les providers.'}); }
});

app.post('/api/admin/ai/gateway/providers', requireAuth, requireRole(RBAC.canAccessAdmin), async (req, res) => {
  try { const provider = await saveAIRouterAccount(req.body || {}); await profileAudit(req,'UPDATE_AI_GATEWAY','ai-provider', {provider: provider?.provider, accountId: provider?.id}); res.json({success:true,provider}); }
  catch (e:any) { res.status(400).json({success:false,error:e?.message||'Impossible d’enregistrer le provider.'}); }
});

app.delete('/api/admin/ai/gateway/providers/:id', requireAuth, requireRole(RBAC.canAccessAdmin), async (req, res) => {
  try { await deleteAIRouterAccount(Number(req.params.id)); await profileAudit(req,'DELETE_AI_GATEWAY','ai-provider', {accountId:Number(req.params.id)}); res.json({success:true}); }
  catch (e:any) { res.status(400).json({success:false,error:e?.message||'Impossible de supprimer le provider.'}); }
});

app.post('/api/admin/ai/gateway/test', requireAuth, requireRole(RBAC.canAccessAdmin), async (req, res) => {
  try { const accountId=req.body?.accountId ? Number(req.body.accountId) : undefined; const provider=req.body?.provider || undefined; const result=await callGatewayText({prompt:'Réponds uniquement par le mot OPERATIONNEL.',isJson:false,provider,accountId}); if(!result) return res.status(503).json({success:false,error:'Aucun provider configuré.'}); res.json({success:true,provider:result.account.provider,account:result.account.name,model:result.account.model,reply:result.text.trim()}); }
  catch(e:any){ res.status(503).json({success:false,error:e?.message||'Test IA impossible.'}); }
});

app.post('/api/admin/copilot/test', requireAuth, requireRole(RBAC.canAccessAdmin), async (req: Request, res: Response) => {
  const testPrompt = 'Réponds uniquement par le mot OPERATIONNEL.';
  const start = Date.now();
  const reply = await callAIResilient({ prompt: testPrompt, model: String(req.body?.model || '') || undefined });
  const latencyMs = Date.now() - start;
  const config = await getAIConfig();
  if (!reply) return res.status(503).json({ success:false, error:'Le fournisseur IA est indisponible ou non configuré.', model: config.model, latencyMs });
  res.json({ success:true, message:'Fournisseur IA opérationnel.', model:config.model, provider:config.provider, reply:reply.trim(), latencyMs, timestamp:new Date().toISOString() });
});

// ====================================================================
// --- PRODUCTION REST API WITH RBAC FOR ALL PM ENTITIES ---
// ====================================================================
app.use('/api/projects', requireOrigin, requireAuth);
app.use('/api/portfolio', requireAuth);
app.use('/api/audit-logs', requireAuth);
app.use('/api/admin', requireAuth, requireRole(RBAC.canAccessAdmin));

// --- ADMIN USER/PROFILE CRUD ---
const USER_ROLES: UserRole[] = ['ADMINISTRATEUR','DIRECTEUR_PROJETS','PMO','CHEF_PROJET','CONTRIBUTEUR'];
const profileAudit = async (req: Request, action: string, entityId: string, details: any) => {
  const u = currentUser(req);
  dbStore.addAuditLog({ userId: u.id, userEmail: u.email, userRole: u.role, action, entityType: 'USER_PROFILE', entityId, details });
};

app.get('/api/admin/users', async (_req, res) => {
  try { res.json({ success:true, users: await dbStore.listUsers() }); }
  catch (e:any) { res.status(500).json({ success:false, error:e?.message || 'Impossible de charger les profils.' }); }
});

app.post('/api/admin/users', async (req, res) => {
  try {
    const { email, displayName, role, jobTitle, department, officeLocation, avatarUrl, azureOid, isActive } = req.body || {};
    if (!email || !displayName || !role) return res.status(400).json({ success:false, error:'Email, nom affiché et rôle sont obligatoires.' });
    if (!USER_ROLES.includes(role)) return res.status(400).json({ success:false, error:'Rôle invalide.' });
    const existing = await dbStore.getUserByEmail(String(email));
    if (existing) return res.status(409).json({ success:false, error:'Un profil existe déjà pour cet email.' });
    const user = await dbStore.createUser({ email:String(email), displayName:String(displayName), role, jobTitle, department, officeLocation, avatarUrl, azureOid, isActive });
    await profileAudit(req, 'CREATE_USER_PROFILE', user.id, { email:user.email, role:user.role });
    res.status(201).json({ success:true, user });
  } catch (e:any) { res.status(500).json({ success:false, error:e?.code === '23505' ? 'Un profil existe déjà avec cet email ou cet identifiant Entra.' : (e?.message || 'Création impossible.') }); }
});

app.put('/api/admin/users/:id', async (req, res) => {
  try {
    const id = String(req.params.id);
    const existing = await dbStore.getUserById(id);
    if (!existing) return res.status(404).json({ success:false, error:'Profil introuvable.' });
    const updates = { ...req.body };
    if (updates.role && !USER_ROLES.includes(updates.role)) return res.status(400).json({ success:false, error:'Rôle invalide.' });
    if (updates.email) {
      const duplicate = await dbStore.getUserByEmail(String(updates.email));
      if (duplicate && duplicate.id !== id) return res.status(409).json({ success:false, error:'Un autre profil utilise déjà cet email.' });
    }
    if (existing.id === 'local-admin') return res.status(400).json({ success:false, error:'Le compte administrateur local se gère via les variables LOCAL_ADMIN_*.' });
    const user = await dbStore.updateUser(id, updates);
    await profileAudit(req, 'UPDATE_USER_PROFILE', id, updates);
    res.json({ success:true, user });
  } catch (e:any) { res.status(500).json({ success:false, error:e?.code === '23505' ? 'Email ou identifiant Entra déjà utilisé.' : (e?.message || 'Modification impossible.') }); }
});

app.delete('/api/admin/users/:id', async (req, res) => {
  try {
    const id = String(req.params.id);
    if (id === 'local-admin') return res.status(400).json({ success:false, error:'Le compte administrateur local ne peut pas être supprimé ici.' });
    const existing = await dbStore.getUserById(id);
    if (!existing) return res.status(404).json({ success:false, error:'Profil introuvable.' });
    if (existing.role === 'ADMINISTRATEUR' && existing.isActive) {
      const admins = (await dbStore.listUsers()).filter(u => u.role === 'ADMINISTRATEUR' && u.isActive);
      if (admins.length <= 1) return res.status(400).json({ success:false, error:'Impossible de supprimer le dernier administrateur actif.' });
    }
    const deleted = await dbStore.deleteUser(id);
    await profileAudit(req, 'DELETE_USER_PROFILE', id, { email:existing.email, role:existing.role });
    res.json({ success:deleted });
  } catch (e:any) { res.status(500).json({ success:false, error:e?.message || 'Suppression impossible.' }); }
});

app.patch('/api/admin/users/:id/status', async (req, res) => {
  try {
    const id = String(req.params.id); const isActive = Boolean(req.body?.isActive);
    const existing = await dbStore.getUserById(id);
    if (!existing) return res.status(404).json({ success:false, error:'Profil introuvable.' });
    if (!isActive && existing.role === 'ADMINISTRATEUR') {
      const admins = (await dbStore.listUsers()).filter(u => u.role === 'ADMINISTRATEUR' && u.isActive);
      if (admins.length <= 1) return res.status(400).json({ success:false, error:'Impossible de désactiver le dernier administrateur actif.' });
    }
    const user = await dbStore.updateUser(id, { isActive });
    await profileAudit(req, isActive ? 'ACTIVATE_USER_PROFILE' : 'DEACTIVATE_USER_PROFILE', id, { email:existing.email });
    res.json({ success:true, user });
  } catch (e:any) { res.status(500).json({ success:false, error:e?.message || 'Mise à jour du statut impossible.' }); }
});


// 1. Get Schema SQL definition
app.get('/api/schema/sql', requireAuth, requireRole(RBAC.canAccessAdmin), (req: Request, res: Response) => {
  try {
    const schemaPath = path.join(process.cwd(), 'src', 'db', 'schema.sql');
    if (fs.existsSync(schemaPath)) {
      const sql = fs.readFileSync(schemaPath, 'utf8');
      return res.json({ success: true, sql });
    }
    return res.status(404).json({ error: 'Fichier schema.sql introuvable' });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// 2. Portfolio Consolidated Analytics
app.get('/api/portfolio/summary', requireRole(RBAC.canAccessPortfolio), (req: Request, res: Response) => {
  const projects = dbStore.getAllProjects();
  let totalBAC = 0;
  let totalPV = 0;
  let totalEV = 0;
  let totalAC = 0;
  let totalTasks = 0;
  let completedTasks = 0;
  let criticalRisks = 0;

  projects.forEach((p) => {
    totalBAC += p.totalBudget || 0;
    totalTasks += p.tasks?.length || 0;
    completedTasks += p.tasks?.filter((t) => t.status === 'DONE').length || 0;
    criticalRisks += p.risks?.filter((r) => r.probability * r.impact >= 15).length || 0;
    
    p.tasks?.forEach((t) => {
      const pv = t.costEstimated || 0;
      const ac = t.costActual || 0;
      const ev = (pv * (t.completionPercent || 0)) / 100;
      totalPV += pv;
      totalAC += ac;
      totalEV += ev;
    });
  });

  const portfolioCPI = totalAC > 0 ? parseFloat((totalEV / totalAC).toFixed(3)) : 1.0;
  const portfolioSPI = totalPV > 0 ? parseFloat((totalEV / totalPV).toFixed(3)) : 1.0;

  res.json({
    success: true,
    totalProjects: projects.length,
    totalBAC,
    totalPV,
    totalEV,
    totalAC,
    portfolioCPI,
    portfolioSPI,
    costVarianceCV: totalEV - totalAC,
    scheduleVarianceSV: totalEV - totalPV,
    totalTasks,
    completedTasks,
    criticalRisks,
    projectsSummary: projects.map((p) => ({
      id: p.id,
      code: p.code,
      name: p.name,
      client: p.client,
      status: p.status,
      totalBudget: p.totalBudget,
      tasksCount: p.tasks?.length || 0,
      membersCount: p.members?.length || 0,
    })),
  });
});

// 3. Projects Endpoints (CRUD)
const IMPORT_FIELD_ALIASES: Record<string, string[]> = {
  code: ['code', 'code projet', 'project code', 'id projet', 'reference', 'référence', 'ref'],
  name: ['nom', 'nom projet', 'project name', 'nom du projet', 'intitulé', 'libellé', 'project title'],
  description: ['description', 'descriptif', 'project description', 'details', 'détails'],
  client: ['client', 'customer', 'client name', 'société', 'societe', 'company', 'compte'],
  managerName: ['chef de projet', 'chef projet', 'project manager', 'pm', 'manager', 'responsable', 'pilot'],
  managerEmail: ['email chef de projet', 'pm email', 'manager email', 'email responsable', 'project manager email'],
  status: ['statut', 'status', 'état', 'etat', 'project status'],
  priority: ['priorité', 'priorite', 'priority', 'project priority'],
  methodology: ['méthodologie', 'methodologie', 'methodology', 'méthode', 'methode'],
  startDate: ['date début', 'date de début', 'début', 'debut', 'start date', 'date start'],
  endDate: ['date fin', 'date de fin', 'fin', 'end date', 'date end'],
  totalBudget: ['budget', 'budget total', 'budget bac', 'bac', 'montant', 'budget (€)', 'budget eur'],
  currency: ['devise', 'currency', 'monnaie'],
};

function normHeader(value: unknown) {
  return String(value ?? '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
}
function normalizeDate(value: unknown): string {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10);
  if (typeof value === 'number') {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (parsed) return `${String(parsed.y).padStart(4,'0')}-${String(parsed.m).padStart(2,'0')}-${String(parsed.d).padStart(2,'0')}`;
  }
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  const iso = raw.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
  if (iso) return `${iso[1]}-${iso[2].padStart(2,'0')}-${iso[3].padStart(2,'0')}`;
  const fr = raw.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/);
  if (fr) return `${fr[3]}-${fr[2].padStart(2,'0')}-${fr[1].padStart(2,'0')}`;
  return '';
}
function parseAmount(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const raw = String(value ?? '').replace(/\s/g, '').replace(/€/g, '').replace(/,/g, '.');
  const n = Number(raw.replace(/[^0-9.-]/g, ''));
  return Number.isFinite(n) ? n : 0;
}
function canonicalStatus(value: unknown): Project['status'] {
  const v = normHeader(value);
  if (v.includes('termin') || v.includes('complete') || v.includes('completed')) return 'COMPLETED';
  if (v.includes('pause') || v.includes('hold')) return 'ON_HOLD';
  if (v.includes('risque') || v.includes('risk')) return 'AT_RISK';
  if (v.includes('plan') || v.includes('planning') || v.includes('cadrage')) return 'PLANNING';
  return 'IN_PROGRESS';
}
function canonicalPriority(value: unknown): Project['priority'] {
  const v = normHeader(value);
  if (v.includes('critique') || v.includes('critical')) return 'CRITICAL';
  if (v.includes('faible') || v.includes('low') || v.includes('basse')) return 'LOW';
  if (v.includes('moyen') || v.includes('medium')) return 'MEDIUM';
  return 'HIGH';
}
function canonicalMethodology(value: unknown): Project['methodology'] {
  const v = normHeader(value);
  if (v.includes('agile')) return 'AGILE';
  if (v.includes('water')) return 'WATERFALL';
  return 'HYBRID';
}
function compactHeader(value: unknown) {
  return normHeader(value).replace(/\s+/g, '');
}

function headerMap(headers: string[]) {
  const map: Record<string, string> = {};
  const normalized = headers.map(normHeader);
  const compact = headers.map(compactHeader);
  for (const [field, aliases] of Object.entries(IMPORT_FIELD_ALIASES)) {
    let bestIdx = -1;
    let bestScore = -1;
    for (let i = 0; i < headers.length; i++) {
      const h = normalized[i];
      const hc = compact[i];
      for (const alias of aliases) {
        const a = normHeader(alias);
        const ac = compactHeader(alias);
        let score = -1;
        if (h === a) score = 100;
        else if (hc === ac) score = 95;
        else if (h.includes(a) && a.length >= 4) score = 80 + a.length / 100;
        else if (hc.includes(ac) && ac.length >= 4) score = 70 + ac.length / 100;
        if (score > bestScore) { bestScore = score; bestIdx = i; }
      }
    }
    if (bestIdx >= 0) map[field] = headers[bestIdx];
  }
  return map;
}

function detectHeaderRow(matrix: any[][]) {
  const maxRows = Math.min(matrix.length, 15);
  let best = { index: 0, score: -1 };
  const expected = Object.values(IMPORT_FIELD_ALIASES).flat().map(compactHeader);
  for (let i = 0; i < maxRows; i++) {
    const row = matrix[i] || [];
    const cells = row.map(v => String(v ?? '').trim()).filter(Boolean);
    if (!cells.length) continue;
    const compactCells = cells.map(compactHeader);
    let score = 0;
    for (const cell of compactCells) {
      if (expected.some(a => cell === a || (a.length >= 5 && cell.includes(a)) || (cell.length >= 5 && a.includes(cell)))) score++;
    }
    // A real header row normally contains at least two recognizable fields.
    if (score >= 2 && score > best.score) best = { index: i, score };
  }
  return best.index;
}
function cleanJsonResponse(text: string): string {
  const trimmed = String(text || '').trim();
  if (!trimmed) return '';
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  return (fenced ? fenced[1] : trimmed).trim();
}

function generateImportCode(name: string, rowNumber: number, usedCodes: Set<string>): string {
  const base = compactHeader(name).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 18).toUpperCase() || 'PROJET';
  let candidate = `IMP-${base}-${String(rowNumber).padStart(3, '0')}`;
  let i = 2;
  while (usedCodes.has(candidate.toLowerCase())) {
    candidate = `IMP-${base}-${String(rowNumber).padStart(3, '0')}-${i++}`;
  }
  usedCodes.add(candidate.toLowerCase());
  return candidate;
}

function validateImportProject(project: any) {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (!project.name) errors.push('Nom du projet introuvable');
  if (!project.code) warnings.push('Code projet absent : CLARITY PM générera un code à l’import');
  if (!project.startDate) warnings.push('Date de début non trouvée');
  if (!project.endDate) warnings.push('Date de fin non trouvée');
  if (project.startDate && project.endDate && project.endDate < project.startDate) errors.push('Fin antérieure au début');
  if (!project.client) warnings.push('Client non identifié');
  if (!project.managerName) warnings.push('Chef de projet non identifié');
  return { valid: errors.length === 0, errors, warnings };
}

function normalizeImportedProject(raw: any, rowNumber: number, managerLookup: UserProfile[] = [], usedCodes = new Set<string>()) {
  const email = String(raw?.managerEmail || '').trim().toLowerCase();
  const managerNameRaw = String(raw?.managerName || '').trim();
  const manager = managerLookup.find(u =>
    (email && u.email.toLowerCase() === email) ||
    (!email && managerNameRaw && u.displayName.toLowerCase() === managerNameRaw.toLowerCase())
  );
  const project: any = {
    id: String(raw?.id || `proj-import-${crypto.randomUUID()}`),
    code: String(raw?.code || '').trim(),
    name: String(raw?.name || '').trim(),
    description: String(raw?.description || '').trim(),
    client: String(raw?.client || '').trim(),
    managerName: manager?.displayName || managerNameRaw,
    managerId: manager?.id,
    status: canonicalStatus(raw?.status),
    priority: canonicalPriority(raw?.priority),
    methodology: canonicalMethodology(raw?.methodology),
    startDate: normalizeDate(raw?.startDate),
    endDate: normalizeDate(raw?.endDate),
    totalBudget: parseAmount(raw?.totalBudget),
    currency: String(raw?.currency || 'EUR').trim().toUpperCase() || 'EUR',
    members: [], tasks: [], milestones: [], risks: [], kpiWidgets: [],
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
  };
  if (project.code) usedCodes.add(project.code.toLowerCase());
  const validation = validateImportProject(project);
  return { rowNumber, valid: validation.valid, errors: validation.errors, warnings: validation.warnings, duplicate: false, confidence: Number(raw?.confidence) || 0, evidence: String(raw?.evidence || ''), project };
}


function inferProjectName(raw: Record<string, unknown>, mapped: Record<string, unknown>): string {
  const explicit = String(mapped.name || '').trim();
  if (explicit) return explicit;
  const code = String(mapped.code || '').trim();
  const client = String(mapped.client || '').trim();
  const description = String(mapped.description || '').trim();
  // For unstructured files, create a neutral working label from facts already present.
  // This is deliberately not presented as an AI-invented project name.
  if (code && client) return `${code} — ${client}`;
  if (code) return code;
  if (client && description) return `${client} — ${description.slice(0, 80)}`;
  if (client) return `Projet — ${client}`;
  if (description) return description.slice(0, 100);
  const candidates = Object.values(raw)
    .map(v => String(v ?? '').trim())
    .filter(v => v && v.length >= 4)
    .filter(v => !/^\d+$/.test(v))
    .filter(v => !/^(planifi|en cours|termine|terminé|actif|inactive|n\/a|eur|€)$/i.test(v));
  return candidates[0] || '';
}

function buildProjectFromRow(raw: Record<string, unknown>, rowNumber: number, mapping: Record<string,string>, managerLookup: UserProfile[] = []) {
  const get = (key: string) => mapping[key] ? raw[mapping[key]] : undefined;
  const mapped: Record<string, unknown> = {};
  for (const field of Object.keys(IMPORT_FIELD_ALIASES)) mapped[field] = get(field);
  const email = String(mapped.managerEmail || '').trim().toLowerCase();
  const managerNameRaw = String(mapped.managerName || '').trim();
  const manager = managerLookup.find(u =>
    (email && u.email.toLowerCase() === email) ||
    (!email && managerNameRaw && u.displayName.toLowerCase() === managerNameRaw.toLowerCase())
  );
  const project: any = {
    id: `proj-import-${crypto.randomUUID()}`,
    code: String(mapped.code || '').trim(),
    name: inferProjectName(raw, mapped),
    description: String(mapped.description || '').trim(),
    client: String(mapped.client || '').trim(),
    managerName: manager?.displayName || managerNameRaw,
    managerId: manager?.id,
    status: canonicalStatus(mapped.status),
    priority: canonicalPriority(mapped.priority),
    methodology: canonicalMethodology(mapped.methodology),
    startDate: normalizeDate(mapped.startDate),
    endDate: normalizeDate(mapped.endDate),
    totalBudget: parseAmount(mapped.totalBudget),
    currency: String(mapped.currency || 'EUR').trim().toUpperCase() || 'EUR',
    members: [], tasks: [], milestones: [], risks: [], kpiWidgets: [],
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
  };
  const validation = validateImportProject(project);
  return { rowNumber, valid: validation.valid, errors: validation.errors, warnings: validation.warnings, duplicate: false, confidence: project.name ? 0.65 : 0.45, source: 'Excel', evidence: Object.values(raw).map(v => String(v ?? '').trim()).filter(Boolean).join(' | '), project };
}

function buildHeuristicRows(workbook: any, managerLookup: UserProfile[] = []) {
  const out: any[] = [];
  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const matrix = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: false }) as any[][];
    const headerRowIndex = detectHeaderRow(matrix);
    const headers = (matrix[headerRowIndex] || []).map((h: any) => String(h ?? '').trim());
    const mapping = headerMap(headers);
    for (let i = 0; i < matrix.length; i++) {
      if (i === headerRowIndex) continue;
      const row = matrix[i] || [];
      if (!row.some(v => String(v ?? '').trim())) continue;
      const raw: Record<string, unknown> = {};
      headers.forEach((h: string, idx: number) => { if (h) raw[h] = row[idx]; });
      // If the detected headers are weak, still capture the row as raw evidence.
      if (!Object.keys(mapping).length) {
        row.forEach((v, idx) => { if (String(v ?? '').trim()) raw[`col_${idx + 1}`] = v; });
      }
      const built = buildProjectFromRow(raw, i + 1, mapping, managerLookup);
      if (built.project.name || built.project.code || built.project.client || built.project.description) out.push({ ...built, source: 'Règles', sheet: sheetName });
    }
  }
  return out;
}

function buildSheetEvidence(workbook: any): { text: string; rows: Array<{ sheet: string; row: number; values: string[] }> } {
  const rows: Array<{ sheet: string; row: number; values: string[] }> = [];
  const blocks: string[] = [];
  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) continue;
    const matrix = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: false }) as any[][];
    const compactRows: string[] = [];
    matrix.forEach((row, idx) => {
      const values = (row || []).map(v => String(v ?? '').trim());
      if (!values.some(Boolean)) return;
      rows.push({ sheet: sheetName, row: idx + 1, values });
      const cells = values.map((value, col) => value ? `${XLSX.utils.encode_cell({r: idx, c: col})}=${JSON.stringify(value)}` : '').filter(Boolean);
      compactRows.push(`L${idx + 1}: ${cells.join(' | ')}`);
    });
    if (compactRows.length) blocks.push(`### FEUILLE: ${sheetName}\n${compactRows.join('\n')}`);
  }
  return { text: blocks.join('\n\n'), rows };
}

function mergeProjectExtraction(base: any, ai: any): any {
  const merged = { ...(base || {}), ...(ai || {}) };
  if (base?.code) merged.code = base.code;
  for (const key of ['startDate', 'endDate', 'totalBudget', 'currency']) {
    if (base?.[key] !== undefined && base?.[key] !== '' && base?.[key] !== 0) merged[key] = base[key];
  }
  if (!base?.name && ai?.name) merged.name = ai.name;
  const aiDescription = String(ai?.description || '').trim();
  const looksRaw = /(^|\n)FICHIER |### FEUILLE:|^L\d+:/m.test(aiDescription) || aiDescription.length > 2500;
  if (!base?.description && aiDescription && !looksRaw) merged.description = aiDescription;
  if (!base?.description && !merged.description && base?.name) merged.description = `Projet ${base.name}.`;
  return merged;
}

async function extractProjectsWithAI(evidence: string): Promise<Array<any>> {
  if (!evidence.trim()) return [];
  const maxChars = 70000;
  const chunks: string[] = [];
  if (evidence.length <= maxChars) chunks.push(evidence);
  else {
    let cursor = 0;
    while (cursor < evidence.length) {
      let end = Math.min(cursor + maxChars, evidence.length);
      const lastBreak = evidence.lastIndexOf('\n', end);
      if (lastBreak > cursor + 20000) end = lastBreak;
      chunks.push(evidence.slice(cursor, end));
      cursor = end;
    }
  }

  const all: any[] = [];
  for (let i = 0; i < chunks.length; i++) {
    const prompt = `Tu es l'agent d'import de CLARITY PM. Tu analyses un fichier de gestion de projets Excel potentiellement TRÈS MAL STRUCTURÉ.
Ta mission est de RECONSTRUIRE les projets présents dans le document, même si :
- les en-têtes sont absents, décalés, sur plusieurs lignes ou dans une autre langue;
- les informations sont réparties dans plusieurs feuilles;
- un projet est décrit par un bloc de lignes, une fiche, des cellules fusionnées ou une combinaison de tableaux;
- les colonnes changent d'une feuille à l'autre;
- certaines valeurs sont absentes ou placées sous des libellés non standard.

RÈGLES STRICTES:
1. Recherche des PROJETS RÉELS, pas chaque ligne. Une fiche projet peut couvrir plusieurs lignes.
2. Regroupe les lignes qui parlent du même projet.
3. Utilise le contexte du classeur, les titres, clients, codes, chefs de projet, dates, budgets, statuts, descriptions et technologies.
4. Ne transforme pas une personne, un client ou un service en projet sans preuve contextuelle.
5. Ne fabrique aucune donnée factuelle absente. Un champ inconnu doit être null/"".
6. Si un nom de projet est explicitement présent dans le document, utilise-le même s'il n'est pas dans une colonne "Nom".
7. Si un code projet est présent, conserve-le exactement. Sinon laisse code vide: CLARITY PM générera un code technique après extraction.
8. Les dates doivent respecter YYYY-MM-DD lorsqu'elles sont connues avec certitude.
9. Les nombres doivent être numériques. La devise par défaut peut être EUR seulement si le document est manifestement en euros; sinon vide.
10. Retourne aussi une confiance 0..1 et une courte preuve textuelle pour chaque projet.
11. Ignore les totaux généraux, lignes d'en-tête, sous-totaux, signatures et informations purement administratives.
12. Deux occurrences du même projet dans plusieurs feuilles doivent être fusionnées.

SCHÉMA DE SORTIE STRICT:
{"projects":[{"name":"","code":"","description":"","client":"","managerName":"","managerEmail":"","status":"","priority":"","methodology":"","startDate":"","endDate":"","totalBudget":0,"currency":"","confidence":0.0,"evidence":""}]}

Valeurs normalisées recommandées: statut PLANNING|IN_PROGRESS|ON_HOLD|COMPLETED|AT_RISK; priorité LOW|MEDIUM|HIGH|CRITICAL; méthodologie AGILE|WATERFALL|HYBRID.

PARTIE ${i + 1}/${chunks.length} DU FICHIER:
${chunks[i]}`;
    const text = await callGeminiResilient({ prompt, isJson: true });
    if (!text) continue;
    try {
      const parsed = JSON.parse(cleanJsonResponse(text));
      if (Array.isArray(parsed?.projects)) all.push(...parsed.projects);
    } catch (err) {
      console.warn('Gemini extraction JSON invalide:', err instanceof Error ? err.message : String(err));
    }
  }
  return all;
}



const PROJECT_INTAKE_PROMPT = `Tu es l'agent de structuration documentaire de CLARITY PM.
Tu analyses plusieurs fichiers qui alimentent UN PROJET DEJA SELECTIONNE.
OBJECTIF: construire une mise à jour structurée du projet, pas copier le contenu des documents dans la description.

REGLES ABSOLUES:
1. Identifie d'abord le contexte du projet (nom, code, client, direction, chef de projet, statut, dates, budget, avancement).
2. Répartis chaque information dans le bon emplacement du modèle CLARITY PM.
3. Pour un classeur Excel, analyse TOUTES les feuilles et les blocs métier: fiche/rapport projet, planning/dates, checklist/jalons, risques/alertes, budget, actions, ressources/acteurs, synthèse et commentaires.
4. Une feuille peut décrire le même projet que les autres: fusionne les informations au lieu de créer des doublons.
5. Une ligne n'est PAS forcément un projet: une fiche peut s'étaler sur des dizaines de lignes.
6. Ne mets JAMAIS une copie brute du document dans projectPatch.description. La description doit être une synthèse courte et utile (2 à 5 phrases maximum) basée uniquement sur les faits trouvés.
7. Les informations détaillées doivent aller dans tasks, milestones, risks et members.
8. Les événements de planning deviennent des milestones quand ils représentent des étapes/livraisons; les éléments de checklist deviennent des milestones ou tasks selon leur nature.
9. Les actions récentes deviennent des tasks si elles ont un objet/action identifiable.
10. Les alertes/riesques deviennent des risks; ne crée pas de risque à partir d'un simple titre de section vide.
11. Les noms de personnes ne deviennent jamais des projets.
12. Ne fabrique aucune donnée. Champ inconnu = null ou ''.
13. Conserve exactement les codes, noms, clients, dates et montants trouvés dans les documents; normalise seulement leur format.
14. Pour chaque élément extrait, retourne confidence 0..1 et evidence courte avec la feuille/fichier et la cellule ou ligne si possible.
15. Si plusieurs valeurs existent, privilégie la plus récente/explicitement marquée révisée et signale le conflit dans warnings.
16. Le système CLARITY PM revalidera toutes les valeurs avant écriture.

REPARTITION ATTENDUE:
- projectPatch.description = résumé métier du projet, jamais les données brutes.
- projectPatch = attributs généraux du projet.
- milestones = dates clés, livraisons, changements, étapes de qualité, MEP, recette, etc.
- tasks = actions, tâches, travaux à réaliser ou checklist opérationnelle.
- risks = alertes/risques avec cause/impact/mitigation quand elles sont présentes.
- members = personnes ou équipes réellement identifiées.

Le JSON doit respecter exactement le schéma demandé par l'application.
`;

function buildDeterministicProjectIntake(files: Express.Multer.File[]) {
  const patch: any = {};
  const tasks: any[] = [];
  const milestones: any[] = [];
  const risks: any[] = [];
  const members: any[] = [];
  const warnings: string[] = [];
  const evidence: string[] = [];
  const addEvidence = (text: string) => { if (text && !evidence.includes(text)) evidence.push(text); };

  for (const f of files) {
    const ext = path.extname(f.originalname || '').toLowerCase();
    if (!['.xlsx', '.xls', '.csv'].includes(ext)) continue;
    try {
      const wb = XLSX.read(f.buffer, { type:'buffer', cellDates:true, dense:false });
      for (const sheetName of wb.SheetNames) {
        const sheet = wb.Sheets[sheetName];
        if (!sheet) continue;
        const matrix = XLSX.utils.sheet_to_json(sheet, { header:1, defval:'', raw:false }) as any[][];
        const nonEmpty = (matrix || []).map((r, i) => ({ i:i+1, v:(r||[]).map(x=>String(x ?? '').trim()) })).filter(x=>x.v.some(Boolean));
        const flat = nonEmpty.map(x=>x.v.filter(Boolean).join(' | ')).join('\n');
        if (flat) addEvidence(`${f.originalname} / ${sheetName}: ${flat.slice(0, 12000)}`);
        for (const rowInfo of nonEmpty) {
          const vals = rowInfo.v;
          for (let c=0;c<vals.length-1;c++) {
            const label = vals[c].toLowerCase();
            const value = vals[c+1];
            if (!value) continue;
            const source = `${f.originalname} / ${sheetName} / L${rowInfo.i}`;
            const set = (key:string, v:any) => { if ((patch[key]===undefined || patch[key]==='') && v!==undefined && v!=='') patch[key]=v; };
            if (/^référence\s+comev|^reference\s+comev/.test(label)) set('code', value.replace(/^[-\s]+/,''));
            else if (/^imputation\s+ogpp/.test(label)) { const m=value.match(/\(?\s*([A-Z0-9 _-]+)\s*\)?\s*$/); if (!patch.name && m) patch.name=m[1].trim(); }
            else if (/^objectif\s+du\s+projet/.test(label)) set('description', value);
            else if (/^bu\s*\/\s*direction/.test(label)) set('client', value);
            else if (/^cp\s+decsi|^cp\s+tma|^cpp/.test(label)) set('managerName', value);
            else if (/^date\s+d[ée]but\s+projet/.test(label)) set('startDate', normalizeDate(value));
            else if (/^date\s+(ouv\.|ouverture)\s+service/.test(label)) set('endDate', normalizeDate(value));
            else if (/^statut\s+du\s+projet/.test(label)) set('status', value);
            else if (/^priorit[ée]/.test(label)) set('priority', value);
            else if (/^type\s+projet/.test(label)) set('methodology', value);
            else if (/^domaine/.test(label)) addEvidence(`${source}: Domaine=${value}`);
            else if (/^complexit[ée]/.test(label)) addEvidence(`${source}: Complexité=${value}`);
            else if (/^%\s*d.?avancement/.test(label)) addEvidence(`${source}: Avancement=${value}`);
            else if (/^commentaire/.test(label)) addEvidence(`${source}: ${value}`);
          }
          // Checklist / actions: detect explicit action rows without treating headers as tasks.
          const line = vals.filter(Boolean).join(' | ');
          const low = line.toLowerCase();
          if (sheetName.toLowerCase().includes('check') && vals[0] && !/^(jalons|livrables)/i.test(vals[0]) && vals[0].length > 10) {
            const title = vals[0];
            const targetDate = vals[4] ? normalizeDate(vals[4]) : '';
            milestones.push({ title, targetDate, description: vals.slice(1).filter(Boolean).join(' | '), confidence:0.9, evidence:`${f.originalname} / ${sheetName} / L${rowInfo.i}` });
          } else if (/action|a faire|à faire|remédiation|remediation/i.test(low) && vals[0] && vals[0].length > 6 && !/^(actions?|porte(r|ur)|statut)$/i.test(vals[0])) {
            tasks.push({ title: vals[0], description: vals.slice(1).filter(Boolean).join(' | '), status:'TODO', priority:'MEDIUM', startDate:'', dueDate:'', estimatedHours:0, category:'DOCUMENT-IA', tags:['DOCUMENT'], confidence:0.75, evidence:`${f.originalname} / ${sheetName} / L${rowInfo.i}` });
          }
          if (/alerte|risque|niveau de risque/i.test(low) && vals[0] && vals[0].length > 6 && !/^(alerte|risques?)/i.test(vals[0])) {
            risks.push({ title: vals[0], description: vals.slice(1).filter(Boolean).join(' | '), category:'EXTERNE', probability:1, impact:1, mitigationPlan:'', contingencyPlan:'', status:'ACTIVE', confidence:0.65, evidence:`${f.originalname} / ${sheetName} / L${rowInfo.i}` });
          }
        }
      }
    } catch (e) {
      warnings.push(`Lecture locale impossible pour ${f.originalname}.`);
    }
  }
  if (!patch.name && patch.code) patch.name = patch.code;
  return {
    projectPatch: patch,
    tasks: Array.from(new Map(tasks.map(x=>[`${x.title}|${x.evidence}`,x])).values()),
    milestones: Array.from(new Map(milestones.map(x=>[`${x.title}|${x.targetDate}`,x])).values()),
    risks: Array.from(new Map(risks.map(x=>[`${x.title}|${x.evidence}`,x])).values()),
    members,
    sourceSummary: 'Extraction locale structurée par feuilles, libellés et blocs.',
    warnings,
    evidence
  };
}

function extractTextForLocalProvider(files: Express.Multer.File[]) {
  const parts: string[] = [];
  for (const f of files) {
    const ext = path.extname(f.originalname || '').toLowerCase();
    if (ext === '.xlsx' || ext === '.xls' || ext === '.csv') {
      try {
        const wb = XLSX.read(f.buffer, { type:'buffer', cellDates:true, dense:false });
        const pack = buildSheetEvidence(wb);
        parts.push(`FICHIER ${f.originalname}\n${pack.text}`);
      } catch { parts.push(`FICHIER ${f.originalname}\nImpossible de lire ce fichier localement.`); }
    } else if (['.txt','.md','.json'].includes(ext)) {
      parts.push(`FICHIER ${f.originalname}\n${f.buffer.toString('utf8').slice(0,180000)}`);
    }
  }
  return parts.join('\n\n');
}

app.get('/api/project-managers', requireAuth, requireRole((r) => r === 'DIRECTEUR_PROJETS'), async (_req, res) => {
  try {
    const users = (await dbStore.listUsers()).filter(u => u.isActive && u.role === 'CHEF_PROJET');
    res.json({ success: true, users });
  } catch (e: any) {
    res.status(500).json({ success: false, error: e?.message || 'Impossible de charger les chefs de projet.' });
  }
});

function canViewProject(project: Project, user: MicrosoftSessionUser): boolean {
  if (user.role === 'DIRECTEUR_PROJETS' || user.role === 'PMO') return true;
  if (user.role === 'ADMINISTRATEUR') return false;
  if (user.role === 'CHEF_PROJET') {
    return project.managerId === user.id ||
      project.managerName?.toLowerCase() === user.displayName?.toLowerCase() ||
      project.members?.some(m => m.id === user.id || m.email?.toLowerCase() === user.email.toLowerCase());
  }
  if (user.role === 'CONTRIBUTEUR') {
    return project.members?.some(m => m.id === user.id || m.email?.toLowerCase() === user.email.toLowerCase()) ||
      project.tasks?.some(t => t.assigneeId === user.id || t.assigneeId === user.email);
  }
  return false;
}

app.get('/api/projects', (req: Request, res: Response) => {
  const user = currentUser(req);
  if (user.role === 'ADMINISTRATEUR') return res.status(403).json({ error: 'Les administrateurs système utilisent uniquement la console d’administration.' });
  const projects = dbStore.getAllProjects().filter(project => canViewProject(project, user));
  res.json({ success: true, count: projects.length, data: projects });
});

app.get('/api/projects/:id', (req: Request, res: Response) => {
  const project = dbStore.getProjectById(req.params.id);
  const user = currentUser(req);
  if (!project) {
    return res.status(404).json({ error: 'Projet introuvable.' });
  }
  if (!canViewProject(project, user)) return res.status(403).json({ error: 'Vous n’avez pas accès à ce projet.' });
  res.json({ success: true, data: project });
});

// CREATE PROJECT — Restricted to DIRECTEUR_PROJETS
app.post('/api/projects', async (req: Request, res: Response) => {
  const user = currentUser(req);
  if (!RBAC.canCreateOrDeleteProject(user.role)) {
    return res.status(403).json({
      error: 'Accès refusé : seul le Directeur de Projets peut créer un projet.',
      requiredRole: 'DIRECTEUR_PROJETS',
      userRole: user.role,
    });
  }

  const projectPayload = req.body;
  if (!projectPayload.name || !projectPayload.code) {
    return res.status(400).json({ error: 'Nom et code du projet requis.' });
  }

  const created = await dbStore.createProject(
    {
      id: projectPayload.id || `proj-${Date.now()}`,
      code: projectPayload.code,
      name: projectPayload.name,
      description: projectPayload.description || '',
      client: projectPayload.client || 'Direction Générale',
      managerName: projectPayload.managerName || user.displayName,
      managerId: projectPayload.managerId || undefined,
      status: projectPayload.status || 'PLANNING',
      priority: projectPayload.priority || 'HIGH',
      methodology: projectPayload.methodology || 'HYBRID',
      startDate: projectPayload.startDate || new Date().toISOString().split('T')[0],
      endDate: projectPayload.endDate || new Date(Date.now() + 90 * 86400000).toISOString().split('T')[0],
      totalBudget: Number(projectPayload.totalBudget || projectPayload.budgetBAC) || 100000,
      currency: projectPayload.currency || 'EUR',
      members: projectPayload.members || [],
      tasks: projectPayload.tasks || [],
      milestones: projectPayload.milestones || [],
      risks: projectPayload.risks || [],
      kpiWidgets: projectPayload.kpiWidgets || [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    user
  );

  res.status(201).json({ success: true, data: created });
});

// UPDATE PROJECT
app.put('/api/projects/:id', requireRole(RBAC.canManageProject), async (req: Request, res: Response) => {
  const user = currentUser(req);
  const existing = dbStore.getProjectById(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Projet introuvable.' });
  if (!canViewProject(existing, user)) return res.status(403).json({ error: 'Vous n’avez pas accès à ce projet.' });
  const updated = await dbStore.updateProject(req.params.id, req.body, user);
  if (!updated) {
    return res.status(404).json({ error: 'Projet introuvable.' });
  }
  res.json({ success: true, data: updated });
});

// BULK DELETE PROJECTS — Restricted to DIRECTEUR_PROJETS
app.delete('/api/projects', async (req: Request, res: Response) => {
  const user = currentUser(req);
  if (!RBAC.canCreateOrDeleteProject(user.role)) {
    return res.status(403).json({
      error: 'Accès refusé : seul le Directeur de Projets peut supprimer des projets.',
      requiredRole: 'DIRECTEUR_PROJETS',
      userRole: user.role,
    });
  }

  const ids = Array.isArray(req.body?.ids) ? req.body.ids.map((id: unknown) => String(id)).filter(Boolean) : [];
  if (!ids.length) return res.status(400).json({ error: 'Aucun projet sélectionné.' });
  if (ids.length > 500) return res.status(400).json({ error: 'Maximum 500 projets par suppression.' });

  const visibleIds = ids.filter(id => {
    const project = dbStore.getProjectById(id);
    return project && canViewProject(project, user);
  });
  if (!visibleIds.length) return res.status(404).json({ error: 'Aucun projet sélectionné n’est accessible.' });

  try {
    const deletedIds = await dbStore.deleteProjectsBulk(visibleIds, user);
    return res.json({ success: true, deleted: deletedIds.length, ids: deletedIds });
  } catch (error: any) {
    console.error('Bulk project deletion failed:', error);
    return res.status(500).json({ error: error?.message || 'Impossible de supprimer les projets sélectionnés.' });
  }
});

// DELETE PROJECT — Restricted to DIRECTEUR_PROJETS
app.delete('/api/projects/:id', async (req: Request, res: Response) => {
  const user = currentUser(req);
  if (!RBAC.canCreateOrDeleteProject(user.role)) {
    return res.status(403).json({
      error: 'Accès refusé : seul le Directeur de Projets peut supprimer un projet.',
      requiredRole: 'DIRECTEUR_PROJETS',
      userRole: user.role,
    });
  }

  const existing = dbStore.getProjectById(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Projet introuvable.' });
  if (!canViewProject(existing, user)) return res.status(403).json({ error: 'Vous n’avez pas accès à ce projet.' });
  const success = await dbStore.deleteProject(req.params.id, user);
  if (!success) {
    return res.status(404).json({ error: 'Projet introuvable.' });
  }
  res.json({ success: true, message: 'Projet supprimé avec succès.' });
});

// JSON import — Projects for Director, Tasks/Milestones for other project roles.
const JSON_IMPORT_LIMIT = 500;
function normalizeJsonImport(type: 'projects'|'tasks'|'milestones', items: any[], user: MicrosoftSessionUser) {
  const errors: string[] = [];
  const normalized: any[] = [];
  const seen = new Set<string>();
  const today = new Date().toISOString().split('T')[0];
  for (let i = 0; i < items.length; i++) {
    const raw = items[i] || {};
    const n = i + 1;
    if (type === 'projects') {
      const code = String(raw.code || raw.projectCode || '').trim();
      const name = String(raw.name || raw.title || '').trim();
      if (!code || !name) { errors.push(`Ligne ${n}: code et name sont obligatoires.`); continue; }
      const key = code.toLowerCase();
      if (seen.has(key)) { errors.push(`Ligne ${n}: doublon dans le fichier pour le code ${code}.`); continue; }
      seen.add(key);
      const existing = dbStore.getAllProjects().find(p => p.code.toLowerCase() === key);
      if (existing) { errors.push(`Ligne ${n}: le projet ${code} existe déjà.`); continue; }
      const startDate = String(raw.startDate || today).slice(0,10);
      const endDate = String(raw.endDate || startDate).slice(0,10);
      if (endDate < startDate) { errors.push(`Ligne ${n}: endDate antérieure à startDate.`); continue; }
      normalized.push({
        id: String(raw.id || `proj-${Date.now()}-${i}-${crypto.randomBytes(3).toString('hex')}`), code, name,
        description: String(raw.description || ''), client: String(raw.client || 'Direction Générale'),
        managerName: String(raw.managerName || user.displayName), managerId: raw.managerId || undefined,
        status: raw.status || 'PLANNING', priority: raw.priority || 'MEDIUM', methodology: raw.methodology || 'HYBRID',
        startDate, endDate, totalBudget: Number(raw.totalBudget ?? raw.budget ?? raw.budgetBAC ?? 0) || 0,
        currency: String(raw.currency || 'EUR'), members: Array.isArray(raw.members) ? raw.members : [],
        tasks: [], milestones: [], risks: [], kpiWidgets: [], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
      });
    } else {
      const projectId = String(raw.projectId || '').trim();
      const projectCode = String(raw.projectCode || raw.codeProjet || '').trim();
      const project = projectId ? dbStore.getProjectById(projectId) : dbStore.getAllProjects().find(p => p.code.toLowerCase() === projectCode.toLowerCase());
      if (!project) { errors.push(`Ligne ${n}: projet introuvable${projectCode ? ` (${projectCode})` : ''}.`); continue; }
      if (!canViewProject(project, user)) { errors.push(`Ligne ${n}: accès refusé au projet ${project.code}.`); continue; }
      if (type === 'tasks') {
        const title = String(raw.title || raw.name || '').trim();
        if (!title) { errors.push(`Ligne ${n}: title est obligatoire.`); continue; }
        const key = `${project.id}|${title.toLowerCase()}`;
        if (seen.has(key)) { errors.push(`Ligne ${n}: doublon de tâche ${title}.`); continue; }
        seen.add(key);
        normalized.push({ projectId: project.id, title, description: raw.description, status: raw.status || 'TODO', priority: raw.priority || 'MEDIUM', assigneeId: raw.assigneeId, startDate: raw.startDate || today, dueDate: raw.dueDate || raw.endDate || today, estimatedHours: Number(raw.estimatedHours || 0), actualHours: Number(raw.actualHours || 0), completionPercent: Number(raw.completionPercent ?? raw.progress ?? 0), costEstimated: Number(raw.costEstimated ?? raw.plannedCost ?? 0), costActual: Number(raw.costActual ?? raw.actualCost ?? 0), category: raw.category || 'Général', tags: Array.isArray(raw.tags) ? raw.tags : [], subtasks: Array.isArray(raw.subtasks) ? raw.subtasks : [], predecessorIds: Array.isArray(raw.predecessorIds) ? raw.predecessorIds : (Array.isArray(raw.dependencies) ? raw.dependencies : []) });
      } else {
        const title = String(raw.title || raw.name || '').trim();
        if (!title) { errors.push(`Ligne ${n}: title est obligatoire.`); continue; }
        const key = `${project.id}|${title.toLowerCase()}`;
        if (seen.has(key)) { errors.push(`Ligne ${n}: doublon de jalon ${title}.`); continue; }
        seen.add(key);
        normalized.push({ projectId: project.id, title, targetDate: raw.targetDate || raw.date || today, completed: Boolean(raw.completed), description: raw.description, deliverable: raw.deliverable, deliverables: Array.isArray(raw.deliverables) ? raw.deliverables : undefined });
      }
    }
  }
  return { items: normalized, errors, validCount: normalized.length, errorCount: errors.length, duplicateCount: errors.filter(e => /doublon|existe déjà/.test(e)).length };
}

app.post('/api/import-json/validate', requireOrigin, requireAuth, (req: Request, res: Response) => {
  const user = currentUser(req);
  const type = req.body?.type as 'projects'|'tasks'|'milestones';
  const items = Array.isArray(req.body?.items) ? req.body.items : [];
  if (!['projects','tasks','milestones'].includes(type)) return res.status(400).json({ error: 'Type JSON invalide.' });
  if (items.length < 1 || items.length > JSON_IMPORT_LIMIT) return res.status(400).json({ error: `Le fichier doit contenir entre 1 et ${JSON_IMPORT_LIMIT} éléments.` });
  if (type === 'projects' && !RBAC.canCreateOrDeleteProject(user.role)) return res.status(403).json({ error: 'Seul le Directeur de Projets peut importer des projets.' });
  if (type === 'tasks' && !RBAC.canManageTasks(user.role)) return res.status(403).json({ error: 'Droits insuffisants pour importer des tâches.' });
  if (type === 'milestones' && user.role === 'ADMINISTRATEUR') return res.status(403).json({ error: 'Les administrateurs utilisent uniquement la console d’administration.' });
  res.json({ success: true, data: normalizeJsonImport(type, items, user) });
});

app.post('/api/import-json/confirm', requireOrigin, requireAuth, async (req: Request, res: Response) => {
  const user = currentUser(req);
  const type = req.body?.type as 'projects'|'tasks'|'milestones';
  const items = Array.isArray(req.body?.items) ? req.body.items : [];
  if (!['projects','tasks','milestones'].includes(type) || !items.length || items.length > JSON_IMPORT_LIMIT) return res.status(400).json({ error: 'Import JSON invalide.' });
  if (type === 'projects' && !RBAC.canCreateOrDeleteProject(user.role)) return res.status(403).json({ error: 'Seul le Directeur de Projets peut créer des projets.' });
  if (type === 'tasks' && !RBAC.canManageTasks(user.role)) return res.status(403).json({ error: 'Droits insuffisants pour créer des tâches.' });
  if (type === 'milestones' && user.role === 'ADMINISTRATEUR') return res.status(403).json({ error: 'Droits insuffisants pour créer des jalons.' });
  const check = normalizeJsonImport(type, items, user);
  if (check.errors.length) return res.status(400).json({ error: 'Le contenu a changé ou contient des éléments invalides.', errors: check.errors, data: check });
  const created: any[] = [];
  try {
    for (const item of check.items) {
      if (type === 'projects') created.push(await dbStore.createProject(item as Project, user));
      else if (type === 'tasks') {
        const task = dbStore.addTask(item.projectId, { ...item, id: `tsk-${Date.now()}-${Math.random().toString(36).slice(2,7)}` }, user);
        if (!task) throw new Error(`Projet introuvable pour la tâche ${item.title}.`); created.push(task);
      } else {
        const milestone = dbStore.addMilestone(item.projectId, { ...item, id: `ms-${Date.now()}-${Math.random().toString(36).slice(2,7)}` }, user);
        if (!milestone) throw new Error(`Projet introuvable pour le jalon ${item.title}.`); created.push(milestone);
      }
    }
    res.status(201).json({ success: true, data: { imported: created.length, items: created } });
  } catch (e:any) { res.status(500).json({ error: e?.message || 'Import JSON impossible.' }); }
});

// 4. Tasks (WBS) Endpoints
app.post('/api/projects/:id/tasks', (req: Request, res: Response) => {
  const user = currentUser(req);
  if (!RBAC.canManageTasks(user.role)) {
    return res.status(403).json({ error: 'Droits insuffisants pour ajouter des tâches.' });
  }

  const taskPayload = req.body;
  const task = dbStore.addTask(
    req.params.id,
    {
      id: taskPayload.id || `tsk-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      projectId: req.params.id,
      title: taskPayload.title || 'Nouvelle tâche',
      description: taskPayload.description,
      status: taskPayload.status || 'TODO',
      priority: taskPayload.priority || 'MEDIUM',
      assigneeId: taskPayload.assigneeId,
      startDate: taskPayload.startDate || new Date().toISOString().split('T')[0],
      dueDate: taskPayload.dueDate || taskPayload.endDate || new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0],
      estimatedHours: Number(taskPayload.estimatedHours) || 20,
      actualHours: Number(taskPayload.actualHours) || 0,
      completionPercent: Number(taskPayload.completionPercent || taskPayload.progress) || 0,
      costEstimated: Number(taskPayload.costEstimated || taskPayload.plannedCost) || 2000,
      costActual: Number(taskPayload.costActual || taskPayload.actualCost) || 0,
      category: taskPayload.category || 'Développement',
      tags: taskPayload.tags || ['WBS'],
      subtasks: taskPayload.subtasks || [],
      predecessorIds: taskPayload.predecessorIds || taskPayload.dependencies || [],
    },
    user
  );

  if (!task) return res.status(404).json({ error: 'Projet introuvable.' });
  res.status(201).json({ success: true, data: task });
});

app.put('/api/projects/:id/tasks/:taskId', requireRole(RBAC.canManageTasks), (req: Request, res: Response) => {
  const user = currentUser(req);
  const updated = dbStore.updateTask(req.params.id, req.params.taskId, req.body, user);
  if (!updated) return res.status(404).json({ error: 'Tâche ou projet introuvable.' });
  res.json({ success: true, data: updated });
});

app.delete('/api/projects/:id/tasks/:taskId', requireRole(RBAC.canManageTasks), (req: Request, res: Response) => {
  const user = currentUser(req);
  const success = dbStore.deleteTask(req.params.id, req.params.taskId, user);
  if (!success) return res.status(404).json({ error: 'Tâche introuvable.' });
  res.json({ success: true, message: 'Tâche supprimée.' });
});

// 5. Team Resources Endpoints — Restricted to DIRECTEUR_PROJETS and ADMINISTRATEUR
app.post('/api/projects/:id/team', (req: Request, res: Response) => {
  const user = currentUser(req);
  if (!RBAC.canManageResources(user.role)) {
    return res.status(403).json({
      error: 'Accès refusé : Seul le Directeur de Projets est habilité à provisionner et allouer de nouvelles ressources humaines.',
      requiredRole: 'DIRECTEUR_PROJETS',
      userRole: user.role,
    });
  }

  const memberPayload = req.body;
  const member = dbStore.addTeamMember(
    req.params.id,
    {
      id: memberPayload.id || `tm-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      name: memberPayload.name || 'Nouveau Collaborateur',
      role: memberPayload.role || 'Consultant / Expert',
      email: memberPayload.email || 'collaborateur@entreprise.fr',
      hourlyRate: Number(memberPayload.hourlyRate || memberPayload.dailyRate) || 85,
      maxWeeklyHours: Number(memberPayload.maxWeeklyHours || memberPayload.capacityHoursPerWeek) || 35,
      avatarUrl: memberPayload.avatarUrl,
      color: memberPayload.color || '#3b82f6',
    },
    user
  );

  if (!member) return res.status(404).json({ error: 'Projet introuvable.' });
  res.status(201).json({ success: true, data: member });
});

app.put('/api/projects/:id/team/:memberId', (req: Request, res: Response) => {
  const user = currentUser(req);
  if (!RBAC.canManageResources(user.role)) {
    return res.status(403).json({
      error: 'Accès refusé : Seul le Directeur de Projets peut modifier les TJM et allocations de ressources.',
      requiredRole: 'DIRECTEUR_PROJETS',
    });
  }

  const updated = dbStore.updateTeamMember(req.params.id, req.params.memberId, req.body, user);
  if (!updated) return res.status(404).json({ error: 'Membre ou projet introuvable.' });
  res.json({ success: true, data: updated });
});

app.delete('/api/projects/:id/team/:memberId', (req: Request, res: Response) => {
  const user = currentUser(req);
  if (!RBAC.canManageResources(user.role)) {
    return res.status(403).json({
      error: 'Accès refusé : Seul le Directeur de Projets peut libérer/supprimer des ressources affectées.',
      requiredRole: 'DIRECTEUR_PROJETS',
    });
  }

  const success = dbStore.deleteTeamMember(req.params.id, req.params.memberId, user);
  if (!success) return res.status(404).json({ error: 'Membre introuvable.' });
  res.json({ success: true, message: 'Ressource retirée.' });
});

// 6. Risks Management Endpoints
app.post('/api/projects/:id/risks', requireRole(RBAC.canManageRisks), (req: Request, res: Response) => {
  const user = currentUser(req);
  const riskPayload = req.body;
  const prob = Number(riskPayload.probability) || 3;
  const imp = Number(riskPayload.impact) || 3;

  const risk = dbStore.addRisk(
    req.params.id,
    {
      id: riskPayload.id || `rsk-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      projectId: req.params.id,
      title: riskPayload.title || 'Nouveau Risque',
      description: riskPayload.description || '',
      category: riskPayload.category || 'TECHNIQUE',
      probability: prob,
      impact: imp,
      status: riskPayload.status || 'ACTIVE',
      mitigationPlan: riskPayload.mitigationPlan || 'Surveillance hebdomadaire et points de contrôle.',
      contingencyPlan: riskPayload.contingencyPlan,
      ownerId: riskPayload.ownerId,
      financialImpact: Number(riskPayload.financialImpact) || 0,
      identifiedDate: riskPayload.identifiedDate || new Date().toISOString().split('T')[0],
    },
    user
  );

  if (!risk) return res.status(404).json({ error: 'Projet introuvable.' });
  res.status(201).json({ success: true, data: risk });
});

app.put('/api/projects/:id/risks/:riskId', requireRole(RBAC.canManageRisks), (req: Request, res: Response) => {
  const user = currentUser(req);
  const updated = dbStore.updateRisk(req.params.id, req.params.riskId, req.body, user);
  if (!updated) return res.status(404).json({ error: 'Risque ou projet introuvable.' });
  res.json({ success: true, data: updated });
});

app.delete('/api/projects/:id/risks/:riskId', requireRole(RBAC.canManageRisks), (req: Request, res: Response) => {
  const user = currentUser(req);
  const success = dbStore.deleteRisk(req.params.id, req.params.riskId, user);
  if (!success) return res.status(404).json({ error: 'Risque introuvable.' });
  res.json({ success: true, message: 'Risque supprimé.' });
});

// 7. Milestones Endpoints
app.post('/api/projects/:id/milestones', requireRole(RBAC.canManageProject), (req: Request, res: Response) => {
  const user = currentUser(req);
  const mPayload = req.body;
  const milestone = dbStore.addMilestone(
    req.params.id,
    {
      id: mPayload.id || `ms-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      projectId: req.params.id,
      title: mPayload.title || 'Nouveau Jalon',
      targetDate: mPayload.targetDate || mPayload.date || new Date().toISOString().split('T')[0],
      completed: Boolean(mPayload.completed),
      description: mPayload.description,
      deliverable: mPayload.deliverable || 'Livrable contractuel',
    },
    user
  );

  if (!milestone) return res.status(404).json({ error: 'Projet introuvable.' });
  res.status(201).json({ success: true, data: milestone });
});

app.put('/api/projects/:id/milestones/:mId', requireRole(RBAC.canManageProject), (req: Request, res: Response) => {
  const user = currentUser(req);
  const updated = dbStore.updateMilestone(req.params.id, req.params.mId, req.body, user);
  if (!updated) return res.status(404).json({ error: 'Jalon introuvable.' });
  res.json({ success: true, data: updated });
});

app.delete('/api/projects/:id/milestones/:mId', requireRole(RBAC.canManageProject), (req: Request, res: Response) => {
  const user = currentUser(req);
  const success = dbStore.deleteMilestone(req.params.id, req.params.mId, user);
  if (!success) return res.status(404).json({ error: 'Jalon introuvable.' });
  res.json({ success: true, message: 'Jalon supprimé.' });
});

// 8. Audit Logs Endpoint
app.get('/api/audit-logs', requireRole(RBAC.canAccessAdmin), (req: Request, res: Response) => {
  const logs = dbStore.getAuditLogs(100);
  res.json({ success: true, count: logs.length, data: logs });
});




// API: état/configuration Copilot Studio (aucun secret n'est renvoyé)
app.get('/api/copilot-studio/status', requireAuth, (req: Request, res: Response) => {
  res.json({ success: true, configured: Boolean(COPILOT_DIRECTLINE_TOKEN_ENDPOINT), agentId: COPILOT_AGENT_ID, environmentId: COPILOT_ENVIRONMENT_ID, tenantIdConfigured: Boolean(COPILOT_TENANT_ID), directLineConfigured: Boolean(COPILOT_DIRECTLINE_TOKEN_ENDPOINT) });
});

// API: chat Copilot Studio via Direct Line. Le token reste côté serveur.
app.post('/api/projects/:id/copilot-studio', upload.array('files', 10), requireRole(RBAC.canManageProject), async (req: Request, res: Response) => {
  try {
    const project = dbStore.getProjectById(String(req.params.id));
    if (!project) return res.status(404).json({ error: 'Projet introuvable.' });
    const files = ((req as any).files || []) as Express.Multer.File[];
    const message = String(req.body?.message || '').trim() || 'Analyse les documents fournis et compare-les au projet CLARITY.';
    const evidence = files.length ? await extractDocumentEvidenceForCopilot(files) : '';
    const context = { project, requestedAt: new Date().toISOString(), user: { id: currentUser(req).id, role: currentUser(req).role }, documents: files.map(f => ({ name: f.originalname, size: f.size, mimeType: f.mimetype })) };
    const prompt = `Tu es l’agent Copilot Studio intégré à CLARITY PM. Analyse réellement les informations fournies. Ne rien inventer. Réponds en JSON strict avec {"reply":"...","analysis":{},"actions":[]}. Les actions sont des PROPOSITIONS uniquement et doivent cibler le projectId ${project.id}. Conserve les identifiants existants lorsque possible. CONTEXTE=${JSON.stringify(context)} DOCUMENTS=${evidence || '[aucun]'} DEMANDE=${message}`;
    const session = await getCopilotStudioToken();
    const result = await sendCopilotStudioMessage(session.token, session.conversationId, prompt, currentUser(req).id);
    let parsed:any;
    try { parsed = cleanCopilotJson(result.reply); } catch { parsed = { reply: result.reply, analysis: {}, actions: [] }; }
    const actions = Array.isArray(parsed.actions) ? parsed.actions.map((a:any,i:number)=>normalizeCopilotAction(a,project,i)).filter(Boolean) : [];
    const memory = await loadCopilotMemory(project.id,currentUser(req).id);
    const history = [...(memory.history||[]), { role:'user', text:message, files:files.map(f=>({name:f.originalname,size:f.size})), meta:'Copilot Studio' }, { role:'assistant', text:String(parsed.reply||result.reply||''), analysis:parsed.analysis||{}, meta:`Copilot Studio · ${COPILOT_AGENT_ID}` }].slice(-100);
    await saveCopilotMemory(project.id,currentUser(req).id,{...memory,evidence:evidence||memory.evidence,files:files.length?files.map(f=>({name:f.originalname,size:f.size,mimeType:f.mimetype})):memory.files,analysis:parsed.analysis||{},pendingActions:actions,history});
    res.json({ success:true, data:{ reply:String(parsed.reply||result.reply||''), analysis:parsed.analysis||{}, actions, confirmation:{required:actions.length>0,message:actions.length?'Modifications proposées par Copilot Studio. Validation CLARITY requise.':''}, applied:[], project, provider:'COPILOT_STUDIO', model:COPILOT_AGENT_ID, conversationId:session.conversationId } });
  } catch(e:any) { console.error('Copilot Studio error:',e); res.status(500).json({error:e?.message||'Copilot Studio indisponible.'}); }
});

// API d'actions pour un connecteur/plugin Copilot Studio. Cette route ne peut être appelée qu'avec CLARITY_API_KEY.
app.post('/api/copilot/actions', requireClarityApiKey, async (req: Request, res: Response) => {
  try {
    const projectId=String(req.body?.projectId||'');
    const project=projectId?dbStore.getProjectById(projectId):null;
    if(!project) return res.status(404).json({error:'Projet introuvable.'});
    const actions=Array.isArray(req.body?.actions)?req.body.actions:[];
    if(!actions.length) return res.status(400).json({error:'actions[] est requis.'});
    const systemUser:MicrosoftSessionUser={id:'copilot-studio',displayName:'Copilot Studio',email:'copilot@clarity.local',role:'DIRECTEUR_PROJETS',authProvider:'LOCAL',connectedAt:new Date().toISOString()};
    const normalized=actions.map((a:any,i:number)=>normalizeCopilotAction(a,project,i)).filter(Boolean);
    const result=applyCopilotActions(project,normalized,systemUser);
    res.json({success:true,project:dbStore.getProjectById(project.id),applied:result.applied,failed:result.failed});
  } catch(e:any) { res.status(500).json({error:e?.message||'Application Copilot impossible.'}); }
});

// API: mémoire du Copilot pour un projet
app.get('/api/projects/:id/copilot', requireRole(RBAC.canManageProject), async (req: Request, res: Response) => {
  try {
    const project=dbStore.getProjectById(String(req.params.id));
    if(!project) return res.status(404).json({error:'Projet introuvable.'});
    const memory=await loadCopilotMemory(project.id,currentUser(req).id);
    res.json({success:true,data:{history:memory.history||[],files:memory.files||[],analysis:memory.analysis||{},pendingActions:memory.pendingActions||[]}});
  } catch(e:any) { res.status(500).json({error:e?.message||'Mémoire Copilot indisponible.'}); }
});

// API: CLARITY PM Copilot — chat + analyse documentaire + actions projet
app.get('/api/projects/:id/copilot/proposals.json', requireRole(RBAC.canManageProject), async (req: Request, res: Response) => {
  try {
    const project=dbStore.getProjectById(String(req.params.id));
    if(!project) return res.status(404).json({error:'Projet introuvable.'});
    const user=currentUser(req);
    const memory=await loadCopilotMemory(project.id,user.id);
    res.json({version:1,project:{id:project.id,code:project.code,name:project.name},generatedAt:new Date().toISOString(),proposals:Array.isArray(memory.pendingActions)?memory.pendingActions:[]});
  } catch(e:any) { res.status(500).json({error:e?.message||'Impossible de charger le JSON des propositions.'}); }
});

app.post('/api/projects/:id/copilot', upload.array('files', 10), requireRole(RBAC.canManageProject), async (req: Request, res: Response) => {
  try {
    const project = dbStore.getProjectById(String(req.params.id));
    if (!project) return res.status(404).json({ error:'Projet introuvable.' });
    const files = ((req as any).files || []) as Express.Multer.File[];
    const message = String(req.body?.message || '').trim();
    const result = await runGatewayCopilot(project, files, message, currentUser(req));
    // IMPORTANT: Copilot never changes the project during analysis.
    // Actions returned by the AI are proposals and require explicit user confirmation.
    const proposedActions = Array.isArray(result.actions) ? result.actions : [];
    const confirmation = proposedActions.length > 0 ? {
      required: true,
      message: 'J’ai identifié des modifications possibles. Voulez-vous les appliquer au projet ?',
      actions: proposedActions
    } : { required: false, message: '', actions: [] };
    res.json({ success:true, data:{ reply:result.reply || '', analysis:result.analysis || {}, actions:proposedActions, confirmation, applied:[], project, provider:result.provider, account:result.account, model:result.model } });
  } catch (e:any) {
    console.error('Copilot error:', e);
    const status = Number(e?.status) === 401 ? 401 : 500;
    res.status(status).json({ error:e?.message || 'Copilot indisponible.' });
  }
});

// API: refuser les propositions en attente sans modifier le projet
app.post('/api/projects/:id/copilot/reject', requireRole(RBAC.canManageProject), async (req: Request, res: Response) => {
  try {
    const project=dbStore.getProjectById(String(req.params.id));
    if(!project) return res.status(404).json({error:'Projet introuvable.'});
    const user=currentUser(req); const memory=await loadCopilotMemory(project.id,user.id);
    await saveCopilotMemory(project.id,user.id,{...memory,pendingActions:[]});
    res.json({success:true,data:{pendingActions:[]}});
  } catch(e:any){ res.status(500).json({error:e?.message||'Impossible de refuser les propositions.'}); }
});

// API: appliquer explicitement les propositions du Copilot après confirmation utilisateur
app.post('/api/projects/:id/copilot/apply', requireRole(RBAC.canManageProject), async (req: Request, res: Response) => {
  try {
    const project = dbStore.getProjectById(String(req.params.id));
    if (!project) return res.status(404).json({ error:'Projet introuvable.' });
    if (req.body?.confirmed !== true) return res.status(400).json({ error:'Confirmation utilisateur requise.' });
    const user = currentUser(req);
    const memory = await loadCopilotMemory(project.id, user.id);
    const storedActions = Array.isArray(memory.pendingActions) ? memory.pendingActions : [];
    if (!storedActions.length) return res.status(400).json({ error:'Aucune proposition en attente à appliquer.' });
    const proposalIds = Array.isArray(req.body?.proposalIds) ? req.body.proposalIds.map(String) : [];
    const requested = proposalIds.length ? storedActions.filter((a:any)=>proposalIds.includes(String(a.proposalId||a._key))) : (Array.isArray(req.body?.actions) ? req.body.actions : storedActions);
    if (!requested.length) return res.status(400).json({ error:'Aucune modification sélectionnée.', code:'NO_SELECTED_PROPOSALS' });
    const result = applyCopilotActions(project, requested, user);
    const appliedIds = new Set(result.applied.map((x:any)=>String(x.proposalId)));
    const remaining = storedActions.filter((a:any)=>!appliedIds.has(String(a.proposalId||a._key)));
    await saveCopilotMemory(project.id, user.id, { ...memory, pendingActions: remaining });
    const updated = dbStore.getProjectById(project.id);
    res.json({ success:true, data:{ applied:result.applied, failed:result.failed, appliedCount:result.applied.length, failedCount:result.failed.length, remainingProposals:remaining.length, project:updated } });
  } catch (e:any) {
    console.error('Copilot apply error:', e);
    res.status(500).json({ error:e?.message || 'Impossible d’appliquer les modifications du Copilot.' });
  }
});

// Vite middleware & Static Serving
async function startServer() {
  await dbStore.initialize();
  await ensureAIConfigTable();
  await ensureCopilotMemoryTable();
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req: Request, res: Response) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
