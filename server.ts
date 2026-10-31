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
  return `${appUrl.replace(/\/$/, '')}/auth/microsoft/callback`;
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
  return joined.length > 180000 ? `${joined.slice(0, 180000)}\n[Contenu tronqué par CLARITY pour respecter la taille de la requête; les premières feuilles/lignes sont conservées.]` : joined;
}

const M365_COPILOT_SYSTEM_PROMPT = `Tu es Microsoft 365 Copilot utilisé comme moteur IA du Copilot Projet de CLARITY PM.
Tu dois analyser réellement le contenu documentaire fourni dans additionalContext et le croiser avec le projet CLARITY.
Le contenu documentaire a été extrait techniquement par CLARITY (Excel/PDF/DOCX) mais aucune analyse sémantique n'a été faite localement. Ton moteur est responsable du raisonnement, de la comparaison et de l'identification des éléments.

RÈGLES: analyse toutes les feuilles/sections/lignes pertinentes; cite les preuves avec fichier/feuille/ligne ou page lorsqu'elles sont disponibles; distingue faits, déductions et recommandations; ne fabrique pas d'éléments. Compare avec le projet courant et ne propose que ce qui est justifié.

IMPORTANT: tu ne modifies jamais CLARITY directement. Tu proposes des actions CRUD qui seront montrées à l'utilisateur puis appliquées uniquement après confirmation explicite.

Réponds STRICTEMENT en JSON: {"reply":"...","analysis":{"summary":"...","findings":[],"contradictions":[],"recommendations":[],"elements":{"tasks":[],"milestones":[],"risks":[],"dates":[],"budgets":[],"decisions":[],"corrections":[],"missing":[]}},"actions":[]}`;

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

async function getCopilotStudioDirectLineToken() {
  const secret = String(process.env.COPILOT_DIRECTLINE_SECRET || '').trim();
  if (!secret) throw new Error('COPILOT_DIRECTLINE_SECRET n’est pas configuré. Copilot Studio → Settings → Security → Web channel security → Secret 1.');
  const response = await fetch('https://directline.botframework.com/v3/directline/tokens/generate', {
    method: 'POST',
    headers: { Authorization: `Bearer ${secret}` },
  });
  const text = await response.text();
  let data:any = {};
  try { data = text ? JSON.parse(text) : {}; } catch { data = { raw:text }; }
  if (!response.ok || !data?.token || !data?.conversationId) {
    throw new Error(`Copilot Studio Direct Line token impossible (${response.status}): ${String(data?.error?.message || data?.message || text || 'réponse vide').slice(0,800)}`);
  }
  return { token:String(data.token), conversationId:String(data.conversationId), expiresIn:Number(data.expires_in||1800) };
}

async function sendCopilotStudioActivity(token:string, conversationId:string, text:string, user:MicrosoftSessionUser) {
  const response = await fetch(`https://directline.botframework.com/v3/directline/conversations/${encodeURIComponent(conversationId)}/activities`, {
    method:'POST',
    headers:{ Authorization:`Bearer ${token}`, 'Content-Type':'application/json' },
    body:JSON.stringify({
      type:'message',
      locale:'fr-FR',
      from:{ id:`clarity-${String(user.id).replace(/[^a-zA-Z0-9_-]/g,'_')}`, name:user.displayName },
      text,
    }),
  });
  const body=await response.text();
  if(!response.ok) throw new Error(`Copilot Studio Direct Line: envoi impossible (${response.status}) ${body.slice(0,800)}`);
  return body ? JSON.parse(body) : {};
}

async function waitForCopilotStudioReply(token:string, conversationId:string, sentActivityId?:string) {
  const started=Date.now();
  let watermark='';
  const timeoutMs=Math.max(15000,Number(process.env.COPILOT_DIRECTLINE_TIMEOUT_MS||90000));
  while(Date.now()-started < timeoutMs) {
    const url=`https://directline.botframework.com/v3/directline/conversations/${encodeURIComponent(conversationId)}/activities${watermark?`?watermark=${encodeURIComponent(watermark)}`:''}`;
    const response=await fetch(url,{headers:{Authorization:`Bearer ${token}`}});
    const body=await response.text();
    if(!response.ok) throw new Error(`Copilot Studio Direct Line: lecture impossible (${response.status}) ${body.slice(0,800)}`);
    let data:any={}; try{data=body?JSON.parse(body):{};}catch{}
    watermark=String(data?.watermark||watermark);
    const activities=Array.isArray(data?.activities)?data.activities:[];
    const candidates=activities.filter((a:any)=>a?.type==='message' && a?.from?.id && String(a.from.id)!=='' && (!sentActivityId || String(a.id)!==String(sentActivityId)));
    const botMessages=candidates.filter((a:any)=>!String(a.from.id).startsWith('clarity-'));
    const reply=botMessages.slice().reverse().find((a:any)=>String(a.text||'').trim());
    if(reply?.text) return {text:String(reply.text), activity:reply};
    await new Promise(r=>setTimeout(r,700));
  }
  throw new Error(`Copilot Studio n’a pas répondu dans le délai de ${Math.round(timeoutMs/1000)} secondes.`);
}

async function runCopilotStudio(project: Project, files: Express.Multer.File[], message: string, user: MicrosoftSessionUser) {
  const memory=await loadCopilotMemory(project.id,user.id);
  const evidence=files.length ? await extractDocumentEvidenceForCopilot(files) : String(memory.evidence||'');
  const effectiveMessage=message || (files.length
    ? 'Analyse en profondeur le ou les fichiers joints, compare-les au projet CLARITY courant et prépare les propositions CRUD précises à valider.'
    : 'Continue avec le contexte documentaire précédent et réponds à ma demande. Si une modification du projet est nécessaire, propose-la sous forme d’action CRUD.');

  const context={
    user:{id:user.id,displayName:user.displayName,email:user.email,role:user.role},
    project:{id:project.id,code:project.code,name:project.name,description:project.description,client:project.client,status:project.status,priority:project.priority,startDate:project.startDate,endDate:project.endDate,budget:project.budget,tasks:project.tasks||[],milestones:project.milestones||[],risks:project.risks||[]},
    previousAnalysis:memory.analysis||{},
    previousFiles:memory.files||[],
    recentConversation:(memory.history||[]).slice(-6),
  };

  const instruction=`Tu es l’agent Microsoft Copilot Studio de CLARITY PM. Tu es le SEUL moteur IA utilisé pour cette analyse documentaire. N’utilise ni Gemini, ni OpenAI, ni un autre provider.

MISSION: analyser réellement le contenu du document fourni, le comparer au projet CLARITY courant, puis produire des propositions CRUD directement exploitables par le backend CLARITY.

RÈGLES ABSOLUES:
1. Réponds UNIQUEMENT avec un objet JSON valide, sans markdown, sans bloc de code.
2. Le schéma exact est: {"reply":"...","analysis":{"summary":"...","findings":[],"contradictions":[],"recommendations":[],"elements":{"tasks":[],"milestones":[],"risks":[],"dates":[],"budgets":[],"decisions":[],"corrections":[],"missing":[]}},"actions":[]}.
3. Chaque action doit contenir: proposalId unique, type, targetProjectId="${String(project.id)}", reason, source et, selon le type, id+patch ou task/milestone/risk.
4. Types autorisés: update_project, add_task, update_task, add_milestone, update_milestone, add_risk, update_risk.
5. Ne supprime jamais.
6. Pour une création, ne fabrique jamais d’id final. Pour une tâche rattachée à un nouveau jalon, utilise milestoneProposalId correspondant au proposalId du jalon créé.
7. Pour une modification, n’utilise que les IDs existants dans le projet fourni.
8. Ne propose que les changements réellement justifiés par le document et absents ou différents dans CLARITY.
9. Pour chaque action, donne une source exploitable: nom du fichier + feuille + ligne si Excel, ou page si PDF/DOCX lorsque disponible.
10. Si aucune modification n’est justifiée, actions doit être [].
11. Le backend CLARITY fera la validation finale et l’écriture PostgreSQL uniquement après confirmation de l’utilisateur.

CONTEXTE PROJET:
${JSON.stringify(context)}

DOCUMENT(S) FOURNI(S):
${evidence ? evidence.slice(0,120000) : '[Aucun nouveau document]'}

DEMANDE UTILISATEUR:
${effectiveMessage}`;

  const dl=await getCopilotStudioDirectLineToken();
  const sent=await sendCopilotStudioActivity(dl.token,dl.conversationId,instruction,user);
  const reply=await waitForCopilotStudioReply(dl.token,dl.conversationId,sent?.id);
  let result:any;
  try { result=cleanCopilotJson(reply.text); }
  catch {
    result={reply:reply.text,analysis:{summary:reply.text,findings:[],contradictions:[],recommendations:[],elements:{tasks:[],milestones:[],risks:[],dates:[],budgets:[],decisions:[],corrections:[],missing:[]}},actions:[]};
  }

  const filesMeta=files.map(f=>({name:f.originalname,size:f.size,type:f.mimetype}));
  const incomingActions=(Array.isArray(result.actions)?result.actions:[])
    .map((a:any,i:number)=>normalizeCopilotAction(a,project,i)).filter(Boolean)
    .sort((a:any,b:any)=>{const rank=(x:any)=>x?.type==='add_milestone'?0:x?.type==='add_task'?1:2; return rank(a)-rank(b);});
  const previousActions=Array.isArray(memory.pendingActions)?memory.pendingActions:[];
  const actionMap=new Map(previousActions.map((a:any,i:number)=>[copilotActionKey(a,i),{...a,_key:copilotActionKey(a,i)}]));
  incomingActions.forEach((a:any)=>actionMap.set(a.proposalId,a));
  const pendingActions=Array.from(actionMap.values());
  const proposalSet={version:1,projectId:String(project.id),projectCode:String(project.code||''),projectName:String(project.name||''),generatedAt:new Date().toISOString(),proposals:pendingActions};
  const history=[...(memory.history||[]),{role:'user',text:effectiveMessage,files:filesMeta,userEmail:user.email},{role:'assistant',text:String(result.reply||reply.text),analysis:result.analysis||{}}];
  await saveCopilotMemory(project.id,user.id,{evidence:files.length?evidence:memory.evidence,files:files.length?filesMeta:memory.files,analysis:result.analysis||memory.analysis||{},pendingActions,history});
  return {...result,actions:pendingActions,proposalSet,provider:'MICROSOFT_COPILOT_STUDIO',account:'Copilot Studio',model:'Direct Line',conversationId:dl.conversationId};
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
          const out=dbStore.addTask(project.id,{id:`tsk-ai-${crypto.randomUUID()}`,projectId:project.id,milestoneId:milestoneId||milestoneByTitle,title:String(t.title||'Tâche IA'),description:String(t.description||''),status:['TODO','IN_PROGRESS','REVIEW','DONE','BLOCKED'].includes(t.status)?t.status:'TODO',priority:['LOW','MEDIUM','HIGH','CRITICAL'].includes(t.priority)?t.priority:'MEDIUM',assigneeId:t.assigneeId,startDate:t.startDate||project.startDate,dueDate:t.dueDate||project.endDate,estimatedHours:Number(t.estimatedHours)||0,actualHours:Number(t.actualHours)||0,completionPercent:Number(t.completionPercent)||0,costEstimated:Number(t.costEstimated)||0,costActual:Number(t.costActual)||0,category:String(t.category||'DOCUMENT'),tags:Array.isArray(t.tags)?t.tags.map(String):['AI'],subtasks:[],predecessorIds:Array.isArray(t.predecessorIds)?t.predecessorIds.map(String):[]},user as any);
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
          const out=dbStore.addMilestone(project.id,{id:generatedId,projectId:project.id,title:String(m.title||'Jalon IA'),targetDate:m.targetDate||project.endDate,completed:Boolean(m.completed),description:String(m.description||''),deliverable:String(m.deliverable||'Livrable')},user as any);
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
          const out=dbStore.addRisk(project.id,{id:`rsk-ai-${crypto.randomUUID()}`,projectId:project.id,title:String(r.title||'Risque IA'),description:String(r.description||''),category:['TECHNIQUE','BUDGET','DELAI','RESSOURCES','EXTERNE','JURIDIQUE'].includes(r.category)?r.category:'TECHNIQUE',probability:Number(r.probability)||1,impact:Number(r.impact)||1,status:['ACTIVE','MITIGATED','CLOSED'].includes(r.status)?r.status:'ACTIVE',mitigationPlan:String(r.mitigationPlan||''),contingencyPlan:String(r.contingencyPlan||''),ownerId:r.ownerId,financialImpact:Number(r.financialImpact)||0,identifiedDate:r.identifiedDate||new Date().toISOString().split('T')[0]},user as any);
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
  const effectiveMessage = message || (files.length ? 'Analyse en profondeur tous les fichiers joints, compare-les au projet et identifie précisément ce qui doit être ajouté ou corrigé.' : 'Continue avec le contexte documentaire précédent et réponds à ma demande.');
  const projectContext = JSON.stringify({
    id: project.id, code: project.code, name: project.name, description: project.description, client: project.client, status: project.status, priority: project.priority, startDate: project.startDate,
    endDate: project.endDate, totalBudget: project.totalBudget, currency: project.currency, tasks: project.tasks, milestones: project.milestones, risks: project.risks,
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
Tu reçois le projet courant et, lorsqu'ils sont joints, les fichiers réels de l'utilisateur. Tu dois analyser le contenu des fichiers directement avec ton moteur IA. Ne fais jamais semblant d'avoir regardé un document si tu n'as pas réellement traité son contenu.`;

function cleanJsonResponse(text: string): string {
  const trimmed = String(text || '').trim();
  if (!trimmed) return '';
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  return (fenced ? fenced[1] : trimmed).trim();
}

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
  const effectiveMessage = message || (files.length ? 'Analyse en profondeur tous les fichiers joints, compare-les au projet et identifie précisément ce qui doit être ajouté ou corrigé.' : 'Continue avec le contexte documentaire précédent et réponds à ma demande.');

  const context = {
    connectedUser: { id: user.id, email: user.email, displayName: user.displayName, role: user.role },
    project: { ...project, tasks: project.tasks, milestones: project.milestones, risks: project.risks },
    previousCopilotAnalysis: memory.analysis || {},
    previousFiles: memory.files || [],
    conversation: (memory.history || []).slice(-12),
    currentFiles: fileNames,
    request: effectiveMessage,
  };

  const prompt = `${COPILOT_SYSTEM_PROMPT}\n\nCONTEXTE CLARITY:\n${JSON.stringify(context, null, 2)}\n\nIMPORTANT: Les fichiers joints sont extraits techniquement par CLARITY puis transmis au moteur IA. Analyse véritablement leur contenu et mets en relation les éléments avec le projet courant.`;
  const documentEvidence = files.length ? await extractDocumentEvidenceForCopilot(files) : '';
  const gatewayPrompt = `${prompt}\n\nCONTENU DES DOCUMENTS À ANALYSER SÉMANTIQUEMENT PAR LE MOTEUR IA:\n${documentEvidence || '[aucun nouveau document]'}`;
  const raw = await callAIResilient({ prompt: gatewayPrompt, isJson: true });
  if (!raw) throw new Error('Aucun compte IA OAuth disponible dans AI Provider Hub.');
  let result: any;
  try {
    result = cleanCopilotJson(raw);
  } catch {
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

function applyCopilotActionsLegacy(project: Project, actions: any[], user: MicrosoftSessionUser) {
  const applied: any[] = [];
  for (const action of Array.isArray(actions) ? actions : []) {
    try {
      switch (action?.type) {
        case 'update_project': {
          const patch = action.patch && typeof action.patch === 'object' ? action.patch : {};
          const allowed = ['name','code','description','client','managerName','managerId','status','priority','methodology','startDate','endDate','totalBudget','currency'];
          const safe = Object.fromEntries(Object.entries(patch).filter(([k,v]) => allowed.includes(k) && v !== undefined));
          if (Object.keys(safe).length) { const out = dbStore.updateProject(project.id, safe as any, user as any); if (out) applied.push({type:action.type, data:out}); }
          break;
        }
        case 'add_task': {
          if (!RBAC.canManageTasks(user.role)) break;
          const t=action.task||{}; const out=dbStore.addTask(project.id,{id:`tsk-ai-${crypto.randomUUID()}`,projectId:project.id,title:String(t.title||'Tâche IA'),description:String(t.description||''),status:String(t.status||'TODO'),priority:String(t.priority||'MEDIUM'),assigneeId:t.assigneeId,startDate:t.startDate||new Date().toISOString().split('T')[0],dueDate:t.dueDate||new Date(Date.now()+7*86400000).toISOString().split('T')[0],estimatedHours:Number(t.estimatedHours)||20,actualHours:Number(t.actualHours)||0,completionPercent:Number(t.completionPercent)||0,costEstimated:Number(t.costEstimated)||2000,costActual:Number(t.costActual)||0,category:String(t.category||'Développement'),tags:Array.isArray(t.tags)?t.tags.map(String):['WBS'],subtasks:[],predecessorIds:Array.isArray(t.predecessorIds)?t.predecessorIds.map(String):[]},user as any); if(out) applied.push({type:action.type,data:out}); break;
        }
        case 'update_task': {
          if (!RBAC.canManageTasks(user.role)) break; const out=dbStore.updateTask(project.id,String(action.id),action.patch||{},user as any); if(out) applied.push({type:action.type,data:out}); break;
        }
        case 'add_milestone': {
          const m=action.milestone||{}; const out=dbStore.addMilestone(project.id,{id:`ms-ai-${crypto.randomUUID()}`,projectId:project.id,title:String(m.title||'Jalon IA'),targetDate:String(m.targetDate||m.date||new Date().toISOString().split('T')[0]),completed:Boolean(m.completed),description:String(m.description||''),deliverable:String(m.deliverable||'Livrable')},user as any); if(out) applied.push({type:action.type,data:out}); break;
        }
        case 'update_milestone': {
          const out=dbStore.updateMilestone(project.id,String(action.id),action.patch||{},user as any); if(out) applied.push({type:action.type,data:out}); break;
        }
        case 'add_risk': {
          if (!RBAC.canManageRisks(user.role)) break; const r=action.risk||{}; const out=dbStore.addRisk(project.id,{id:`rsk-ai-${crypto.randomUUID()}`,projectId:project.id,title:String(r.title||'Risque IA'),description:String(r.description||''),category:String(r.category||'TECHNIQUE'),probability:Number(r.probability)||3,impact:Number(r.impact)||3,status:String(r.status||'ACTIVE'),mitigationPlan:String(r.mitigationPlan||''),contingencyPlan:String(r.contingencyPlan||''),ownerId:r.ownerId,financialImpact:Number(r.financialImpact)||0,identifiedDate:String(r.identifiedDate||new Date().toISOString().split('T')[0])},user as any); if(out) applied.push({type:action.type,data:out}); break;
        }
        case 'update_risk': {
          if (!RBAC.canManageRisks(user.role)) break; const out=dbStore.updateRisk(project.id,String(action.id),action.patch||{},user as any); if(out) applied.push({type:action.type,data:out}); break;
        }
      }
    } catch (e) { console.warn('Copilot action ignorée:', e); }
  }
  return applied;
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
      const uploadResponse = await fetch(`${base}/files`, { method: 'POST', headers: { Authorization: `Bearer ${apiKey}` }, body: form });
      if (!uploadResponse.ok) throw new Error(`Upload OpenAI ${file.originalname}: HTTP ${uploadResponse.status}`);
      const uploadedFile: any = await uploadResponse.json();
      uploaded.push(String(uploadedFile.id));
    }

    const schema = {
      type: 'object',
      additionalProperties: false,
      properties: {
        projectPatch: { type: 'object', additionalProperties: false, properties: { code:{type:'string'}, name:{type:'string'}, description:{type:'string'}, client:{type:'string'}, managerName:{type:'string'}, managerEmail:{type:'string'}, status:{type:'string'}, priority:{type:'string'}, methodology:{type:'string'}, startDate:{type:'string'}, endDate:{type:'string'}, totalBudget:{type:'number'}, currency:{type:'string'} }, required:['code','name','description','client','managerName','managerEmail','status','priority','methodology','startDate','endDate','totalBudget','currency'] },
        tasks:{type:'array',items:{type:'object',additionalProperties:false,properties:{title:{type:'string'},description:{type:'string'},status:{type:'string'},priority:{type:'string'},startDate:{type:'string'},dueDate:{type:'string'},estimatedHours:{type:'number'},assigneeId:{type:'string'}}}},
        milestones:{type:'array',items:{type:'object',additionalProperties:false,properties:{title:{type:'string'},targetDate:{type:'string'},description:{type:'string'},deliverable:{type:'string'}}}},
        risks:{type:'array',items:{type:'object',additionalProperties:false,properties:{title:{type:'string'},description:{type:'string'},category:{type:'string'},probability:{type:'number'},impact:{type:'number'},mitigationPlan:{type:'string'}}}},
        members:{type:'array',items:{type:'object',additionalProperties:false,properties:{name:{type:'string'},role:{type:'string'},email:{type:'string'},hourlyRate:{type:'number'},maxWeeklyHours:{type:'number'}}}},
        sourceSummary:{type:'string'},
        warnings:{type:'array',items:{type:'string'}}
      },
      required:['projectPatch','tasks','milestones','risks','members','sourceSummary','warnings']
    };

    const response = await fetch(`${base}/responses`, {
      method:'POST',
      headers:{'Content-Type':'application/json', Authorization:`Bearer ${apiKey}`},
      body: JSON.stringify({
        model: config.model,
        input:[{role:'user',content:[{type:'input_text',text:prompt}, ...uploaded.map(file_id => ({type:'input_file', file_id}))]}],
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
    await Promise.all(uploaded.map(id => fetch(`${base}/files/${encodeURIComponent(id)}`, { method:'DELETE', headers:{Authorization:`Bearer ${apiKey}`} }).catch(()=>undefined)));
  }
}

app.get('/api/health', (req: Request, res: Response) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

export default app;
