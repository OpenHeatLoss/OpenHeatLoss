// server/routes/radiatorSchedule.js
const express = require('express');
const router  = express.Router();

const {
  radiatorSchedule,
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
      res.status(500).json({ error: error.message });
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
      const result = await radiatorSchedule.create(req.body);
      res.json({ id: result.id });
    } catch (error) {
      console.error('Error creating radiator schedule entry:', error);
      res.status(500).json({ error: error.message });
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
      await radiatorSchedule.update(req.params.id, req.body);
      res.json({ success: true });
    } catch (error) {
      console.error('Error updating radiator schedule entry:', error);
      res.status(500).json({ error: error.message });
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
      res.status(500).json({ error: error.message });
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
      res.status(500).json({ error: error.message });
    }
  });

  return router;
};
