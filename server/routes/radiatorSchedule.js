// server/routes/radiatorSchedule.js
const express = require('express');
const router = express.Router();
const { radiatorSchedule } = require('../database');

// Get radiator schedule for a room
router.get('/rooms/:roomId/schedule', async (req, res) => {
  try {
    const schedule = await radiatorSchedule.getByRoomId(req.params.roomId);
    res.json(schedule);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Add radiator to schedule
router.post('/schedule', async (req, res) => {
  try {
    const result = await radiatorSchedule.create(req.body);
    res.json({ id: result.id });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update radiator in schedule
router.put('/schedule/:id', async (req, res) => {
  try {
    await radiatorSchedule.update(req.params.id, req.body);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete radiator from schedule
router.delete('/schedule/:id', async (req, res) => {
  try {
    await radiatorSchedule.delete(req.params.id);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Mark room radiator schedule as complete
router.post('/rooms/:roomId/schedule/complete', async (req, res) => {
  try {
    await radiatorSchedule.markRoomComplete(req.params.roomId, req.body.isComplete);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;

// Don't forget to add this to server.js:
// const radiatorScheduleRoutes = require('./routes/radiatorSchedule');
// app.use('/api', radiatorScheduleRoutes);