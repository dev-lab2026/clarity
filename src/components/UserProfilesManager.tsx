import React, { useEffect, useMemo, useState } from 'react';
import { Pencil, Plus, RefreshCw, Search, Trash2, UserCheck, UserX, X } from 'lucide-react';
import { UserProfile, UserRole } from '../types';

const ROLES: { value: UserRole; label: string }[] = [
  { value: 'ADMINISTRATEUR', label: 'Administrateur' },
  { value: 'DIRECTEUR_PROJETS', label: 'Directeur de projets' },
  { value: 'PMO', label: 'PMO' },
  { value: 'CHEF_PROJET', label: 'Chef de projet' },
  { value: 'CONTRIBUTEUR', label: 'Contributeur' },
];

type FormState = {
  email: string; displayName: string; role: UserRole; jobTitle: string; department: string;
  officeLocation: string; azureOid: string; isActive: boolean;
};
const emptyForm: FormState = { email:'', displayName:'', role:'CHEF_PROJET', jobTitle:'', department:'', officeLocation:'', azureOid:'', isActive:true };

export const UserProfilesManager: React.FC = () => {
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [editing, setEditing] = useState<UserProfile | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm);

  const load = async () => {
    setLoading(true); setError(null);
    try {
      const r = await fetch('/api/admin/users');
      const d = await r.json();
      if (!r.ok || !d.success) throw new Error(d.error || 'Chargement impossible.');
      setUsers(d.users || []);
    } catch (e:any) { setError(e?.message || 'Chargement impossible.'); }
    finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return users;
    return users.filter(u => [u.displayName,u.email,u.department,u.jobTitle,u.role].some(v => String(v||'').toLowerCase().includes(q)));
  }, [users, search]);

  const openCreate = () => { setEditing(null); setForm(emptyForm); setError(null); setNotice(null); setModalOpen(true); };
  const openEdit = (u: UserProfile) => {
    setEditing(u); setModalOpen(true); setForm({ email:u.email, displayName:u.displayName, role:u.role, jobTitle:u.jobTitle||'', department:u.department||'', officeLocation:u.officeLocation||'', azureOid:u.azureOid||'', isActive:u.isActive }); setError(null); setNotice(null);
  };
  const close = () => { setEditing(null); setForm(emptyForm); setModalOpen(false); };

  const save = async (e: React.FormEvent) => {
    e.preventDefault(); setSaving(true); setError(null); setNotice(null);
    try {
      const url = editing ? `/api/admin/users/${editing.id}` : '/api/admin/users';
      const method = editing ? 'PUT' : 'POST';
      const r = await fetch(url, { method, headers:{'Content-Type':'application/json'}, body:JSON.stringify(form) });
      const d = await r.json();
      if (!r.ok || !d.success) throw new Error(d.error || 'Enregistrement impossible.');
      await load(); close(); setNotice(editing ? 'Profil modifié avec succès.' : 'Profil créé avec succès.');
    } catch (e:any) { setError(e?.message || 'Enregistrement impossible.'); }
    finally { setSaving(false); }
  };

  const toggle = async (u: UserProfile) => {
    setError(null); setNotice(null);
    try {
      const r = await fetch(`/api/admin/users/${u.id}/status`, { method:'PATCH', headers:{'Content-Type':'application/json'}, body:JSON.stringify({isActive:!u.isActive}) });
      const d = await r.json(); if (!r.ok || !d.success) throw new Error(d.error || 'Modification impossible.');
      await load(); setNotice(u.isActive ? 'Profil désactivé.' : 'Profil activé.');
    } catch(e:any) { setError(e?.message || 'Modification impossible.'); }
  };

  const remove = async (u: UserProfile) => {
    if (!window.confirm(`Supprimer définitivement le profil ${u.displayName} (${u.email}) ?`)) return;
    setError(null); setNotice(null);
    try {
      const r = await fetch(`/api/admin/users/${u.id}`, { method:'DELETE' });
      const d = await r.json(); if (!r.ok || !d.success) throw new Error(d.error || 'Suppression impossible.');
      await load(); setNotice('Profil supprimé.');
    } catch(e:any) { setError(e?.message || 'Suppression impossible.'); }
  };

  return <div className="space-y-5">
    <div className="bg-white rounded-3xl border border-slate-200 shadow-xs p-6 sm:p-8">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3"><div className="p-3 bg-indigo-100 text-indigo-700 rounded-2xl"><UserCheck className="w-6 h-6"/></div><div><h2 className="text-lg font-bold text-slate-900">Profils utilisateurs</h2><p className="text-xs text-slate-500">Création, modification, activation et suppression des profils CLARITY PM.</p></div></div>
        </div>
        <div className="flex gap-2">
          <button onClick={() => void load()} className="px-3 py-2 rounded-xl border border-slate-200 text-slate-700 text-xs font-bold hover:bg-slate-50"><RefreshCw className={`w-4 h-4 inline mr-1 ${loading?'animate-spin':''}`}/>Actualiser</button>
          <button onClick={openCreate} className="px-3 py-2 rounded-xl bg-indigo-600 text-white text-xs font-bold hover:bg-indigo-500"><Plus className="w-4 h-4 inline mr-1"/>Créer un profil</button>
        </div>
      </div>
      <div className="mt-5 grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="rounded-2xl bg-slate-50 border border-slate-200 p-4"><div className="text-xs text-slate-500">Profils</div><div className="text-2xl font-black text-slate-900">{users.length}</div></div>
        <div className="rounded-2xl bg-emerald-50 border border-emerald-200 p-4"><div className="text-xs text-emerald-700">Actifs</div><div className="text-2xl font-black text-emerald-800">{users.filter(u=>u.isActive).length}</div></div>
        <div className="rounded-2xl bg-amber-50 border border-amber-200 p-4"><div className="text-xs text-amber-700">Inactifs</div><div className="text-2xl font-black text-amber-800">{users.filter(u=>!u.isActive).length}</div></div>
      </div>
      <div className="mt-5 relative"><Search className="w-4 h-4 absolute left-3 top-3 text-slate-400"/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Rechercher par nom, email, rôle ou département..." className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-xs focus:bg-white focus:ring-2 focus:ring-indigo-500"/></div>
      {notice && <div className="mt-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 px-4 py-3 text-xs font-semibold">{notice}</div>}
      {error && <div className="mt-4 rounded-xl bg-red-50 border border-red-200 text-red-800 px-4 py-3 text-xs font-semibold">{error}</div>}

      <div className="mt-5 overflow-x-auto rounded-2xl border border-slate-200">
        <table className="w-full text-left text-xs">
          <thead className="bg-slate-50 border-b border-slate-200"><tr><th className="p-3">Utilisateur</th><th className="p-3">Rôle</th><th className="p-3">Département</th><th className="p-3">Entra ID</th><th className="p-3">Statut</th><th className="p-3 text-right">Actions</th></tr></thead>
          <tbody className="divide-y divide-slate-100">
            {filtered.map(u => <tr key={u.id} className="hover:bg-slate-50/70">
              <td className="p-3"><div className="font-bold text-slate-900">{u.displayName}</div><div className="text-slate-500">{u.email}</div></td>
              <td className="p-3"><span className="px-2 py-1 rounded-lg bg-indigo-50 text-indigo-700 font-bold">{ROLES.find(r=>r.value===u.role)?.label || u.role}</span></td>
              <td className="p-3 text-slate-700">{u.department || '—'}</td>
              <td className="p-3 font-mono text-[10px] text-slate-500">{u.azureOid ? 'Associé' : 'À associer'}</td>
              <td className="p-3"><span className={`px-2 py-1 rounded-lg font-bold ${u.isActive?'bg-emerald-50 text-emerald-700':'bg-slate-100 text-slate-500'}`}>{u.isActive?'Actif':'Inactif'}</span></td>
              <td className="p-3"><div className="flex justify-end gap-1">
                <button title="Modifier" onClick={()=>openEdit(u)} className="p-2 rounded-lg hover:bg-indigo-50 text-indigo-600"><Pencil className="w-4 h-4"/></button>
                <button title={u.isActive?'Désactiver':'Activer'} onClick={()=>void toggle(u)} className="p-2 rounded-lg hover:bg-amber-50 text-amber-600">{u.isActive?<UserX className="w-4 h-4"/>:<UserCheck className="w-4 h-4"/>}</button>
                <button title="Supprimer" onClick={()=>void remove(u)} className="p-2 rounded-lg hover:bg-red-50 text-red-600"><Trash2 className="w-4 h-4"/></button>
              </div></td>
            </tr>)}
            {!loading && filtered.length===0 && <tr><td colSpan={6} className="p-8 text-center text-slate-400">Aucun profil.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>

    {modalOpen && <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4" onMouseDown={e=>{if(e.currentTarget===e.target)close()}}>
      <form onSubmit={save} className="w-full max-w-2xl bg-white rounded-3xl shadow-2xl border border-slate-200 p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-5"><div><h3 className="text-lg font-black text-slate-900">{editing?'Modifier le profil':'Créer un profil'}</h3><p className="text-xs text-slate-500">L'administrateur CLARITY PM définit le rôle et les droits.</p></div><button type="button" onClick={close} className="p-2 rounded-xl hover:bg-slate-100"><X className="w-5 h-5"/></button></div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {([['displayName','Nom affiché'],['email','Email'],['jobTitle','Poste'],['department','Département'],['officeLocation','Localisation'],['azureOid','Object ID Entra (optionnel)']] as const).map(([key,label])=><label key={key} className="text-xs font-bold text-slate-700">{label}<input value={form[key]} onChange={e=>setForm({...form,[key]:e.target.value})} required={key==='displayName'||key==='email'} disabled={editing?.id==='local-admin' && key==='email'} className="mt-1 w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-xs font-normal focus:bg-white focus:ring-2 focus:ring-indigo-500"/></label>)}
          <label className="text-xs font-bold text-slate-700">Rôle<select value={form.role} onChange={e=>setForm({...form,role:e.target.value as UserRole})} className="mt-1 w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-xs"><option value="ADMINISTRATEUR">Administrateur</option><option value="DIRECTEUR_PROJETS">Directeur de projets</option><option value="PMO">PMO</option><option value="CHEF_PROJET">Chef de projet</option><option value="CONTRIBUTEUR">Contributeur</option></select></label>
          <label className="flex items-center gap-2 text-xs font-bold text-slate-700 pt-6"><input type="checkbox" checked={form.isActive} onChange={e=>setForm({...form,isActive:e.target.checked})} className="w-4 h-4"/>Profil actif</label>
        </div>
        <div className="mt-6 flex justify-end gap-2"><button type="button" onClick={close} className="px-4 py-2.5 rounded-xl border border-slate-200 text-xs font-bold">Annuler</button><button disabled={saving} className="px-4 py-2.5 rounded-xl bg-indigo-600 text-white text-xs font-bold">{saving?'Enregistrement...':editing?'Enregistrer les modifications':'Créer le profil'}</button></div>
      </form>
    </div>}
  </div>;
};
