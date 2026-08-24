import React, { useState } from 'react';
import { Project, ProjectStatus, PriorityLevel, UserProfile } from '../types';
import { X, FolderPlus, Trash2 } from 'lucide-react';
import { DEFAULT_KPI_WIDGETS } from '../data/initialData';

interface AddEditProjectModalProps {
  project?: Project | null;
  onClose: () => void;
  onSaveProject: (project: Project) => Promise<unknown>;
  onDeleteProject?: (projectId: string) => Promise<unknown>;
  canCreateDelete?: boolean;
  canEdit?: boolean;
  projectManagers?: UserProfile[];
}

export const AddEditProjectModal: React.FC<AddEditProjectModalProps> = ({
  project,
  onClose,
  onSaveProject,
  onDeleteProject,
  canCreateDelete = false,
  canEdit = true,
  projectManagers = [],
}) => {
  const [name, setName] = useState(project?.name || '');
  const [code, setCode] = useState(project?.code || `PRJ-${new Date().getFullYear()}-${Math.floor(Math.random() * 899 + 100)}`);
  const [description, setDescription] = useState(project?.description || '');
  const [client, setClient] = useState(project?.client || 'Direction Générale');
  const [managerName, setManagerName] = useState(project?.managerName || '');
  const [managerId, setManagerId] = useState(project?.managerId || '');
  const [status, setStatus] = useState<ProjectStatus>(project?.status || 'PLANNING');
  const [priority, setPriority] = useState<PriorityLevel>(project?.priority || 'HIGH');
  const [methodology, setMethodology] = useState<'AGILE' | 'WATERFALL' | 'HYBRID'>(project?.methodology || 'HYBRID');
  const [startDate, setStartDate] = useState(
    project?.startDate || new Date().toISOString().split('T')[0]
  );
  const [endDate, setEndDate] = useState(
    project?.endDate || new Date(Date.now() + 180 * 24 * 3600 * 1000).toISOString().split('T')[0]
  );
  const [totalBudget, setTotalBudget] = useState(project?.totalBudget || 150000);
  const [currency, setCurrency] = useState(project?.currency || '€');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setError(null);
    setSaving(true);

    const updatedProject: Project = {
      id: project?.id || `proj-${Date.now()}`,
      name: name.trim(),
      code: code.trim().toUpperCase(),
      description: description.trim(),
      client: client.trim(),
      managerName: managerName.trim(),
      managerId: managerId || undefined,
      status,
      priority,
      methodology,
      startDate,
      endDate,
      totalBudget: Number(totalBudget) || 100000,
      currency,
      kpiWidgets: project?.kpiWidgets || DEFAULT_KPI_WIDGETS,
      tasks: project?.tasks || [],
      milestones: project?.milestones || [],
      risks: project?.risks || [],
      members: project?.members || [
        { id: `mem-${Date.now()}`, name: managerName.trim(), role: 'Chef de Projet', email: 'cp@entreprise.fr', hourlyRate: 90, maxWeeklyHours: 35, color: '#4F46E5' },
      ],
      createdAt: project?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    try {
      await onSaveProject(updatedProject);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Une erreur est survenue.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl max-w-xl w-full shadow-2xl border border-slate-200 flex flex-col max-h-[90vh] overflow-hidden">
        
        {/* Header */}
        <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-indigo-100 text-indigo-700">
              <FolderPlus className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">
                {project ? 'Modifier les Paramètres du Projet' : 'Créer un Nouveau Projet'}
              </h2>
              <p className="text-xs text-slate-500">
                Informations générales, méthodologie et enveloppe budgétaire (BAC)
              </p>
            </div>
          </div>

          <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 overflow-y-auto flex-1 space-y-4">
          
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2">
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Nom du Projet *
              </label>
              <input
                type="text"
                required
                placeholder="Ex: Refonte Plateforme E-Commerce B2B"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full text-xs p-2.5 bg-slate-50 border border-slate-300 rounded-xl font-bold"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Code Projet
              </label>
              <input
                type="text"
                required
                placeholder="PRJ-2026-01"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                className="w-full text-xs p-2.5 bg-slate-50 border border-slate-300 rounded-xl font-mono uppercase font-bold"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              Description & Enjeux stratégiques
            </label>
            <textarea
              rows={2}
              placeholder="Objectifs opérationnels, contexte métier et livrables attendus..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full text-xs p-2 bg-slate-50 border border-slate-300 rounded-xl"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Commanditaire / Client
              </label>
              <input
                type="text"
                placeholder="Ex: Direction Marketing & Ventes"
                value={client}
                onChange={(e) => setClient(e.target.value)}
                className="w-full text-xs p-2 bg-slate-50 border border-slate-300 rounded-xl font-medium"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Chef de Projet Responsable
              </label>
              {projectManagers.length > 0 ? (
                <select
                  value={managerId}
                  onChange={(e) => {
                    const selected = projectManagers.find(u => u.id === e.target.value);
                    setManagerId(e.target.value);
                    setManagerName(selected?.displayName || '');
                  }}
                  className="w-full text-xs p-2 bg-slate-50 border border-slate-300 rounded-xl font-medium"
                  required
                >
                  <option value="">Sélectionner un chef de projet</option>
                  {projectManagers.map(manager => (
                    <option key={manager.id} value={manager.id}>
                      {manager.displayName} — {manager.email}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  type="text"
                  placeholder="Chef de projet responsable"
                  value={managerName}
                  onChange={(e) => setManagerName(e.target.value)}
                  className="w-full text-xs p-2 bg-slate-50 border border-slate-300 rounded-xl font-medium"
                />
              )}
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Statut</label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as ProjectStatus)}
                className="w-full text-xs p-2 bg-slate-50 border border-slate-300 rounded-xl font-semibold"
              >
                <option value="PLANNING">Cadrage / Planification</option>
                <option value="IN_PROGRESS">En cours d'exécution</option>
                <option value="AT_RISK">En dérive / Risque</option>
                <option value="COMPLETED">Livré / Clôturé</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Priorité</label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value as PriorityLevel)}
                className="w-full text-xs p-2 bg-slate-50 border border-slate-300 rounded-xl font-semibold"
              >
                <option value="LOW">Basse</option>
                <option value="MEDIUM">Moyenne</option>
                <option value="HIGH">Haute</option>
                <option value="CRITICAL">Stratégique / Critique</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Méthodologie</label>
              <select
                value={methodology}
                onChange={(e: any) => setMethodology(e.target.value)}
                className="w-full text-xs p-2 bg-slate-50 border border-slate-300 rounded-xl font-semibold"
              >
                <option value="AGILE">Agile (Scrum/Kanban)</option>
                <option value="HYBRID">Hybride (Agile + Jalons)</option>
                <option value="WATERFALL">Cycle en V / Waterfall</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Date de début</label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full text-xs p-2 bg-slate-50 border border-slate-300 rounded-xl font-semibold"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Date de fin prévue</label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full text-xs p-2 bg-slate-50 border border-slate-300 rounded-xl font-semibold"
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2">
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Budget Total Alloué (BAC) *
              </label>
              <input
                type="number"
                min="0"
                required
                value={totalBudget}
                onChange={(e) => setTotalBudget(Number(e.target.value))}
                className="w-full text-xs p-2 bg-slate-50 border border-slate-300 rounded-xl font-black text-slate-900"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Devise</label>
              <input
                type="text"
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
                className="w-full text-xs p-2 bg-slate-50 border border-slate-300 rounded-xl font-bold text-center"
              />
            </div>
          </div>

          {error && (
            <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700">{error}</div>
          )}

          {/* Footer Submit */}
          <div className="flex items-center justify-between pt-4 border-t border-slate-100">
            {project && onDeleteProject && canCreateDelete ? (
              <button
                type="button"
                disabled={saving}
                onClick={async () => {
                  if (!confirm(`Confirmez-vous la suppression du projet "${project.name}" ?`)) return;
                  setError(null);
                  setSaving(true);
                  try {
                    await onDeleteProject(project.id);
                  } catch (err) {
                    setError(err instanceof Error ? err.message : 'Une erreur est survenue.');
                    setSaving(false);
                  }
                }}
                className="text-xs font-bold text-rose-600 hover:text-rose-800 disabled:opacity-50"
              >
                Supprimer le projet
              </button>
            ) : <div />}

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl"
              >
                Annuler
              </button>
              <button
                type="submit"
                disabled={saving || !canEdit || (!project && !canCreateDelete)}
                className="px-5 py-2 text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl shadow-xs cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {saving ? 'Enregistrement…' : project ? 'Enregistrer les modifications' : 'Créer le projet'}
              </button>
            </div>
          </div>

        </form>

      </div>
    </div>
  );
};
