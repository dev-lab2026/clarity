import React, { useState } from 'react';
import { 
  Project, 
  TeamMember, 
  Task,
  MicrosoftUser
} from '../types';
import { formatCurrency, formatDateFR } from '../utils/pmCalculations';
import { 
  Users, 
  UserPlus, 
  Clock, 
  DollarSign, 
  AlertTriangle, 
  CheckCircle2, 
  Mail, 
  Briefcase,
  Trash2,
  Edit3,
  ShieldCheck
} from 'lucide-react';

interface TeamWorkloadProps {
  project: Project;
  currentUser?: MicrosoftUser | null;
  onUpdateProject: (updated: Project) => void;
  onOpenTaskModal: (taskId?: string) => void;
}

export const TeamWorkload: React.FC<TeamWorkloadProps> = ({
  project,
  currentUser,
  onUpdateProject,
  onOpenTaskModal,
}) => {
  const [showAddMember, setShowAddMember] = useState(false);
  const [editingMember, setEditingMember] = useState<TeamMember | null>(null);

  // Form states
  const [name, setName] = useState('');
  const [role, setRole] = useState('');
  const [email, setEmail] = useState('');
  const [hourlyRate, setHourlyRate] = useState(85);
  const [maxWeeklyHours, setMaxWeeklyHours] = useState(35);
  const [color, setColor] = useState('#4F46E5');

  const handleOpenAdd = () => {
    setEditingMember(null);
    setName('');
    setRole('');
    setEmail('');
    setHourlyRate(85);
    setMaxWeeklyHours(35);
    setColor('#4F46E5');
    setShowAddMember(true);
  };

  const handleOpenEdit = (m: TeamMember) => {
    setEditingMember(m);
    setName(m.name);
    setRole(m.role);
    setEmail(m.email);
    setHourlyRate(m.hourlyRate || 85);
    setMaxWeeklyHours(m.maxWeeklyHours || 35);
    setColor(m.color || '#4F46E5');
    setShowAddMember(true);
  };

  const handleSaveMember = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    if (editingMember) {
      const updatedMembers = project.members.map((m) =>
        m.id === editingMember.id
          ? {
              ...m,
              name: name.trim(),
              role: role.trim() || 'Collaborateur',
              email: email.trim(),
              hourlyRate: Number(hourlyRate) || 85,
              maxWeeklyHours: Number(maxWeeklyHours) || 35,
              color,
            }
          : m
      );
      onUpdateProject({ ...project, members: updatedMembers });
    } else {
      const newMember: TeamMember = {
        id: `mem-${Date.now()}`,
        name: name.trim(),
        role: role.trim() || 'Collaborateur',
        email: email.trim() || `${name.toLowerCase().replace(/\s+/g, '.')}@entreprise.fr`,
        hourlyRate: Number(hourlyRate) || 85,
        maxWeeklyHours: Number(maxWeeklyHours) || 35,
        color,
      };
      onUpdateProject({ ...project, members: [...project.members, newMember] });
    }

    setShowAddMember(false);
  };

  const handleDeleteMember = (memberId: string) => {
    if (confirm('Voulez-vous supprimer ce membre de l’équipe ?')) {
      const updatedMembers = project.members.filter((m) => m.id !== memberId);
      onUpdateProject({ ...project, members: updatedMembers });
    }
  };

  // Color palette presets
  const colorPresets = ['#4F46E5', '#059669', '#D97706', '#DB2777', '#0284C7', '#7C3AED', '#DC2626'];

  return (
    <div className="space-y-6">
      
      {/* Header */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <Users className="w-4 h-4 text-indigo-600" />
              <span>Gestion des Ressources & Charge de Travail</span>
            </h2>
            <span className="px-2 py-0.5 rounded-full bg-indigo-50 border border-indigo-200 text-indigo-700 text-[10px] font-bold">
              Directeur de Projets & PMO
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Suivi des capacités hebdomadaires, allocations des tâches, TJM et valorisation financière.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleOpenAdd}
            className="px-3.5 py-2 rounded-xl text-xs font-bold bg-indigo-600 text-white hover:bg-indigo-700 transition-colors shadow-2xs flex items-center gap-1.5 cursor-pointer"
          >
            <UserPlus className="w-4 h-4" />
            <span>+ Ajouter une Ressource</span>
          </button>
        </div>
      </div>

      {/* Member Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {project.members.map((member) => {
          const assignedTasks = project.tasks.filter((t) => t.assigneeId === member.id);
          const activeTasks = assignedTasks.filter((t) => t.status !== 'DONE');
          const completedTasks = assignedTasks.filter((t) => t.status === 'DONE');
          
          const totalEstimatedHours = assignedTasks.reduce((sum, t) => sum + (Number(t.estimatedHours) || 0), 0);
          const totalActualHours = assignedTasks.reduce((sum, t) => sum + (Number(t.actualHours) || 0), 0);
          
          // Monthly capacity = weekly * 4
          const monthlyCapacity = (member.maxWeeklyHours || 35) * 4;
          const utilizationRate = Math.round((totalEstimatedHours / (monthlyCapacity || 1)) * 100);
          const totalCostLogged = totalActualHours * (member.hourlyRate || 85);

          return (
            <div
              key={member.id}
              className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs flex flex-col justify-between space-y-4"
            >
              <div>
                {/* Top Info */}
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div
                      className="w-10 h-10 rounded-xl flex items-center justify-center text-white text-base font-black shadow-xs"
                      style={{ backgroundColor: member.color || '#4F46E5' }}
                    >
                      {member.name.charAt(0)}
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-slate-900 leading-snug">
                        {member.name}
                      </h3>
                      <span className="text-xs text-slate-500 font-medium block">
                        {member.role}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => handleOpenEdit(member)}
                      className="p-1 text-slate-400 hover:text-indigo-600 rounded"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => handleDeleteMember(member.id)}
                      className="p-1 text-slate-400 hover:text-rose-600 rounded"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Rates and Capacity */}
                <div className="grid grid-cols-2 gap-2 mt-4 pt-3 border-t border-slate-100 text-xs">
                  <div className="bg-slate-50 p-2 rounded-lg">
                    <span className="text-[10px] text-slate-500 block">Taux Journalier/Horaire</span>
                    <strong className="text-slate-900 font-bold">{member.hourlyRate} €/h</strong>
                  </div>
                  <div className="bg-slate-50 p-2 rounded-lg">
                    <span className="text-[10px] text-slate-500 block">Capacité Mensuelle</span>
                    <strong className="text-slate-900 font-bold">{monthlyCapacity}h</strong>
                  </div>
                </div>

                {/* Utilization Progress */}
                <div className="mt-4">
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="text-slate-600 font-medium">Taux d'Allocation :</span>
                    <strong className={utilizationRate > 100 ? 'text-rose-600 font-extrabold' : 'text-slate-900'}>
                      {utilizationRate}% ({totalEstimatedHours}h)
                    </strong>
                  </div>
                  <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${
                        utilizationRate > 100 
                          ? 'bg-rose-500' 
                          : utilizationRate >= 80 
                          ? 'bg-emerald-500' 
                          : 'bg-indigo-500'
                      }`}
                      style={{ width: `${Math.min(100, utilizationRate)}%` }}
                    />
                  </div>
                  {utilizationRate > 100 && (
                    <span className="text-[10px] text-rose-600 font-bold flex items-center gap-1 mt-1">
                      <AlertTriangle className="w-3 h-3" /> Risque de surcharge / sur-allocation !
                    </span>
                  )}
                </div>

                {/* Assigned Tasks Summary */}
                <div className="mt-4 pt-3 border-t border-slate-100">
                  <span className="text-[11px] font-bold text-slate-700 uppercase tracking-wider block mb-2">
                    Tâches Assignées ({assignedTasks.length})
                  </span>
                  <div className="space-y-1.5 max-h-32 overflow-y-auto">
                    {assignedTasks.length === 0 ? (
                      <span className="text-xs text-slate-400 italic">Aucune tâche assignée</span>
                    ) : (
                      assignedTasks.map((t) => (
                        <div
                          key={t.id}
                          onClick={() => onOpenTaskModal(t.id)}
                          className="p-1.5 bg-slate-50 rounded-lg hover:bg-indigo-50 transition-colors text-xs flex items-center justify-between cursor-pointer"
                        >
                          <span className={`truncate max-w-[170px] ${t.status === 'DONE' ? 'line-through text-slate-400' : 'text-slate-800'}`}>
                            {t.title}
                          </span>
                          <span className="text-[10px] font-bold text-slate-500">
                            {t.actualHours || 0}/{t.estimatedHours}h
                          </span>
                        </div>
                      ))
                    )}
                  </div>
                </div>

              </div>

              {/* Bottom Cost Footer */}
              <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
                <span className="text-slate-500">Coût réel engagé :</span>
                <strong className="text-slate-900 font-bold text-sm">
                  {formatCurrency(totalCostLogged, project.currency)}
                </strong>
              </div>

            </div>
          );
        })}
      </div>

      {/* Add / Edit Member Modal */}
      {showAddMember && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 max-w-md w-full shadow-2xl border border-slate-200">
            <h3 className="text-base font-bold text-slate-900 mb-4">
              {editingMember ? 'Modifier le Collaborateur' : 'Ajouter un Membre à l’Équipe'}
            </h3>

            <form onSubmit={handleSaveMember} className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Nom complet *</label>
                <input
                  type="text"
                  required
                  placeholder="Ex: Sophie Valette"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full text-xs p-2 bg-slate-50 border border-slate-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Rôle / Spécialité</label>
                <input
                  type="text"
                  placeholder="Ex: Architecte Cloud / Scrum Master"
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                  className="w-full text-xs p-2 bg-slate-50 border border-slate-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Email professionnel</label>
                <input
                  type="email"
                  placeholder="nom@entreprise.fr"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full text-xs p-2 bg-slate-50 border border-slate-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Taux Horaire (€/h)</label>
                  <input
                    type="number"
                    min="1"
                    value={hourlyRate}
                    onChange={(e) => setHourlyRate(Number(e.target.value))}
                    className="w-full text-xs p-2 bg-slate-50 border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Capacité hebdo (h/sem)</label>
                  <input
                    type="number"
                    min="1"
                    max="60"
                    value={maxWeeklyHours}
                    onChange={(e) => setMaxWeeklyHours(Number(e.target.value))}
                    className="w-full text-xs p-2 bg-slate-50 border border-slate-300 rounded-lg"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Couleur d'identification</label>
                <div className="flex items-center gap-2">
                  {colorPresets.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setColor(c)}
                      className={`w-6 h-6 rounded-full transition-transform ${color === c ? 'scale-125 ring-2 ring-indigo-500 ring-offset-2' : ''}`}
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowAddMember(false)}
                  className="px-3.5 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-xs font-bold bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
                >
                  Enregistrer
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
};
