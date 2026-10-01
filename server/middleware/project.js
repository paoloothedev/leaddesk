import { getDB } from '../db.js';

// Requires authMiddleware to have run first (sets req.user).
// Resolves the target project from X-Project-Id header or ?project= query param.
export function resolveProject(req, res, next) {
  const projectId = req.headers['x-project-id'] || req.query.project;
  if (!projectId) {
    return res.status(400).json({ error: 'X-Project-Id header (or ?project= query) required' });
  }
  const db = getDB();
  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(projectId);
  if (!project) {
    return res.status(404).json({ error: 'Project not found' });
  }
  req.project = project;
  next();
}
