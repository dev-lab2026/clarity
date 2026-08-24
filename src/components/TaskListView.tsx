import React, { useState } from 'react';
import { 
  Project, 
  Task, 
  TaskStatus, 
  PriorityLevel 
} from '../types';
import { formatDateFR, formatCurrency } from '../utils/pmCalculations';
import { 
  Search, 
  Filter, 
  Download, 
  Plus, 
  CheckCircle2, 
  Clock, 
  AlertCircle, 
  Tag, 
  Trash2, 
  Edit3,
  Layers,
  ArrowUpDown
} from 'lucide-react';

interface TaskListViewProps {
  project: Project;
  onOpenTaskModal: (taskId?: string) => void;
  onDeleteTask: (taskId: string) => void;
  onUpdateTask: (task: Task) => void;
}

export const TaskListView: React.FC<TaskListViewProps> = ({
  project,
  onOpenTaskModal,
  onDeleteTask,
  onUpdateTask,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [priorityFilter, setPriorityFilter] = useState<string>('ALL');
  const [groupBy, setGroupBy] = useState<'NONE' | 'MILESTONE' | 'CATEGORY' | 'ASSIGNEE'>('MILESTONE');
  const [selectedTasks, setSelectedTasks] = useState<string[]>([]);

  // Filter tasks
  const filteredTasks = project.tasks.filter((t) => {
    const matchesSearch = 
      t.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (t.category && t.category.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (t.tags && t.tags.some((tag) => tag.toLowerCase().includes(searchTerm.toLowerCase())));

    const matchesStatus = statusFilter === 'ALL' || t.status === statusFilter;
    const matchesPriority = priorityFilter === 'ALL' || t.priority === priorityFilter;

    return matchesSearch && matchesStatus && matchesPriority;
  });

  // Export tasks to CSV
  const handleExportCSV = () => {
    const headers = ['ID', 'Titre', 'Statut', 'Priorité', 'Catégorie', 'Responsable', 'Jalon', 'Date Début', 'Date Fin', 'Heures Estimées', 'Heures Réelles', 'Avancement (%)'];
    const rows = filteredTasks.map((t) => {
      const assignee = project.members.find((m) => m.id === t.assigneeId)?.name || 'Non assigné';
      const milestone = project.milestones.find((ms) => ms.id === t.milestoneId)?.title || 'Sans jalon';
      return [
        t.id,
        `"${t.title.replace(/"/g, '""')}"`,
        t.status,
        t.priority,
        t.category || '',
        `"${assignee}"`,
        `"${milestone}"`,
        t.startDate || '',
        t.dueDate || '',
        t.estimatedHours || 0,
        t.actualHours || 0,
        t.completionPercent || 0,
      ].join(',');
    });

    const csvContent = 'data:text/csv;charset=utf-8,\uFEFF' + [headers.join(','), ...rows].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `WBS_Taches_${project.code}_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const getPriorityBadge = (p: PriorityLevel) => {
    switch (p) {
      case 'CRITICAL':
        return <span className="px-2 py-0.5 rounded text-[10px] font-extrabold bg-rose-100 text-rose-800">Critique</span>;
      case 'HIGH':
        return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-orange-100 text-orange-800">Haute</span>;
      case 'MEDIUM':
        return <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-amber-100 text-amber-800">Moyenne</span>;
      case 'LOW':
        return <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-100 text-slate-600">Basse</span>;
    }
  };

  const getStatusBadge = (status: TaskStatus) => {
    switch (status) {
      case 'DONE':
        return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">Terminé</span>;
      case 'IN_PROGRESS':
        return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 text-blue-800">En cours</span>;
      case 'REVIEW':
        return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800">En revue</span>;
      case 'BLOCKED':
        return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-800">Bloqué</span>;
      case 'TODO':
        return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-700">À faire</span>;
    }
  };

  const todayStr = new Date().toISOString().split('T')[0];

  // Group tasks
  const groupedTasks: { [key: string]: Task[] } = {};
  if (groupBy === 'NONE') {
    groupedTasks['Toutes les tâches'] = filteredTasks;
  } else if (groupBy === 'MILESTONE') {
    project.milestones.forEach((ms) => {
      groupedTasks[ms.title] = filteredTasks.filter((t) => t.milestoneId === ms.id);
    });
    const orphans = filteredTasks.filter((t) => !t.milestoneId);
    if (orphans.length > 0) groupedTasks['Hors Jalons'] = orphans;
  } else if (groupBy === 'CATEGORY') {
    filteredTasks.forEach((t) => {
      const cat = t.category || 'Général';
      if (!groupedTasks[cat]) groupedTasks[cat] = [];
      groupedTasks[cat].push(t);
    });
  } else if (groupBy === 'ASSIGNEE') {
    project.members.forEach((m) => {
      groupedTasks[m.name] = filteredTasks.filter((t) => t.assigneeId === m.id);
    });
    const unassigned = filteredTasks.filter((t) => !t.assigneeId);
    if (unassigned.length > 0) groupedTasks['Non assigné'] = unassigned;
  }

  return (
    <div className="space-y-4">
      
      {/* Controls & Export Header */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex flex-col md:flex-row items-center justify-between gap-3">
        
        {/* Search */}
        <div className="relative w-full md:w-64">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            placeholder="Rechercher par libellé, tag..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500"
          />
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
          
          {/* Group By */}
          <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-600">
            <Layers className="w-3.5 h-3.5 text-slate-500" />
            <span>Grouper par :</span>
            <select
              value={groupBy}
              onChange={(e: any) => setGroupBy(e.target.value)}
              className="bg-slate-50 border border-slate-300 rounded-lg px-2 py-1 text-slate-800 font-medium"
            >
              <option value="MILESTONE">Jalons (WBS)</option>
              <option value="CATEGORY">Catégorie</option>
              <option value="ASSIGNEE">Collaborateur</option>
              <option value="NONE">Aucun</option>
            </select>
          </div>

          {/* Status filter */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="text-xs bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-1 text-slate-700 font-medium"
          >
            <option value="ALL">Tous les statuts</option>
            <option value="TODO">À faire</option>
            <option value="IN_PROGRESS">En cours</option>
            <option value="REVIEW">En revue</option>
            <option value="DONE">Terminé</option>
          </select>

          {/* Export CSV */}
          <button
            onClick={handleExportCSV}
            className="px-3 py-1 text-xs font-semibold bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 rounded-lg flex items-center gap-1.5 cursor-pointer shadow-2xs"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export CSV</span>
          </button>

          {/* Add Task */}
          <button
            onClick={() => onOpenTaskModal()}
            className="px-3 py-1 text-xs font-bold bg-indigo-600 text-white hover:bg-indigo-700 rounded-lg flex items-center gap-1.5 cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>+ Nouvelle Tâche</span>
          </button>

        </div>
      </div>

      {/* WBS Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50/80 border-b border-slate-200 text-slate-600 font-bold uppercase tracking-wider text-[11px]">
                <th className="p-3 w-10 text-center">#</th>
                <th className="p-3 min-w-[220px]">Intitulé de la tâche</th>
                <th className="p-3">Statut</th>
                <th className="p-3">Priorité</th>
                <th className="p-3">Responsable</th>
                <th className="p-3">Échéance</th>
                <th className="p-3 text-right">Estimé / Réel</th>
                <th className="p-3 w-32">Avancement</th>
                <th className="p-3 text-right">Actions</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-100">
              {Object.keys(groupedTasks).map((groupTitle) => {
                const tasksInGroup = groupedTasks[groupTitle];
                if (tasksInGroup.length === 0) return null;

                return (
                  <React.Fragment key={groupTitle}>
                    {groupBy !== 'NONE' && (
                      <tr className="bg-slate-100/70 font-bold text-slate-800">
                        <td colSpan={9} className="py-2.5 px-4 text-xs">
                          <span className="flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-indigo-600" />
                            <span>{groupTitle}</span>
                            <span className="text-[11px] font-normal text-slate-500">
                              ({tasksInGroup.length} tâches)
                            </span>
                          </span>
                        </td>
                      </tr>
                    )}

                    {tasksInGroup.map((task, idx) => {
                      const assignee = project.members.find((m) => m.id === task.assigneeId);
                      const isOverdue = task.status !== 'DONE' && task.dueDate && task.dueDate < todayStr;
                      const isDone = task.status === 'DONE';

                      return (
                        <tr
                          key={task.id}
                          className={`hover:bg-slate-50/80 transition-colors ${
                            isOverdue ? 'bg-rose-50/20' : ''
                          }`}
                        >
                          <td className="p-3 text-center text-slate-400 font-mono text-[10px]">
                            {idx + 1}
                          </td>

                          {/* Title & Tags */}
                          <td className="p-3">
                            <div className="font-semibold text-slate-900 flex items-center gap-2">
                              <span className={isDone ? 'line-through text-slate-400' : ''}>
                                {task.title}
                              </span>
                            </div>
                            {task.tags && task.tags.length > 0 && (
                              <div className="flex items-center gap-1 mt-1">
                                {task.tags.map((tg) => (
                                  <span key={tg} className="text-[9px] bg-slate-100 text-slate-600 px-1.5 py-0.2 rounded">
                                    #{tg}
                                  </span>
                                ))}
                              </div>
                            )}
                          </td>

                          {/* Status */}
                          <td className="p-3">
                            {getStatusBadge(task.status)}
                          </td>

                          {/* Priority */}
                          <td className="p-3">
                            {getPriorityBadge(task.priority)}
                          </td>

                          {/* Assignee */}
                          <td className="p-3">
                            {assignee ? (
                              <div className="flex items-center gap-1.5">
                                <div
                                  className="w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold text-white shadow-2xs"
                                  style={{ backgroundColor: assignee.color || '#4F46E5' }}
                                >
                                  {assignee.name.charAt(0)}
                                </div>
                                <span className="text-slate-700 font-medium">{assignee.name.split(' ')[0]}</span>
                              </div>
                            ) : (
                              <span className="text-slate-400 italic">Non assigné</span>
                            )}
                          </td>

                          {/* Due date */}
                          <td className="p-3">
                            <span className={isOverdue ? 'text-rose-600 font-bold' : 'text-slate-600'}>
                              {formatDateFR(task.dueDate)}
                            </span>
                            {isOverdue && (
                              <span className="block text-[9px] font-extrabold text-rose-600">En retard</span>
                            )}
                          </td>

                          {/* Hours */}
                          <td className="p-3 text-right text-slate-700 font-medium">
                            <span className="font-bold">{task.actualHours || 0}</span> / {task.estimatedHours || 0}h
                          </td>

                          {/* Progress Slider / Bar */}
                          <td className="p-3">
                            <div className="flex items-center gap-2">
                              <div className="flex-1 bg-slate-100 h-2 rounded-full overflow-hidden">
                                <div
                                  className={`h-full rounded-full transition-all ${
                                    isDone ? 'bg-emerald-500' : 'bg-indigo-600'
                                  }`}
                                  style={{ width: `${isDone ? 100 : task.completionPercent || 0}%` }}
                                />
                              </div>
                              <span className="text-[11px] font-bold text-slate-700 w-8 text-right">
                                {isDone ? 100 : task.completionPercent || 0}%
                              </span>
                            </div>
                          </td>

                          {/* Actions */}
                          <td className="p-3 text-right">
                            <div className="flex items-center justify-end gap-1">
                              <button
                                onClick={() => onOpenTaskModal(task.id)}
                                className="p-1.5 text-slate-500 hover:text-indigo-600 hover:bg-slate-100 rounded-md transition-colors"
                                title="Modifier la tâche"
                              >
                                <Edit3 className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => onDeleteTask(task.id)}
                                className="p-1.5 text-slate-500 hover:text-rose-600 hover:bg-rose-50 rounded-md transition-colors"
                                title="Supprimer la tâche"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
};
