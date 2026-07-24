const express = require('express');
const {
  requireAuth,
  listUserPermissions,
} = require('../middleware/auth');

const router = express.Router();

/**
 * GET /api/me
 * requireAuth only (pending users may check their own status).
 */
router.get('/', requireAuth, async (req, res) => {
  try {
    const permissions = await listUserPermissions(req.user);
    return res.json({
      ...req.user,
      permissions,
    });
  } catch (err) {
    console.error('[GET /api/me]', err);
    return res.status(500).json({ error: 'Gagal mengambil profil' });
  }
});

module.exports = router;
