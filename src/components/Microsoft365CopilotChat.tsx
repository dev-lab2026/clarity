import React, { useEffect, useMemo, useState } from 'react';
import { PublicClientApplication, AccountInfo } from '@azure/msal-browser';
import { Project, MicrosoftUser } from '../types';
import { CheckCircle2, Loader2, LogIn, Paperclip, ShieldCheck, XCircle, Send } from 'lucide-react';

interface Props { project: Project; currentUser?: MicrosoftUser | null; onProjectUpdated?: (p: Project) => void; }

type PendingAction = { type: string; id?: string; patch?: any; task?: any; milestone?: any; risk?: any; reason?: string };

const CLIENT_ID = window.CLARITY_CONFIG?.entraClientId || import.meta.env.VITE_ENTRA_CLIENT_ID || '';
const TENANT_ID = window.CLARITY_CONFIG?.entraTenantId || import.meta.env.VITE_ENTRA_TENANT_ID || '';
const GRAPH_SCOPES = [
  'Sites.Read.All','Mail.Read','People.Read.All','OnlineMeetingTranscript.Read.All',
  'Chat.Read','ChannelMessage.Read.All','ExternalItem.Read.All'
];

function inspectAccessToken(token: string) {
  try {
    const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g,'+').replace(/_/g,'/')));
    const scopes = String(payload.scp || '').split(/\s+/).filter(Boolean);
    return { aud: payload.aud || '', scopes };
  } catch {
    return { aud: '', scopes: [] as string[] };
  }
}

function hasCopilotGraphScopes(token: string) {
  const info = inspectAccessToken(token);
  return info.aud === '00000003-0000-0000-c000-000000000000' && GRAPH_SCOPES.every(scope => info.scopes.includes(scope));
}

export const Microsoft365CopilotChat: React.FC<Props> = ({ project, currentUser, onProjectUpdated }) => {
  const [msal, setMsal] = useState<PublicClientApplication | null>(null);
  const [account, setAccount] = useState<AccountInfo | null>(null);
  const [connected, setConnected] = useState(false);
  const [messages, setMessages] = useState<{role:'user'|'assistant';text:string}[]>([]);
  const [input, setInput] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [loading, setLoading] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState('');
  const [pending, setPending] = useState<PendingAction[]>([]);
  const [applying, setApplying] = useState(false);
  const [conversationId, setConversationId] = useState('');

  const configured = useMemo(() => Boolean(CLIENT_ID && TENANT_ID), []);

  useEffect(() => {
    if (!configured) return;
    const app = new PublicClientApplication({
      auth: { clientId: CLIENT_ID, authority: `https://login.microsoftonline.com/${TENANT_ID}`, redirectUri: `${window.location.origin}/` },
      cache: { cacheLocation: 'sessionStorage', storeAuthStateInCookie: false },
    });
    app.initialize().then(() => {
      const existing = app.getAllAccounts()[0] || null;
      setMsal(app); setAccount(existing); setConnected(Boolean(existing));
    }).catch((e:any) => setError(e?.message || 'Impossible d’initialiser Microsoft Entra ID.'));
  }, [configured]);

  const acquireToken = async (forcePopup = false) => {
    if (!msal) throw new Error('Microsoft Entra n’est pas initialisé.');
    let acc = account;
    if (!acc) {
      const r = await msal.loginPopup({ scopes: ['openid','profile','email',...GRAPH_SCOPES], prompt:'select_account' });
      acc = r.account; setAccount(acc); setConnected(true);
    }
    const tokenRequest = { account: acc!, scopes: GRAPH_SCOPES };
    try {
      const silent = await msal.acquireTokenSilent(tokenRequest);
      if (silent.accessToken && hasCopilotGraphScopes(silent.accessToken)) return silent.accessToken;
    } catch {
      // The cached token may predate the Copilot Graph consent. Use an interactive request below.
    }
    const popup = await msal.acquireTokenPopup({
      ...tokenRequest,
      prompt: forcePopup ? 'select_account' : 'consent',
    });
    if (!popup.accessToken) throw new Error('Microsoft n’a pas fourni de jeton Graph.');
    if (!hasCopilotGraphScopes(popup.accessToken)) {
      const info = inspectAccessToken(popup.accessToken);
      throw new Error(`Le jeton Microsoft obtenu n’est pas un jeton Graph Copilot complet (aud=${info.aud || 'absent'}). Déconnectez/reconnectez le compte et acceptez les autorisations.`);
    }
    return popup.accessToken;
  };

  const connect = async () => {
    setError(''); setConnecting(true);
    try { await acquireToken(true); }
    catch (e:any) { setConnected(false); setError(e?.message || 'Connexion Microsoft impossible.'); }
    finally { setConnecting(false); }
  };

  const send = async () => {
    if ((!input.trim() && !files.length) || loading) return;
    setError(''); setLoading(true);
    const message = input.trim() || 'Analyse en profondeur les fichiers joints et identifie ce qui doit être ajouté ou corrigé dans ce projet.';
    setMessages(v => [...v,{role:'user',text:message+(files.length?`\n📎 ${files.map(f=>f.name).join(', ')}`:'')}]);
    setInput('');
    try {
      const token = await acquireToken(false);
      const form = new FormData();
      form.append('message', message);
      if (conversationId) form.append('conversationId', conversationId);
      files.forEach(f=>form.append('files',f));
      const r = await fetch(`/api/projects/${encodeURIComponent(project.id)}/copilot`, {
        method:'POST', headers:{ Authorization:`Bearer ${token}` }, body:form
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || 'Microsoft 365 Copilot indisponible.');
      setConversationId(data.data?.conversationId || conversationId);
      setMessages(v=>[...v,{role:'assistant',text:data.data?.reply || 'Analyse terminée.'}]);
      if (Array.isArray(data.data?.confirmation?.actions) && data.data.confirmation.actions.length) setPending(data.data.confirmation.actions);
      setFiles([]);
    } catch(e:any) {
      setMessages(v=>[...v,{role:'assistant',text:`Erreur : ${e?.message || 'Copilot indisponible.'}`}]);
    } finally { setLoading(false); }
  };

  const apply = async () => {
    if (!pending.length || applying) return;
    setApplying(true); setError('');
    try {
      const r=await fetch(`/api/projects/${encodeURIComponent(project.id)}/copilot/apply`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({confirmed:true})});
      const data=await r.json();
      if(!r.ok) throw new Error(data.error||'Application impossible.');
      setPending([]); setMessages(v=>[...v,{role:'assistant',text:`✅ ${data.data?.applied?.length||0} modification(s) appliquée(s) au projet après votre confirmation.`}]);
      if(data.data?.project) onProjectUpdated?.(data.data.project);
    }catch(e:any){setError(e?.message||'Application impossible.');}
    finally{setApplying(false);}
  };

  return <div className="h-full flex flex-col bg-white rounded-2xl border border-slate-200 overflow-hidden">
    <div className="px-4 py-3 border-b bg-slate-50 flex items-center justify-between">
      <div>
        <div className="font-bold text-slate-800">Microsoft 365 Copilot — {project.name}</div>
        <div className="text-[11px] text-slate-500">Votre compte Microsoft est utilisé. Aucun compte OpenAI/Gemini partagé.</div>
      </div>
      <div className="flex items-center gap-2 text-[10px] text-slate-500"><ShieldCheck className="w-4 h-4 text-emerald-600"/>{connected ? 'Compte connecté' : 'Compte Microsoft'}</div>
    </div>
    {!configured ? <div className="p-6 text-sm text-red-700">Configuration Entra manquante. Vérifiez ENTRA_CLIENT_ID et ENTRA_TENANT_ID dans le .env Docker.</div> : !connected ? <div className="flex-1 grid place-items-center p-8"><div className="text-center max-w-md"><LogIn className="w-10 h-10 mx-auto mb-3 text-indigo-500"/><h3 className="font-bold text-slate-800">Connecter votre Microsoft 365 Copilot</h3><p className="text-xs text-slate-500 mt-2">CLARITY ouvre Microsoft pour vous connecter. Le mot de passe n’est jamais envoyé à CLARITY. Le token délégué reste en mémoire du navigateur et n’est jamais stocké par CLARITY.</p><button onClick={connect} disabled={connecting} className="mt-4 px-5 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-bold disabled:opacity-50">{connecting?<><Loader2 className="inline w-4 h-4 mr-2 animate-spin"/>Connexion...</>:'Se connecter avec Microsoft'}</button>{error&&<p className="mt-3 text-xs text-red-600">{error}</p>}</div></div> : <>
      <div className="flex-1 min-h-[420px] overflow-y-auto p-4 space-y-3 bg-slate-50">
        {messages.length===0 && <div className="text-sm text-slate-500 text-center py-10">Posez une question ou joignez un fichier. Le moteur Microsoft 365 Copilot analysera le contexte du projet et les documents fournis.</div>}
        {messages.map((m,i)=><div key={i} className={`max-w-[90%] rounded-xl p-3 text-sm whitespace-pre-wrap ${m.role==='user'?'ml-auto bg-indigo-600 text-white':'bg-white border border-slate-200 text-slate-800'}`}>{m.text}</div>)}
        {loading&&<div className="bg-white border rounded-xl p-3 text-sm text-slate-500"><Loader2 className="inline w-4 h-4 mr-2 animate-spin"/>Microsoft 365 Copilot analyse...</div>}
      </div>
      <div className="border-t bg-white p-3">
        {files.length>0&&<div className="mb-2 flex flex-wrap gap-2">{files.map((f,i)=><span key={i} className="text-xs bg-slate-100 rounded px-2 py-1">📎 {f.name}</span>)}</div>}
        <div className="flex gap-2 items-end">
          <label className="p-2 rounded-lg border cursor-pointer hover:bg-slate-50"><Paperclip className="w-5 h-5 text-slate-600"/><input type="file" multiple accept=".xlsx,.xls,.csv,.pdf,.doc,.docx,.txt,.md,.json" className="hidden" onChange={e=>setFiles(Array.from(e.target.files||[]))}/></label>
          <textarea value={input} onChange={e=>setInput(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();send();}}} placeholder="Demandez une analyse, une correction ou une modification du projet..." className="flex-1 min-h-[44px] max-h-32 resize-y border rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-200" />
          <button onClick={send} disabled={loading||(!input.trim()&&!files.length)} className="p-3 rounded-lg bg-indigo-600 text-white disabled:opacity-40"><Send className="w-5 h-5"/></button>
        </div>
        {pending.length>0&&<div className="mt-3 border border-amber-200 bg-amber-50 rounded-xl p-3"><div className="font-bold text-sm text-amber-900">Modifications proposées par Copilot</div><div className="text-xs text-amber-800 mt-1">{pending.length} modification(s) sont prêtes. Rien n’a encore été écrit dans CLARITY.</div><div className="flex gap-2 mt-3"><button onClick={apply} disabled={applying} className="px-4 py-2 rounded-lg bg-emerald-600 text-white text-xs font-bold">{applying?'Application...':'✓ Oui, appliquer'}</button><button onClick={()=>setPending([])} className="px-4 py-2 rounded-lg border bg-white text-xs font-bold"><XCircle className="inline w-4 h-4 mr-1"/>Non</button></div></div>}
        {error&&<div className="mt-2 text-xs text-red-700 bg-red-50 border rounded p-2">{error}</div>}
      </div>
    </>}
  </div>;
};
