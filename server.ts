
  if (!milestone) return res.status(404).json({ error: 'Projet introuvable.' });
  res.status(201).json({ success: true, data: milestone });
});

app.put('/api/projects/:id/milestones/:mId', requireRole(RBAC.canManageProject), (req: Request, res: Response) => {
  const user = currentUser(req);
  const updated = dbStore.updateMilestone(req.params.id, req.params.mId, req.body, user);
  if (!updated) return res.status(404).json({ error: 'Jalon introuvable.' });
  res.json({ success: true, data: updated });
});

app.delete('/api/projects/:id/milestones/:mId', requireRole(RBAC.canManageProject), (req: Request, res: Response) => {
  const user = currentUser(req);
  const success = dbStore.deleteMilestone(req.params.id, req.params.mId, user);
  if (!success) return res.status(404).json({ error: 'Jalon introuvable.' });
  res.json({ success: true, message: 'Jalon supprimé.' });
});

// 8. Audit Logs Endpoint
app.get('/api/audit-logs', requireRole(RBAC.canAccessAdmin), (req: Request, res: Response) => {
  const logs = dbStore.getAuditLogs(100);
  res.json({ success: true, count: logs.length, data: logs });
});



// API: mémoire du Copilot pour un projet
app.get('/api/projects/:id/copilot', requireRole(RBAC.canManageProject), async (req: Request, res: Response) => {
  try {
    const project=dbStore.getProjectById(String(req.params.id));
    if(!project) return res.status(404).json({error:'Projet introuvable.'});
    const memory=await loadCopilotMemory(project.id,currentUser(req).id);
    res.json({success:true,data:{history:memory.history||[],files:memory.files||[],analysis:memory.analysis||{},pendingActions:memory.pendingActions||[]}});
  } catch(e:any) { res.status(500).json({error:e?.message||'Mémoire Copilot indisponible.'}); }
});

// API: CLARITY PM Copilot — chat + analyse documentaire + actions projet
app.get('/api/projects/:id/copilot/proposals.json', requireRole(RBAC.canManageProject), async (req: Request, res: Response) => {
  try {
    const project=dbStore.getProjectById(String(req.params.id));
    if(!project) return res.status(404).json({error:'Projet introuvable.'});
    const user=currentUser(req);
    const memory=await loadCopilotMemory(project.id,user.id);
    res.json({version:1,project:{id:project.id,code:project.code,name:project.name},generatedAt:new Date().toISOString(),proposals:Array.isArray(memory.pendingActions)?memory.pendingActions:[]});
  } catch(e:any) { res.status(500).json({error:e?.message||'Impossible de charger le JSON des propositions.'}); }
});

app.post('/api/projects/:id/copilot', upload.array('files', 10), requireRole(RBAC.canManageProject), async (req: Request, res: Response) => {
  try {
    const project = dbStore.getProjectById(String(req.params.id));
    if (!project) return res.status(404).json({ error:'Projet introuvable.' });
    const files = ((req as any).files || []) as Express.Multer.File[];
    const message = String(req.body?.message || '').trim();
    const result = await runCopilotStudio(project, files, message, currentUser(req));
    // IMPORTANT: Copilot never changes the project during analysis.
    // Actions returned by the AI are proposals and require explicit user confirmation.
    const proposedActions = Array.isArray(result.actions) ? result.actions : [];
    const confirmation = proposedActions.length > 0 ? {
      required: true,
      message: 'J’ai identifié des modifications possibles. Voulez-vous les appliquer au projet ?',
      actions: proposedActions
    } : { required: false, message: '', actions: [] };
    res.json({ success:true, data:{ reply:result.reply || '', analysis:result.analysis || {}, actions:proposedActions, confirmation, applied:[], project, provider:result.provider, account:result.account, model:result.model } });
  } catch (e:any) {
    console.error('Copilot error:', e);
    const status = Number(e?.status) === 401 ? 401 : 500;
    res.status(status).json({ error:e?.message || 'Copilot indisponible.' });
  }
});

// API: refuser les propositions en attente sans modifier le projet
app.post('/api/projects/:id/copilot/reject', requireRole(RBAC.canManageProject), async (req: Request, res: Response) => {
  try {
    const project=dbStore.getProjectById(String(req.params.id));
    if(!project) return res.status(404).json({error:'Projet introuvable.'});
    const user=currentUser(req); const memory=await loadCopilotMemory(project.id,user.id);
    await saveCopilotMemory(project.id,user.id,{...memory,pendingActions:[]});
    res.json({success:true,data:{pendingActions:[]}});
  } catch(e:any){ res.status(500).json({error:e?.message||'Impossible de refuser les propositions.'}); }
});

// API: appliquer explicitement les propositions du Copilot après confirmation utilisateur
app.post('/api/projects/:id/copilot/apply', requireRole(RBAC.canManageProject), async (req: Request, res: Response) => {
  try {
    const project = dbStore.getProjectById(String(req.params.id));
    if (!project) return res.status(404).json({ error:'Projet introuvable.' });
    if (req.body?.confirmed !== true) return res.status(400).json({ error:'Confirmation utilisateur requise.' });
    const user = currentUser(req);
    const memory = await loadCopilotMemory(project.id, user.id);
    const storedActions = Array.isArray(memory.pendingActions) ? memory.pendingActions : [];
    if (!storedActions.length) return res.status(400).json({ error:'Aucune proposition en attente à appliquer.' });
    const proposalIds = Array.isArray(req.body?.proposalIds) ? req.body.proposalIds.map(String) : [];
    const requested = proposalIds.length ? storedActions.filter((a:any)=>proposalIds.includes(String(a.proposalId||a._key))) : storedActions;
    if (!requested.length) return res.status(400).json({ error:'Aucune modification sélectionnée.', code:'NO_SELECTED_PROPOSALS' });
    const result = applyCopilotActions(project, requested, user);
    const appliedIds = new Set(result.applied.map((x:any)=>String(x.proposalId)));
    const remaining = storedActions.filter((a:any)=>!appliedIds.has(String(a.proposalId||a._key)));
    await saveCopilotMemory(project.id, user.id, { ...memory, pendingActions: remaining });
    const updated = dbStore.getProjectById(project.id);
    res.json({ success:true, data:{ applied:result.applied, failed:result.failed, appliedCount:result.applied.length, failedCount:result.failed.length, remainingProposals:remaining.length, project:updated } });
  } catch (e:any) {
    console.error('Copilot apply error:', e);
    res.status(500).json({ error:e?.message || 'Impossible d’appliquer les modifications du Copilot.' });
  }
});

// Vite middleware & Static Serving
async function startServer() {
  await dbStore.initialize();
  await ensureAIConfigTable();
  await ensureCopilotMemoryTable();
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req: Request, res: Response) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
