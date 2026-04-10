// server/pdf-routes.js
const express = require('express');
const router = express.Router();
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs').promises;
const os = require('os');

// Generate MCS Performance Estimate PDF
router.post('/generate-pdf/performance', async (req, res) => {
  let tempJsonFile = null;
  let tempPdfFile = null;
  
  try {
    const data = req.body;
    
    // Create temporary files
    const tempDir = os.tmpdir();
    tempJsonFile = path.join(tempDir, `mcs_perf_${Date.now()}.json`);
    tempPdfFile = path.join(tempDir, `mcs_perf_${Date.now()}.pdf`);
    
    // Write JSON data to temp file
    await fs.writeFile(tempJsonFile, JSON.stringify(data, null, 2));
    
    // Call Python script
    const pythonScript = path.join(__dirname, 'generate_mcs_performance_pdf.py');
    const python = spawn('python3', [pythonScript, tempJsonFile, tempPdfFile]);
    
    let stdout = '';
    let stderr = '';
    
    python.stdout.on('data', (data) => {
      stdout += data.toString();
    });
    
    python.stderr.on('data', (data) => {
      stderr += data.toString();
    });
    
    python.on('close', async (code) => {
      try {
        if (code !== 0) {
          console.error('Python script error:', stderr);
          return res.status(500).json({ error: 'Failed to generate PDF' });
        }
        
        // Read the generated PDF
        const pdfBuffer = await fs.readFile(tempPdfFile);
        
        // Send PDF to client
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', 'attachment; filename="MCS_Performance_Estimate.pdf"');
        res.send(pdfBuffer);
        
        // Cleanup temp files
        await fs.unlink(tempJsonFile).catch(() => {});
        await fs.unlink(tempPdfFile).catch(() => {});
      } catch (error) {
        console.error('Error reading PDF:', error);
        res.status(500).json({ error: 'Failed to read generated PDF' });
      }
    });
  } catch (error) {
    console.error('Error generating PDF:', error);
    if (tempJsonFile) await fs.unlink(tempJsonFile).catch(() => {});
    if (tempPdfFile) await fs.unlink(tempPdfFile).catch(() => {});
    res.status(500).json({ error: 'Failed to generate PDF' });
  }
});

// Generate MCS Sound Assessment PDF
router.post('/generate-pdf/sound', async (req, res) => {
  let tempJsonFile = null;
  let tempPdfFile = null;
  
  try {
    const data = req.body;
    
    // Create temporary files
    const tempDir = os.tmpdir();
    tempJsonFile = path.join(tempDir, `mcs_sound_${Date.now()}.json`);
    tempPdfFile = path.join(tempDir, `mcs_sound_${Date.now()}.pdf`);
    
    // Write JSON data to temp file
    await fs.writeFile(tempJsonFile, JSON.stringify(data, null, 2));
    
    // Call Python script
    const pythonScript = path.join(__dirname, 'generate_mcs_sound_pdf.py');
    const python = spawn('python3', [pythonScript, tempJsonFile, tempPdfFile]);
    
    let stdout = '';
    let stderr = '';
    
    python.stdout.on('data', (data) => {
      stdout += data.toString();
    });
    
    python.stderr.on('data', (data) => {
      stderr += data.toString();
    });
    
    python.on('close', async (code) => {
      try {
        if (code !== 0) {
          console.error('Python script error:', stderr);
          return res.status(500).json({ error: 'Failed to generate PDF' });
        }
        
        // Read the generated PDF
        const pdfBuffer = await fs.readFile(tempPdfFile);
        
        // Send PDF to client
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', 'attachment; filename="MCS_Sound_Assessment.pdf"');
        res.send(pdfBuffer);
        
        // Cleanup temp files
        await fs.unlink(tempJsonFile).catch(() => {});
        await fs.unlink(tempPdfFile).catch(() => {});
      } catch (error) {
        console.error('Error reading PDF:', error);
        res.status(500).json({ error: 'Failed to read generated PDF' });
      }
    });
  } catch (error) {
    console.error('Error generating PDF:', error);
    if (tempJsonFile) await fs.unlink(tempJsonFile).catch(() => {});
    if (tempPdfFile) await fs.unlink(tempPdfFile).catch(() => {});
    res.status(500).json({ error: 'Failed to generate PDF' });
  }
});

// Generate Pipe Sizing Installation Report PDF
router.post('/generate-pdf/pipe-sizing', async (req, res) => {
  let tempJsonFile = null;
  let tempPdfFile = null;
  
  try {
    const data = req.body;
    
    // Create temporary files
    const tempDir = os.tmpdir();
    tempJsonFile = path.join(tempDir, `pipe_sizing_${Date.now()}.json`);
    tempPdfFile = path.join(tempDir, `pipe_sizing_${Date.now()}.pdf`);
    
    // Write JSON data to temp file
    await fs.writeFile(tempJsonFile, JSON.stringify(data, null, 2));
    
    // Call Python script
    const pythonScript = path.join(__dirname, 'generate_pipe_sizing_pdf.py');
    const python = spawn('python3', [pythonScript, tempJsonFile, tempPdfFile]);
    
    let stdout = '';
    let stderr = '';
    
    python.stdout.on('data', (data) => {
      stdout += data.toString();
    });
    
    python.stderr.on('data', (data) => {
      stderr += data.toString();
    });
    
    python.on('close', async (code) => {
      try {
        if (code !== 0) {
          console.error('Python script error:', stderr);
          return res.status(500).json({ error: 'Failed to generate PDF' });
        }
        
        // Read the generated PDF
        const pdfBuffer = await fs.readFile(tempPdfFile);
        
        // Send PDF to client
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', 'attachment; filename="Pipe_Sizing_Installation_Report.pdf"');
        res.send(pdfBuffer);
        
        // Cleanup temp files
        await fs.unlink(tempJsonFile).catch(() => {});
        await fs.unlink(tempPdfFile).catch(() => {});
      } catch (error) {
        console.error('Error reading PDF:', error);
        res.status(500).json({ error: 'Failed to read generated PDF' });
      }
    });
  } catch (error) {
    console.error('Error generating PDF:', error);
    if (tempJsonFile) await fs.unlink(tempJsonFile).catch(() => {});
    if (tempPdfFile) await fs.unlink(tempPdfFile).catch(() => {});
    res.status(500).json({ error: 'Failed to generate PDF' });
  }
});


// Generate Heat Loss Summary PDF
router.post('/generate-pdf/heat-loss', async (req, res) => {
  let tempJsonFile = null;
  let tempPdfFile = null;
  try {
    const data = req.body;
    const tempDir = os.tmpdir();
    tempJsonFile = path.join(tempDir, `heat_loss_${Date.now()}.json`);
    tempPdfFile  = path.join(tempDir, `heat_loss_${Date.now()}.pdf`);
    await fs.writeFile(tempJsonFile, JSON.stringify(data, null, 2));
    const pythonScript = path.join(__dirname, 'generate_heat_loss_pdf.py');
    const python = spawn('python3', [pythonScript, tempJsonFile, tempPdfFile]);
    let stderr = '';
    python.stderr.on('data', (d) => { stderr += d.toString(); });
    python.on('close', async (code) => {
      try {
        if (code !== 0) {
          console.error('Python script error:', stderr);
          return res.status(500).json({ error: 'Failed to generate PDF' });
        }
        const pdfBuffer = await fs.readFile(tempPdfFile);
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', 'attachment; filename="Heat_Loss_Report.pdf"');
        res.send(pdfBuffer);
        await fs.unlink(tempJsonFile).catch(() => {});
        await fs.unlink(tempPdfFile).catch(() => {});
      } catch (error) {
        console.error('Error reading PDF:', error);
        res.status(500).json({ error: 'Failed to read generated PDF' });
      }
    });
  } catch (error) {
    console.error('Error generating PDF:', error);
    if (tempJsonFile) await fs.unlink(tempJsonFile).catch(() => {});
    if (tempPdfFile)  await fs.unlink(tempPdfFile).catch(() => {});
    res.status(500).json({ error: 'Failed to generate PDF' });
  }
});

// Generate Radiator Schedule PDF
router.post('/generate-pdf/radiator-schedule', async (req, res) => {
  let tempJsonFile = null;
  let tempPdfFile = null;
  try {
    const data = req.body;
    const tempDir = os.tmpdir();
    tempJsonFile = path.join(tempDir, `rad_sched_${Date.now()}.json`);
    tempPdfFile  = path.join(tempDir, `rad_sched_${Date.now()}.pdf`);
    await fs.writeFile(tempJsonFile, JSON.stringify(data, null, 2));
    const pythonScript = path.join(__dirname, 'generate_radiator_schedule_pdf.py');
    const python = spawn('python3', [pythonScript, tempJsonFile, tempPdfFile]);
    let stderr = '';
    python.stderr.on('data', (d) => { stderr += d.toString(); });
    python.on('close', async (code) => {
      try {
        if (code !== 0) {
          console.error('Python script error:', stderr);
          return res.status(500).json({ error: 'Failed to generate PDF' });
        }
        const pdfBuffer = await fs.readFile(tempPdfFile);
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', 'attachment; filename="Radiator_Schedule.pdf"');
        res.send(pdfBuffer);
        await fs.unlink(tempJsonFile).catch(() => {});
        await fs.unlink(tempPdfFile).catch(() => {});
      } catch (error) {
        console.error('Error reading PDF:', error);
        res.status(500).json({ error: 'Failed to read generated PDF' });
      }
    });
  } catch (error) {
    console.error('Error generating PDF:', error);
    if (tempJsonFile) await fs.unlink(tempJsonFile).catch(() => {});
    if (tempPdfFile)  await fs.unlink(tempPdfFile).catch(() => {});
    res.status(500).json({ error: 'Failed to generate PDF' });
  }
});

module.exports = router;
