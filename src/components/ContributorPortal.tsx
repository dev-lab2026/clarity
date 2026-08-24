import React, { useState, useMemo } from 'react';
import { 
  Project, 
  Task, 
  TaskStatus, 
  MicrosoftUser 
} from '../types';
import { 
  CheckCircle2, 
  Clock, 
  Calendar, 
  AlertCircle, 
  Play, 
  CheckCheck, 
  ListTodo, 
  Layers, 
  ChevronRight, 
  Plus, 
  Filter, 
  Check, 
  Sparkles,
  UserCheck,
  TrendingUp,
  FolderKanban,
  ExternalLink
} from 'lucide-react';

interface ContributorPortalProps {
  projects: Project[];
  currentUser: MicrosoftUser;
  onUpdateTask: (task: Task) => void;
  onOpenTaskDetails?: (taskId: string) => void;
}

export const ContributorPortal: React.FC<ContributorPortalProps> = ({
  projects,
  currentUser,
  onUpdateTask,
  onOpenTaskDetails,
}) => {
  const [selectedProjectId, setSelectedProjectId] = useState<string>('ALL');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [editingHoursTaskId, setEditingHoursTaskId] = useState<string | null>(null);
  const [loggedHoursInput, setLoggedHoursInput] = useState<number>(0);
  const [progressInput, setProgressInput] = useState<number>(0);
  const [quickSearch, setQuickSearch] = useState('');

  // Collect all tasks across accessible projects
  const allTasks = useMemo(() => {
    const list: { task: Task; project: Project }[] = [];
    projects.forEach((proj) => {
      if (selectedProjectId === 'ALL' || proj.id === selectedProjectId) {
        proj.tasks.forEach((task) => {
          // If task matches current user name/email or assignee
          const isAssigned =
            task.assigneeId === currentUser.id ||
            task.assigneeId === currentUser.email ||
            Boolean(task.tags?.some(t => t.toLowerCase().includes(currentUser.displayName.toLowerCase())));
          if (isAssigned) list.push({ task, project: proj });
        });
      }
    });
    return list;
  }, [projects, selectedProjectId, currentUser]);

  // Filtered tasks
  const filteredTasks = useMemo(() => {
    return allTasks.filter(({ task }) => {
      if (statusFilter !== 'ALL' && task.status !== statusFilter) return false;
      if (quickSearch && !task.title.toLowerCase().includes(quickSearch.toLowerCase()) && !task.category?.toLowerCase().includes(quickSearch.toLowerCase())) {
        return false;
      }
      return true;
    });
  }, [allTasks, statusFilter, quickSearch]);

  // Stats calculation
  const stats = useMemo(() => {
    const total = allTasks.length;
    const todo = allTasks.filter(t => t.task.status === 'TODO').length;
    const inProgress = allTasks.filter(t => t.task.status === 'IN_PROGRESS').length;
    const review = allTasks.filter(t => t.task.status === 'REVIEW').length;
    const done = allTasks.filter(t => t.task.status === 'DONE').length;
    const totalLoggedHours = allTasks.reduce((acc, t) => acc + (t.task.actualHours || 0), 0);
    const totalEstimatedHours = allTasks.reduce((acc, t) => acc + (t.task.estimatedHours || 0), 0);
    
    return {
      total,
      todo,
      inProgress,
      review,
      done,
      totalLoggedHours,
      totalEstimatedHours,
      completionRate: total > 0 ? Math.round((done / total) * 100) : 0,
    };
  }, [allTasks]);

  const handleQuickStatusChange = (task: Task, newStatus: TaskStatus) => {
    const updated: Task = {
      ...task,
      status: newStatus,
      completionPercent: newStatus === 'DONE' ? 100 : task.completionPercent,
    };
    onUpdateTask(updated);
  };

  const handleSaveLoggedHours = (task: Task) => {
    const updated: Task = {
      ...task,
      actualHours: Number(loggedHoursInput),
      completionPercent: Number(progressInput),
      status: progressInput === 100 ? 'DONE' : progressInput > 0 ? 'IN_PROGRESS' : task.status,
    };
    onUpdateTask(updated);
    setEditingHoursTaskId(null);
  };

  const openLogHoursModal = (task: Task) => {
    setEditingHoursTaskId(task.id);
    setLoggedHoursInput(task.actualHours || 0);
    setProgressInput(task.completionPercent || 0);
  };

  return (
    <div className="space-y-6">
      {/* Contributor Header Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 rounded-3xl p-6 sm:p-8 text-white shadow-xl relative overflow-hidden">
        <div className="absolute top-0 right-0 -mt-8 -mr-8 w-64 h-64 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />
        
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="flex items-start sm:items-center gap-4">
            <div className="p-3 bg-gradient-to-br from-blue-600 to-indigo-600 rounded-2xl shadow-lg border border-indigo-400/30">
              <UserCheck className="w-8 h-8 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2.5 flex-wrap">
                <h1 className="text-xl sm:text-2xl font-black tracking-tight text-white">
                  Espace Personnel Collaborateur
                </h1>
                <span className="px-2.5 py-0.5 rounded-full bg-blue-500/20 text-blue-300 border border-blue-400/30 text-xs font-bold uppercase tracking-wider">
                  Rôle Contributeur
                </span>
              </div>
              <p className="text-sm text-slate-300 mt-1 max-w-2xl">
                Bienvenue <strong className="text-white">{currentUser.displayName}</strong>. Consultez vos tâches assignées, mettez à jour votre avancement et déclarez vos heures passées en temps réel.
              </p>
            </div>
          </div>

          {/* Project Filter Dropdown */}
          <div className="flex items-center gap-3">
            <div className="bg-slate-800/80 border border-slate-700 rounded-xl p-1.5 flex items-center gap-2">
              <span className="text-xs text-slate-400 pl-2">Projet :</span>
              <select
                value={selectedProjectId}
                onChange={(e) => setSelectedProjectId(e.target.value)}
                className="bg-slate-900 text-white text-xs font-bold rounded-lg px-2.5 py-1.5 border border-slate-700 focus:outline-none focus:border-indigo-500 cursor-pointer"
              >
                <option value="ALL">Tous les projets ({projects.length})</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    [{p.code}] {p.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* KPI Stats Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-bold uppercase tracking-wider">Tâches À Faire</span>
            <ListTodo className="w-4 h-4 text-slate-400" />
          </div>
          <div className="text-2xl font-black text-slate-900">{stats.todo}</div>
          <span className="text-[11px] text-slate-400">En attente de démarrage</span>
        </div>

        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between text-blue-600 mb-2">
            <span className="text-xs font-bold uppercase tracking-wider">En Cours</span>
            <Clock className="w-4 h-4 text-blue-500 animate-spin" />
          </div>
          <div className="text-2xl font-black text-blue-600">{stats.inProgress}</div>
          <span className="text-[11px] text-slate-400">Actuellement en production</span>
        </div>

        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between text-emerald-600 mb-2">
            <span className="text-xs font-bold uppercase tracking-wider">Terminées</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-500" />
          </div>
          <div className="text-2xl font-black text-emerald-600">{stats.done}</div>
          <span className="text-[11px] text-emerald-600 font-bold">{stats.completionRate}% complété</span>
        </div>

        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between text-indigo-600 mb-2">
            <span className="text-xs font-bold uppercase tracking-wider">Temps Réalisé</span>
            <TrendingUp className="w-4 h-4 text-indigo-500" />
          </div>
          <div className="text-2xl font-black text-indigo-700">{stats.totalLoggedHours}h</div>
          <span className="text-[11px] text-slate-400">sur {stats.totalEstimatedHours}h estimées</span>
        </div>
      </div>

      {/* Task Filter & Search Bar */}
      <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-xs flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <div className="relative flex-1 sm:w-64">
            <input
              type="text"
              placeholder="Rechercher une tâche..."
              value={quickSearch}
              onChange={(e) => setQuickSearch(e.target.value)}
              className="w-full pl-3.5 pr-8 py-1.5 text-xs bg-slate-50 border border-slate-300 rounded-xl text-slate-900 focus:outline-none focus:border-indigo-500"
            />
          </div>
        </div>

        <div className="flex items-center gap-1.5 overflow-x-auto w-full sm:w-auto pb-1 sm:pb-0 scrollbar-none">
          {[
            { id: 'ALL', label: 'Toutes' },
            { id: 'TODO', label: 'À faire' },
            { id: 'IN_PROGRESS', label: 'En cours' },
            { id: 'REVIEW', label: 'En revue' },
            { id: 'DONE', label: 'Terminées' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setStatusFilter(tab.id)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
                statusFilter === tab.id
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Kanban Board View for Contributor */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {(['TODO', 'IN_PROGRESS', 'REVIEW', 'DONE'] as TaskStatus[]).map((status) => {
          const colTasks = filteredTasks.filter(t => t.task.status === status);
          const colConfig = {
            TODO: { title: 'À Faire', bg: 'bg-slate-50', border: 'border-slate-200', badge: 'bg-slate-200 text-slate-700' },
            IN_PROGRESS: { title: 'En Cours', bg: 'bg-blue-50/50', border: 'border-blue-200', badge: 'bg-blue-100 text-blue-700' },
            REVIEW: { title: 'En Revue', bg: 'bg-amber-50/50', border: 'border-amber-200', badge: 'bg-amber-100 text-amber-700' },
            DONE: { title: 'Terminées', bg: 'bg-emerald-50/50', border: 'border-emerald-200', badge: 'bg-emerald-100 text-emerald-700' },
          }[status];

          return (
            <div key={status} className={`rounded-2xl p-4 border ${colConfig.border} ${colConfig.bg} flex flex-col min-h-[400px]`}>
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-bold text-slate-800">{colConfig.title}</span>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${colConfig.badge}`}>
                  {colTasks.length}
                </span>
              </div>

              <div className="space-y-3 flex-1 overflow-y-auto">
                {colTasks.map(({ task, project }) => (
                  <div 
                    key={task.id} 
                    className="bg-white rounded-xl p-3.5 border border-slate-200/80 shadow-2xs hover:shadow-md transition-all space-y-2.5"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[10px] font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-100 truncate">
                        {project.code}
                      </span>
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                        task.priority === 'CRITICAL' ? 'bg-red-100 text-red-700' :
                        task.priority === 'HIGH' ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-600'
                      }`}>
                        {task.priority}
                      </span>
                    </div>

                    <h4 className="text-xs font-bold text-slate-900 leading-snug">
                      {task.title}
                    </h4>

                    {task.description && (
                      <p className="text-[11px] text-slate-500 line-clamp-2">
                        {task.description}
                      </p>
                    )}

                    {/* Progress & Hours Bar */}
                    <div className="space-y-1">
                      <div className="flex justify-between text-[10px] text-slate-500 font-semibold">
                        <span>Avancement</span>
                        <span>{task.completionPercent}%</span>
                      </div>
                      <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                        <div 
                          className={`h-full rounded-full transition-all ${
                            task.completionPercent === 100 ? 'bg-emerald-500' : 'bg-indigo-600'
                          }`}
                          style={{ width: `${task.completionPercent}%` }}
                        />
                      </div>
                    </div>

                    <div className="flex items-center justify-between text-[11px] text-slate-500 pt-1 border-t border-slate-100">
                      <div className="flex items-center gap-1 font-mono text-[10px]">
                        <Clock className="w-3 h-3 text-slate-400" />
                        <span>{task.actualHours}h / {task.estimatedHours}h</span>
                      </div>

                      <button
                        onClick={() => openLogHoursModal(task)}
                        className="text-[11px] text-indigo-600 hover:text-indigo-800 font-bold hover:bg-indigo-50 px-2 py-1 rounded transition-colors cursor-pointer"
                      >
                        Saisir Temps
                      </button>
                    </div>

                    {/* Quick Move Buttons */}
                    <div className="flex items-center justify-between gap-1 pt-1">
                      {status !== 'TODO' && (
                        <button
                          onClick={() => handleQuickStatusChange(task, status === 'DONE' ? 'REVIEW' : status === 'REVIEW' ? 'IN_PROGRESS' : 'TODO')}
                          className="text-[10px] text-slate-400 hover:text-slate-700 px-1.5 py-0.5 rounded hover:bg-slate-100 cursor-pointer"
                        >
                          ← Reculer
                        </button>
                      )}
                      <div className="flex-1" />
                      {status !== 'DONE' && (
                        <button
                          onClick={() => handleQuickStatusChange(task, status === 'TODO' ? 'IN_PROGRESS' : status === 'IN_PROGRESS' ? 'REVIEW' : 'DONE')}
                          className="text-[10px] text-emerald-600 hover:text-emerald-800 font-bold px-2 py-0.5 bg-emerald-50 hover:bg-emerald-100 rounded transition-colors cursor-pointer"
                        >
                          Avancer →
                        </button>
                      )}
                    </div>
                  </div>
                ))}

                {colTasks.length === 0 && (
                  <div className="text-center py-8 text-slate-400 text-xs">
                    Aucune tâche dans cette colonne
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Log Hours & Progress Modal */}
      {editingHoursTaskId && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 max-w-md w-full shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-900">Saisie du Temps & Avancement</h3>
              <button 
                onClick={() => setEditingHoursTaskId(null)}
                className="text-slate-400 hover:text-slate-600 text-lg cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">
                  Heures réelles passées (h)
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.5"
                  value={loggedHoursInput}
                  onChange={(e) => setLoggedHoursInput(Number(e.target.value))}
                  className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-300 rounded-xl text-slate-900 focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <div className="flex justify-between text-xs font-semibold text-slate-700 mb-1">
                  <span>Pourcentage de complétion (%)</span>
                  <span className="text-indigo-600 font-bold">{progressInput}%</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="100"
                  step="5"
                  value={progressInput}
                  onChange={(e) => setProgressInput(Number(e.target.value))}
                  className="w-full accent-indigo-600 cursor-pointer"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
              <button
                onClick={() => setEditingHoursTaskId(null)}
                className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl cursor-pointer"
              >
                Annuler
              </button>
              <button
                onClick={() => {
                  const target = allTasks.find(t => t.task.id === editingHoursTaskId)?.task;
                  if (target) handleSaveLoggedHours(target);
                }}
                className="px-4 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-xs cursor-pointer"
              >
                Enregistrer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
