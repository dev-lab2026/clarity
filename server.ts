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

// CSRF/origin guard for all state-changing HTTP requests. Public OAuth GET callbacks remain unaffected.
