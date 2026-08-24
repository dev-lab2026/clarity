import pg from 'pg';
import crypto from 'node:crypto';
import { Project, Task, TeamMember, Risk, Milestone, MicrosoftUser, UserProfile, UserRole } from '../types';
import { INITIAL_PROJECTS } from '../data/initialData';

const { Pool } = pg;
let poolInstance: pg.Pool | null = null;

export function getPgPool(): pg.Pool | null {
  if (poolInstance) return poolInstance;
  const connectionString = process.env.DATABASE_URL;
  const host = process.env.POSTGRES_HOST;
  if (!connectionString && !host) return null;
  poolInstance = new Pool(connectionString ? {
    connectionString,
    ssl: process.env.POSTGRES_SSL === 'disable' ? false : { rejectUnauthorized: false },
    max: Number(process.env.POSTGRES_POOL_MAX || 20),
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
  } : {
    host,
    port: Number(process.env.POSTGRES_PORT) || 5432,
    database: process.env.POSTGRES_DB || 'clarity_pm_enterprise',
    user: process.env.POSTGRES_USER || 'postgres',
    password: process.env.POSTGRES_PASSWORD || '',
    ssl: process.env.POSTGRES_SSL === 'disable' ? false : { rejectUnauthorized: false },
    max: Number(process.env.POSTGRES_POOL_MAX || 20),
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
  });
  poolInstance.on('error', (err) => console.error('PostgreSQL pool error:', err.message));
  return poolInstance;
}

type AuditLog = {
  id: string;
  userId?: string;
  userEmail?: string;
  userRole?: string;
  action: string;
  entityType: string;
  entityId?: string;
  details?: unknown;
  createdAt: string;
};

class ProjectStore {
  private projects = new Map<string, Project>();
  private auditLogs: AuditLog[] = [];
  private persistent = false;

  constructor() {
    INITIAL_PROJECTS.forEach((p) => this.projects.set(p.id, structuredClone(p)));
  }

  async initialize() {
    const pool = getPgPool();
    if (!pool) {
      if (process.env.NODE_ENV === 'production' && process.env.REQUIRE_DATABASE !== 'false') {
        throw new Error('DATABASE_URL/POSTGRES_* est requis en production.');
      }
      console.warn('PostgreSQL non configuré: mode mémoire autorisé uniquement hors production.');
      return;
    }
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id VARCHAR(64) PRIMARY KEY,
        email VARCHAR(255) UNIQUE NOT NULL,
        display_name VARCHAR(255) NOT NULL,
        role VARCHAR(32) NOT NULL DEFAULT 'CHEF_PROJET',
        job_title VARCHAR(150),
        department VARCHAR(150),
        office_location VARCHAR(150),
        avatar_url TEXT,
        azure_oid VARCHAR(128) UNIQUE,
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
      CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
      CREATE TABLE IF NOT EXISTS project_documents (
        id VARCHAR(128) PRIMARY KEY,
        document JSONB NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS app_audit_logs (
        id UUID PRIMARY KEY,
        user_id VARCHAR(128), user_email VARCHAR(320), user_role VARCHAR(64),
        action VARCHAR(128) NOT NULL, entity_type VARCHAR(64) NOT NULL, entity_id VARCHAR(128),
        details JSONB, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_app_audit_logs_created_at ON app_audit_logs(created_at DESC);
    `);
    const projects = await pool.query<{ id: string; document: Project }>('SELECT id, document FROM project_documents ORDER BY id');
    if (projects.rows.length === 0) {
      for (const p of this.projects.values()) await this.persistProject(p);
    } else {
      this.projects.clear();
      for (const row of projects.rows) this.projects.set(row.id, row.document);
    }
    const logs = await pool.query<any>('SELECT id, user_id, user_email, user_role, action, entity_type, entity_id, details, created_at FROM app_audit_logs ORDER BY created_at DESC LIMIT 500');
    this.auditLogs = logs.rows.map((r) => ({ id: r.id, userId: r.user_id, userEmail: r.user_email, userRole: r.user_role, action: r.action, entityType: r.entity_type, entityId: r.entity_id, details: r.details, createdAt: new Date(r.created_at).toISOString() }));
    this.persistent = true;
  }

  private async persistProject(project: Project) {
    const pool = getPgPool();
    if (!pool) return;
    await pool.query(`INSERT INTO project_documents(id, document) VALUES($1,$2) ON CONFLICT(id) DO UPDATE SET document=EXCLUDED.document, updated_at=NOW()`, [project.id, JSON.stringify(project)]);
  }

  private async removeProject(id: string) {
    const pool = getPgPool();
    if (pool) await pool.query('DELETE FROM project_documents WHERE id=$1', [id]);
  }

  private async persistAudit(log: AuditLog) {
    const pool = getPgPool();
    if (!pool) return;
    await pool.query(`INSERT INTO app_audit_logs(id,user_id,user_email,user_role,action,entity_type,entity_id,details,created_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`, [log.id, log.userId || null, log.userEmail || null, log.userRole || null, log.action, log.entityType, log.entityId || null, log.details ? JSON.stringify(log.details) : null, log.createdAt]);
  }

  private mapUser(row: any): UserProfile {
    return {
      id: String(row.id),
      email: String(row.email),
      displayName: String(row.display_name),
      role: row.role as UserRole,
      jobTitle: row.job_title || undefined,
      department: row.department || undefined,
      officeLocation: row.office_location || undefined,
      avatarUrl: row.avatar_url || undefined,
      azureOid: row.azure_oid || undefined,
      isActive: Boolean(row.is_active),
      createdAt: new Date(row.created_at).toISOString(),
      updatedAt: new Date(row.updated_at).toISOString(),
    };
  }

  async listUsers(): Promise<UserProfile[]> {
    const pool = getPgPool();
    if (!pool) return [];
    const result = await pool.query(`SELECT id,email,display_name,role,job_title,department,office_location,avatar_url,azure_oid,is_active,created_at,updated_at FROM users ORDER BY display_name ASC`);
    return result.rows.map((r) => this.mapUser(r));
  }

  async getUserById(id: string): Promise<UserProfile | null> {
    const pool = getPgPool();
    if (!pool) return null;
    const result = await pool.query(`SELECT id,email,display_name,role,job_title,department,office_location,avatar_url,azure_oid,is_active,created_at,updated_at FROM users WHERE id=$1`, [id]);
    return result.rows[0] ? this.mapUser(result.rows[0]) : null;
  }

  async getUserByEmail(email: string): Promise<UserProfile | null> {
    const pool = getPgPool();
    if (!pool) return null;
    const result = await pool.query(`SELECT id,email,display_name,role,job_title,department,office_location,avatar_url,azure_oid,is_active,created_at,updated_at FROM users WHERE lower(email)=lower($1)`, [email]);
    return result.rows[0] ? this.mapUser(result.rows[0]) : null;
  }

  async getUserByAzureOid(azureOid: string): Promise<UserProfile | null> {
    const pool = getPgPool();
    if (!pool) return null;
    const result = await pool.query(`SELECT id,email,display_name,role,job_title,department,office_location,avatar_url,azure_oid,is_active,created_at,updated_at FROM users WHERE azure_oid=$1`, [azureOid]);
    return result.rows[0] ? this.mapUser(result.rows[0]) : null;
  }

  async createUser(input: { email: string; displayName: string; role: UserRole; jobTitle?: string; department?: string; officeLocation?: string; avatarUrl?: string; azureOid?: string; isActive?: boolean }): Promise<UserProfile> {
    const pool = getPgPool();
    if (!pool) throw new Error('PostgreSQL requis pour gérer les profils.');
    const id = crypto.randomUUID();
    const result = await pool.query(`INSERT INTO users(id,email,display_name,role,job_title,department,office_location,avatar_url,azure_oid,is_active) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id,email,display_name,role,job_title,department,office_location,avatar_url,azure_oid,is_active,created_at,updated_at`, [id,input.email.trim().toLowerCase(),input.displayName.trim(),input.role,input.jobTitle||null,input.department||null,input.officeLocation||null,input.avatarUrl||null,input.azureOid||null,input.isActive !== false]);
    return this.mapUser(result.rows[0]);
  }

  async updateUser(id: string, updates: Partial<Omit<UserProfile,'id'|'createdAt'|'updatedAt'>>): Promise<UserProfile | null> {
    const pool = getPgPool();
    if (!pool) throw new Error('PostgreSQL requis pour gérer les profils.');
    const fields: string[] = []; const values: any[] = [];
    const mapping: Record<string,string> = { email:'email', displayName:'display_name', role:'role', jobTitle:'job_title', department:'department', officeLocation:'office_location', avatarUrl:'avatar_url', azureOid:'azure_oid', isActive:'is_active' };
    for (const [key, value] of Object.entries(updates)) {
      if (!(key in mapping)) continue;
      fields.push(`${mapping[key]}=$${values.length+1}`);
      values.push(key === 'email' && typeof value === 'string' ? value.trim().toLowerCase() : value ?? null);
    }
    if (!fields.length) return this.getUserById(id);
    values.push(id);
    const result = await pool.query(`UPDATE users SET ${fields.join(',')},updated_at=NOW() WHERE id=$${values.length} RETURNING id,email,display_name,role,job_title,department,office_location,avatar_url,azure_oid,is_active,created_at,updated_at`, values);
    return result.rows[0] ? this.mapUser(result.rows[0]) : null;
  }

  async deleteUser(id: string): Promise<boolean> {
    const pool = getPgPool();
    if (!pool) throw new Error('PostgreSQL requis pour gérer les profils.');
    const result = await pool.query(`DELETE FROM users WHERE id=$1`, [id]);
    return (result.rowCount || 0) > 0;
  }

  async upsertEntraUser(input: { azureOid: string; email: string; displayName: string; jobTitle?: string; department?: string; officeLocation?: string; avatarUrl?: string }): Promise<UserProfile | null> {
    const existing = await this.getUserByAzureOid(input.azureOid) || await this.getUserByEmail(input.email);
    if (!existing) {
      if (process.env.AUTO_PROVISION_USERS !== 'true') return null;
      return this.createUser({ ...input, role: (process.env.DEFAULT_USER_ROLE as UserRole) || 'CHEF_PROJET', isActive: true });
    }
    return this.updateUser(existing.id, { displayName: input.displayName, jobTitle: input.jobTitle, department: input.department, officeLocation: input.officeLocation, avatarUrl: input.avatarUrl, azureOid: input.azureOid });
  }

  getAllProjects() { return Array.from(this.projects.values()); }
  getProjectById(id: string) { return this.projects.get(id); }

  createProject(project: Project, user: MicrosoftUser) {
    const now = new Date().toISOString();
    const created = { ...project, createdAt: now, updatedAt: now };
    this.projects.set(created.id, created);
    void this.persistProject(created);
    this.addAuditLog({ userId: user.id, userEmail: user.email, userRole: user.role, action: 'CREATE_PROJECT', entityType: 'PROJECT', entityId: created.id, details: { name: created.name, code: created.code } });
    return created;
  }

  async createProjectsBulk(projects: Project[], user: MicrosoftUser): Promise<Project[]> {
    const pool = getPgPool();
    if (!pool) throw new Error('PostgreSQL requis pour importer des projets.');
    if (!projects.length) return [];
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      for (const project of projects) {
        await client.query(
          `INSERT INTO project_documents(id, document) VALUES($1,$2) ON CONFLICT(id) DO NOTHING`,
          [project.id, JSON.stringify(project)]
        );
      }
      for (const project of projects) {
        await client.query(
          `INSERT INTO app_audit_logs(id,user_id,user_email,user_role,action,entity_type,entity_id,details,created_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
          [crypto.randomUUID(), user.id, user.email, user.role, 'IMPORT_PROJECT', 'PROJECT', project.id, JSON.stringify({ code: project.code, name: project.name }), new Date().toISOString()]
        );
      }
      await client.query('COMMIT');
      for (const project of projects) this.projects.set(project.id, project);
      return projects;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  updateProject(id: string, updates: Partial<Project>, user: MicrosoftUser) {
    const existing = this.projects.get(id); if (!existing) return null;
    const updated = { ...existing, ...updates, id: existing.id, updatedAt: new Date().toISOString() };
    this.projects.set(id, updated); void this.persistProject(updated);
    this.addAuditLog({ userId: user.id, userEmail: user.email, userRole: user.role, action: 'UPDATE_PROJECT', entityType: 'PROJECT', entityId: id, details: updates });
    return updated;
  }

  deleteProject(id: string, user: MicrosoftUser) {
    const existing = this.projects.get(id); if (!existing) return false;
    this.projects.delete(id); void this.removeProject(id);
    this.addAuditLog({ userId: user.id, userEmail: user.email, userRole: user.role, action: 'DELETE_PROJECT', entityType: 'PROJECT', entityId: id, details: { name: existing.name } });
    return true;
  }

  async deleteProjectsBulk(ids: string[], user: MicrosoftUser): Promise<string[]> {
    const uniqueIds = [...new Set(ids.map(String).filter(Boolean))];
    if (!uniqueIds.length) return [];
    const existing = uniqueIds.map(id => this.projects.get(id)).filter(Boolean) as Project[];
    if (!existing.length) return [];
    const pool = getPgPool();
    if (!pool) throw new Error('PostgreSQL requis pour supprimer des projets.');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      for (const project of existing) {
        await client.query('DELETE FROM project_documents WHERE id=$1', [project.id]);
        await client.query(
          `INSERT INTO app_audit_logs(id,user_id,user_email,user_role,action,entity_type,entity_id,details,created_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
          [crypto.randomUUID(), user.id, user.email, user.role, 'DELETE_PROJECT', 'PROJECT', project.id, JSON.stringify({ name: project.name, code: project.code, bulk: true }), new Date().toISOString()]
        );
      }
      await client.query('COMMIT');
      for (const project of existing) this.projects.delete(project.id);
      return existing.map(project => project.id);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  private mutateProject(id: string, action: string, entityType: string, entityId: string, user: MicrosoftUser, mutate: (p: Project) => void) {
    const project = this.projects.get(id); if (!project) return null;
    mutate(project); project.updatedAt = new Date().toISOString(); void this.persistProject(project);
    this.addAuditLog({ userId: user.id, userEmail: user.email, userRole: user.role, action, entityType, entityId, details: { projectId: id } });
    return project;
  }

  addTask(projectId: string, task: Task, user: MicrosoftUser) { const p = this.mutateProject(projectId, 'ADD_TASK', 'TASK', task.id, user, (x) => x.tasks.push(task)); return p?.tasks.find(t => t.id === task.id) || null; }
  updateTask(projectId: string, taskId: string, updates: Partial<Task>, user: MicrosoftUser) { let out: Task | null = null; this.mutateProject(projectId, 'UPDATE_TASK', 'TASK', taskId, user, (p) => { const i=p.tasks.findIndex(t=>t.id===taskId); if(i>=0){p.tasks[i]={...p.tasks[i],...updates};out=p.tasks[i];} }); return out; }
  deleteTask(projectId: string, taskId: string, user: MicrosoftUser) { let ok=false; this.mutateProject(projectId,'DELETE_TASK','TASK',taskId,user,p=>{const n=p.tasks.length;p.tasks=p.tasks.filter(t=>t.id!==taskId);ok=p.tasks.length!==n}); return ok; }

  addTeamMember(projectId: string, member: TeamMember, user: MicrosoftUser) { const p=this.mutateProject(projectId,'ADD_RESOURCE','TEAM_MEMBER',member.id,user,x=>x.members.push(member)); return p?.members.find(m=>m.id===member.id)||null; }
  updateTeamMember(projectId:string,id:string,updates:Partial<TeamMember>,user:MicrosoftUser){let out:TeamMember|null=null;this.mutateProject(projectId,'UPDATE_RESOURCE','TEAM_MEMBER',id,user,p=>{const i=p.members.findIndex(m=>m.id===id);if(i>=0){p.members[i]={...p.members[i],...updates};out=p.members[i]}});return out;}
  deleteTeamMember(projectId:string,id:string,user:MicrosoftUser){let ok=false;this.mutateProject(projectId,'REMOVE_RESOURCE','TEAM_MEMBER',id,user,p=>{const n=p.members.length;p.members=p.members.filter(m=>m.id!==id);ok=p.members.length!==n});return ok;}

  addRisk(projectId:string,risk:Risk,user:MicrosoftUser){const p=this.mutateProject(projectId,'ADD_RISK','RISK',risk.id,user,x=>x.risks.push(risk));return p?.risks.find(r=>r.id===risk.id)||null;}
  updateRisk(projectId:string,id:string,updates:Partial<Risk>,user:MicrosoftUser){let out:Risk|null=null;this.mutateProject(projectId,'UPDATE_RISK','RISK',id,user,p=>{const i=p.risks.findIndex(r=>r.id===id);if(i>=0){p.risks[i]={...p.risks[i],...updates};out=p.risks[i]}});return out;}
  deleteRisk(projectId:string,id:string,user:MicrosoftUser){let ok=false;this.mutateProject(projectId,'DELETE_RISK','RISK',id,user,p=>{const n=p.risks.length;p.risks=p.risks.filter(r=>r.id!==id);ok=p.risks.length!==n});return ok;}

  addMilestone(projectId:string,m:Milestone,user:MicrosoftUser){const p=this.mutateProject(projectId,'ADD_MILESTONE','MILESTONE',m.id,user,x=>x.milestones.push(m));return p?.milestones.find(v=>v.id===m.id)||null;}
  updateMilestone(projectId:string,id:string,updates:Partial<Milestone>,user:MicrosoftUser){let out:Milestone|null=null;this.mutateProject(projectId,'UPDATE_MILESTONE','MILESTONE',id,user,p=>{const i=p.milestones.findIndex(m=>m.id===id);if(i>=0){p.milestones[i]={...p.milestones[i],...updates};out=p.milestones[i]}});return out;}
  deleteMilestone(projectId:string,id:string,user:MicrosoftUser){let ok=false;this.mutateProject(projectId,'DELETE_MILESTONE','MILESTONE',id,user,p=>{const n=p.milestones.length;p.milestones=p.milestones.filter(m=>m.id!==id);ok=p.milestones.length!==n});return ok;}



  async applyProjectIntake(projectId: string, patch: Partial<Project>, tasks: Task[], milestones: Milestone[], risks: Risk[], members: TeamMember[], user: MicrosoftUser): Promise<Project | null> {
    const existing = this.projects.get(projectId);
    if (!existing) return null;
    const pool = getPgPool();
    if (!pool) throw new Error('PostgreSQL requis pour enrichir un projet.');
    const updated: Project = { ...existing, ...patch, id: existing.id, updatedAt: new Date().toISOString(),
      tasks: [...existing.tasks, ...tasks], milestones: [...existing.milestones, ...milestones], risks: [...existing.risks, ...risks], members: [...existing.members, ...members] };
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`UPDATE project_documents SET document=$2, updated_at=NOW() WHERE id=$1`, [projectId, JSON.stringify(updated)]);
      await client.query(`INSERT INTO app_audit_logs(id,user_id,user_email,user_role,action,entity_type,entity_id,details,created_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`, [crypto.randomUUID(), user.id, user.email, user.role, 'AI_PROJECT_ENRICHMENT', 'PROJECT', projectId, JSON.stringify({tasks:tasks.length,milestones:milestones.length,risks:risks.length,members:members.length,fields:Object.keys(patch)}), new Date().toISOString()]);
      await client.query('COMMIT');
      this.projects.set(projectId, updated);
      return updated;
    } catch (error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
  }
  addAuditLog(log: Omit<AuditLog,'id'|'createdAt'>) { const item={...log,id:crypto.randomUUID(),createdAt:new Date().toISOString()}; this.auditLogs.unshift(item); if(this.auditLogs.length>500)this.auditLogs.length=500; void this.persistAudit(item); }
  getAuditLogs(limit=100){return this.auditLogs.slice(0,Math.min(limit,500));}
}

export const dbStore = new ProjectStore();
