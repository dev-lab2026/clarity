import React, { useState } from 'react';
import { Project, Risk, RiskCategory, RiskStatus } from '../types';
import { X, ShieldAlert, Trash2 } from 'lucide-react';

interface AddEditRiskModalProps {
  project: Project;
  riskId?: string | null;
  onClose: () => void;
  onSaveRisk: (risk: Risk) => void;
  onDeleteRisk?: (riskId: string) => void;
}

export const AddEditRiskModal: React.FC<AddEditRiskModalProps> = ({
  project,
  riskId,
  onClose,
  onSaveRisk,
  onDeleteRisk,
}) => {
  const existingRisk = riskId ? project.risks.find((r) => r.id === riskId) : null;

  const [title, setTitle] = useState(existingRisk?.title || '');
  const [description, setDescription] = useState(existingRisk?.description || '');
  const [category, setCategory] = useState<RiskCategory>(existingRisk?.category || 'TECHNIQUE');
  const [probability, setProbability] = useState<number>(existingRisk?.probability || 3);
  const [impact, setImpact] = useState<number>(existingRisk?.impact || 3);
  const [mitigationPlan, setMitigationPlan] = useState(existingRisk?.mitigationPlan || '');
  const [contingencyPlan, setContingencyPlan] = useState(existingRisk?.contingencyPlan || '');
  const [ownerId, setOwnerId] = useState(existingRisk?.ownerId || '');
  const [financialImpact, setFinancialImpact] = useState<number>(existingRisk?.financialImpact || 10000);
  const [status, setStatus] = useState<RiskStatus>(existingRisk?.status || 'ACTIVE');

  const riskScore = probability * impact;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    const riskData: Risk = {
      id: existingRisk?.id || `risk-${Date.now()}`,
      projectId: project.id,
      title: title.trim(),
      description: description.trim(),
      category,
      probability,
      impact,
      mitigationPlan: mitigationPlan.trim(),
      contingencyPlan: contingencyPlan.trim(),
      ownerId: ownerId || undefined,
      financialImpact: Number(financialImpact) || 0,
      status,
      identifiedDate: existingRisk?.identifiedDate || new Date().toISOString().split('T')[0],
    };

    onSaveRisk(riskData);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl max-w-lg w-full shadow-2xl border border-slate-200 flex flex-col max-h-[90vh] overflow-hidden">
        
        {/* Header */}
        <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-rose-100 text-rose-700">
              <ShieldAlert className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">
                {existingRisk ? 'Modifier le Risque' : 'Déclarer un Nouveau Risque'}
              </h2>
              <p className="text-xs text-slate-500">
                Évaluation matricielle et plan de mitigation
              </p>
            </div>
          </div>

          <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 overflow-y-auto flex-1 space-y-4">
          
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              Intitulé du risque ou problème *
            </label>
            <input
              type="text"
              required
              placeholder="Ex: Retard livraison API tierce de paiement"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full text-xs p-2.5 bg-slate-50 border border-slate-300 rounded-xl font-semibold"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Catégorie</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as RiskCategory)}
                className="w-full text-xs p-2 bg-slate-50 border border-slate-300 rounded-xl font-medium"
              >
                <option value="TECHNIQUE">Technique</option>
                <option value="DELAIS">Délais / Planning</option>
                <option value="BUDGET">Budget / Coûts</option>
                <option value="RESSOURCES">Ressources humaines</option>
                <option value="JURIDIQUE">Juridique / RGPD</option>
                <option value="FOURNISSEUR">Fournisseur externe</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Statut</label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as RiskStatus)}
                className="w-full text-xs p-2 bg-slate-50 border border-slate-300 rounded-xl font-medium"
              >
                <option value="ACTIVE">Actif (Non résolu)</option>
                <option value="MITIGATED">Atténué (Sous contrôle)</option>
                <option value="CLOSED">Clôturé (Écarté)</option>
              </select>
            </div>
          </div>

          {/* Probability & Impact 1 to 5 sliders */}
          <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-3">
            <div className="flex items-center justify-between text-xs font-bold text-slate-800">
              <span>Évaluation Matricielle (Score : {riskScore}/25)</span>
              <span className={`px-2 py-0.5 rounded text-[10px] font-extrabold ${
                riskScore >= 15 ? 'bg-rose-100 text-rose-800' : riskScore >= 10 ? 'bg-orange-100 text-orange-800' : 'bg-amber-100 text-amber-800'
              }`}>
                {riskScore >= 15 ? 'Critique' : riskScore >= 10 ? 'Élevé' : 'Modéré'}
              </span>
            </div>

            <div>
              <div className="flex justify-between text-xs text-slate-600 mb-1">
                <span>Probabilité (d'occurrence) :</span>
                <strong className="text-slate-900">{probability} / 5</strong>
              </div>
              <input
                type="range"
                min="1"
                max="5"
                value={probability}
                onChange={(e) => setProbability(Number(e.target.value))}
                className="w-full accent-indigo-600 cursor-pointer"
              />
            </div>

            <div>
              <div className="flex justify-between text-xs text-slate-600 mb-1">
                <span>Impact (gravité sur le projet) :</span>
                <strong className="text-slate-900">{impact} / 5</strong>
              </div>
              <input
                type="range"
                min="1"
                max="5"
                value={impact}
                onChange={(e) => setImpact(Number(e.target.value))}
                className="w-full accent-indigo-600 cursor-pointer"
              />
            </div>
          </div>

          {/* Mitigation plan */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              Plan d'Atténuation (Actions préventives)
            </label>
            <textarea
              rows={2}
              placeholder="Ex: Doubler les tests de charge et prévoir un mock de secours..."
              value={mitigationPlan}
              onChange={(e) => setMitigationPlan(e.target.value)}
              className="w-full text-xs p-2 bg-slate-50 border border-slate-300 rounded-xl"
            />
          </div>

          {/* Owner & Financial impact */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Porteur du risque</label>
              <select
                value={ownerId}
                onChange={(e) => setOwnerId(e.target.value)}
                className="w-full text-xs p-2 bg-slate-50 border border-slate-300 rounded-xl"
              >
                <option value="">Non assigné</option>
                {project.members.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Impact Financier Max (€)</label>
              <input
                type="number"
                min="0"
                value={financialImpact}
                onChange={(e) => setFinancialImpact(Number(e.target.value))}
                className="w-full text-xs p-2 bg-slate-50 border border-slate-300 rounded-xl font-semibold"
              />
            </div>
          </div>

          {/* Footer Submit */}
          <div className="flex items-center justify-between pt-4 border-t border-slate-100">
            {existingRisk && onDeleteRisk ? (
              <button
                type="button"
                onClick={() => {
                  if (confirm('Supprimer ce risque ?')) {
                    onDeleteRisk(existingRisk.id);
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
                className="px-5 py-2 text-xs font-bold bg-rose-600 hover:bg-rose-700 text-white rounded-xl shadow-xs cursor-pointer"
              >
                {existingRisk ? 'Enregistrer' : 'Déclarer le risque'}
              </button>
            </div>
          </div>

        </form>

      </div>
    </div>
  );
};
