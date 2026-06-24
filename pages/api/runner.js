// pages/api/runner.js
// The app's control link to the background runner.
//   GET           → { configured, enabled, status }  (for the control panel)
//   POST {action} → 'enable' | 'disable' | 'run'
// 'run' triggers the GitHub Actions workflow via a repository_dispatch, so the
// user can start a batch from the app without ever opening GitHub.

import { isEnabled, setEnabled, getStatus, setStatus, getBatchSize, setBatchSize, kvConfigured } from '../../lib/runnerState';

async function triggerWorkflow() {
  const repo = process.env.GITHUB_REPO;            // e.g. "projecthailmary-2/indexation-checker-2"
  const token = process.env.GITHUB_DISPATCH_TOKEN; // PAT with Actions write access
  if (!repo || !token) {
    throw new Error('Start-from-app isn’t set up yet (missing GITHUB_REPO / GITHUB_DISPATCH_TOKEN).');
  }
  const r = await fetch(`https://api.github.com/repos/${repo}/dispatches`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ event_type: 'run-audit' }),
  });
  if (!r.ok) {
    const body = await r.text().catch(() => '');
    throw new Error(`GitHub didn’t accept the start request (${r.status}). ${body.slice(0, 160)}`);
  }
}

// Cancel any in-progress / queued audit runs directly via the GitHub API, so
// "Turn Off" is a real stop (not just a graceful flag the runner may not reach).
async function cancelActiveRuns() {
  const repo = process.env.GITHUB_REPO;
  const token = process.env.GITHUB_DISPATCH_TOKEN;
  if (!repo || !token) return { cancelled: 0 };
  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  };
  let cancelled = 0;
  for (const status of ['in_progress', 'queued']) {
    const list = await fetch(`https://api.github.com/repos/${repo}/actions/runs?status=${status}&per_page=50`, { headers });
    if (!list.ok) continue;
    const data = await list.json();
    for (const run of (data.workflow_runs || [])) {
      const c = await fetch(`https://api.github.com/repos/${repo}/actions/runs/${run.id}/cancel`, { method: 'POST', headers });
      if (c.ok) cancelled++;
    }
  }
  return { cancelled };
}

export default async function handler(req, res) {
  if (req.method === 'GET') {
    if (!kvConfigured()) {
      return res.status(200).json({ configured: false, enabled: false, batchSize: 300, status: null });
    }
    const [enabled, rawStatus, batchSize] = await Promise.all([isEnabled(), getStatus(), getBatchSize()]);
    // Self-heal a stuck "running" status: if a run crashed/was cancelled without
    // reporting back, its timestamp goes stale — treat it as idle so the controls
    // don't stay locked. A live run refreshes its status every chunk (~minutes).
    let status = rawStatus;
    if (status?.state === 'running') {
      const last = Date.parse(status.updatedAt || status.startedAt || '');
      if (!Number.isFinite(last) || Date.now() - last > 15 * 60 * 1000) {
        status = { ...status, state: 'idle', stale: true };
      }
    }
    return res.status(200).json({ configured: true, enabled, batchSize: batchSize || 300, status });
  }

  if (req.method === 'POST') {
    if (!kvConfigured()) {
      return res.status(503).json({ error: 'Automation storage isn’t configured (KV_REST_API_URL / KV_REST_API_TOKEN).' });
    }
    const { action } = req.body || {};
    if (action === 'enable') { await setEnabled(true); return res.status(200).json({ ok: true, enabled: true }); }
    if (action === 'disable') {
      await setEnabled(false);
      // Make "Turn Off" a real stop: cancel any running/queued run, and clear
      // the status so the app unlocks immediately.
      let cancelled = 0;
      try { ({ cancelled } = await cancelActiveRuns()); } catch { /* best effort */ }
      try { await setStatus({ state: 'idle', finishedAt: new Date().toISOString(), note: 'stopped by user' }); } catch {}
      return res.status(200).json({ ok: true, enabled: false, cancelled });
    }
    if (action === 'setBatchSize') {
      try { await setBatchSize(req.body.value); return res.status(200).json({ ok: true, batchSize: parseInt(req.body.value, 10) }); }
      catch (e) { return res.status(400).json({ error: e.message }); }
    }
    if (action === 'run') {
      if (!(await isEnabled())) {
        return res.status(409).json({ error: 'Turn the automation on before running a batch.' });
      }
      try { await triggerWorkflow(); return res.status(200).json({ ok: true, triggered: true }); }
      catch (e) { return res.status(500).json({ error: e.message }); }
    }
    return res.status(400).json({ error: 'Unknown action.' });
  }

  return res.status(405).end();
}
