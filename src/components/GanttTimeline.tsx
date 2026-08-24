import React, { useState } from 'react';
import { 
  Project, 
  Task, 
  Milestone 
} from '../types';
import { formatDateFR } from '../utils/pmCalculations';
import { 
  Calendar, 
  Clock, 
  ChevronLeft, 
  ChevronRight, 
  Target, 
  Zap, 
  CheckCircle2, 
  AlertCircle,
  Plus
} from 'lucide-react';

interface GanttTimelineProps {
  project: Project;
  onOpenTaskModal: (taskId?: string) => void;
  onOpenMilestoneModal: (milestoneId?: string) => void;
}

export const GanttTimeline: React.FC<GanttTimelineProps> = ({
  project,
  onOpenTaskModal,
  onOpenMilestoneModal,
}) => {
  const [zoomLevel, setZoomLevel] = useState<'MONTHS' | 'WEEKS' | 'DAYS'>('WEEKS');
  const [highlightCriticalPath, setHighlightCriticalPath] = useState(false);

  // Compute Project Start & End boundaries
  const projectStartDate = new Date(project.startDate || '2026-01-01');
  const projectEndDate = new Date(project.endDate || '2026-12-31');
  
  // Total span in days
  const totalDays = Math.max(30, Math.round((projectEndDate.getTime() - projectStartDate.getTime()) / (24 * 3600 * 1000)));

  // Generate date timeline columns based on zoom level
  const timelineColumns = [];
  const startYear = projectStartDate.getFullYear();
  const startMonth = projectStartDate.getMonth();
  const endYear = projectEndDate.getFullYear();
  const endMonth = projectEndDate.getMonth();

  const totalMonths = (endYear - startYear) * 12 + (endMonth - startMonth) + 1;

  for (let m = 0; m <= totalMonths; m++) {
    const d = new Date(startYear, startMonth + m, 1);
    timelineColumns.push({
      date: d,
      label: d.toLocaleDateString('fr-FR', { month: 'short', year: '2-digit' }),
    });
  }

  // Calculate percentage offset and width for a date range
  const getBarPosition = (startDateStr?: string, dueDateStr?: string) => {
    if (!startDateStr || !dueDateStr) return { left: '0%', width: '10%' };

    const start = new Date(startDateStr).getTime();
    const end = new Date(dueDateStr).getTime();
    const projStart = projectStartDate.getTime();
    const projEnd = projectEndDate.getTime();
    const totalProjTime = projEnd - projStart;

    if (totalProjTime <= 0) return { left: '0%', width: '100%' };

    const leftPercent = Math.max(0, Math.min(100, ((start - projStart) / totalProjTime) * 100));
    const rightPercent = Math.max(0, Math.min(100, ((end - projStart) / totalProjTime) * 100));
    const widthPercent = Math.max(2, rightPercent - leftPercent);

    return {
      left: `${leftPercent}%`,
      width: `${widthPercent}%`,
    };
  };

  // Milestone marker position
  const getMilestonePosition = (dateStr: string) => {
    const target = new Date(dateStr).getTime();
    const projStart = projectStartDate.getTime();
    const projEnd = projectEndDate.getTime();
    const totalProjTime = projEnd - projStart;
    if (totalProjTime <= 0) return '50%';
    const percent = Math.max(0, Math.min(100, ((target - projStart) / totalProjTime) * 100));
    return `${percent}%`;
  };

  // Today position line
  const now = new Date().getTime();
  const projStart = projectStartDate.getTime();
  const projEnd = projectEndDate.getTime();
  const todayPercent = Math.max(0, Math.min(100, ((now - projStart) / (projEnd - projStart)) * 100));

  return (
    <div className="space-y-4">
      
      {/* Controls Strip */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
            <Calendar className="w-4 h-4 text-indigo-600" />
            <span>Chronogramme & Diagramme de Gantt</span>
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Période : {formatDateFR(project.startDate)} → {formatDateFR(project.endDate)} ({totalDays} jours)
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {/* Critical path toggle */}
          <button
            onClick={() => setHighlightCriticalPath(!highlightCriticalPath)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all flex items-center gap-1.5 cursor-pointer ${
              highlightCriticalPath 
                ? 'bg-rose-50 border-rose-300 text-rose-700 shadow-2xs font-bold' 
                : 'bg-slate-50 border-slate-300 text-slate-700 hover:bg-slate-100'
            }`}
          >
            <Zap className="w-3.5 h-3.5 text-rose-500" />
            <span>Chemin Critique</span>
          </button>

          <button
            onClick={() => onOpenMilestoneModal()}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 transition-colors flex items-center gap-1 cursor-pointer"
          >
            <Target className="w-3.5 h-3.5 text-indigo-600" />
            <span>+ Jalon</span>
          </button>

          <button
            onClick={() => onOpenTaskModal()}
            className="px-3 py-1.5 rounded-lg text-xs font-bold bg-indigo-600 text-white hover:bg-indigo-700 transition-colors flex items-center gap-1 cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>+ Tâche</span>
          </button>
        </div>
      </div>

      {/* Gantt Canvas Container */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        
        {/* Milestones Horizontal Bar */}
        <div className="p-4 bg-slate-50/80 border-b border-slate-200">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
              <Target className="w-3.5 h-3.5 text-indigo-600" />
              Ligne des Jalons & Livrables Clés
            </span>
            <span className="text-[11px] text-slate-500">
              {project.milestones.length} jalons positionnés
            </span>
          </div>

          <div className="relative h-12 bg-white rounded-xl border border-slate-200 px-3 flex items-center">
            {/* Background Month Grid Lines */}
            <div className="absolute inset-0 flex justify-between px-3 pointer-events-none opacity-40">
              {timelineColumns.map((col, i) => (
                <div key={i} className="border-r border-slate-200 h-full" />
              ))}
            </div>

            {/* Today Line */}
            <div
              className="absolute top-0 bottom-0 w-0.5 bg-indigo-500 z-10 pointer-events-none"
              style={{ left: `${todayPercent}%` }}
              title="Aujourd'hui"
            />

            {/* Milestone Diamond Markers */}
            {project.milestones.map((ms) => {
              const pos = getMilestonePosition(ms.targetDate);
              return (
                <div
                  key={ms.id}
                  onClick={() => onOpenMilestoneModal(ms.id)}
                  style={{ left: pos }}
                  title={`${ms.title} (${formatDateFR(ms.targetDate)})`}
                  className="absolute -translate-x-1/2 cursor-pointer group z-20 flex flex-col items-center"
                >
                  <div
                    className={`w-5 h-5 rotate-45 rounded-sm flex items-center justify-center transition-transform group-hover:scale-125 shadow-xs ${
                      ms.completed
                        ? 'bg-emerald-600 text-white'
                        : 'bg-indigo-600 text-white'
                    }`}
                  >
                    <Target className="w-3 h-3 -rotate-45" />
                  </div>

                  {/* Tooltip on hover */}
                  <div className="hidden group-hover:block absolute bottom-7 bg-slate-900 text-white text-[10px] font-semibold py-1 px-2 rounded-lg whitespace-nowrap z-30 shadow-lg pointer-events-none">
                    {ms.title} • {formatDateFR(ms.targetDate)}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Gantt Grid (Left Table + Right Timeline Canvas) */}
        <div className="overflow-x-auto">
          <div className="min-w-[900px]">
            
            {/* Header: Task Metadata + Timeline Months */}
            <div className="grid grid-cols-12 bg-slate-100/80 border-b border-slate-200 text-xs font-bold text-slate-700">
              <div className="col-span-5 p-3 border-r border-slate-200 flex items-center justify-between">
                <span>Tâche & Assignation</span>
                <span className="text-[11px] text-slate-500 font-normal">Dates & Avancement</span>
              </div>
              <div className="col-span-7 relative p-3 flex justify-between">
                {timelineColumns.map((col, i) => (
                  <span key={i} className="text-[11px] font-semibold text-slate-600">
                    {col.label}
                  </span>
                ))}
              </div>
            </div>

            {/* Task Rows */}
            <div className="divide-y divide-slate-100">
              {project.tasks.map((task, idx) => {
                const assignee = project.members.find((m) => m.id === task.assigneeId);
                const barPos = getBarPosition(task.startDate, task.dueDate);
                const isCritical = highlightCriticalPath && (task.priority === 'CRITICAL' || task.priority === 'HIGH');
                const isCompleted = task.status === 'DONE';

                return (
                  <div
                    key={task.id}
                    onClick={() => onOpenTaskModal(task.id)}
                    className={`grid grid-cols-12 items-center hover:bg-slate-50/80 transition-colors cursor-pointer text-xs ${
                      isCritical ? 'bg-rose-50/30' : idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/30'
                    }`}
                  >
                    {/* Left Column: Task Info */}
                    <div className="col-span-5 p-3 border-r border-slate-200 flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className={`w-2 h-2 rounded-full shrink-0 ${
                          isCompleted ? 'bg-emerald-500' : task.status === 'IN_PROGRESS' ? 'bg-blue-500' : 'bg-slate-300'
                        }`} />
                        
                        <span className={`font-semibold truncate ${isCompleted ? 'line-through text-slate-400' : 'text-slate-900'}`}>
                          {task.title}
                        </span>

                        {isCritical && (
                          <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-rose-100 text-rose-700 shrink-0">
                            Critique
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        {assignee && (
                          <div
                            className="w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold text-white shadow-2xs"
                            style={{ backgroundColor: assignee.color || '#4F46E5' }}
                            title={assignee.name}
                          >
                            {assignee.name.charAt(0)}
                          </div>
                        )}
                        <span className="text-[11px] font-bold text-slate-700 w-8 text-right">
                          {isCompleted ? '100%' : `${task.completionPercent || 0}%`}
                        </span>
                      </div>
                    </div>

                    {/* Right Column: Timeline Bar */}
                    <div className="col-span-7 p-3 relative h-12 flex items-center">
                      
                      {/* Month Grid Divider Lines */}
                      <div className="absolute inset-0 flex justify-between px-3 pointer-events-none opacity-30">
                        {timelineColumns.map((col, i) => (
                          <div key={i} className="border-r border-slate-200 h-full" />
                        ))}
                      </div>

                      {/* Today vertical Line */}
                      <div
                        className="absolute top-0 bottom-0 w-0.5 bg-indigo-500/70 z-10 pointer-events-none"
                        style={{ left: `${todayPercent}%` }}
                      />

                      {/* Horizontal Gantt Bar */}
                      <div
                        className={`absolute h-6 rounded-md transition-all shadow-2xs overflow-hidden flex items-center px-2 group ${
                          isCompleted
                            ? 'bg-emerald-200 border border-emerald-300'
                            : isCritical
                            ? 'bg-rose-200 border border-rose-300'
                            : 'bg-indigo-100 border border-indigo-300'
                        }`}
                        style={{ left: barPos.left, width: barPos.width }}
                      >
                        {/* Progress Fill */}
                        <div
                          className={`absolute left-0 top-0 bottom-0 rounded-l-md transition-all ${
                            isCompleted
                              ? 'bg-emerald-500'
                              : isCritical
                              ? 'bg-rose-500'
                              : 'bg-indigo-600'
                          }`}
                          style={{ width: `${isCompleted ? 100 : task.completionPercent || 0}%` }}
                        />

                        {/* Bar Label */}
                        <span className="relative z-10 text-[10px] font-bold text-white drop-shadow-xs truncate">
                          {formatDateFR(task.startDate)} → {formatDateFR(task.dueDate)}
                        </span>
                      </div>

                    </div>
                  </div>
                );
              })}
            </div>

          </div>
        </div>

        {/* Footer legend */}
        <div className="p-3 bg-slate-50 border-t border-slate-200 flex flex-wrap items-center justify-between text-xs text-slate-500">
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded bg-emerald-500" /> Tâche terminée
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded bg-indigo-600" /> Tâche en cours
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded bg-rose-500" /> Chemin critique
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rotate-45 bg-indigo-600" /> Jalon clé
            </span>
          </div>

          <span className="font-medium text-slate-600">
            Ligne violette = Date du jour
          </span>
        </div>

      </div>

    </div>
  );
};
