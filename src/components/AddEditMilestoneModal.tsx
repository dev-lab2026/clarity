import React, { useState } from 'react';
import { Project, Milestone } from '../types';
import { X, Target, Trash2 } from 'lucide-react';

interface AddEditMilestoneModalProps {
  project: Project;
  milestoneId?: string | null;
  onClose: () => void;
  onSaveMilestone: (milestone: Milestone) => void;
  onDeleteMilestone?: (milestoneId: string) => void;
}

export const AddEditMilestoneModal: React.FC<AddEditMilestoneModalProps> = ({
  project,
  milestoneId,
  onClose,
  onSaveMilestone,
  onDeleteMilestone,
}) => {
  const existingMilestone = milestoneId
    ? project.milestones.find((m) => m.id === milestoneId)
    : null;

  const [title, setTitle] = useState(existingMilestone?.title || '');
  const [description, setDescription] = useState(existingMilestone?.description || '');
  const [targetDate, setTargetDate] = useState(
    existingMilestone?.targetDate || new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString().split('T')[0]
  );
  const [completed, setCompleted] = useState(existingMilestone?.completed || false);
  const [deliverablesInput, setDeliverablesInput] = useState(
    existingMilestone?.deliverables?.join(', ') || ''
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    const deliverables = deliverablesInput
      .split(',')
      .map((d) => d.trim())
      .filter(Boolean);

    const msData: Milestone = {
      id: existingMilestone?.id || `ms-${Date.now()}`,
      projectId: project.id,
      title: title.trim(),
      description: description.trim(),
      targetDate,
      completed,
      actualDate: completed ? (existingMilestone?.actualDate || new Date().toISOString().split('T')[0]) : undefined,
      deliverables,
    };

    onSaveMilestone(msData);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl max-w-md w-full shadow-2xl border border-slate-200 flex flex-col overflow-hidden">
        
        {/* Header */}
        <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-indigo-100 text-indigo-700">
              <Target className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">
                {existingMilestone ? 'Modifier le Jalon' : 'Nouveau Jalon Clé'}
              </h2>
              <p className="text-xs text-slate-500">
                Livrables et étapes majeures du projet
              </p>
            </div>
          </div>

          <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              Nom du Jalon / Étape clé *
            </label>
            <input
              type="text"
              required
              placeholder="Ex: Validation Prototype & Architecture"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full text-xs p-2.5 bg-slate-50 border border-slate-300 rounded-xl font-semibold"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              Date Cible de Livraison *
            </label>
            <input
              type="date"
              required
              value={targetDate}
              onChange={(e) => setTargetDate(e.target.value)}
              className="w-full text-xs p-2 bg-slate-50 border border-slate-300 rounded-xl font-semibold"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              Description & Objectif du jalon
            </label>
            <textarea
              rows={2}
              placeholder="Critères de validation du comité..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full text-xs p-2 bg-slate-50 border border-slate-300 rounded-xl"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              Livrables associés (séparés par virgule)
            </label>
            <input
              type="text"
              placeholder="Ex: Cahier de recette, Dossier d'architecture"
              value={deliverablesInput}
              onChange={(e) => setDeliverablesInput(e.target.value)}
              className="w-full text-xs p-2 bg-slate-50 border border-slate-300 rounded-xl"
            />
          </div>

          <div className="pt-2">
            <label className="flex items-center gap-2 text-xs font-bold text-slate-800 cursor-pointer">
              <input
                type="checkbox"
                checked={completed}
                onChange={(e) => setCompleted(e.target.checked)}
                className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500"
              />
              <span>Jalon atteint et validé (100% terminé)</span>
            </label>
          </div>

          {/* Footer Submit */}
          <div className="flex items-center justify-between pt-4 border-t border-slate-100">
            {existingMilestone && onDeleteMilestone ? (
              <button
                type="button"
                onClick={() => {
                  if (confirm('Supprimer ce jalon ?')) {
                    onDeleteMilestone(existingMilestone.id);
                    onClose();
                  }
                }}
                className="text-xs font-bold text-rose-600 hover:text-rose-800"
              >
                Supprimer
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
                className="px-5 py-2 text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl shadow-xs cursor-pointer"
              >
                {existingMilestone ? 'Enregistrer' : 'Créer le jalon'}
              </button>
            </div>
          </div>
        </form>

      </div>
    </div>
  );
};
