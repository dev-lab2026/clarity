import React, { useState, useEffect, useMemo } from 'react';
import { 
  Project, 
  Task, 
  Milestone, 
  Risk, 
  KPIWidget, 
  TaskStatus, 
  RiskStatus,
  MicrosoftUser,
  UserProfile,
} from './types';
import { INITIAL_PROJECTS, DEFAULT_KPI_WIDGETS } from './data/initialData';
import { calculateProjectMetrics } from './utils/pmCalculations';

// Components
import { Navbar } from './components/Navbar';
import { KPIDashboard } from './components/KPIDashboard';
import { KanbanBoard } from './components/KanbanBoard';
import { GanttTimeline } from './components/GanttTimeline';
import { TaskListView } from './components/TaskListView';
import { RiskMatrix } from './components/RiskMatrix';
import { TeamWorkload } from './components/TeamWorkload';
import { PortfolioOverview } from './components/PortfolioOverview';
import { AdminPage } from './components/AdminPage';
import { ContributorPortal } from './components/ContributorPortal';

// Modals
import { AIAssistantModal } from './components/AIAssistantModal';
import { JsonImportModal } from './components/JsonImportModal';
import { WidgetCustomizerModal } from './components/WidgetCustomizerModal';
import { AddEditTaskModal } from './components/AddEditTaskModal';
import { AddEditMilestoneModal } from './components/AddEditMilestoneModal';
import { AddEditRiskModal } from './components/AddEditRiskModal';
import { AddEditProjectModal } from './components/AddEditProjectModal';
import { MicrosoftAuthModal } from './components/MicrosoftAuthModal';
import { LoginPage } from './components/LoginPage';

export const App: React.FC = () => {
  // Microsoft User Authentication State
  const [currentUser, setCurrentUser] = useState<MicrosoftUser | null>(null);

  const [isMicrosoftAuthOpen, setIsMicrosoftAuthOpen] = useState(false);
  const [isLoginPageView, setIsLoginPageView] = useState(false);

  // Check auth session with server on startup
  useEffect(() => {
    fetch('/api/auth/me')
      .then((res) => res.json())
      .then((data) => {
        if (data.isAuthenticated && data.user) {
          setCurrentUser(data.user);
          if (data.user.role === 'ADMINISTRATEUR') setActiveTab('ADMIN');
          else if (data.user.role === 'CONTRIBUTEUR') setActiveTab('MY_TASKS');
          else if (data.user.role === 'DIRECTEUR_PROJETS' || data.user.role === 'PMO') setActiveTab('PORTFOLIO');
          else setActiveTab('DASHBOARD');
        }
      })
      .catch((err) => console.warn('Auth check error', err));
  }, []);

  const handleLoginSuccess = (user: MicrosoftUser) => {
    setCurrentUser(user);
    if (user.role === 'ADMINISTRATEUR') setActiveTab('ADMIN');
    else if (user.role === 'CONTRIBUTEUR') setActiveTab('MY_TASKS');
    else if (user.role === 'DIRECTEUR_PROJETS' || user.role === 'PMO') setActiveTab('PORTFOLIO');
    else setActiveTab('DASHBOARD');
  };


  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } catch (e) {
      console.warn('Logout request failed', e);
    }
    setCurrentUser(null);
  };

  // Business data is loaded from the authenticated API; localStorage is not a source of truth.
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectsLoading, setProjectsLoading] = useState(false);
  const [projectManagers, setProjectManagers] = useState<UserProfile[]>([]);
  const [selectedProjectIds, setSelectedProjectIds] = useState<string[]>([]);

  useEffect(() => {
    if (!currentUser || currentUser.role === 'ADMINISTRATEUR') { setProjects([]); setSelectedProjectIds([]); return; }
    setProjectsLoading(true);
    fetch('/api/projects')
      .then(async r => { if (!r.ok) throw new Error((await r.json()).error || 'Erreur de chargement'); return r.json(); })
      .then(data => setProjects(Array.isArray(data.data) ? data.data : []))
      .catch(err => console.error('Project load error', err))
      .finally(() => setProjectsLoading(false));
  }, [currentUser]);

  useEffect(() => {
    if (currentUser?.role !== 'DIRECTEUR_PROJETS') { setProjectManagers([]); return; }
    fetch('/api/project-managers')
      .then(async r => { if (!r.ok) throw new Error((await r.json()).error || 'Erreur'); return r.json(); })
      .then(data => setProjectManagers(Array.isArray(data.users) ? data.users : []))
      .catch(err => console.warn('Project managers load error', err));
  }, [currentUser]);

  const [activeProjectId, setActiveProjectId] = useState<string>(() => {
    return projects[0]?.id || 'proj-apollo-1';
  });

  const [activeTab, setActiveTab] = useState<
    'DASHBOARD' | 'KANBAN' | 'GANTT' | 'TASKS' | 'RISKS' | 'TEAM' | 'PORTFOLIO' | 'ADMIN' | 'MY_TASKS'
  >('DASHBOARD');

  const isAdmin = currentUser?.role === 'ADMINISTRATEUR';
  const isDirector = currentUser?.role === 'DIRECTEUR_PROJETS';
  const canCreateDeleteProject = isDirector;
  const canEditProject = currentUser?.role === 'DIRECTEUR_PROJETS' || currentUser?.role === 'CHEF_PROJET' || currentUser?.role === 'PMO';


  // Active Project & Metrics
  const activeProject = useMemo(() => {
    return projects.find((p) => p.id === activeProjectId) || projects[0];
  }, [projects, activeProjectId]);

  const metrics = useMemo(() => {
    if (!activeProject) return null;
    return calculateProjectMetrics(activeProject);
  }, [activeProject]);

  // Modal States
  const [isAIAssistantOpen, setIsAIAssistantOpen] = useState(false);
  const [isWidgetCustomizerOpen, setIsWidgetCustomizerOpen] = useState(false);
  const [taskModalState, setTaskModalState] = useState<{ isOpen: boolean; taskId?: string | null }>({
    isOpen: false,
    taskId: null,
  });
  const [milestoneModalState, setMilestoneModalState] = useState<{ isOpen: boolean; milestoneId?: string | null }>({
    isOpen: false,
    milestoneId: null,
  });
  const [riskModalState, setRiskModalState] = useState<{ isOpen: boolean; riskId?: string | null }>({
    isOpen: false,
    riskId: null,
  });
  const [projectModalState, setProjectModalState] = useState<{ isOpen: boolean; project?: Project | null }>({
    isOpen: false,
    project: null,
  });
  const [isJsonImportOpen, setIsJsonImportOpen] = useState(false);

  // Project Handlers
  const handleUpdateProject = async (updated: Project) => {
    if (!canEditProject) throw new Error('Vous n’avez pas le droit de modifier ce projet.');
    const res = await fetch(`/api/projects/${encodeURIComponent(updated.id)}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(updated) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Échec de sauvegarde du projet');
    const saved = data.data || updated;
    setProjects(prev => prev.map(p => p.id === saved.id ? saved : p));
    return saved;
  };

  const handleSaveProject = async (savedProj: Project) => {
    if (!canEditProject) throw new Error('Vous n’avez pas le droit de modifier les projets.');
    const exists = projects.some(p => p.id === savedProj.id);
    if (!exists && !canCreateDeleteProject) throw new Error('Seul le Directeur de Projets peut créer un projet.');
    const res = await fetch(exists ? `/api/projects/${encodeURIComponent(savedProj.id)}` : '/api/projects', { method: exists ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(savedProj) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Échec de sauvegarde du projet');
    const saved = data.data || savedProj;
    setProjects(prev => exists ? prev.map(p => p.id === saved.id ? saved : p) : [...prev, saved]);
    setActiveProjectId(saved.id);
    setActiveTab('DASHBOARD');
    return saved;
  };

  const handleToggleProjectSelection = (id: string) => {
    if (!canCreateDeleteProject) return;
    setSelectedProjectIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const handleToggleAllProjectSelection = () => {
    if (!canCreateDeleteProject) return;
    setSelectedProjectIds(prev => prev.length === projects.length ? [] : projects.map(p => p.id));
  };

  const handleBulkDeleteProjects = async () => {
    if (!canCreateDeleteProject || !selectedProjectIds.length) return;
    const names = projects.filter(p => selectedProjectIds.includes(p.id)).slice(0, 3).map(p => p.name).join(', ');
    const suffix = selectedProjectIds.length > 3 ? '…' : '';
    if (!window.confirm(`Supprimer ${selectedProjectIds.length} projet(s) sélectionné(s) ?\n\n${names}${suffix}`)) return;
    try {
      const res = await fetch('/api/projects', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids: selectedProjectIds }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Échec de suppression en masse.');
      const deleted = new Set<string>(data.ids || selectedProjectIds);
      setProjects(prev => {
        const remaining = prev.filter(p => !deleted.has(p.id));
        setActiveProjectId(remaining[0]?.id || '');
        return remaining;
      });
      setSelectedProjectIds([]);
    } catch (error) {
      window.alert(error instanceof Error ? error.message : 'Échec de suppression en masse.');
    }
  };

  const handleDeleteProject = async (projId: string) => {
    if (!canCreateDeleteProject) throw new Error('Seul le Directeur de Projets peut supprimer un projet.');
    const res = await fetch(`/api/projects/${encodeURIComponent(projId)}`, { method: 'DELETE' });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Échec de suppression du projet');
    setProjects(prev => { const remaining=prev.filter(p=>p.id!==projId); setActiveProjectId(remaining[0]?.id || ''); return remaining; });
    setProjectModalState({ isOpen: false, project: null });
    return true;
  };

  const handleContributorTaskUpdate = async (task: Task) => {
    const res = await fetch(`/api/projects/${encodeURIComponent(task.projectId)}/tasks/${encodeURIComponent(task.id)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(task),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Impossible de mettre à jour la tâche.');
    if (data.data) {
      setProjects(prev => prev.map(project => project.id !== task.projectId ? project : {
        ...project,
        tasks: project.tasks.map(existing => existing.id === task.id ? data.data : existing),
      }));
    }
  };

  // Task Handlers
  const handleSaveTask = (task: Task) => {
    if (!activeProject) return;
    const taskExists = activeProject.tasks.some((t) => t.id === task.id);
    let updatedTasks: Task[];
    if (taskExists) {
      updatedTasks = activeProject.tasks.map((t) => (t.id === task.id ? task : t));
    } else {
      updatedTasks = [...activeProject.tasks, task];
    }
    handleUpdateProject({ ...activeProject, tasks: updatedTasks });
  };

  const handleUpdateTaskStatus = (taskId: string, newStatus: TaskStatus) => {
    if (!activeProject) return;
    const updatedTasks = activeProject.tasks.map((t) => {
      if (t.id === taskId) {
        return {
          ...t,
          status: newStatus,
          completionPercent: newStatus === 'DONE' ? 100 : t.completionPercent,
        };
      }
      return t;
    });
    handleUpdateProject({ ...activeProject, tasks: updatedTasks });
  };

  const handleDeleteTask = (taskId: string) => {
    if (!activeProject) return;
    const updatedTasks = activeProject.tasks.filter((t) => t.id !== taskId);
    handleUpdateProject({ ...activeProject, tasks: updatedTasks });
  };

  const handleQuickAddTask = (status: TaskStatus, title: string) => {
    if (!activeProject) return;
    const newTask: Task = {
      id: `task-${Date.now()}`,
      projectId: activeProject.id,
      title,
      status,
      priority: 'MEDIUM',
      estimatedHours: 8,
      actualHours: 0,
      completionPercent: status === 'DONE' ? 100 : 0,
      startDate: new Date().toISOString().split('T')[0],
      dueDate: new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString().split('T')[0],
      tags: ['Tâche'],
    };
    handleUpdateProject({ ...activeProject, tasks: [...activeProject.tasks, newTask] });
  };

  // Milestone Handlers
  const handleSaveMilestone = (ms: Milestone) => {
    if (!activeProject) return;
    const exists = activeProject.milestones.some((m) => m.id === ms.id);
    let updatedMilestones: Milestone[];
    if (exists) {
      updatedMilestones = activeProject.milestones.map((m) => (m.id === ms.id ? ms : m));
    } else {
      updatedMilestones = [...activeProject.milestones, ms];
    }
    handleUpdateProject({ ...activeProject, milestones: updatedMilestones });
  };

  const handleToggleMilestone = (milestoneId: string) => {
    if (!activeProject) return;
    const updatedMilestones = activeProject.milestones.map((m) =>
      m.id === milestoneId 
        ? { ...m, completed: !m.completed, actualDate: !m.completed ? new Date().toISOString().split('T')[0] : undefined } 
        : m
    );
    handleUpdateProject({ ...activeProject, milestones: updatedMilestones });
  };

  const handleDeleteMilestone = (msId: string) => {
    if (!activeProject) return;
    const updatedMilestones = activeProject.milestones.filter((m) => m.id !== msId);
    handleUpdateProject({ ...activeProject, milestones: updatedMilestones });
  };

  // Data Export & Import Handlers
  const handleExportData = () => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(projects, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", `cockpit_pm_export_${new Date().toISOString().split('T')[0]}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };


  // Risk Handlers
  const handleSaveRisk = (risk: Risk) => {
    if (!activeProject) return;
    const exists = activeProject.risks.some((r) => r.id === risk.id);
    let updatedRisks: Risk[];
    if (exists) {
      updatedRisks = activeProject.risks.map((r) => (r.id === risk.id ? risk : r));
    } else {
      updatedRisks = [...activeProject.risks, risk];
    }
    handleUpdateProject({ ...activeProject, risks: updatedRisks });
  };

  const handleUpdateRiskStatus = (riskId: string, status: RiskStatus) => {
    if (!activeProject) return;
    const updatedRisks = activeProject.risks.map((r) =>
      r.id === riskId ? { ...r, status } : r
    );
    handleUpdateProject({ ...activeProject, risks: updatedRisks });
  };

  const handleDeleteRisk = (riskId: string) => {
    if (!activeProject) return;
    const updatedRisks = activeProject.risks.filter((r) => r.id !== riskId);
    handleUpdateProject({ ...activeProject, risks: updatedRisks });
  };

  // KPI Widget Configuration
  const handleUpdateWidgets = (widgets: KPIWidget[]) => {
    if (!activeProject) return;
    handleUpdateProject({ ...activeProject, kpiWidgets: widgets });
  };

  // AI Assistant Task Injection
  const handleAddTasksFromAI = (tasksToAdd: Partial<Task>[]) => {
    if (!activeProject) return;
    const newTasks: Task[] = tasksToAdd.map((t, idx) => ({
      id: `ai-task-${Date.now()}-${idx}`,
      projectId: activeProject.id,
      title: t.title || 'Nouvelle tâche',
      description: t.description || '',
      status: t.status || 'TODO',
      priority: t.priority || 'MEDIUM',
      estimatedHours: t.estimatedHours || 16,
      actualHours: 0,
      completionPercent: 0,
      startDate: t.startDate || new Date().toISOString().split('T')[0],
      dueDate: t.dueDate || new Date(Date.now() + 14 * 24 * 3600 * 1000).toISOString().split('T')[0],
      category: t.category || 'Général',
      tags: t.tags || ['IA-WBS'],
    }));

    handleUpdateProject({ ...activeProject, tasks: [...activeProject.tasks, ...newTasks] });
  };

  const handleTabChange = (tab: string) => {
    const upper = tab.toUpperCase();
    if (upper === 'WORKLOAD') {
      setActiveTab('TEAM');
    } else if (upper === 'ADMIN') {
      setActiveTab('ADMIN');
    } else if (['DASHBOARD', 'KANBAN', 'GANTT', 'TASKS', 'RISKS', 'TEAM', 'PORTFOLIO', 'ADMIN', 'MY_TASKS'].includes(upper)) {
      setActiveTab(upper as any);
    }
  };

  // Gate access: User must be connected to Microsoft account
  if (!currentUser) {
    return (
      <LoginPage
        onLoginSuccess={(user) => {
          handleLoginSuccess(user);
        }}
        currentUser={currentUser}
      />
    );
  }

  return (
    <div className="min-h-screen bg-slate-900/5 text-slate-900 font-sans antialiased flex flex-col selection:bg-indigo-500 selection:text-white">
      
      {/* Top Navigation Bar */}
      <Navbar
        projects={projects}
        activeProjectId={activeProjectId}
        activeTab={activeTab === 'TEAM' ? 'workload' : activeTab.toLowerCase()}
        metrics={metrics || undefined}
        currentUser={currentUser}
        onSelectProject={(id) => setActiveProjectId(id)}
        onChangeTab={handleTabChange}
        onOpenNewProject={canCreateDeleteProject ? () => setProjectModalState({ isOpen: true, project: null }) : () => {}}
        onOpenJsonImport={() => setIsJsonImportOpen(true)}
        onOpenAI={() => setIsAIAssistantOpen(true)}
        onOpenCustomizer={() => setIsWidgetCustomizerOpen(true)}
        onOpenSettings={canEditProject ? () => setProjectModalState({ isOpen: true, project: activeProject }) : () => {}}
        onOpenMicrosoftAuth={() => setIsMicrosoftAuthOpen(true)}
        onOpenLoginPage={() => {}}
        onLogout={handleLogout}
        onExportData={handleExportData}
        isPortfolioView={activeTab === 'PORTFOLIO'}
        onTogglePortfolioView={(isPortfolio) => setActiveTab(isPortfolio ? 'PORTFOLIO' : 'DASHBOARD')}
      />

      {/* Main Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8 space-y-6">
        
        {/* Render Tab Views */}
        {activeTab === 'PORTFOLIO' && (
          <PortfolioOverview
            projects={projects}
            onSelectProject={(id) => {
              setActiveProjectId(id);
              setActiveTab('DASHBOARD');
            }}
            onOpenNewProject={canCreateDeleteProject ? () => setProjectModalState({ isOpen: true, project: null }) : undefined}
            canBulkDelete={canCreateDeleteProject}
            selectedProjectIds={selectedProjectIds}
            onToggleProjectSelection={handleToggleProjectSelection}
            onToggleAllProjectSelection={handleToggleAllProjectSelection}
            onBulkDeleteProjects={handleBulkDeleteProjects}
          />
        )}

        {activeTab === 'DASHBOARD' && activeProject && (
          <KPIDashboard
            project={activeProject}
            metrics={metrics || undefined}
            onOpenCustomizeWidgets={() => setIsWidgetCustomizerOpen(true)}
            onOpenAIAssistant={() => setIsAIAssistantOpen(true)}
            onOpenTaskModal={(taskId) => setTaskModalState({ isOpen: true, taskId })}
            onOpenMilestoneModal={(milestoneId) => setMilestoneModalState({ isOpen: true, milestoneId })}
            onOpenRiskModal={(riskId) => setRiskModalState({ isOpen: true, riskId })}
            onOpenProjectSettings={() => setProjectModalState({ isOpen: true, project: activeProject })}
            onChangeTab={handleTabChange}
            onToggleMilestone={handleToggleMilestone}
          />
        )}

        {activeTab === 'KANBAN' && activeProject && (
          <KanbanBoard
            project={activeProject}
            onOpenTaskModal={(taskId) => setTaskModalState({ isOpen: true, taskId })}
            onUpdateTaskStatus={handleUpdateTaskStatus}
            onDeleteTask={handleDeleteTask}
            onQuickAddTask={handleQuickAddTask}
          />
        )}

        {activeTab === 'GANTT' && activeProject && (
          <GanttTimeline
            project={activeProject}
            onOpenTaskModal={(taskId) => setTaskModalState({ isOpen: true, taskId })}
            onOpenMilestoneModal={(milestoneId) => setMilestoneModalState({ isOpen: true, milestoneId })}
          />
        )}

        {activeTab === 'TASKS' && activeProject && (
          <TaskListView
            project={activeProject}
            onOpenTaskModal={(taskId) => setTaskModalState({ isOpen: true, taskId })}
            onDeleteTask={handleDeleteTask}
            onUpdateTask={handleSaveTask}
          />
        )}

        {activeTab === 'RISKS' && activeProject && (
          <RiskMatrix
            project={activeProject}
            onOpenRiskModal={(riskId) => setRiskModalState({ isOpen: true, riskId })}
            onDeleteRisk={handleDeleteRisk}
            onUpdateRiskStatus={handleUpdateRiskStatus}
          />
        )}

        {activeTab === 'TEAM' && activeProject && (
          <TeamWorkload
            project={activeProject}
            currentUser={currentUser}
            onUpdateProject={handleUpdateProject}
            onOpenTaskModal={(taskId) => setTaskModalState({ isOpen: true, taskId })}
          />
        )}

        {activeTab === 'MY_TASKS' && (
          <ContributorPortal
            projects={projects}
            currentUser={currentUser}
            onUpdateTask={handleContributorTaskUpdate}
            onOpenTaskDetails={(taskId) => setTaskModalState({ isOpen: true, taskId })}
          />
        )}

        {activeTab === 'ADMIN' && (
          <AdminPage
            currentUser={currentUser}
            onClose={() => setActiveTab('DASHBOARD')}
          />
        )}

      </main>

      {/* Footer */}
      <footer className="border-t border-slate-200 bg-white py-4 px-6 text-center text-xs text-slate-500">
        Clarity PM
      </footer>

      {/* MODALS */}
      {/* 1. AI Assistant Modal */}
      {isAIAssistantOpen && activeProject && metrics && (
        <AIAssistantModal
          project={activeProject}
          metrics={metrics}
          onClose={() => setIsAIAssistantOpen(false)}
          onAddTasksToProject={handleAddTasksFromAI}
          onProjectUpdated={(updated) => { setProjects(prev => prev.map(p => p.id === updated.id ? updated : p)); setActiveProjectId(updated.id); }}
        />
      )}

      {/* 2. Widget Customizer Modal */}
      {isWidgetCustomizerOpen && activeProject && (
        <WidgetCustomizerModal
          project={activeProject}
          onClose={() => setIsWidgetCustomizerOpen(false)}
          onUpdateWidgets={handleUpdateWidgets}
        />
      )}

      {/* 3. Add/Edit Task Modal */}
      {taskModalState.isOpen && activeProject && (
        <AddEditTaskModal
          project={activeProject}
          taskId={taskModalState.taskId}
          onClose={() => setTaskModalState({ isOpen: false, taskId: null })}
          onSaveTask={handleSaveTask}
          onDeleteTask={handleDeleteTask}
        />
      )}

      {/* 4. Add/Edit Milestone Modal */}
      {milestoneModalState.isOpen && activeProject && (
        <AddEditMilestoneModal
          project={activeProject}
          milestoneId={milestoneModalState.milestoneId}
          onClose={() => setMilestoneModalState({ isOpen: false, milestoneId: null })}
          onSaveMilestone={handleSaveMilestone}
          onDeleteMilestone={handleDeleteMilestone}
        />
      )}

      {/* 5. Add/Edit Risk Modal */}
      {riskModalState.isOpen && activeProject && (
        <AddEditRiskModal
          project={activeProject}
          riskId={riskModalState.riskId}
          onClose={() => setRiskModalState({ isOpen: false, riskId: null })}
          onSaveRisk={handleSaveRisk}
          onDeleteRisk={handleDeleteRisk}
        />
      )}

      {/* 6. Add/Edit Project Modal */}
      {projectModalState.isOpen && (
        <AddEditProjectModal
          project={projectModalState.project}
          onClose={() => setProjectModalState({ isOpen: false, project: null })}
          onSaveProject={handleSaveProject}
          onDeleteProject={canCreateDeleteProject ? handleDeleteProject : undefined}
          canCreateDelete={canCreateDeleteProject}
          canEdit={canEditProject}
          projectManagers={projectManagers}
        />
      )}


      <JsonImportModal isOpen={isJsonImportOpen} onClose={() => setIsJsonImportOpen(false)} role={currentUser.role} onImported={async () => { const r=await fetch('/api/projects'); const d=await r.json(); if(r.ok&&Array.isArray(d.data)) setProjects(d.data); }} />

      {/* 7. Microsoft 365 / Entra ID Authentication Modal */}
      <MicrosoftAuthModal
        isOpen={isMicrosoftAuthOpen}
        onClose={() => setIsMicrosoftAuthOpen(false)}
        currentUser={currentUser}
        onLoginSuccess={(user) => {
          handleLoginSuccess(user);
        }}
        onLogout={handleLogout}
      />

    </div>
  );
};

export default App;
