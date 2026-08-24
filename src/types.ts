export type ProjectStatus = 'PLANNING' | 'IN_PROGRESS' | 'ON_HOLD' | 'COMPLETED' | 'AT_RISK';
export type PriorityLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
export type TaskStatus = 'TODO' | 'IN_PROGRESS' | 'REVIEW' | 'DONE' | 'BLOCKED';
export type Methodology = 'AGILE' | 'WATERFALL' | 'HYBRID';
export type RiskCategory = 'TECHNIQUE' | 'BUDGET' | 'DELAIS' | 'RESSOURCES' | 'JURIDIQUE' | 'EXTERNE';
export type RiskStatus = 'ACTIVE' | 'MITIGATED' | 'CLOSED' | 'OCCURRED';

export interface Subtask {
  id: string;
  title: string;
  completed: boolean;
}

export interface Task {
  id: string;
  projectId: string;
  title: string;
  description?: string;
  status: TaskStatus;
  priority: PriorityLevel;
  assigneeId?: string;
  milestoneId?: string;
  startDate: string; // ISO format YYYY-MM-DD
  dueDate: string;   // ISO format YYYY-MM-DD
  estimatedHours: number;
  actualHours: number;
  completionPercent: number; // 0 - 100
  costEstimated?: number;
  costActual?: number;
  category?: string;
  tags: string[];
  subtasks?: Subtask[];
  predecessorIds?: string[]; // IDs of tasks that must finish before this starts
}

export interface Milestone {
  id: string;
  projectId: string;
  title: string;
  targetDate: string;
  actualDate?: string;
  completed: boolean;
  description?: string;
  deliverable?: string;
  deliverables?: string[];
}

export interface Risk {
  id: string;
  projectId: string;
  title: string;
  description?: string;
  category: RiskCategory;
  probability: number; // 1 to 5
  impact: number;      // 1 to 5
  mitigationPlan: string;
  contingencyPlan?: string;
  ownerId?: string;
  financialImpact?: number;
  status: RiskStatus;
  identifiedDate?: string;
}

export interface TeamMember {
  id: string;
  name: string;
  role: string;
  email: string;
  avatarUrl?: string;
  hourlyRate: number;
  maxWeeklyHours: number;
  color: string;
}

export type WidgetType = 
  | 'STAT_CARD' 
  | 'EARNED_VALUE_CHART' 
  | 'BURNDOWN_CHART' 
  | 'WORKLOAD_BAR' 
  | 'TASK_STATUS_PIE' 
  | 'RISK_HEATMAP' 
  | 'MILESTONE_TIMELINE' 
  | 'BUDGET_BURN_GAUGE' 
  | 'SPI_CPI_RADAR';

export interface KPIWidget {
  id: string;
  type: WidgetType;
  title: string;
  description?: string;
  metricKey?: string;
  size: 'SMALL' | 'MEDIUM' | 'LARGE' | 'FULL';
  isVisible: boolean;
  order: number;
  thresholds?: {
    greenMin?: number;
    amberMin?: number;
    target?: number;
  };
}

export interface Project {
  id: string;
  code: string;
  name: string;
  description: string;
  client?: string;
  managerName: string;
  managerId?: string;
  status: ProjectStatus;
  priority: PriorityLevel;
  methodology: Methodology;
  startDate: string;
  endDate: string;
  totalBudget: number; // BAC (Budget at Completion)
  currency: string;
  members: TeamMember[];
  tasks: Task[];
  milestones: Milestone[];
  risks: Risk[];
  kpiWidgets: KPIWidget[];
  createdAt: string;
  updatedAt: string;
}

export interface ProjectMetrics {
  // Earned Value Management (EVM)
  BAC: number; // Budget at Completion (Budget total alloué)
  PV: number;  // Planned Value (Valeur planifiée à date)
  EV: number;  // Earned Value (Valeur acquise)
  AC: number;  // Actual Cost (Coût réel constaté)
  CV: number;  // Cost Variance (EV - AC)
  SV: number;  // Schedule Variance (EV - PV)
  CPI: number; // Cost Performance Index (EV / AC)
  SPI: number; // Schedule Performance Index (EV / PV)
  EAC: number; // Estimate at Completion (BAC / CPI)
  ETC: number; // Estimate to Complete (EAC - AC)
  VAC: number; // Variance at Completion (BAC - EAC)
  
  // Progress & Counts
  progressPercent: number;
  totalTasks: number;
  completedTasks: number;
  inProgressTasks: number;
  blockedTasks: number;
  overdueTasks: number;
  
  // Hours
  totalEstimatedHours: number;
  totalActualHours: number;
  
  // Health & Risks
  healthScore: number; // 0 to 100
  healthStatus: 'HEALTHY' | 'WARNING' | 'CRITICAL';
  criticalRisksCount: number;
  totalRisksCount: number;
  
  // Milestones
  completedMilestones: number;
  totalMilestones: number;
}

export type UserRole = 'DIRECTEUR_PROJETS' | 'CHEF_PROJET' | 'PMO' | 'CONTRIBUTEUR' | 'ADMINISTRATEUR';

export interface MicrosoftUser {
  id: string;
  displayName: string;
  email: string;
  role?: UserRole;
  jobTitle?: string;
  department?: string;
  officeLocation?: string;
  avatarUrl?: string;
  tenantId?: string;
  authProvider: 'MICROSOFT_ENTRA' | 'MICROSOFT_LIVE' | 'LOCAL' | 'DEMO';
  connectedAt: string;
}


export interface UserProfile {
  id: string;
  email: string;
  displayName: string;
  role: UserRole;
  jobTitle?: string;
  department?: string;
  officeLocation?: string;
  avatarUrl?: string;
  azureOid?: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AuthState {
  isAuthenticated: boolean;
  user: MicrosoftUser | null;
  isLoading: boolean;
  isConfigured: boolean;
}

export interface ActiveDirectoryConfig {
  tenantId: string;
  clientId: string;
  clientSecretConfigured: boolean;
  domain: string;
  syncIntervalHours: number;
  autoProvisionUsers: boolean;
  defaultRole: UserRole;
  lastSyncAt?: string;
  syncStatus: 'SUCCESS' | 'WARNING' | 'FAILED' | 'NEVER';
  syncedUsersCount: number;
}

export interface PostgresConfig {
  host: string;
  port: number;
  database: string;
  user: string;
  passwordConfigured: boolean;
  sslMode: 'require' | 'prefer' | 'disable';
  maxPoolSize: number;
  idleTimeoutMillis: number;
  connectionStatus: 'CONNECTED' | 'DISCONNECTED' | 'CONNECTING' | 'ERROR';
  lastTestedAt?: string;
  lastSyncAt?: string;
  latencyMs?: number;
  tableStats?: {
    projects: number;
    tasks: number;
    resources: number;
    risks: number;
    milestones: number;
  };
}

export interface IACopilotConfig {
  provider: 'GEMINI_PRO' | 'OPENAI' | 'AZURE_OPENAI' | 'GEMINI' | 'OPENAI_COMPATIBLE' | 'ANTHROPIC';
  model: string;
  baseUrl?: string;
  apiKeyConfigured: boolean;
  temperature: number;
  maxOutputTokens: number;
  contextWindow: number;
  features: {
    wbsGeneration: boolean;
    copilReporting: boolean;
    earnedValueAudit: boolean;
    riskPrediction: boolean;
    resourceBalancing: boolean;
  };
  totalCallsMonth: number;
  avgLatencyMs: number;
  successRate: number;
  lastUsedAt?: string;
}

export interface SystemAdminSettings {
  activeDirectory: ActiveDirectoryConfig;
  postgres: PostgresConfig;
  copilot: IACopilotConfig;
  governance: {
    directorCanManageProjects: boolean;
    directorCanAllocateResources: boolean;
    requireDirectorApprovalForBudget: boolean;
    maxProjectsPerDirector: number;
    auditLogRetentionDays: number;
  };
}
