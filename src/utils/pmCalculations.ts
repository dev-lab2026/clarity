import { Project, ProjectMetrics } from '../types';

export function calculateProjectMetrics(project: Project): ProjectMetrics {
  const defaultMetrics: ProjectMetrics = {
    BAC: 0,
    PV: 0,
    EV: 0,
    AC: 0,
    CV: 0,
    SV: 0,
    CPI: 1,
    SPI: 1,
    EAC: 0,
    ETC: 0,
    VAC: 0,
    progressPercent: 0,
    totalTasks: 0,
    completedTasks: 0,
    inProgressTasks: 0,
    blockedTasks: 0,
    overdueTasks: 0,
    totalEstimatedHours: 0,
    totalActualHours: 0,
    healthScore: 100,
    healthStatus: 'HEALTHY',
    criticalRisksCount: 0,
    totalRisksCount: 0,
    completedMilestones: 0,
    totalMilestones: 0,
  };

  if (!project) {
    return defaultMetrics;
  }

  const BAC = project.totalBudget || 0;
  const tasks = project.tasks || [];
  const milestones = project.milestones || [];
  const risks = project.risks || [];

  const totalTasks = tasks.length;
  const completedTasks = tasks.filter((t) => t.status === 'DONE').length;
  const inProgressTasks = tasks.filter((t) => t.status === 'IN_PROGRESS' || t.status === 'REVIEW').length;
  const blockedTasks = tasks.filter((t) => t.status === 'BLOCKED').length;

  const todayStr = new Date().toISOString().split('T')[0];
  const overdueTasks = tasks.filter(
    (t) => t.status !== 'DONE' && t.dueDate && t.dueDate < todayStr
  ).length;

  // Total Hours
  const totalEstimatedHours = tasks.reduce((sum, t) => sum + (Number(t.estimatedHours) || 0), 0);
  const totalActualHours = tasks.reduce((sum, t) => sum + (Number(t.actualHours) || 0), 0);

  // Overall Completion % (weighted by estimated hours or uniform if 0)
  let progressPercent = 0;
  if (totalEstimatedHours > 0) {
    const earnedHours = tasks.reduce((sum, t) => {
      const completion = t.status === 'DONE' ? 100 : (t.completionPercent || 0);
      return sum + ((Number(t.estimatedHours) || 0) * (completion / 100));
    }, 0);
    progressPercent = Math.round((earnedHours / totalEstimatedHours) * 100);
  } else if (totalTasks > 0) {
    progressPercent = Math.round((completedTasks / totalTasks) * 100);
  }

  // Earned Value (EV) = Progress % * BAC
  const EV = Math.round((progressPercent / 100) * BAC);

  // Planned Value (PV) = Theoretical expected progress based on timeline elapsed
  const startDate = new Date(project.startDate).getTime();
  const endDate = new Date(project.endDate).getTime();
  const now = new Date().getTime();
  
  let plannedRatio = 0;
  if (endDate > startDate) {
    if (now >= endDate) {
      plannedRatio = 1;
    } else if (now <= startDate) {
      plannedRatio = 0.05;
    } else {
      plannedRatio = (now - startDate) / (endDate - startDate);
    }
  } else {
    plannedRatio = 0.5;
  }
  const PV = Math.round(plannedRatio * BAC);

  // Actual Cost (AC) = explicit task actual costs OR logged hours * blended member rate
  let computedAC = 0;
  const memberRateMap = new Map<string, number>();
  (project.members || []).forEach((m) => {
    memberRateMap.set(m.id, m.hourlyRate || 75);
  });

  tasks.forEach((t) => {
    if (t.costActual !== undefined && t.costActual > 0) {
      computedAC += Number(t.costActual);
    } else {
      const rate = t.assigneeId ? (memberRateMap.get(t.assigneeId) || 75) : 75;
      computedAC += (Number(t.actualHours) || 0) * rate;
    }
  });

  // If computedAC is 0 but tasks are done and budget exists, provide sensible proportion
  const AC = computedAC > 0 ? computedAC : Math.round((progressPercent / 100) * BAC * 0.95);

  // Cost Variance (CV) = EV - AC
  const CV = EV - AC;

  // Schedule Variance (SV) = EV - PV
  const SV = EV - PV;

  // Cost Performance Index (CPI) = EV / AC (safeguarded)
  const CPI = AC > 0 ? Number((EV / AC).toFixed(2)) : 1.0;

  // Schedule Performance Index (SPI) = EV / PV (safeguarded)
  const SPI = PV > 0 ? Number((EV / PV).toFixed(2)) : 1.0;

  // Estimate At Completion (EAC)
  const EAC = CPI > 0 ? Math.round(BAC / CPI) : BAC;

  // Estimate To Complete (ETC)
  const ETC = Math.max(0, EAC - AC);

  // Variance At Completion (VAC)
  const VAC = BAC - EAC;

  // Critical Risks
  const criticalRisksCount = risks.filter(
    (r) => r.status === 'ACTIVE' && r.probability * r.impact >= 15
  ).length;
  const totalRisksCount = risks.length;

  // Milestones
  const completedMilestones = milestones.filter((m) => m.completed).length;
  const totalMilestones = milestones.length;

  // Composite Health Score (0 - 100)
  // Factors: SPI (30 pts), CPI (30 pts), Overdue penalty (20 pts), Critical Risks penalty (20 pts)
  let healthScore = 100;
  
  // SPI scoring (ideal >= 1.0)
  if (SPI >= 1.0) healthScore -= 0;
  else if (SPI >= 0.9) healthScore -= 8;
  else if (SPI >= 0.8) healthScore -= 18;
  else healthScore -= 30;

  // CPI scoring (ideal >= 1.0)
  if (CPI >= 1.0) healthScore -= 0;
  else if (CPI >= 0.9) healthScore -= 8;
  else if (CPI >= 0.8) healthScore -= 18;
  else healthScore -= 30;

  // Overdue Tasks penalty
  if (overdueTasks > 0) {
    const overduePenalty = Math.min(25, overdueTasks * 6);
    healthScore -= overduePenalty;
  }

  // Blocked Tasks penalty
  if (blockedTasks > 0) {
    healthScore -= Math.min(15, blockedTasks * 5);
  }

  // Critical Risks penalty
  if (criticalRisksCount > 0) {
    healthScore -= Math.min(20, criticalRisksCount * 8);
  }

  healthScore = Math.max(10, Math.min(100, Math.round(healthScore)));

  let healthStatus: 'HEALTHY' | 'WARNING' | 'CRITICAL' = 'HEALTHY';
  if (healthScore < 60 || SPI < 0.8 || CPI < 0.8 || criticalRisksCount >= 2) {
    healthStatus = 'CRITICAL';
  } else if (healthScore < 80 || SPI < 0.95 || CPI < 0.95 || overdueTasks > 0) {
    healthStatus = 'WARNING';
  }

  return {
    BAC,
    PV,
    EV,
    AC,
    CV,
    SV,
    CPI,
    SPI,
    EAC,
    ETC,
    VAC,
    progressPercent,
    totalTasks,
    completedTasks,
    inProgressTasks,
    blockedTasks,
    overdueTasks,
    totalEstimatedHours,
    totalActualHours,
    healthScore,
    healthStatus,
    criticalRisksCount,
    totalRisksCount,
    completedMilestones,
    totalMilestones,
  };
}

// Generate S-Curve EVM Historical & Forecast Trend Data
export function generateSCurveData(project: Project) {
  const metrics = calculateProjectMetrics(project);
  const start = new Date(project.startDate);
  const end = new Date(project.endDate);
  const totalMonths = Math.max(3, Math.round((end.getTime() - start.getTime()) / (30 * 24 * 3600 * 1000)));

  const data = [];
  const BAC = metrics.BAC;

  for (let i = 0; i <= totalMonths; i++) {
    const datePoint = new Date(start);
    datePoint.setMonth(datePoint.getMonth() + i);
    const label = datePoint.toLocaleDateString('fr-FR', { month: 'short', year: '2-digit' });

    // Sigmoid / S-curve theoretical accumulation for PV
    const ratio = i / totalMonths;
    // S-curve formula: 3*x^2 - 2*x^3
    const sCurveFactor = 3 * Math.pow(ratio, 2) - 2 * Math.pow(ratio, 3);
    const pvVal = Math.round(sCurveFactor * BAC);

    // EV & AC for past and current
    const currentMonthIndex = Math.min(totalMonths, Math.max(1, Math.round((new Date().getTime() - start.getTime()) / (30 * 24 * 3600 * 1000))));
    
    let evVal: number | null = null;
    let acVal: number | null = null;
    let forecastVal: number | null = null;

    if (i <= currentMonthIndex) {
      const progressAtI = (i / currentMonthIndex) * (metrics.progressPercent / 100);
      evVal = Math.round(progressAtI * BAC);
      acVal = Math.round(evVal / (metrics.CPI || 1));
    } else {
      // Forecast projection
      const remainingProgress = (i - currentMonthIndex) / (totalMonths - currentMonthIndex);
      forecastVal = Math.round(metrics.EV + remainingProgress * (metrics.EAC - metrics.AC));
    }

    data.push({
      month: label,
      PV: pvVal,
      EV: evVal,
      AC: acVal,
      Forecast: forecastVal,
    });
  }

  return data;
}

// Format currency
export function formatCurrency(amount: number, currency: string = '€'): string {
  return new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency: currency === '€' ? 'EUR' : currency === '$' ? 'USD' : 'EUR',
    maximumFractionDigits: 0,
  }).format(amount);
}

// Format date in French
export function formatDateFR(dateStr?: string): string {
  if (!dateStr) return '-';
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch {
    return dateStr;
  }
}
