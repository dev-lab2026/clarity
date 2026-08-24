import React, { useState, useEffect } from 'react';
import { 
  Project, 
  Task, 
  TaskStatus, 
  PriorityLevel, 
  Subtask 
} from '../types';
import { 
  X, 
  Plus, 
  Trash2, 
  CheckSquare, 
  Calendar, 
  Clock, 
  Tag, 
  User, 
  Target 
} from 'lucide-react';

interface AddEditTaskModalProps {
  project: Project;
  taskId?: string | null;
  onClose: () => void;
  onSaveTask: (task: Task) => void;
  onDeleteTask?: (taskId: string) => void;
}

export const AddEditTaskModal: React.FC<AddEditTaskModalProps> = ({
  project,
  taskId,
  onClose,
  onSaveTask,
  onDeleteTask,
}) => {
  const existingTask = taskId ? project.tasks.find((t) => t.id === taskId) : null;

  const [title, setTitle] = useState(existingTask?.title || '');
  const [description, setDescription] = useState(existingTask?.description || '');
  const [status, setStatus] = useState<TaskStatus>(existingTask?.status || 'TODO');
  const [priority, setPriority] = useState<PriorityLevel>(existingTask?.priority || 'MEDIUM');
  const [assigneeId, setAssigneeId] = useState<string>(existingTask?.assigneeId || '');
  const [milestoneId, setMilestoneId] = useState<string>(existingTask?.milestoneId || '');
  const [startDate, setStartDate] = useState<string>(
    existingTask?.startDate || new Date().toISOString().split('T')[0]
  );
  const [dueDate, setDueDate] = useState<string>(
    existingTask?.dueDate || new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString().split('T')[0]
  );
  const [estimatedHours, setEstimatedHours] = useState<number>(existingTask?.estimatedHours || 16);
  const [actualHours, setActualHours] = useState<number>(existingTask?.actualHours || 0);
  const [completionPercent, setCompletionPercent] = useState<number>(
    existingTask?.completionPercent || (existingTask?.status === 'DONE' ? 100 : 0)
  );
  const [category, setCategory] = useState<string>(existingTask?.category || 'Développement');
  const [tagsInput, setTagsInput] = useState<string>(existingTask?.tags?.join(', ') || '');
  const [subtasks, setSubtasks] = useState<Subtask[]>(existingTask?.subtasks || []);
  const [newSubtaskTitle, setNewSubtaskTitle] = useState('');

  const handleAddSubtask = () => {
    if (!newSubtaskTitle.trim()) return;
    setSubtasks([...subtasks, { id: `st-${Date.now()}`, title: newSubtaskTitle.trim(), completed: false }]);
    setNewSubtaskTitle('');
  };

  const handleToggleSubtask = (id: string) => {
    setSubtasks(
      subtasks.map((st) => (st.id === id ? { ...st, completed: !st.completed } : st))
    );
  };

  const handleDeleteSubtask = (id: string) => {
    setSubtasks(subtasks.filter((st) => st.id !== id));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    const tags = tagsInput
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);

    const taskData: Task = {
      id: existingTask?.id || `task-${Date.now()}`,
      projectId: project.id,
      title: title.trim(),
      description: description.trim(),
      status,
      priority,
      assigneeId: assigneeId || undefined,
      milestoneId: milestoneId || undefined,
      startDate,
      dueDate,
      estimatedHours: Number(estimatedHours) || 0,
      actualHours: Number(actualHours) || 0,
      completionPercent: status === 'DONE' ? 100 : Number(completionPercent) || 0,
      category: category.trim() || undefined,
      tags,
      subtasks,
    };

    onSaveTask(taskData);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl max-w-2xl w-full shadow-2xl border border-slate-200 flex flex-col max-h-[90vh] overflow-hidden">
        
        {/* Header */}
        <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50">
          <div>
            <h2 className="text-base font-bold text-slate-900">
              {existingTask ? 'Modifier la Tâche' : 'Créer une Nouvelle Tâche'}
            </h2>
            <p className="text-xs text-slate-500">
              Projet : <strong>{project.name}</strong>
            </p>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 overflow-y-auto flex-1 space-y-4">
          
          {/* Title */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              Intitulé de la tâche *
            </label>
            <input
              type="text"
              required
              placeholder="Ex: Conception de la base de données PostgreSQL"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full text-xs p-2.5 bg-slate-50 border border-slate-300 rounded-xl focus:ring-indigo-500 focus:border-indigo-500 font-semibold text-slate-900"
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              Description & Livrable attendu
            </label>
            <textarea
              rows={2}
              placeholder="Détails, critères d'acceptation, spécifications..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full text-xs p-2 bg-slate-50 border border-slate-300 rounded-xl focus:ring-indigo-500 focus:border-indigo-500"
            />
          </div>

          {/* Status & Priority */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Statut</label>
              <select
                value={status}
                onChange={(e) => {
                  const s = e.target.value as TaskStatus;
                  setStatus(s);
                  if (s === 'DONE') setCompletionPercent(100);
                }}
                className="w-full text-xs p-2 bg-slate-50 border border-slate-300 rounded-xl font-semibold"
              >
                <option value="TODO">À faire</option>
                <option value="IN_PROGRESS">En cours</option>
                <option value="REVIEW">En revue / Validation</option>
                <option value="BLOCKED">Bloqué</option>
                <option value="DONE">Terminé</option>
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
                <option value="CRITICAL">Critique</option>
              </select>
            </div>
          </div>

          {/* Assignee & Milestone */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Responsable</label>
              <select
                value={assigneeId}
                onChange={(e) => setAssigneeId(e.target.value)}
                className="w-full text-xs p-2 bg-slate-50 border border-slate-300 rounded-xl font-medium"
              >
                <option value="">Non assigné</option>
                {project.members.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name} ({m.role})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Jalon associé (WBS)</label>
              <select
                value={milestoneId}
                onChange={(e) => setMilestoneId(e.target.value)}
                className="w-full text-xs p-2 bg-slate-50 border border-slate-300 rounded-xl font-medium"
              >
                <option value="">Hors jalon</option>
                {project.milestones.map((ms) => (
                  <option key={ms.id} value={ms.id}>
                    {ms.title}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Dates */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Date de début</label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full text-xs p-2 bg-slate-50 border border-slate-300 rounded-xl"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Date d’échéance</label>
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="w-full text-xs p-2 bg-slate-50 border border-slate-300 rounded-xl"
              />
            </div>
          </div>

          {/* Hours & Completion % */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Heures Estimées</label>
              <input
                type="number"
                min="0"
                value={estimatedHours}
                onChange={(e) => setEstimatedHours(Number(e.target.value))}
                className="w-full text-xs p-2 bg-slate-50 border border-slate-300 rounded-xl"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Heures Passées</label>
              <input
                type="number"
                min="0"
                value={actualHours}
                onChange={(e) => setActualHours(Number(e.target.value))}
                className="w-full text-xs p-2 bg-slate-50 border border-slate-300 rounded-xl"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Avancement (%)</label>
              <input
                type="number"
                min="0"
                max="100"
                value={completionPercent}
                onChange={(e) => setCompletionPercent(Number(e.target.value))}
                className="w-full text-xs p-2 bg-slate-50 border border-slate-300 rounded-xl"
              />
            </div>
          </div>

          {/* Category & Tags */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Catégorie</label>
              <input
                type="text"
                placeholder="Cadrage, Dév, Recette..."
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full text-xs p-2 bg-slate-50 border border-slate-300 rounded-xl"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Tags (séparés par virgule)</label>
              <input
                type="text"
                placeholder="Frontend, API, Urgent..."
                value={tagsInput}
                onChange={(e) => setTagsInput(e.target.value)}
                className="w-full text-xs p-2 bg-slate-50 border border-slate-300 rounded-xl"
              />
            </div>
          </div>

          {/* Subtasks Checklist */}
          <div className="pt-2 border-t border-slate-100">
            <label className="block text-xs font-bold text-slate-700 mb-2">
              Sous-tâches & Checklist ({subtasks.filter((s) => s.completed).length}/{subtasks.length})
            </label>

            <div className="flex gap-2 mb-2">
              <input
                type="text"
                placeholder="Ajouter un sous-élément..."
                value={newSubtaskTitle}
                onChange={(e) => setNewSubtaskTitle(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAddSubtask();
                  }
                }}
                className="flex-1 text-xs p-2 bg-slate-50 border border-slate-300 rounded-xl"
              />
              <button
                type="button"
                onClick={handleAddSubtask}
                className="px-3 py-2 bg-slate-900 text-white rounded-xl text-xs font-semibold"
              >
                +
              </button>
            </div>

            <div className="space-y-1.5 max-h-32 overflow-y-auto">
              {subtasks.map((st) => (
                <div key={st.id} className="flex items-center justify-between p-1.5 bg-slate-50 rounded-lg text-xs">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={st.completed}
                      onChange={() => handleToggleSubtask(st.id)}
                      className="rounded text-indigo-600 focus:ring-indigo-500"
                    />
                    <span className={st.completed ? 'line-through text-slate-400' : 'text-slate-800'}>
                      {st.title}
                    </span>
                  </label>
                  <button
                    type="button"
                    onClick={() => handleDeleteSubtask(st.id)}
                    className="text-slate-400 hover:text-rose-600 p-1"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Footer Submit */}
          <div className="flex items-center justify-between pt-4 border-t border-slate-100">
            {existingTask && onDeleteTask ? (
              <button
                type="button"
                onClick={() => {
                  if (confirm('Supprimer cette tâche ?')) {
                    onDeleteTask(existingTask.id);
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
                {existingTask ? 'Enregistrer les modifications' : 'Créer la tâche'}
              </button>
            </div>
          </div>

        </form>

      </div>
    </div>
  );
};
