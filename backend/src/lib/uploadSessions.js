const crypto = require('crypto');

const SESSION_TTL_MS = 30 * 60 * 1000;
const sessions = new Map();

function cleanupExpired() {
  const now = Date.now();
  for (const [id, session] of sessions.entries()) {
    if (now - session.createdAt > SESSION_TTL_MS) {
      sessions.delete(id);
    }
  }
}

function createUploadSession(payload) {
  cleanupExpired();
  const id = crypto.randomUUID();
  sessions.set(id, {
    id,
    createdAt: Date.now(),
    ...payload,
  });
  return id;
}

function getUploadSession(id) {
  cleanupExpired();
  const session = sessions.get(id);
  if (!session) return null;
  if (Date.now() - session.createdAt > SESSION_TTL_MS) {
    sessions.delete(id);
    return null;
  }
  return session;
}

function updateUploadSession(id, patch) {
  const session = getUploadSession(id);
  if (!session) return null;
  Object.assign(session, patch);
  return session;
}

function consumeUploadSession(id) {
  const session = getUploadSession(id);
  if (!session) return null;
  sessions.delete(id);
  return session;
}

module.exports = {
  createUploadSession,
  getUploadSession,
  updateUploadSession,
  consumeUploadSession,
};
