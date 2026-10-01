import { getDB } from '../db.js';

// Returns the project row if `user` may access it, else null.
// Single place for workspace access rules (membership comes with T-017).
export function canAccessProject(user, projectId) {
  if (!user || !projectId || typeof projectId !== 'string') return null;
  return getDB().prepare('SELECT * FROM projects WHERE id = ?').get(projectId) || null;
}

// Requires authMiddleware to have run first (sets req.user).
// Resolves the target project from X-Project-Id header or ?project= query param.
export function resolveProject(req, res, next) {
  const projectId = req.headers['x-project-id'] || req.query.project;
  if (!projectId) {
    return res.status(400).json({ error: 'X-Project-Id header (or ?project= query) required' });
  }
  const project = canAccessProject(req.user, projectId);
  if (!project) {
    return res.status(404).json({ error: 'Project not found' });
  }
  req.project = project;
  next();
}
