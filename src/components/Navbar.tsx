import React, { useMemo } from 'react';
import { 
  FolderKanban, 
  Plus, 
  Sparkles, 
  Sliders, 
  Download, 
  Upload, 
  Layers, 
  LayoutDashboard, 
  Calendar, 
  ListTodo, 
  ShieldAlert, 
  Users, 
  Settings as SettingsIcon,
  CheckCircle2,
  AlertTriangle,
  Flame,
  ShieldCheck,
  User as UserIcon
} from 'lucide-react';
import { Project, ProjectMetrics, MicrosoftUser, UserRole } from '../types';
import { formatCurrency } from '../utils/pmCalculations';

interface NavbarProps {
  projects: Project[];
  activeProjectId: string;
  activeTab: string;
  metrics?: ProjectMetrics;
  currentUser: MicrosoftUser | null;
  onSelectProject: (id: string) => void;
  onChangeTab: (tab: string) => void;
  onOpenNewProject: () => void;
  onOpenJsonImport: () => void;
  onOpenAI: () => void;
  onOpenCustomizer: () => void;
  onOpenSettings: () => void;
  onOpenMicrosoftAuth: () => void;
  onOpenLoginPage: () => void;
  onLogout: () => void;
  onExportData: () => void;
  isPortfolioView: boolean;
  onTogglePortfolioView: (isPortfolio: boolean) => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  projects,
  activeProjectId,
  activeTab,
  metrics,
  currentUser,
  onSelectProject,
  onChangeTab,
  onOpenNewProject,
  onOpenJsonImport,
  onOpenAI,
  onOpenCustomizer,
  onOpenSettings,
  onOpenMicrosoftAuth,
  onOpenLoginPage,
  onLogout,
  onExportData,
  isPortfolioView,
  onTogglePortfolioView,
}) => {
  const currentProject = projects.find((p) => p.id === activeProjectId) || projects[0];

  const getStatusBadge = () => {
    if (!currentProject) return null;
    switch (currentProject.status) {
      case 'IN_PROGRESS':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-600 border border-emerald-500/20">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            En cours
          </span>
        );
      case 'AT_RISK':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-500/10 text-rose-600 border border-rose-500/20">
            <AlertTriangle className="w-3 h-3 text-rose-500" />
            Risque Élevé
          </span>
        );
      case 'PLANNING':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-500/10 text-blue-600 border border-blue-500/20">
            Cadrage / Planification
          </span>
        );
      case 'COMPLETED':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-purple-500/10 text-purple-600 border border-purple-500/20">
            <CheckCircle2 className="w-3 h-3" />
            Terminé
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-600 border border-amber-500/20">
            En pause
          </span>
        );
    }
  };

  const criticalRisks = metrics?.criticalRisksCount ?? 0;
  const userRole: UserRole = currentUser?.role || 'CHEF_PROJET';

  // Role-Based Navigation Matrix
  const navTabs = useMemo(() => {
    switch (userRole) {
      case 'ADMINISTRATEUR':
        return [
          { id: 'admin', label: 'Console d’Administration & Sécurité', icon: ShieldCheck },
        ];
      case 'DIRECTEUR_PROJETS':
        return [
          { id: 'portfolio', label: 'Portefeuille Multi-Projets', icon: Layers },
          { id: 'dashboard', label: 'Tableau de Bord Stratégique & KPIs', icon: LayoutDashboard },
          { id: 'risks', label: 'Matrice des Risques Portefeuille', icon: ShieldAlert, badge: criticalRisks > 0 ? criticalRisks : undefined },
          { id: 'workload', label: 'Charge & Capacité des Équipes', icon: Users },
        ];
      case 'PMO':
        return [
          { id: 'portfolio', label: 'Portefeuille & Gouvernance', icon: Layers },
          { id: 'dashboard', label: 'Audit EVM & Courbes en S', icon: LayoutDashboard },
          { id: 'gantt', label: 'Jalons Stratégiques & Délais', icon: Calendar },
          { id: 'tasks', label: 'Audit WBS & Livrables', icon: ListTodo },
          { id: 'risks', label: 'Revue des Risques & Alertes', icon: ShieldAlert, badge: criticalRisks > 0 ? criticalRisks : undefined },
        ];
      case 'CONTRIBUTEUR':
        return [
          { id: 'my_tasks', label: 'Mes Tâches & Mon Temps', icon: ListTodo },
        ];
      case 'CHEF_PROJET':
      default:
        return [
          { id: 'dashboard', label: 'Tableau de bord & KPIs', icon: LayoutDashboard },
          { id: 'kanban', label: 'Tableau Kanban', icon: FolderKanban },
          { id: 'gantt', label: 'Chronogramme Gantt', icon: Calendar },
          { id: 'tasks', label: 'Grille WBS & Tâches', icon: ListTodo },
          { id: 'risks', label: 'Matrice des Risques', icon: ShieldAlert, badge: criticalRisks > 0 ? criticalRisks : undefined },
          { id: 'workload', label: 'Charge & Ressources', icon: Users },
        ];
    }
  }, [userRole, criticalRisks]);

  const getRoleBadge = (role: UserRole) => {
    switch (role) {
      case 'ADMINISTRATEUR':
        return { label: '🛡️ Administrateur Système', color: 'bg-rose-50 text-rose-700 border-rose-200' };
      case 'DIRECTEUR_PROJETS':
        return { label: '⭐ Directeur de Projets', color: 'bg-purple-50 text-purple-700 border-purple-200' };
      case 'PMO':
        return { label: '📊 PMO & Gouvernance', color: 'bg-emerald-50 text-emerald-700 border-emerald-200' };
      case 'CONTRIBUTEUR':
        return { label: '👤 Contributeur', color: 'bg-blue-50 text-blue-700 border-blue-200' };
      case 'CHEF_PROJET':
      default:
        return { label: '🚀 Chef de Projet', color: 'bg-indigo-50 text-indigo-700 border-indigo-200' };
    }
  };

  return (
    <header className="bg-white border-b border-slate-200 sticky top-0 z-30 shadow-xs">
      {/* Top Header Strip */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 gap-4">
          
          {/* Logo & Project Selector or Role Label */}
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2.5 bg-slate-900 text-white px-3 py-1.5 rounded-xl shadow-xs">
              <div className="p-1 rounded-lg bg-indigo-600 text-white">
                <Layers className="w-5 h-5" />
              </div>
              <div>
                <span className="font-bold text-sm tracking-tight block leading-none">CLARITY PM</span>
              </div>
            </div>

            <div className="h-6 w-px bg-slate-200 hidden sm:block" />

            {/* If Admin: Show dedicated Admin Console badge */}
            {userRole === 'ADMINISTRATEUR' ? (
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-rose-800 bg-rose-50 px-3 py-1 rounded-lg border border-rose-200 flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4 text-rose-600" />
                  <span>Console d’Administration & Sécurité</span>
                </span>
              </div>
            ) : userRole === 'CONTRIBUTEUR' ? (
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-blue-800 bg-blue-50 px-3 py-1 rounded-lg border border-blue-200">
                  Espace Collaborateur
                </span>
              </div>
            ) : !isPortfolioView ? (
              <div className="flex items-center gap-2">
                <select
                  id="project-selector"
                  value={activeProjectId}
                  onChange={(e) => onSelectProject(e.target.value)}
                  className="bg-slate-50 border border-slate-300 text-slate-900 text-sm font-semibold rounded-lg focus:ring-indigo-500 focus:border-indigo-500 block py-1.5 px-3 max-w-[240px] sm:max-w-xs truncate cursor-pointer hover:bg-slate-100 transition-colors"
                >
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      [{p.code}] {p.name}
                    </option>
                  ))}
                </select>
                {getStatusBadge()}
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-slate-800 bg-indigo-50 text-indigo-700 px-3 py-1 rounded-lg border border-indigo-200">
                  Vue Portefeuille Global ({projects.length} Projets)
                </span>
              </div>
            )}
          </div>

          {/* Quick Actions according to Role */}
          <div className="flex items-center gap-2 sm:gap-3">
            
            {/* Toggle Portfolio for Director and PMO */}
            {(userRole === 'DIRECTEUR_PROJETS' || userRole === 'PMO') && (
              <button
                id="btn-toggle-portfolio"
                onClick={() => onTogglePortfolioView(!isPortfolioView)}
                className={`text-xs font-semibold px-3 py-1.5 rounded-lg border transition-all flex items-center gap-1.5 ${
                  isPortfolioView 
                    ? 'bg-indigo-600 text-white border-indigo-700 shadow-xs' 
                    : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                }`}
              >
                <Layers className="w-3.5 h-3.5" />
                <span className="hidden md:inline">{isPortfolioView ? 'Vue Projet Unitaire' : 'Vue Portefeuille'}</span>
              </button>
            )}

            {/* AI Copilot Button (Project Manager and Director) */}
            {(userRole === 'CHEF_PROJET' || userRole === 'DIRECTEUR_PROJETS' || userRole === 'PMO') && (
              <button
                id="btn-open-pm-ai"
                onClick={onOpenAI}
                className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600 text-white hover:opacity-95 shadow-sm transition-all flex items-center gap-1.5 cursor-pointer active:scale-95"
              >
                <Sparkles className="w-3.5 h-3.5 animate-pulse" />
                <span className="hidden sm:inline">Assistant IA PM</span>
              </button>
            )}

            {/* Customize KPIs (Project Manager & Director) */}
            {(userRole === 'CHEF_PROJET' || userRole === 'DIRECTEUR_PROJETS') && !isPortfolioView && (
              <button
                id="btn-customize-kpis"
                onClick={onOpenCustomizer}
                title="Personnaliser les indicateurs KPI et widgets"
                className="p-1.5 sm:px-2.5 sm:py-1.5 text-xs font-medium text-slate-700 bg-slate-50 border border-slate-300 hover:bg-slate-100 rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer"
              >
                <Sliders className="w-3.5 h-3.5 text-slate-600" />
                <span className="hidden lg:inline">Personnaliser KPIs</span>
              </button>
            )}

            {/* New Project (Director of Projects and PMO only) */}
            {userRole === 'DIRECTEUR_PROJETS' && (
              <button
                id="btn-new-project"
                onClick={onOpenNewProject}
                className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-slate-900 text-white hover:bg-slate-800 transition-colors flex items-center gap-1 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Nouveau Projet</span>
              </button>
            )}

            {/* Import JSON contrôlé par rôle */}
            {userRole !== 'ADMINISTRATEUR' && (
              <button
                id="btn-import-json"
                onClick={onOpenJsonImport}
                title="Importer des projets, tâches ou jalons en JSON"
                className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-indigo-50 text-indigo-700 border border-indigo-200 hover:bg-indigo-100 transition-colors flex items-center gap-1 cursor-pointer"
              >
                <Upload className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Importer JSON</span>
              </button>
            )}

            {/* Settings & Data IO (Only for Project Managers / PMO / Director) */}
            {userRole !== 'CONTRIBUTEUR' && userRole !== 'ADMINISTRATEUR' && (
              <div className="flex items-center gap-1 border-l border-slate-200 pl-2">
                <button
                  id="btn-export-backup"
                  onClick={onExportData}
                  title="Exporter les données du projet (JSON)"
                  className="p-1.5 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors"
                >
                  <Download className="w-4 h-4" />
                </button>

                <button
                  id="btn-project-settings"
                  onClick={onOpenSettings}
                  title="Paramètres du projet"
                  className="p-1.5 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors"
                >
                  <SettingsIcon className="w-4 h-4" />
                </button>
              </div>
            )}

            {/* User Profile & Role Switcher */}
            <div className="flex items-center gap-1.5 border-l border-slate-200 pl-2">
              {currentUser && (
                <div className="flex items-center gap-1.5">
                  <button
                    id="btn-microsoft-user-profile"
                    onClick={onOpenMicrosoftAuth}
                    className="flex items-center gap-2 p-1 pl-1.5 pr-2.5 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-full transition-all cursor-pointer group shadow-2xs"
                    title={`Connecté en tant que ${currentUser.displayName} (${getRoleBadge(userRole).label}) - Cliquer pour gérer`}
                  >
                    <div className="relative">
                      <img
                        src={currentUser.avatarUrl || `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(currentUser.displayName)}`}
                        alt={currentUser.displayName}
                        className="w-6 h-6 rounded-full object-cover bg-indigo-600 border border-white"
                      />
                      <span className="absolute -bottom-0.5 -right-0.5 w-2 h-2 bg-emerald-500 rounded-full ring-1 ring-white" />
                    </div>
                    <div className="text-left hidden xl:block">
                      <span className="text-xs font-bold text-slate-800 block leading-tight truncate max-w-[110px]">
                        {currentUser.displayName.split(' ')[0]}
                      </span>
                      <span className="text-[10px] font-bold block leading-none text-indigo-600">
                        {userRole === 'ADMINISTRATEUR' ? '🛡️ Admin' :
                         userRole === 'DIRECTEUR_PROJETS' ? '⭐ Dir. Projets' :
                         userRole === 'PMO' ? '📊 PMO' :
                         userRole === 'CONTRIBUTEUR' ? '👤 Contributeur' : '🚀 Chef Projet'}
                      </span>
                    </div>
                  </button>

                  <button
                    id="btn-nav-logout"
                    onClick={onLogout}
                    title="Se déconnecter"
                    className="flex items-center gap-1 px-2.5 py-1.5 text-slate-600 hover:text-rose-600 hover:bg-rose-50 rounded-lg text-xs font-medium border border-slate-200 transition-colors cursor-pointer"
                  >
                    <span>Déconnexion</span>
                  </button>
                </div>
              )}
            </div>

          </div>
        </div>

        {/* Navigation Tabs Bar */}
        <div className="flex items-center space-x-1 sm:space-x-2 overflow-x-auto py-1.5 scrollbar-none border-t border-slate-100">
          {navTabs.map((tab) => {
            const Icon = tab.icon;
            const currentTabLower = (activeTab || '').toLowerCase();
            const tabIdLower = tab.id.toLowerCase();
            const isActive = 
              currentTabLower === tabIdLower || 
              (tabIdLower === 'workload' && currentTabLower === 'team') ||
              (tabIdLower === 'team' && currentTabLower === 'workload') ||
              (tabIdLower === 'my_tasks' && currentTabLower === 'contributor');
            return (
              <button
                key={tab.id}
                id={`nav-tab-${tab.id}`}
                onClick={() => onChangeTab(tab.id)}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all whitespace-nowrap cursor-pointer ${
                  isActive
                    ? 'bg-indigo-50 text-indigo-700 shadow-2xs font-bold border border-indigo-200/60'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/70'
                }`}
              >
                <Icon className={`w-3.5 h-3.5 ${isActive ? 'text-indigo-600' : 'text-slate-500'}`} />
                <span>{tab.label}</span>
                {tab.badge !== undefined && (
                  <span className="ml-1 px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-rose-500 text-white">
                    {tab.badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </header>
  );
};
