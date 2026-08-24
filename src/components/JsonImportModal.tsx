import React, { useMemo, useState } from 'react';
import { CheckCircle2, FileJson, Loader2, Upload, X, AlertTriangle } from 'lucide-react';
import { UserRole } from '../types';

type ImportType = 'projects' | 'tasks' | 'milestones';
interface Props { isOpen:boolean; onClose:()=>void; role:UserRole; projectId?:string; onImported?:()=>void; }

const labels: Record<ImportType,string> = { projects:'Projets', tasks:'Tâches', milestones:'Jalons' };
const allowed = (role:UserRole):ImportType[] => role==='DIRECTEUR_PROJETS' ? ['projects','tasks','milestones'] : role==='ADMINISTRATEUR' ? [] : ['tasks','milestones'];

export const JsonImportModal: React.FC<Props> = ({isOpen,onClose,role,onImported}) => {
  const types=useMemo(()=>allowed(role),[role]);
  const [type,setType]=useState<ImportType>(types[0]||'tasks');
  const [items,setItems]=useState<any[]>([]);
  const [fileName,setFileName]=useState('');
  const [preview,setPreview]=useState<any>(null);
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState('');
  const [canonical,setCanonical]=useState<any>(null);
  if(!isOpen) return null;

  const readFile=(file:File)=>{
    setError(''); setPreview(null); setCanonical(null); setFileName(file.name);
    const reader=new FileReader();
    reader.onload=()=>{ try {
      const raw=JSON.parse(String(reader.result||''));
      if(raw?.schema==='clarity.pm.project-update.v1' && raw?.version===1 && Array.isArray(raw?.operations)) { setCanonical(raw); setItems([]); return; }
      const arr=Array.isArray(raw) ? raw : Array.isArray(raw[type]) ? raw[type] : [];
      if(!arr.length) throw new Error(`Le JSON doit contenir un tableau « ${type} » ou être directement un tableau.`);
      setItems(arr);
    } catch(e:any){ setItems([]); setError(e?.message||'JSON invalide.'); } };
    reader.readAsText(file);
  };

  const validate=async()=>{
    setLoading(true); setError('');
    try{
      const r=await fetch('/api/import-json/validate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({type,items})});
      const d=await r.json(); if(!r.ok) throw new Error(d.error||'Validation impossible.');
      setPreview(d.data);
    }catch(e:any){setError(e?.message||'Validation impossible.');}finally{setLoading(false);}
  };
  const apply=async()=>{
    setLoading(true); setError('');
    try{
      if(canonical){
        const projectId=String(canonical?.project?.id||'');
        if(!projectId) throw new Error('Le JSON CLARITY ne contient pas project.id.');
        const r=await fetch(`/api/projects/${encodeURIComponent(projectId)}/copilot/apply-json`,{method:'POST',credentials:'include',headers:{'Content-Type':'application/json'},body:JSON.stringify({confirmed:true,document:canonical})});
        const d=await r.json(); if(!r.ok) throw new Error(d.error||'Application JSON impossible.');
        setPreview({validCount:d.data?.applied?.length||0,errorCount:d.data?.failed?.length||0,duplicateCount:0,items:d.data?.applied||[],applied:{imported:d.data?.applied?.length||0,failed:d.data?.failed||[]}}); onImported?.(); return;
      }
      if(!preview?.items?.length) return;
      const r=await fetch('/api/import-json/confirm',{method:'POST',credentials:'include',headers:{'Content-Type':'application/json'},body:JSON.stringify({type,items:preview.items})});
      const d=await r.json(); if(!r.ok) throw new Error(d.error||'Import impossible.');
      setPreview({...preview,applied:d.data}); setItems([]); onImported?.();
    }catch(e:any){setError(e?.message||'Import impossible.');}finally{setLoading(false);}
  };
  return <div className="fixed inset-0 z-[80] bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-4">
    <div className="bg-white rounded-2xl w-full max-w-3xl max-h-[90vh] overflow-hidden shadow-2xl flex flex-col">
      <div className="p-5 border-b flex justify-between items-center"><div><h2 className="font-bold text-slate-900 flex items-center gap-2"><FileJson className="w-5 h-5 text-indigo-600"/> Import JSON CLARITY</h2><p className="text-xs text-slate-500 mt-1">Import contrôlé par rôle, validation serveur puis confirmation avant CRUD.</p></div><button onClick={onClose}><X/></button></div>
      <div className="p-5 overflow-y-auto space-y-5">
        <div className="flex gap-2 flex-wrap">{types.map(t=><button key={t} onClick={()=>{setType(t);setItems([]);setPreview(null);setError('')}} className={`px-4 py-2 rounded-xl text-sm font-semibold border ${type===t?'bg-indigo-600 text-white border-indigo-600':'bg-white text-slate-700 border-slate-300'}`}>{labels[t]}</button>)}</div>
        <div className="rounded-xl border-2 border-dashed border-slate-300 p-6 text-center"><Upload className="mx-auto w-7 h-7 text-indigo-500"/><p className="font-semibold mt-2">Choisir un fichier JSON</p><p className="text-xs text-slate-500 mb-3">{type==='projects'?'Un tableau de projets.':'Un tableau de '+labels[type].toLowerCase()+' avec projectId ou projectCode.'}</p><input type="file" accept="application/json,.json" onChange={e=>{const f=e.target.files?.[0];if(f)readFile(f)}}/></div>
        {fileName&&<div className="text-xs text-slate-600">📎 {fileName} · {canonical ? `${canonical.operations.length} opération(s) de mise à jour CLARITY` : `${items.length} élément(s)`}</div>}
        {canonical&&<div className="p-4 rounded-xl bg-indigo-50 border border-indigo-200 text-sm text-indigo-900"><b>JSON de mise à jour CLARITY détecté</b><div className="text-xs mt-1">Projet : {canonical.project?.code||canonical.project?.id} · {canonical.operations.length} opération(s). L’application utilise la session de l’utilisateur connecté et vérifie le projet cible avant écriture.</div></div>}
        {error&&<div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-sm"><AlertTriangle className="inline w-4 h-4 mr-1"/>{error}</div>}
        {preview&&<div className="space-y-3"><div className="p-4 rounded-xl bg-slate-50 border"><b>{preview.validCount}</b> valide(s), <b>{preview.errorCount}</b> erreur(s), <b>{preview.duplicateCount}</b> doublon(s).</div>{preview.errors?.length>0&&<div className="p-3 bg-rose-50 rounded-xl text-xs text-rose-700 max-h-40 overflow-auto">{preview.errors.map((e:any,i:number)=><div key={i}>• {e}</div>)}</div>}<div className="max-h-56 overflow-auto border rounded-xl divide-y">{preview.items?.map((it:any,i:number)=><div key={i} className="p-3 text-xs"><b>{it.name||it.title||it.code}</b>{it.projectCode&&<span className="ml-2 text-slate-500">Projet {it.projectCode}</span>}</div>)}</div>{preview.applied&&<div className="p-4 bg-emerald-50 text-emerald-800 rounded-xl"><CheckCircle2 className="inline w-4 h-4 mr-1"/>Import terminé : {preview.applied.imported} élément(s).</div>}</div>}
      </div>
      <div className="p-4 border-t bg-slate-50 flex justify-end gap-2"><button onClick={onClose} className="px-4 py-2 rounded-xl border">Fermer</button>{!preview?.applied&&<><button onClick={validate} disabled={!!canonical||!items.length||loading} className="px-4 py-2 rounded-xl bg-indigo-600 text-white font-semibold disabled:opacity-50">{loading?<Loader2 className="inline w-4 h-4 animate-spin mr-2"/>:null}Valider</button><button onClick={apply} disabled={canonical ? false : (!preview?.validCount||preview.errorCount>0)||loading} className="px-4 py-2 rounded-xl bg-emerald-600 text-white font-semibold disabled:opacity-50">{loading?<Loader2 className="inline w-4 h-4 animate-spin mr-2"/>:null}Appliquer</button></>}</div>
    </div>
  </div>;
};
