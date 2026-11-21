// server/routes/radiatorSchedule.js
const express = require('express');
const router  = express.Router();

const {
  radiatorSchedule,
  radiatorSpecs,
  getProjectForRoom,
  getProjectForScheduleItem,
  ownsProject,
} = require('../database');

// Auth middleware is defined in server.js and attached to req via the Express
// app — it cannot be imported from here. Instead, server.js passes it in when
// mounting this router. We receive it as a parameter and apply it per-route.
// See server.js: app.use('/api', radiatorScheduleRoutes(requireAuthOrAnon));
//
// This pattern avoids duplicating the JWT_SECRET and middleware logic.

// A schedule row may only reference a radiator spec the caller can see —
// the same rule as GET /api/radiator-specs (global/library, own company, or
// own anonymous session). Otherwise a row could point at another company's
// private spec: its details leaked through the materials import, and the
// ON DELETE CASCADE meant that company deleting its spec would silently
// remove this project's schedule row.
async function canUseSpec(specId, req) {
  if (specId == null) return true;
  const spec = await radiatorSpecs.getById(specId);
  if (!spec) return false;
  if (spec.scope === 'global' || spec.scope === 'library') return true;
  if (spec.scope === 'company')   return !!req.user && spec.company_id === req.user.companyId;
  if (spec.scope === 'anonymous') return !req.user && spec.session_token === req.anonToken;
  return false;
}

// 500 responses no longer echo error.message (raw database errors) to the
// client; the detail stays in the server log.
const SERVER_ERROR = 'Server error — please try again';

module.exports = function radiatorScheduleRoutes(requireAuthOrAnon) {
  // ---------------------------------------------------------------------------
  // GET /api/rooms/:roomId/schedule
  // Read-only — still requires auth so anonymous users can only read their
  // own session's data (getCompleteProject already enforces this at project
  // level, but defence in depth applies here too).
  // ---------------------------------------------------------------------------
  router.get('/rooms/:roomId/schedule', requireAuthOrAnon, async (req, res) => {
    try {
      const project = await getProjectForRoom(req.params.roomId);
      if (!ownsProject(project, req)) return res.status(403).json({ error: 'Not authorised' });
      const schedule = await radiatorSchedule.getByRoomId(req.params.roomId);
      res.json(schedule);
    } catch (error) {
      console.error('Error fetching radiator schedule:', error);
      res.status(500).json({ error: SERVER_ERROR });
    }
  });

  // ---------------------------------------------------------------------------
  // POST /api/schedule
  // Create a new schedule entry. Verify ownership via roomId in body.
  // ---------------------------------------------------------------------------
  router.post('/schedule', requireAuthOrAnon, async (req, res) => {
    try {
      const project = await getProjectForRoom(req.body.roomId);
      if (!ownsProject(project, req)) return res.status(403).json({ error: 'Not authorised' });
      if (!(await canUseSpec(req.body.radiatorSpecId, req))) {
        return res.status(403).json({ error: 'Not authorised to use this radiator spec' });
      }
      const result = await radiatorSchedule.create(req.body);
      res.json({ id: result.id });
    } catch (error) {
      console.error('Error creating radiator schedule entry:', error);
      res.status(500).json({ error: SERVER_ERROR });
    }
  });

  // ---------------------------------------------------------------------------
  // PUT /api/schedule/:id
  // Update a schedule entry. Verify ownership via the item's room → project.
  // ---------------------------------------------------------------------------
  router.put('/schedule/:id', requireAuthOrAnon, async (req, res) => {
    try {
      const project = await getProjectForScheduleItem(req.params.id);
      if (!ownsProject(project, req)) return res.status(403).json({ error: 'Not authorised' });
      if (!(await canUseSpec(req.body.radiatorSpecId, req))) {
        return res.status(403).json({ error: 'Not authorised to use this radiator spec' });
      }
      await radiatorSchedule.update(req.params.id, req.body);
      res.json({ success: true });
    } catch (error) {
      console.error('Error updating radiator schedule entry:', error);
      res.status(500).json({ error: SERVER_ERROR });
    }
  });

  // ---------------------------------------------------------------------------
  // DELETE /api/schedule/:id
  // Delete a schedule entry. Verify ownership before deleting.
  // ---------------------------------------------------------------------------
  router.delete('/schedule/:id', requireAuthOrAnon, async (req, res) => {
    try {
      const project = await getProjectForScheduleItem(req.params.id);
      if (!ownsProject(project, req)) return res.status(403).json({ error: 'Not authorised' });
      await radiatorSchedule.delete(req.params.id);
      res.json({ success: true });
    } catch (error) {
      console.error('Error deleting radiator schedule entry:', error);
      res.status(500).json({ error: SERVER_ERROR });
    }
  });

  // ---------------------------------------------------------------------------
  // POST /api/rooms/:roomId/schedule/complete
  // Mark a room's radiator schedule complete/incomplete.
  // ---------------------------------------------------------------------------
  router.post('/rooms/:roomId/schedule/complete', requireAuthOrAnon, async (req, res) => {
    try {
      const project = await getProjectForRoom(req.params.roomId);
      if (!ownsProject(project, req)) return res.status(403).json({ error: 'Not authorised' });
      await radiatorSchedule.markRoomComplete(req.params.roomId, req.body.isComplete);
      res.json({ success: true });
    } catch (error) {
      console.error('Error marking schedule complete:', error);
      res.status(500).json({ error: SERVER_ERROR });
    }
  });

  return router;
};
