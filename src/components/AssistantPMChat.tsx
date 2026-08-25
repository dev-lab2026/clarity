import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, CalendarDays, CheckCircle2, ChevronDown, FileText, Loader2, Paperclip, Send, Target, XCircle, CheckSquare, Square, Eye } from 'lucide-react';
import { Project } from '../types';

type Action={type:string;id?:string;patch?:any;task?:any;milestone?:any;risk?:any;reason?:string;_key?:string};
type Analysis={summary?:string;findings?:any[];contradictions?:any[];recommendations?:any[];elements?:Record<string,any[]>};
type Msg={role:'user'|'assistant';text:string;analysis?:Analysis;files?:string[];meta?:string};

const labels:Record<string,string>={tasks:'Tâches',milestones:'Jalons',risks:'Risques',dates:'Dates clés',budgets:'Budget / coûts',decisions:'Décisions',corrections:'Corrections à apporter',missing:'Informations manquantes'};
const icons:Record<string,React.ReactNode>={tasks:<CheckCircle2 className="w-4 h-4"/>,milestones:<Target className="w-4 h-4"/>,risks:<AlertTriangle className="w-4 h-4"/>,dates:<CalendarDays className="w-4 h-4"/>};

function asText(v:any):string { if(v==null)return ''; if(typeof v==='string')return v; if(Array.isArray(v))return v.map(asText).filter(Boolean).join(' • '); try{return JSON.stringify(v,null,2)}catch{return String(v)} }
function itemTitle(x:any):string { return String(x?.title||x?.name||x?.label||x?.subject||x?.date||x?.description||x?.text||'Élément détecté'); }
function Evidence({x}:{x:any}){const e=x?.evidence||x?.source||x?.proof||x?.reference; return e?<div className="mt-1 text-[10px] text-slate-500">Source : {asText(e)}</div>:null}
function DetailItem({x}:{x:any}){const [open,setOpen]=useState(false); const title=itemTitle(x); const rest=Object.entries(x||{}).filter(([k,v])=>!['title','name','label','subject','date','description','text','evidence','source','proof','reference','confidence'].includes(k)&&v!==''&&v!=null); return <div className="border rounded-xl bg-white overflow-hidden"><button className="w-full text-left px-3 py-2 flex items-center gap-2" onClick={()=>setOpen(!open)}><span className="font-semibold text-xs flex-1">{title}</span>{x?.confidence!=null&&<span className="text-[10px] text-slate-400">Confiance {Math.round(Number(x.confidence)*100)}%</span>}<ChevronDown className={`w-3 h-3 transition-transform ${open?'rotate-180':''}`}/></button><div className="px-3 pb-2"><div className="text-xs text-slate-700 whitespace-pre-wrap">{asText(x?.description||x?.text||'')}</div><Evidence x={x}/>{open&&rest.length>0&&<div className="mt-2 grid gap-1 text-[11px] text-slate-600">{rest.map(([k,v])=><div key={k}><b>{k} :</b> {asText(v)}</div>)}</div>}</div></div>}
function AnalysisView({analysis}:{analysis?:Analysis}){
  const [allOpen,setAllOpen]=useState(false);
  if(!analysis)return null;
  const el=analysis.elements||{};
  const sections=[['findings','Constats'],['contradictions','Incohérences / contradictions'],...Object.keys(labels).map(k=>[k,labels[k]]),['recommendations','Recommandations']];
  const available=sections.filter(([key])=>{
    const arr=(key==='recommendations'?analysis.recommendations:((analysis as any)[key]||el[key]))||[];
    return Array.isArray(arr)&&arr.length>0;
  });
  return <div className="mt-3 space-y-3">
    {analysis.summary&&<div className="rounded-xl border border-indigo-100 bg-white p-4 shadow-sm">
      <div className="flex items-center gap-2"><div className="font-bold text-sm">Synthèse exécutive</div><span className="ml-auto text-[10px] text-slate-400">{available.length} sections</span></div>
      <div className="mt-2 text-sm leading-6 whitespace-pre-wrap text-slate-700">{analysis.summary}</div>
    </div>}
    <div className="flex items-center gap-2">
      <button type="button" onClick={()=>setAllOpen(v=>!v)} className="px-3 py-1.5 rounded-lg border bg-white text-[11px] font-semibold text-slate-700">{allOpen?'Réduire les détails':'Développer les détails'}</button>
      <span className="text-[10px] text-slate-400">Cliquez sur une section pour consulter les preuves et détails.</span>
    </div>
    {sections.map(([key,title])=>{
      const arr=(key==='recommendations'?analysis.recommendations:((analysis as any)[key]||el[key]))||[];
      if(!Array.isArray(arr)||!arr.length)return null;
      return <CollapsibleSection key={key} title={title} count={arr.length} openAll={allOpen} icon={icons[key]||<FileText className="w-4 h-4"/>}>
        <div className="space-y-2">{arr.map((x:any,i:number)=><DetailItem key={i} x={typeof x==='string'?{title:x}:x}/>)}</div>
      </CollapsibleSection>
    })}
  </div>
}
function CollapsibleSection({title,count,icon,children,openAll}:{title:string;count:number;icon:React.ReactNode;children:React.ReactNode;openAll:boolean}){
  const [open,setOpen]=useState(false);
  const expanded=openAll||open;
  return <div className="rounded-xl border bg-slate-50 overflow-hidden">
    <button type="button" onClick={()=>setOpen(v=>!v)} className="w-full flex items-center gap-2 px-3 py-3 text-left hover:bg-slate-100">
      {icon}<span className="font-bold text-xs flex-1">{title}</span><span className="text-[10px] text-slate-400">{count}</span><ChevronDown className={`w-4 h-4 transition-transform ${expanded?'rotate-180':''}`}/>
    </button>
    {expanded&&<div className="p-3 pt-0">{children}</div>}
  </div>
}

export const AssistantPMChat:React.FC<{project:Project;onProjectUpdated?:(p:Project)=>void}>=({project,onProjectUpdated})=>{
  const [messages,setMessages]=useState<Msg[]>([]); const [input,setInput]=useState(''); const [files,setFiles]=useState<File[]>([]); const [pending,setPending]=useState<Action[]>([]); const [selected,setSelected]=useState<Set<string>>(new Set()); const [loading,setLoading]=useState(false); const [applying,setApplying]=useState(false); const [showRawReply,setShowRawReply]=useState(false); const [error,setError]=useState(''); const [provider,setProvider]=useState(''); const [copilotStudio,setCopilotStudio]=useState(false); const [elapsed,setElapsed]=useState(0); const [loadingHistory,setLoadingHistory]=useState(true); const bottomRef=useRef<HTMLDivElement|null>(null); const timer=useRef<number|undefined>();
  useEffect(()=>{fetch('/api/copilot-studio/status',{credentials:'include'}).then(r=>r.json()).then(d=>setCopilotStudio(Boolean(d?.configured))).catch(()=>setCopilotStudio(false));},[]);
  useEffect(()=>{let cancelled=false; setLoadingHistory(true); fetch(`/api/projects/${encodeURIComponent(project.id)}/copilot`,{credentials:'include'}).then(r=>r.json()).then(d=>{if(cancelled)return; const h=d?.data?.history||[]; const actions=(d?.data?.pendingActions||[]).map((a:any,i:number)=>({...a,_key:String(a._key||`${a.type||'action'}:${a.id||i}:${JSON.stringify(a.patch||a.task||a.milestone||a.risk||{})}`)})); setMessages(h.map((x:any)=>({role:x.role==='assistant'?'assistant':'user',text:String(x.text||''),analysis:x.analysis,files:x.files?.map((f:any)=>f.name),meta:x.meta}))); setPending(actions); setSelected(new Set(actions.map((a:any)=>a._key))); setLoadingHistory(false);}).catch(()=>{if(!cancelled)setLoadingHistory(false)}); return ()=>{cancelled=true};},[project.id]);
  useEffect(()=>()=>{if(timer.current)window.clearInterval(timer.current)},[]);
  useEffect(()=>{if(!loadingHistory) requestAnimationFrame(()=>bottomRef.current?.scrollIntoView({behavior:'smooth',block:'end'}));},[messages,loading,loadingHistory]);
  const send=async()=>{if((!input.trim()&&!files.length)||loading)return;setLoading(true);setElapsed(0);timer.current=window.setInterval(()=>setElapsed(v=>v+1),1000);setError('');const msg=input.trim()||'Analyse en profondeur les fichiers joints, compare-les au projet et identifie précisément ce qui doit être ajouté ou corrigé.';const names=files.map(f=>f.name);setMessages(v=>[...v,{role:'user',text:msg,files:names}]);setInput('');try{const form=new FormData();form.append('message',msg);files.forEach(f=>form.append('files',f));const endpoint=copilotStudio?`/api/projects/${encodeURIComponent(project.id)}/copilot-studio`:`/api/projects/${encodeURIComponent(project.id)}/copilot`; const r=await fetch(endpoint,{method:'POST',credentials:'include',body:form});const d=await r.json();if(!r.ok)throw new Error(d.error||'Assistant PM indisponible.');setProvider(`${d.data?.provider||''} · ${d.data?.model||''}`);setMessages(v=>[...v,{role:'assistant',text:String(d.data?.reply||'Analyse terminée.'),analysis:d.data?.analysis,meta:`${d.data?.provider||'IA'} · ${d.data?.model||''}`}]);const incoming=(Array.isArray(d.data?.actions)?d.data.actions:[]).map((a:any,i:number)=>({...a,_key:String(a._key||`${a.type||'action'}:${a.id||i}:${JSON.stringify(a.patch||a.task||a.milestone||a.risk||{})}`)})); setPending(prev=>{const map=new Map(prev.map(a=>[a._key,a])); incoming.forEach(a=>map.set(a._key,a)); const next=Array.from(map.values()); setSelected(prev=>{const n=new Set(prev); incoming.forEach(a=>n.add(a._key)); return n}); return next}); setFiles([]);}catch(e:any){setError(e.message||'Erreur Assistant PM')}finally{if(timer.current)window.clearInterval(timer.current);setLoading(false)}};
  const toggleAction=(key:string)=>setSelected(prev=>{const n=new Set(prev); if(n.has(key))n.delete(key); else n.add(key); return n});
  const selectAll=()=>setSelected(new Set(pending.map(a=>a._key!)));
  const selectNone=()=>setSelected(new Set());
  const reject=async()=>{try{await fetch(`/api/projects/${encodeURIComponent(project.id)}/copilot/reject`,{method:'POST',credentials:'include',headers:{'Content-Type':'application/json'},body:JSON.stringify({confirmed:true})});}catch{} setPending([]);setSelected(new Set());};
  const apply=async()=>{const ids=pending.filter(a=>selected.has(a._key!)).map(a=>String(a.proposalId||a._key));if(!ids.length||applying)return;setApplying(true);setError('');try{const r=await fetch(`/api/projects/${encodeURIComponent(project.id)}/copilot/apply`,{method:'POST',credentials:'include',headers:{'Content-Type':'application/json'},body:JSON.stringify({confirmed:true,proposalIds:ids})});const d=await r.json();if(!r.ok)throw new Error(d.error||'Application impossible');const applied=d.data?.applied||[];const failed=d.data?.failed||[];const appliedIds=new Set(applied.map((x:any)=>String(x.proposalId)));setPending(prev=>prev.filter(a=>!appliedIds.has(String(a.proposalId||a._key))));setSelected(prev=>{const n=new Set(prev);applied.forEach((a:any)=>n.delete(String(a.proposalId)));return n});if(d.data?.project)onProjectUpdated?.(d.data.project);const detail=failed.length?`\n⚠ ${failed.length} échec(s): ${failed.map((x:any)=>x.error).join(' | ')}`:'';setMessages(v=>[...v,{role:'assistant',text:`✓ ${applied.length} modification(s) appliquée(s) au projet.${detail}`}]);if(failed.length)setError(failed.map((x:any)=>x.error).join(' • '));}catch(e:any){setError(e.message||'Application impossible')}finally{setApplying(false)}};
  return <div className="h-full min-h-0 flex flex-col bg-white overflow-hidden">
    <div className="shrink-0 border-b bg-white px-4 py-3 flex items-center gap-3">
      <div className="w-9 h-9 rounded-xl bg-indigo-600 text-white flex items-center justify-center"><FileText className="w-4 h-4"/></div>
      <div className="min-w-0"><div className="font-bold text-sm text-slate-900">Assistant PM</div><div className="text-[11px] text-slate-500 truncate">{copilotStudio?'Microsoft Copilot Studio · Direct Line':'Analyse documentaire · comparaison projet · actions proposées'}</div></div>
      {provider&&<span className="ml-auto text-[10px] text-slate-400 truncate max-w-[220px]">{provider}</span>}
    </div>
    <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-3 md:px-4 py-4 space-y-4 pb-6 [scrollbar-gutter:stable]">{loadingHistory&&<div className="rounded-xl border bg-slate-50 p-4 text-xs text-slate-500 flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin"/>Chargement de la conversation…</div>}
      {messages.length===0&&<div className="rounded-2xl bg-slate-50 border p-5 text-sm text-slate-600"><b className="text-base text-slate-900">Bonjour, je suis votre Assistant PM.</b><p className="mt-2 leading-5">Je peux analyser vos XLSX, PDF et DOCX, comparer les informations au projet CLARITY, détecter les écarts, tâches, jalons, risques, dates, budgets et informations manquantes, puis proposer des corrections.</p></div>}
      {messages.map((m,i)=><div key={i} className={m.role==='user'?'ml-4 md:ml-12':'mr-0 md:mr-3'}><div className={`rounded-2xl p-4 text-sm ${m.role==='user'?'bg-indigo-50':'bg-slate-50 border'}`}>
        <div className="flex items-center gap-2 text-[10px] font-bold uppercase mb-2"><span>{m.role==='user'?'Vous':'Assistant PM'}</span>{m.files?.map(f=><span key={f} className="normal-case font-medium text-slate-500 truncate max-w-[260px]">📎 {f}</span>)}{m.meta&&<span className="ml-auto normal-case font-medium text-slate-400">{m.meta}</span>}</div>
        {m.role==='assistant'&&m.analysis ? <>
          <div className="text-sm leading-6 whitespace-pre-wrap text-slate-700">{m.text}</div>
          <button type="button" onClick={()=>setShowRawReply(v=>!v)} className="mt-3 text-[11px] font-semibold text-indigo-600">{showRawReply?'Masquer la réponse brute':'Afficher la réponse détaillée du modèle'}</button>
          {showRawReply&&<div className="mt-2 rounded-xl border bg-white p-3 text-xs leading-5 whitespace-pre-wrap text-slate-600">{m.text}</div>}
          <AnalysisView analysis={m.analysis}/>
        </> : <div className="whitespace-pre-wrap leading-5">{m.text}</div>}
      </div></div>)}
      {loading&&<div className="mr-2 rounded-2xl border bg-slate-50 p-4 flex items-center gap-3 text-xs text-slate-600"><Loader2 className="w-4 h-4 animate-spin"/><div><b>Analyse en cours…</b><div className="text-[11px] text-slate-500 mt-0.5">{provider||'Sélection du meilleur provider'} · {elapsed}s · analyse documentaire approfondie</div></div></div>}
      <div ref={bottomRef} className="h-1 shrink-0" />
    </div>
    <div className="shrink-0 border-t bg-white/95 backdrop-blur px-3 md:px-4 py-3 shadow-[0_-4px_18px_rgba(15,23,42,0.06)]">
      {pending.length>0&&<div className="mb-3 rounded-xl border border-amber-200 bg-amber-50 p-3 max-h-[32vh] overflow-y-auto"><div className="flex items-center gap-2 sticky top-0 bg-amber-50 pb-2"><div className="font-bold text-sm text-amber-900">Modifications proposées</div><span className="text-[10px] bg-amber-200 text-amber-900 rounded-full px-2 py-0.5">{pending.length}</span><span className="ml-auto text-[10px] text-amber-800">{selected.size} sélectionnée(s)</span></div><div className="text-xs text-amber-800 mb-2">Sélectionnez précisément les changements à appliquer. Rien n'est écrit tant que vous ne validez pas.</div><div className="space-y-1.5">{pending.map((a,i)=><button type="button" key={a._key||i} onClick={()=>toggleAction(a._key!)} className="w-full flex items-start gap-2 rounded-lg border border-amber-200 bg-white p-2 text-left hover:bg-amber-50">{selected.has(a._key!)?<CheckSquare className="w-4 h-4 mt-0.5 text-emerald-600 shrink-0"/>:<Square className="w-4 h-4 mt-0.5 text-slate-400 shrink-0"/>}<span className="text-[11px] text-slate-700"><b>{a.type}</b>{a.targetType&&` · ${a.targetType}`}{a.targetId&&` · ${a.targetId}`}{a.reason&&<span className="block text-slate-500 mt-0.5">{a.reason}</span>}</span></button>)}</div><div className="flex flex-wrap gap-2 mt-3"><button onClick={selectAll} className="px-3 py-2 rounded-xl bg-white border text-xs font-bold">Tout sélectionner</button><button onClick={selectNone} className="px-3 py-2 rounded-xl bg-white border text-xs font-bold">Tout désélectionner</button><button onClick={()=>{}} className="px-3 py-2 rounded-xl bg-white border text-xs font-bold"><Eye className="inline w-4 h-4 mr-1"/>Prévisualiser</button><button onClick={apply} disabled={applying||selected.size===0} className="px-4 py-2 rounded-xl bg-emerald-600 text-white text-xs font-bold disabled:opacity-50">{applying?'Application…':`✓ Appliquer ${selected.size} modification(s)`}</button><button onClick={reject} className="px-3 py-2 rounded-xl bg-white border text-xs font-bold text-red-700"><XCircle className="inline w-4 h-4 mr-1"/>Refuser</button></div></div>}
      {error&&<div className="mb-2 rounded-xl bg-red-50 border border-red-200 text-red-700 p-3 text-xs">{error}</div>}
      {files.length>0&&<div className="mb-2 flex flex-wrap gap-1">{files.map(f=><span key={f.name} className="inline-flex items-center gap-1 rounded-lg bg-slate-100 px-2 py-1 text-[10px] text-slate-600">📎 {f.name}<button type="button" onClick={()=>setFiles(v=>v.filter(x=>x!==f))} className="ml-1 text-slate-400 hover:text-red-600">×</button></span>)}</div>}
      <div className="flex gap-2 items-end">
        <label className="shrink-0 p-3 rounded-xl border bg-white cursor-pointer hover:bg-slate-50" title="Joindre des fichiers"><Paperclip className="w-4 h-4"/><input type="file" multiple accept=".xlsx,.xls,.csv,.pdf,.docx,.txt,.md,.json" className="hidden" onChange={e=>setFiles(Array.from(e.target.files||[]))}/></label>
        <div className="flex-1"><textarea value={input} onChange={e=>setInput(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();send()}}} placeholder="Demandez une analyse, une comparaison, un diagnostic ou une action…" className="w-full min-h-12 max-h-32 rounded-xl border p-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-indigo-200"/><div className="mt-1 flex justify-between text-[10px] text-slate-400"><span>{files.length?`${files.length} fichier(s) prêt(s)`:'Joignez XLSX, PDF, DOCX…'}</span><span>Entrée envoyer · Maj+Entrée nouvelle ligne</span></div></div>
        <button onClick={send} disabled={loading||(!input.trim()&&!files.length)} className="shrink-0 p-3 rounded-xl bg-indigo-600 text-white disabled:opacity-50 hover:bg-indigo-700" title="Envoyer"><Send className="w-4 h-4"/></button>
      </div>
    </div>
  </div>
}
