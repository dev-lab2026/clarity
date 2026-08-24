import React, { useState } from 'react';
import { 
  Plus, 
  Search, 
  Filter, 
  Calendar, 
  Clock, 
  CheckSquare, 
  AlertCircle, 
  MoreVertical, 
  ArrowRight, 
  ArrowLeft, 
  User,
  Tag
} from 'lucide-react';
import { 
  Project, 
  Task, 
  TaskStatus, 
  PriorityLevel 
} from '../types';
import { formatDateFR } from '../utils/pmCalculations';

interface KanbanBoardProps {
  project: Project;
  onOpenTaskModal: (taskId?: string) => void;
  onUpdateTaskStatus: (taskId: string, newStatus: TaskStatus) => void;
  onDeleteTask: (taskId: string) => void;
  onQuickAddTask: (status: TaskStatus, title: string) => void;
}

export const KanbanBoard: React.FC<KanbanBoardProps> = ({
  project,
  onOpenTaskModal,
  onUpdateTaskStatus,
  onDeleteTask,
  onQuickAddTask,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterPriority, setFilterPriority] = useState<string>('ALL');
  const [filterAssignee, setFilterAssignee] = useState<string>('ALL');
  const [filterMilestone, setFilterMilestone] = useState<string>('ALL');
  const [quickInputColumn, setQuickInputColumn] = useState<TaskStatus | null>(null);
  const [quickTitle, setQuickTitle] = useState('');

  const columns: { id: TaskStatus; title: string; color: string; badgeBg: string }[] = [
    { id: 'TODO', title: 'À faire', color: 'border-slate-300', badgeBg: 'bg-slate-100 text-slate-700' },
    { id: 'IN_PROGRESS', title: 'En cours', color: 'border-blue-500', badgeBg: 'bg-blue-100 text-blue-800' },
    { id: 'REVIEW', title: 'En revue / Validation', color: 'border-amber-500', badgeBg: 'bg-amber-100 text-amber-800' },
    { id: 'DONE', title: 'Terminé', color: 'border-emerald-500', badgeBg: 'bg-emerald-100 text-emerald-800' },
  ];

  // Filtering
  const filteredTasks = project.tasks.filter((task) => {
    const matchesSearch = 
      task.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (task.category && task.category.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (task.tags && task.tags.some((tag) => tag.toLowerCase().includes(searchTerm.toLowerCase())));

    const matchesPriority = filterPriority === 'ALL' || task.priority === filterPriority;
    const matchesAssignee = filterAssignee === 'ALL' || task.assigneeId === filterAssignee;
    const matchesMilestone = filterMilestone === 'ALL' || task.milestoneId === filterMilestone;

    return matchesSearch && matchesPriority && matchesAssignee && matchesMilestone;
  });

  const getPriorityBadge = (priority: PriorityLevel) => {
    switch (priority) {
      case 'CRITICAL':
        return <span className="px-2 py-0.5 rounded text-[10px] font-extrabold bg-rose-100 text-rose-800 border border-rose-200">Critique</span>;
      case 'HIGH':
        return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-orange-100 text-orange-800 border border-orange-200">Haute</span>;
      case 'MEDIUM':
        return <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-amber-100 text-amber-800 border border-amber-200">Moyenne</span>;
      case 'LOW':
        return <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-100 text-slate-600 border border-slate-200">Basse</span>;
    }
  };

  const handleQuickSubmit = (status: TaskStatus) => {
    if (!quickTitle.trim()) return;
    onQuickAddTask(status, quickTitle.trim());
    setQuickTitle('');
    setQuickInputColumn(null);
  };

  const todayStr = new Date().toISOString().split('T')[0];

  return (
    <div className="space-y-4">
      
      {/* Search & Filter Bar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex flex-col md:flex-row items-center justify-between gap-3">
        
        {/* Search input */}
        <div className="relative w-full md:w-72">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            placeholder="Rechercher une tâche, tag..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500 text-slate-900"
          />
        </div>

        {/* Filter Dropdowns */}
        <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
          {/* Priority filter */}
          <select
            value={filterPriority}
            onChange={(e) => setFilterPriority(e.target.value)}
            className="text-xs bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-1.5 text-slate-700 font-medium"
          >
            <option value="ALL">Toutes les priorités</option>
            <option value="CRITICAL">Critique</option>
            <option value="HIGH">Haute</option>
            <option value="MEDIUM">Moyenne</option>
            <option value="LOW">Basse</option>
          </select>

          {/* Assignee filter */}
          <select
            value={filterAssignee}
            onChange={(e) => setFilterAssignee(e.target.value)}
            className="text-xs bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-1.5 text-slate-700 font-medium"
          >
            <option value="ALL">Tous les membres</option>
            {project.members.map((m) => (
              <option key={m.id} value={m.id}>{m.name}</option>
            ))}
          </select>

          {/* Milestone filter */}
          <select
            value={filterMilestone}
            onChange={(e) => setFilterMilestone(e.target.value)}
            className="text-xs bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-1.5 text-slate-700 font-medium"
          >
            <option value="ALL">Tous les jalons</option>
            {project.milestones.map((ms) => (
              <option key={ms.id} value={ms.id}>{ms.title}</option>
            ))}
          </select>

          {/* Reset Filters */}
          {(searchTerm || filterPriority !== 'ALL' || filterAssignee !== 'ALL' || filterMilestone !== 'ALL') && (
            <button
              onClick={() => {
                setSearchTerm('');
                setFilterPriority('ALL');
                setFilterAssignee('ALL');
                setFilterMilestone('ALL');
              }}
              className="text-xs text-indigo-600 hover:text-indigo-800 font-semibold px-2 py-1"
            >
              Réinitialiser
            </button>
          )}
        </div>
      </div>

      {/* Kanban Columns Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 items-start">
        {columns.map((col, colIdx) => {
          const colTasks = filteredTasks.filter((t) => {
            if (col.id === 'REVIEW') {
              return t.status === 'REVIEW' || t.status === 'BLOCKED';
            }
            return t.status === col.id;
          });

          return (
            <div
              key={col.id}
              className="bg-slate-100/80 rounded-2xl p-3 border border-slate-200 flex flex-col min-h-[500px]"
            >
              {/* Column Header */}
              <div className="flex items-center justify-between pb-3 mb-3 border-b border-slate-200">
                <div className="flex items-center gap-2">
                  <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                    {col.title}
                  </h3>
                  <span className={`px-2 py-0.5 rounded-full text-xs font-extrabold ${col.badgeBg}`}>
                    {colTasks.length}
                  </span>
                </div>

                <button
                  onClick={() => setQuickInputColumn(quickInputColumn === col.id ? null : col.id)}
                  className="p-1 text-slate-500 hover:text-indigo-600 hover:bg-white rounded-md transition-colors"
                  title="Ajout rapide de tâche"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>

              {/* Quick Add Form in Column */}
              {quickInputColumn === col.id && (
                <div className="mb-3 p-2.5 bg-white rounded-xl border border-indigo-200 shadow-xs">
                  <input
                    type="text"
                    placeholder="Nom de la nouvelle tâche..."
                    value={quickTitle}
                    onChange={(e) => setQuickTitle(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleQuickSubmit(col.id);
                      if (e.key === 'Escape') setQuickInputColumn(null);
                    }}
                    autoFocus
                    className="w-full text-xs p-2 bg-slate-50 border border-slate-200 rounded-lg focus:ring-indigo-500 focus:border-indigo-500 mb-2"
                  />
                  <div className="flex justify-end gap-1.5">
                    <button
                      onClick={() => setQuickInputColumn(null)}
                      className="px-2 py-1 text-[11px] text-slate-500 hover:bg-slate-100 rounded"
                    >
                      Annuler
                    </button>
                    <button
                      onClick={() => handleQuickSubmit(col.id)}
                      className="px-2.5 py-1 text-[11px] font-bold bg-indigo-600 text-white rounded hover:bg-indigo-700"
                    >
                      Ajouter
                    </button>
                  </div>
                </div>
              )}

              {/* Tasks List */}
              <div className="space-y-2.5 flex-1 overflow-y-auto">
                {colTasks.length === 0 ? (
                  <div className="text-center py-8 text-xs text-slate-400 font-medium">
                    Aucune tâche
                  </div>
                ) : (
                  colTasks.map((task) => {
                    const assignee = project.members.find((m) => m.id === task.assigneeId);
                    const milestone = project.milestones.find((ms) => ms.id === task.milestoneId);
                    const isOverdue = task.status !== 'DONE' && task.dueDate && task.dueDate < todayStr;
                    const subtasks = task.subtasks || [];
                    const completedSubtasks = subtasks.filter((s) => s.completed).length;

                    return (
                      <div
                        key={task.id}
                        onClick={() => onOpenTaskModal(task.id)}
                        className={`p-3.5 bg-white rounded-xl border transition-all shadow-2xs hover:shadow-xs cursor-pointer group ${
                          isOverdue ? 'border-rose-300 hover:border-rose-400' : 'border-slate-200 hover:border-indigo-300'
                        }`}
                      >
                        {/* Tags & Priority */}
                        <div className="flex items-center justify-between gap-1 mb-2">
                          <div className="flex items-center gap-1.5">
                            {getPriorityBadge(task.priority)}
                            {task.category && (
                              <span className="text-[10px] font-medium text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">
                                {task.category}
                              </span>
                            )}
                          </div>

                          {/* Move Buttons */}
                          <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity" onClick={(e) => e.stopPropagation()}>
                            {colIdx > 0 && (
                              <button
                                onClick={() => onUpdateTaskStatus(task.id, columns[colIdx - 1].id)}
                                className="p-1 hover:bg-slate-100 rounded text-slate-500 hover:text-indigo-600"
                                title={`Déplacer vers ${columns[colIdx - 1].title}`}
                              >
                                <ArrowLeft className="w-3.5 h-3.5" />
                              </button>
                            )}
                            {colIdx < columns.length - 1 && (
                              <button
                                onClick={() => onUpdateTaskStatus(task.id, columns[colIdx + 1].id)}
                                className="p-1 hover:bg-slate-100 rounded text-slate-500 hover:text-indigo-600"
                                title={`Déplacer vers ${columns[colIdx + 1].title}`}
                              >
                                <ArrowRight className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </div>

                        {/* Title */}
                        <h4 className="text-xs font-bold text-slate-900 leading-snug mb-2 group-hover:text-indigo-600 transition-colors">
                          {task.title}
                        </h4>

                        {/* Milestone Tag if present */}
                        {milestone && (
                          <div className="mb-2 text-[10px] font-semibold text-indigo-600 bg-indigo-50/70 px-2 py-0.5 rounded inline-block">
                            🎯 {milestone.title}
                          </div>
                        )}

                        {/* Subtasks Progress */}
                        {subtasks.length > 0 && (
                          <div className="mb-2">
                            <div className="flex items-center justify-between text-[10px] text-slate-500 mb-1">
                              <span className="flex items-center gap-1">
                                <CheckSquare className="w-3 h-3 text-slate-400" />
                                {completedSubtasks}/{subtasks.length} sous-tâches
                              </span>
                              <span>{Math.round((completedSubtasks / subtasks.length) * 100)}%</span>
                            </div>
                            <div className="w-full bg-slate-100 h-1 rounded-full overflow-hidden">
                              <div
                                className="bg-indigo-600 h-full rounded-full"
                                style={{ width: `${(completedSubtasks / subtasks.length) * 100}%` }}
                              />
                            </div>
                          </div>
                        )}

                        {/* Footer details: Assignee & Due Date & Hours */}
                        <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
                          
                          {/* Assignee Avatar */}
                          <div className="flex items-center gap-1.5">
                            {assignee ? (
                              <div 
                                className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold text-white shadow-2xs"
                                style={{ backgroundColor: assignee.color || '#4F46E5' }}
                                title={assignee.name}
                              >
                                {assignee.name.charAt(0)}
                              </div>
                            ) : (
                              <div className="w-5 h-5 rounded-full bg-slate-200 flex items-center justify-center text-slate-400" title="Non assigné">
                                <User className="w-3 h-3" />
                              </div>
                            )}
                            <span className="text-[10px] font-medium text-slate-700 truncate max-w-[80px]">
                              {assignee ? assignee.name.split(' ')[0] : 'Libre'}
                            </span>
                          </div>

                          {/* Due Date & Hours */}
                          <div className="flex items-center gap-2">
                            <span className="flex items-center gap-1" title="Heures passées / estimées">
                              <Clock className="w-3 h-3 text-slate-400" />
                              {task.actualHours}/{task.estimatedHours}h
                            </span>

                            {task.dueDate && (
                              <span 
                                className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                                  isOverdue 
                                    ? 'bg-rose-100 text-rose-800' 
                                    : 'bg-slate-100 text-slate-600'
                                }`}
                                title={isOverdue ? 'Tâche en retard !' : 'Date d’échéance'}
                              >
                                <Calendar className="w-3 h-3" />
                                {formatDateFR(task.dueDate)}
                              </span>
                            )}
                          </div>

                        </div>
                      </div>
                    );
                  })
                )}
              </div>

            </div>
          );
        })}
      </div>

    </div>
  );
};
