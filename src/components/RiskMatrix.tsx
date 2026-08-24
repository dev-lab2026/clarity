import React, { useState } from 'react';
import { 
  Project, 
  Risk, 
  RiskCategory, 
  RiskStatus 
} from '../types';
import { formatCurrency } from '../utils/pmCalculations';
import { 
  ShieldAlert, 
  Plus, 
  AlertTriangle, 
  CheckCircle2, 
  DollarSign, 
  User, 
  Trash2, 
  Edit3,
  Filter
} from 'lucide-react';

interface RiskMatrixProps {
  project: Project;
  onOpenRiskModal: (riskId?: string) => void;
  onDeleteRisk: (riskId: string) => void;
  onUpdateRiskStatus: (riskId: string, status: RiskStatus) => void;
}

export const RiskMatrix: React.FC<RiskMatrixProps> = ({
  project,
  onOpenRiskModal,
  onDeleteRisk,
  onUpdateRiskStatus,
}) => {
  const [categoryFilter, setCategoryFilter] = useState<string>('ALL');
  const [statusFilter, setStatusFilter] = useState<string>('ACTIVE');

  // Filter risks
  const filteredRisks = project.risks.filter((r) => {
    const matchesCat = categoryFilter === 'ALL' || r.category === categoryFilter;
    const matchesStatus = statusFilter === 'ALL' || r.status === statusFilter;
    return matchesCat && matchesStatus;
  });

  // Calculate total financial exposure of active risks
  const totalFinancialExposure = project.risks
    .filter((r) => r.status === 'ACTIVE')
    .reduce((sum, r) => sum + (Number(r.financialImpact) || 0), 0);

  // Helper for heatmap cell color
  const getCellColor = (prob: number, imp: number) => {
    const score = prob * imp;
    if (score >= 15) return 'bg-rose-500/20 border-rose-500/40 text-rose-800';
    if (score >= 10) return 'bg-orange-500/20 border-orange-500/40 text-orange-800';
    if (score >= 5) return 'bg-amber-500/20 border-amber-500/40 text-amber-800';
    return 'bg-emerald-500/15 border-emerald-500/30 text-emerald-800';
  };

  const getSeverityBadge = (prob: number, imp: number) => {
    const score = prob * imp;
    if (score >= 15) return <span className="px-2 py-0.5 rounded text-[10px] font-extrabold bg-rose-100 text-rose-800">Critique ({score})</span>;
    if (score >= 10) return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-orange-100 text-orange-800">Élevé ({score})</span>;
    if (score >= 5) return <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-amber-100 text-amber-800">Modéré ({score})</span>;
    return <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-100 text-emerald-800">Faible ({score})</span>;
  };

  return (
    <div className="space-y-6">
      
      {/* Top Risk Header & Stats */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-rose-600" />
              <span>Matrice & Registre des Risques Projet</span>
            </h2>
            <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-rose-50 text-rose-700 border border-rose-200">
              {project.risks.filter((r) => r.status === 'ACTIVE').length} Risques Actifs
            </span>
          </div>
          <p className="text-xs text-slate-500">
            Évaluation matricielle Probabilité x Impact (Méthodologie standard PMBOK / ISO 31000)
          </p>
        </div>

        <div className="flex items-center gap-4">
          <div className="bg-slate-50 px-3 py-1.5 rounded-xl border border-slate-200 text-right">
            <span className="text-[10px] uppercase font-bold text-slate-500 block">Exposition Financière</span>
            <strong className="text-sm font-black text-rose-600">
              {formatCurrency(totalFinancialExposure, project.currency)}
            </strong>
          </div>

          <button
            onClick={() => onOpenRiskModal()}
            className="px-3.5 py-2 rounded-xl text-xs font-bold bg-rose-600 text-white hover:bg-rose-700 transition-colors shadow-2xs flex items-center gap-1.5 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>+ Déclarer un Risque</span>
          </button>
        </div>
      </div>

      {/* Grid Row: 5x5 Heatmap + Quick Guide */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* 5x5 Heatmap (7-col) */}
        <div className="lg:col-span-7 bg-white rounded-2xl p-5 border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
              Grille 5x5 Probabilité vs Impact
            </h3>
            <span className="text-[11px] text-slate-400">
              Cliquez sur un point pour voir le détail
            </span>
          </div>

          {/* Matrix Visual */}
          <div className="relative pl-8 pb-8">
            
            {/* Y-Axis Label: Probabilité */}
            <div className="absolute left-0 top-1/2 -translate-y-1/2 -rotate-90 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
              Probabilité ↑
            </div>

            {/* 5x5 Matrix Grid (Prob 5 down to 1) */}
            <div className="space-y-1.5">
              {[5, 4, 3, 2, 1].map((prob) => (
                <div key={prob} className="flex items-center gap-1.5">
                  <span className="w-5 text-right text-[11px] font-bold text-slate-500">{prob}</span>
                  <div className="grid grid-cols-5 gap-1.5 flex-1">
                    {[1, 2, 3, 4, 5].map((imp) => {
                      const risksInCell = project.risks.filter(
                        (r) => r.status === 'ACTIVE' && r.probability === prob && r.impact === imp
                      );

                      return (
                        <div
                          key={imp}
                          className={`h-12 rounded-lg border flex flex-col items-center justify-center p-1 transition-all relative ${getCellColor(prob, imp)}`}
                        >
                          <span className="text-[9px] font-bold opacity-60 absolute top-1 left-1">
                            {prob * imp}
                          </span>
                          {risksInCell.length > 0 && (
                            <div className="flex items-center justify-center w-6 h-6 rounded-full bg-slate-900 text-white text-[11px] font-black shadow-xs">
                              {risksInCell.length}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>

            {/* X-Axis Label: Impact */}
            <div className="flex items-center gap-1.5 mt-2 pl-6">
              {[1, 2, 3, 4, 5].map((imp) => (
                <div key={imp} className="flex-1 text-center text-[11px] font-bold text-slate-500">
                  {imp}
                </div>
              ))}
            </div>
            <div className="text-center text-[11px] font-bold text-slate-500 uppercase tracking-wider mt-1">
              Impact / Gravité →
            </div>

          </div>
        </div>

        {/* Legend & Risk Levels Guide (5-col) */}
        <div className="lg:col-span-5 bg-white rounded-2xl p-5 border border-slate-200 shadow-xs flex flex-col justify-between">
          <div>
            <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-3">
              Seuils de Gravité & Actions Requises
            </h3>

            <div className="space-y-3">
              <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-200">
                <div className="flex items-center justify-between text-xs font-bold text-rose-800 mb-1">
                  <span>🔴 Zone Critique (Score 15 à 25)</span>
                  <span>Escalade COPIL</span>
                </div>
                <p className="text-[11px] text-rose-700">
                  Impact majeur sur les délais ou le budget. Plan d'atténuation d'urgence obligatoire et suivi quotidien.
                </p>
              </div>

              <div className="p-2.5 rounded-xl bg-orange-50 border border-orange-200">
                <div className="flex items-center justify-between text-xs font-bold text-orange-800 mb-1">
                  <span>🟠 Zone Élevée (Score 10 à 14)</span>
                  <span>Surveillance Hebdo</span>
                </div>
                <p className="text-[11px] text-orange-700">
                  Mesures préventives actives et attribution d'un porteur de risque dédié.
                </p>
              </div>

              <div className="p-2.5 rounded-xl bg-amber-50 border border-amber-200">
                <div className="flex items-center justify-between text-xs font-bold text-amber-800 mb-1">
                  <span>🟡 Zone Modérée (Score 5 à 9)</span>
                  <span>Gestion Courante</span>
                </div>
                <p className="text-[11px] text-amber-700">
                  Acceptation sous réserve de suivi périodique lors des comités de projet.
                </p>
              </div>
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-slate-100 text-xs text-slate-500">
            Conseil PM : Révisez la matrice avant chaque comité de pilotage.
          </div>
        </div>

      </div>

      {/* Risk Register Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        
        {/* Filters */}
        <div className="p-4 bg-slate-50/80 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
            Registre Exhaustif des Risques
          </h3>

          <div className="flex items-center gap-2">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="text-xs bg-white border border-slate-300 rounded-lg px-2.5 py-1 text-slate-700 font-medium"
            >
              <option value="ALL">Tous les statuts</option>
              <option value="ACTIVE">Actifs uniquement</option>
              <option value="MITIGATED">Atténués</option>
              <option value="CLOSED">Clôturés</option>
            </select>

            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="text-xs bg-white border border-slate-300 rounded-lg px-2.5 py-1 text-slate-700 font-medium"
            >
              <option value="ALL">Toutes les catégories</option>
              <option value="TECHNIQUE">Technique</option>
              <option value="DELAIS">Délais</option>
              <option value="BUDGET">Budget</option>
              <option value="RESSOURCES">Ressources</option>
              <option value="JURIDIQUE">Juridique / RGPD</option>
            </select>
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-100/70 border-b border-slate-200 text-slate-600 font-bold uppercase tracking-wider text-[11px]">
                <th className="p-3">Risque / Problème</th>
                <th className="p-3">Catégorie</th>
                <th className="p-3 text-center">P x I</th>
                <th className="p-3">Gravité</th>
                <th className="p-3">Plan d'Atténuation (Contre-mesures)</th>
                <th className="p-3">Porteur</th>
                <th className="p-3 text-right">Impact Financier</th>
                <th className="p-3 text-center">Statut</th>
                <th className="p-3 text-right">Actions</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-100">
              {filteredRisks.length === 0 ? (
                <tr>
                  <td colSpan={9} className="p-8 text-center text-slate-400 font-medium">
                    Aucun risque ne correspond aux filtres sélectionnés.
                  </td>
                </tr>
              ) : (
                filteredRisks.map((risk) => {
                  const owner = project.members.find((m) => m.id === risk.ownerId);

                  return (
                    <tr key={risk.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="p-3 font-semibold text-slate-900 max-w-xs">
                        {risk.title}
                      </td>

                      <td className="p-3">
                        <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 font-medium text-[10px]">
                          {risk.category}
                        </span>
                      </td>

                      <td className="p-3 text-center font-bold text-slate-700">
                        {risk.probability} x {risk.impact}
                      </td>

                      <td className="p-3">
                        {getSeverityBadge(risk.probability, risk.impact)}
                      </td>

                      <td className="p-3 text-slate-600 max-w-md text-[11px]">
                        {risk.mitigationPlan || <span className="text-slate-400 italic">Aucun plan défini</span>}
                      </td>

                      <td className="p-3">
                        {owner ? (
                          <div className="flex items-center gap-1.5">
                            <div
                              className="w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold text-white shadow-2xs"
                              style={{ backgroundColor: owner.color || '#4F46E5' }}
                            >
                              {owner.name.charAt(0)}
                            </div>
                            <span className="text-slate-700">{owner.name.split(' ')[0]}</span>
                          </div>
                        ) : (
                          <span className="text-slate-400 italic">Non assigné</span>
                        )}
                      </td>

                      <td className="p-3 text-right font-bold text-slate-900">
                        {risk.financialImpact ? formatCurrency(risk.financialImpact, project.currency) : '-'}
                      </td>

                      <td className="p-3 text-center">
                        <select
                          value={risk.status}
                          onChange={(e) => onUpdateRiskStatus(risk.id, e.target.value as RiskStatus)}
                          className="text-[11px] font-bold rounded-lg border border-slate-300 py-1 px-2 bg-white text-slate-700"
                        >
                          <option value="ACTIVE">Actif</option>
                          <option value="MITIGATED">Atténué</option>
                          <option value="CLOSED">Clôturé</option>
                        </select>
                      </td>

                      <td className="p-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => onOpenRiskModal(risk.id)}
                            className="p-1.5 text-slate-500 hover:text-indigo-600 hover:bg-slate-100 rounded-md transition-colors"
                            title="Modifier le risque"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => onDeleteRisk(risk.id)}
                            className="p-1.5 text-slate-500 hover:text-rose-600 hover:bg-rose-50 rounded-md transition-colors"
                            title="Supprimer le risque"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

      </div>

    </div>
  );
};
