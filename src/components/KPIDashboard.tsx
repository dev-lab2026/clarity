import React from 'react';
import { 
  Project, 
  ProjectMetrics, 
  KPIWidget 
} from '../types';
import { 
  formatCurrency, 
  formatDateFR, 
  generateSCurveData 
} from '../utils/pmCalculations';
import { 
  ResponsiveContainer, 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  Legend, 
  PieChart, 
  Pie, 
  Cell, 
  BarChart, 
  Bar 
} from 'recharts';
import { 
  Activity, 
  TrendingUp, 
  TrendingDown, 
  DollarSign, 
  CheckCircle2, 
  Clock, 
  AlertTriangle, 
  ShieldAlert, 
  Calendar, 
  Target, 
  ArrowUpRight, 
  ArrowDownRight, 
  Sparkles, 
  Plus, 
  Layers, 
  Sliders,
  ChevronRight,
  Brain
} from 'lucide-react';

interface KPIDashboardProps {
  project: Project;
  metrics?: ProjectMetrics;
  onOpenTaskModal?: (taskId?: string) => void;
  onOpenMilestoneModal?: (milestoneId?: string) => void;
  onOpenRiskModal?: (riskId?: string) => void;
  onOpenAI?: () => void;
  onOpenAIAssistant?: () => void;
  onOpenCustomizer?: () => void;
  onOpenCustomizeWidgets?: () => void;
  onOpenProjectSettings?: () => void;
  onChangeTab?: (tab: string) => void;
  onToggleMilestone?: (milestoneId: string) => void;
}

export const KPIDashboard: React.FC<KPIDashboardProps> = ({
  project,
  metrics: incomingMetrics,
  onOpenTaskModal = (_taskId?: string) => {},
  onOpenMilestoneModal = (_milestoneId?: string) => {},
  onOpenRiskModal = (_riskId?: string) => {},
  onOpenAI,
  onOpenAIAssistant,
  onOpenCustomizer,
  onOpenCustomizeWidgets,
  onOpenProjectSettings = () => {},
  onChangeTab = (_tab: string) => {},
  onToggleMilestone = (_milestoneId: string) => {},
}) => {
  const handleOpenAI = onOpenAI || onOpenAIAssistant || (() => {});
  const handleOpenCustomizer = onOpenCustomizer || onOpenCustomizeWidgets || (() => {});
  
  const metrics = incomingMetrics || {
    BAC: project?.totalBudget || 0,
    PV: 0,
    EV: 0,
    AC: 0,
    CV: 0,
    SV: 0,
    CPI: 1,
    SPI: 1,
    EAC: project?.totalBudget || 0,
    ETC: 0,
    VAC: 0,
    progressPercent: 0,
    totalTasks: project?.tasks?.length || 0,
    completedTasks: project?.tasks?.filter(t => t.status === 'DONE')?.length || 0,
    inProgressTasks: 0,
    blockedTasks: 0,
    overdueTasks: 0,
    totalEstimatedHours: 0,
    totalActualHours: 0,
    healthScore: 100,
    healthStatus: 'HEALTHY' as const,
    criticalRisksCount: project?.risks?.filter(r => r.status === 'ACTIVE' && (r.probability * r.impact >= 15))?.length || 0,
    totalRisksCount: project?.risks?.length || 0,
    completedMilestones: project?.milestones?.filter(m => m.completed)?.length || 0,
    totalMilestones: project?.milestones?.length || 0,
  };

  const sCurveData = generateSCurveData(project);

  // Status donut data
  const tasks = project?.tasks || [];
  const statusCounts = {
    TODO: tasks.filter((t) => t.status === 'TODO').length,
    IN_PROGRESS: tasks.filter((t) => t.status === 'IN_PROGRESS').length,
    REVIEW: tasks.filter((t) => t.status === 'REVIEW' || t.status === 'BLOCKED').length,
    DONE: tasks.filter((t) => t.status === 'DONE').length,
  };

  const pieData = [
    { name: 'À faire', value: statusCounts.TODO, color: '#94A3B8' },
    { name: 'En cours', value: statusCounts.IN_PROGRESS, color: '#3B82F6' },
    { name: 'Revue / Bloqué', value: statusCounts.REVIEW, color: '#F59E0B' },
    { name: 'Terminé', value: statusCounts.DONE, color: '#10B981' },
  ].filter((d) => d.value > 0);

  // Team workload data
  const workloadData = project.members.map((member) => {
    const assignedTasks = project.tasks.filter((t) => t.assigneeId === member.id);
    const estimatedHours = assignedTasks.reduce((sum, t) => sum + (Number(t.estimatedHours) || 0), 0);
    const actualHours = assignedTasks.reduce((sum, t) => sum + (Number(t.actualHours) || 0), 0);
    return {
      name: member.name.split(' ')[0],
      estimé: estimatedHours,
      réel: actualHours,
      max: member.maxWeeklyHours * 4, // Monthly capacity
    };
  });

  // Calculate Health color scheme
  const getHealthBadge = (score: number) => {
    if (score >= 80) {
      return {
        bg: 'bg-emerald-50 text-emerald-700 border-emerald-200',
        dot: 'bg-emerald-500',
        text: '🟢 Excellent / En bonne voie',
      };
    } else if (score >= 60) {
      return {
        bg: 'bg-amber-50 text-amber-700 border-amber-200',
        dot: 'bg-amber-500',
        text: '🟡 Vigilance / Dérive mineure',
      };
    } else {
      return {
        bg: 'bg-rose-50 text-rose-700 border-rose-200',
        dot: 'bg-rose-500',
        text: '🔴 Alerte Critique / Actions requises',
      };
    }
  };

  const healthBadge = getHealthBadge(metrics.healthScore);

  // Helper for EVM index indicators
  const getIndexColor = (val: number, threshold = 1.0) => {
    if (val >= threshold) return 'text-emerald-600 bg-emerald-50 border-emerald-200';
    if (val >= threshold - 0.1) return 'text-amber-600 bg-amber-50 border-amber-200';
    return 'text-rose-600 bg-rose-50 border-rose-200';
  };

  // Sort visible widgets
  const visibleWidgets = (project.kpiWidgets || [])
    .filter((w) => w.isVisible)
    .sort((a, b) => a.order - b.order);

  return (
    <div className="space-y-6">
      
      {/* Project Banner & Quick Control Header */}
      <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="px-2 py-0.5 text-[11px] font-bold rounded-md bg-slate-100 text-slate-700 border border-slate-300 uppercase tracking-wider">
                {project.code}
              </span>
              <span className="text-xs text-slate-500 font-medium">
                Client : <strong className="text-slate-700">{project.client || 'Interne'}</strong>
              </span>
              <span className="text-slate-300">•</span>
              <span className="text-xs text-slate-500">
                Chef de Projet : <strong className="text-slate-700">{project.managerName}</strong>
              </span>
            </div>
            <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">
              {project.name}
            </h1>
            <p className="text-sm text-slate-600 mt-1 line-clamp-1">
              {project.description}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              onClick={() => onOpenTaskModal()}
              className="px-3.5 py-2 rounded-xl text-xs font-bold bg-indigo-600 text-white hover:bg-indigo-700 transition-colors shadow-2xs flex items-center gap-1.5 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Ajouter une Tâche</span>
            </button>

            <button
              onClick={() => onOpenMilestoneModal()}
              className="px-3.5 py-2 rounded-xl text-xs font-semibold bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              <Target className="w-4 h-4 text-indigo-600" />
              <span>Nouveau Jalon</span>
            </button>

            <button
              onClick={() => onOpenRiskModal()}
              className="px-3.5 py-2 rounded-xl text-xs font-semibold bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              <ShieldAlert className="w-4 h-4 text-rose-500" />
              <span>Identifier Risque</span>
            </button>

            

            <button
              onClick={handleOpenAI}
              className="px-3.5 py-2 rounded-xl text-xs font-bold bg-gradient-to-r from-purple-600 to-indigo-600 text-white hover:opacity-95 shadow-sm transition-all flex items-center gap-1.5 cursor-pointer"
            >
              <Sparkles className="w-4 h-4 animate-spin" style={{ animationDuration: '6s' }} />
              <span>Assistant PM</span>
            </button>
          </div>
        </div>

        {/* Project Health Score Ribbon */}
        <div className="mt-5 pt-4 border-t border-slate-100 grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
          
          {/* Health Score */}
          <div className="bg-slate-50/80 rounded-xl p-3 border border-slate-200/60">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold text-slate-500 uppercase">Santé Globale</span>
              <Activity className="w-3.5 h-3.5 text-indigo-600" />
            </div>
            <div className="flex items-baseline gap-2 mt-1.5">
              <span className="text-2xl font-black text-slate-900">{metrics.healthScore}</span>
              <span className="text-xs font-semibold text-slate-400">/100</span>
            </div>
            <div className={`mt-1.5 px-2 py-0.5 rounded text-[10px] font-bold border inline-block ${healthBadge.bg}`}>
              {metrics.healthStatus === 'HEALTHY' ? 'En bonne voie' : metrics.healthStatus === 'WARNING' ? 'Sous surveillance' : 'Alerte critique'}
            </div>
          </div>

          {/* Avancement */}
          <div className="bg-slate-50/80 rounded-xl p-3 border border-slate-200/60">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold text-slate-500 uppercase">Avancement</span>
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
            </div>
            <div className="flex items-baseline gap-1 mt-1.5">
              <span className="text-2xl font-black text-slate-900">{metrics.progressPercent}%</span>
            </div>
            <div className="w-full bg-slate-200 h-1.5 rounded-full mt-2 overflow-hidden">
              <div 
                className="bg-emerald-500 h-full rounded-full transition-all duration-500"
                style={{ width: `${metrics.progressPercent}%` }}
              />
            </div>
          </div>

          {/* SPI (Schedule Performance Index) */}
          <div className="bg-slate-50/80 rounded-xl p-3 border border-slate-200/60">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold text-slate-500 uppercase">SPI (Délais)</span>
              {metrics.SPI >= 1.0 ? (
                <ArrowUpRight className="w-3.5 h-3.5 text-emerald-600" />
              ) : (
                <ArrowDownRight className="w-3.5 h-3.5 text-rose-600" />
              )}
            </div>
            <div className="flex items-baseline gap-1 mt-1.5">
              <span className="text-2xl font-black text-slate-900">{metrics.SPI}</span>
            </div>
            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border inline-block mt-1 ${getIndexColor(metrics.SPI, 1.0)}`}>
              {metrics.SPI >= 1.0 ? 'En avance / À l’heure' : metrics.SPI >= 0.9 ? 'Léger retard' : 'Retard critique'}
            </span>
          </div>

          {/* CPI (Cost Performance Index) */}
          <div className="bg-slate-50/80 rounded-xl p-3 border border-slate-200/60">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold text-slate-500 uppercase">CPI (Coûts)</span>
              {metrics.CPI >= 1.0 ? (
                <TrendingUp className="w-3.5 h-3.5 text-emerald-600" />
              ) : (
                <TrendingDown className="w-3.5 h-3.5 text-rose-600" />
              )}
            </div>
            <div className="flex items-baseline gap-1 mt-1.5">
              <span className="text-2xl font-black text-slate-900">{metrics.CPI}</span>
            </div>
            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border inline-block mt-1 ${getIndexColor(metrics.CPI, 1.0)}`}>
              {metrics.CPI >= 1.0 ? 'Sous budget' : metrics.CPI >= 0.9 ? 'Dépassement faible' : 'Surcoût important'}
            </span>
          </div>

          {/* Budget Consommé vs Total */}
          <div className="bg-slate-50/80 rounded-xl p-3 border border-slate-200/60">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold text-slate-500 uppercase">Dépenses (AC)</span>
              <DollarSign className="w-3.5 h-3.5 text-slate-600" />
            </div>
            <div className="flex items-baseline gap-1 mt-1.5">
              <span className="text-lg font-black text-slate-900">{formatCurrency(metrics.AC, project.currency)}</span>
            </div>
            <span className="text-[10px] text-slate-500 block mt-1">
              sur {formatCurrency(metrics.BAC, project.currency)} alloués
            </span>
          </div>

          {/* Risques & Alertes */}
          <div className="bg-slate-50/80 rounded-xl p-3 border border-slate-200/60 cursor-pointer hover:bg-slate-100/80 transition-colors" onClick={() => onChangeTab('risks')}>
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold text-slate-500 uppercase">Risques Majeurs</span>
              <ShieldAlert className="w-3.5 h-3.5 text-rose-500" />
            </div>
            <div className="flex items-baseline gap-1 mt-1.5">
              <span className={`text-2xl font-black ${metrics.criticalRisksCount > 0 ? 'text-rose-600' : 'text-slate-900'}`}>
                {metrics.criticalRisksCount}
              </span>
              <span className="text-xs text-slate-400">/ {metrics.totalRisksCount}</span>
            </div>
            <span className="text-[10px] text-indigo-600 font-semibold flex items-center gap-0.5 mt-1">
              Voir matrice <ChevronRight className="w-3 h-3" />
            </span>
          </div>

        </div>
      </div>

      {/* Main Charts & Indicators Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">

        {/* EVM S-Curve Chart (Large 8-col) */}
        <div className="lg:col-span-8 bg-white rounded-2xl p-5 border border-slate-200 shadow-xs">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
            <div>
              <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <span>Courbe en S & Performance EVM (Earned Value)</span>
                <span className="text-xs px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 font-semibold border border-indigo-200">
                  Temps Réel
                </span>
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Comparaison entre Valeur Planifiée (PV), Valeur Acquise (EV), Coûts Réels (AC) et Projection
              </p>
            </div>

            <div className="flex items-center gap-2 text-xs">
              <span className="flex items-center gap-1 font-medium text-slate-600">
                <span className="w-2.5 h-2.5 rounded-full bg-blue-500" /> PV (Plan)
              </span>
              <span className="flex items-center gap-1 font-medium text-slate-600">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" /> EV (Acquis)
              </span>
              <span className="flex items-center gap-1 font-medium text-slate-600">
                <span className="w-2.5 h-2.5 rounded-full bg-rose-500" /> AC (Dépenses)
              </span>
            </div>
          </div>

          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={sCurveData} margin={{ top: 10, right: 20, left: 10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
                <XAxis dataKey="month" stroke="#94A3B8" fontSize={11} tickLine={false} />
                <YAxis 
                  stroke="#94A3B8" 
                  fontSize={11} 
                  tickFormatter={(val) => `${(val / 1000).toFixed(0)}k€`}
                  tickLine={false}
                />
                <Tooltip 
                  formatter={(val: any) => formatCurrency(Number(val), project.currency)}
                  contentStyle={{ backgroundColor: '#1E293B', borderRadius: '10px', border: 'none', color: '#F8FAFC', fontSize: '12px' }}
                />
                <Line type="monotone" dataKey="PV" stroke="#3B82F6" strokeWidth={2.5} dot={{ r: 3 }} name="Valeur Planifiée (PV)" />
                <Line type="monotone" dataKey="EV" stroke="#10B981" strokeWidth={3} dot={{ r: 4 }} name="Valeur Acquise (EV)" />
                <Line type="monotone" dataKey="AC" stroke="#EF4444" strokeWidth={2.5} dot={{ r: 3 }} name="Coût Réel (AC)" />
                <Line type="monotone" dataKey="Forecast" stroke="#8B5CF6" strokeDasharray="4 4" strokeWidth={2} dot={false} name="Projection EAC" />
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div className="mt-4 pt-3 border-t border-slate-100 grid grid-cols-3 gap-2 text-center text-xs">
            <div className="bg-slate-50 p-2 rounded-lg">
              <span className="text-slate-500 block">Écart Coûts (CV = EV - AC)</span>
              <strong className={`text-sm ${metrics.CV >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                {metrics.CV >= 0 ? '+' : ''}{formatCurrency(metrics.CV, project.currency)}
              </strong>
            </div>
            <div className="bg-slate-50 p-2 rounded-lg">
              <span className="text-slate-500 block">Écart Délais (SV = EV - PV)</span>
              <strong className={`text-sm ${metrics.SV >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                {metrics.SV >= 0 ? '+' : ''}{formatCurrency(metrics.SV, project.currency)}
              </strong>
            </div>
            <div className="bg-slate-50 p-2 rounded-lg">
              <span className="text-slate-500 block">Estimation à Clôture (EAC)</span>
              <strong className="text-sm text-slate-800">
                {formatCurrency(metrics.EAC, project.currency)}
              </strong>
            </div>
          </div>
        </div>

        {/* Task Status & Priority Breakdown (4-col) */}
        <div className="lg:col-span-4 bg-white rounded-2xl p-5 border border-slate-200 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-base font-bold text-slate-900">
                Répartition des Tâches
              </h2>
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700">
                {metrics.totalTasks} tâches
              </span>
            </div>
            <p className="text-xs text-slate-500 mb-4">
              {metrics.completedTasks} terminées • {metrics.inProgressTasks} actives • {metrics.overdueTasks} en retard
            </p>

            <div className="h-44 w-full relative">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={75}
                    paddingAngle={3}
                    dataKey="value"
                  >
                    {pieData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#1E293B', borderRadius: '8px', border: 'none', color: '#F8FAFC', fontSize: '11px' }} 
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                <span className="text-xl font-black text-slate-800">{metrics.progressPercent}%</span>
                <span className="text-[10px] text-slate-400 font-medium uppercase">Complété</span>
              </div>
            </div>
          </div>

          <div className="space-y-2 mt-2 pt-3 border-t border-slate-100">
            {pieData.map((item) => (
              <div key={item.name} className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: item.color }} />
                  <span className="text-slate-600 font-medium">{item.name}</span>
                </div>
                <div className="flex items-center gap-2">
                  <strong className="text-slate-800">{item.value}</strong>
                  <span className="text-slate-400 text-[11px]">
                    ({Math.round((item.value / (metrics.totalTasks || 1)) * 100)}%)
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

      </div>

      {/* Second Row: Milestones Roadmap & Team Workload */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Milestones Roadmaps (7-col) */}
        <div className="lg:col-span-7 bg-white rounded-2xl p-5 border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Target className="w-4 h-4 text-indigo-600" />
                <span>Jalons & Livrables Stratégiques</span>
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                {metrics.completedMilestones} sur {metrics.totalMilestones} jalons validés
              </p>
            </div>
            <button
              onClick={() => onOpenMilestoneModal()}
              className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 flex items-center gap-1 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" /> Nouveau jalon
            </button>
          </div>

          <div className="space-y-3">
            {project.milestones.map((ms) => {
              const isOverdue = !ms.completed && ms.targetDate < new Date().toISOString().split('T')[0];
              return (
                <div 
                  key={ms.id} 
                  className={`p-3 rounded-xl border transition-all flex items-start justify-between gap-3 ${
                    ms.completed 
                      ? 'bg-emerald-50/40 border-emerald-200/70' 
                      : isOverdue 
                      ? 'bg-rose-50/50 border-rose-200' 
                      : 'bg-slate-50/60 border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <button
                      onClick={() => onToggleMilestone(ms.id)}
                      className={`mt-0.5 w-5 h-5 rounded-md flex items-center justify-center transition-colors cursor-pointer ${
                        ms.completed 
                          ? 'bg-emerald-600 text-white' 
                          : 'border-2 border-slate-400 hover:border-emerald-600 text-transparent'
                      }`}
                    >
                      <CheckCircle2 className="w-4 h-4" />
                    </button>
                    <div>
                      <h4 className={`text-xs font-bold ${ms.completed ? 'line-through text-slate-500' : 'text-slate-900'}`}>
                        {ms.title}
                      </h4>
                      {ms.deliverable && (
                        <p className="text-[11px] text-slate-500 mt-0.5">
                          📦 Livrable : <span className="font-medium text-slate-700">{ms.deliverable}</span>
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="text-right shrink-0">
                    <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-md inline-flex items-center gap-1 ${
                      ms.completed 
                        ? 'bg-emerald-100 text-emerald-800' 
                        : isOverdue 
                        ? 'bg-rose-100 text-rose-800' 
                        : 'bg-slate-200 text-slate-700'
                    }`}>
                      <Calendar className="w-3 h-3" />
                      {formatDateFR(ms.targetDate)}
                    </span>
                    {isOverdue && !ms.completed && (
                      <span className="text-[10px] font-bold text-rose-600 block mt-0.5">
                        En retard
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Workload & Resource Allocation (5-col) */}
        <div className="lg:col-span-5 bg-white rounded-2xl p-5 border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <span>Charge de l'Équipe</span>
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Heures estimées vs réalisées par membre
              </p>
            </div>
            <button
              onClick={() => onChangeTab('workload')}
              className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 flex items-center gap-1 cursor-pointer"
            >
              Détails <ChevronRight className="w-3 h-3" />
            </button>
          </div>

          <div className="h-56 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={workloadData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
                <XAxis dataKey="name" stroke="#94A3B8" fontSize={11} tickLine={false} />
                <YAxis stroke="#94A3B8" fontSize={11} tickLine={false} />
                <Tooltip 
                  formatter={(val: any) => `${val} heures`}
                  contentStyle={{ backgroundColor: '#1E293B', borderRadius: '8px', border: 'none', color: '#F8FAFC', fontSize: '11px' }}
                />
                <Legend wrapperStyle={{ fontSize: '11px' }} />
                <Bar dataKey="estimé" fill="#6366F1" radius={[4, 4, 0, 0]} name="Heures Estimées" />
                <Bar dataKey="réel" fill="#10B981" radius={[4, 4, 0, 0]} name="Heures Réalisées" />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-600">
            <span>Total heures estimées : <strong>{metrics.totalEstimatedHours}h</strong></span>
            <span>Total heures réelles : <strong>{metrics.totalActualHours}h</strong></span>
          </div>
        </div>

      </div>

    </div>
  );
};
