// server/pdf-routes.js
//
// Exported as a factory function so server.js can inject requireAuth
// and the companies DB accessor after they are defined.
//
// Usage in server.js (replace the two existing lines):
//   const pdfRoutes = require('./pdf-routes');
//   // ... after requireAuth and companies are defined ...
//   app.use('/api', pdfRoutes(requireAuth, companies));

const express = require('express');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs').promises;
const os = require('os');

// ---------------------------------------------------------------------------
// Shared helper — spawn a Python script with a JSON temp file, return the
// path to the generated PDF, and clean up the JSON file afterwards.
// Rejects if the script exits with a non-zero code.
// ---------------------------------------------------------------------------
async function runPythonScript(scriptName, data, outputPrefix) {
  const tempDir   = os.tmpdir();
  const timestamp = Date.now();
  const jsonFile  = path.join(tempDir, `${outputPrefix}_${timestamp}.json`);
  const pdfFile   = path.join(tempDir, `${outputPrefix}_${timestamp}.pdf`);

  await fs.writeFile(jsonFile, JSON.stringify(data, null, 2));

  const scriptPath = path.join(__dirname, scriptName);

  return new Promise((resolve, reject) => {
    const python = spawn('python3', [scriptPath, jsonFile, pdfFile]);
    let stderr = '';
    python.stderr.on('data', (d) => { stderr += d.toString(); });
    python.on('close', async (code) => {
      await fs.unlink(jsonFile).catch(() => {});
      if (code !== 0) {
        await fs.unlink(pdfFile).catch(() => {});
        return reject(new Error(`${scriptName} exited ${code}: ${stderr}`));
      }
      resolve(pdfFile);
    });
  });
}

// ---------------------------------------------------------------------------
// Merge helper — calls merge_pdfs.py with a list of temp PDF paths.
// Filters out null/undefined entries before writing the paths file.
// ---------------------------------------------------------------------------
async function mergePdfs(pdfPaths, outputPrefix) {
  const valid = pdfPaths.filter(Boolean);
  if (valid.length === 0) throw new Error('No PDFs to merge');

  const tempDir   = os.tmpdir();
  const timestamp = Date.now();
  const pathsFile = path.join(tempDir, `${outputPrefix}_paths_${timestamp}.json`);
  const outFile   = path.join(tempDir, `${outputPrefix}_merged_${timestamp}.pdf`);

  await fs.writeFile(pathsFile, JSON.stringify(valid));

  const scriptPath = path.join(__dirname, 'merge_pdfs.py');

  return new Promise((resolve, reject) => {
    const python = spawn('python3', [scriptPath, pathsFile, outFile]);
    let stderr = '';
    python.stderr.on('data', (d) => { stderr += d.toString(); });
    python.on('close', async (code) => {
      await fs.unlink(pathsFile).catch(() => {});
      if (code !== 0) {
        await fs.unlink(outFile).catch(() => {});
        return reject(new Error(`merge_pdfs.py exited ${code}: ${stderr}`));
      }
      resolve(outFile);
    });
  });
}

// ---------------------------------------------------------------------------
// Sends a PDF file to the client and deletes the temp file afterwards.
// ---------------------------------------------------------------------------
async function sendPdf(res, pdfPath, filename) {
  const buffer = await fs.readFile(pdfPath);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(buffer);
  await fs.unlink(pdfPath).catch(() => {});
}

// ---------------------------------------------------------------------------
// Module export — factory function
// ---------------------------------------------------------------------------
module.exports = function pdfRoutes(requireAuth, companies) {
  const router = express.Router();

  // ── MCS Performance Estimate ─────────────────────────────────────────────
  router.post('/generate-pdf/performance', requireAuth, async (req, res) => {
    let pdfFile = null;
    try {
      pdfFile = await runPythonScript('generate_mcs_performance_pdf.py', req.body, 'mcs_perf');
      await sendPdf(res, pdfFile, 'MCS_Performance_Estimate.pdf');
    } catch (err) {
      console.error('Error generating performance PDF:', err.message);
      if (pdfFile) await fs.unlink(pdfFile).catch(() => {});
      if (!res.headersSent) res.status(500).json({ error: 'Failed to generate PDF' });
    }
  });

  // ── MCS Sound Assessment ─────────────────────────────────────────────────
  router.post('/generate-pdf/sound', requireAuth, async (req, res) => {
    let pdfFile = null;
    try {
      pdfFile = await runPythonScript('generate_mcs_sound_pdf.py', req.body, 'mcs_sound');
      await sendPdf(res, pdfFile, 'MCS_Sound_Assessment.pdf');
    } catch (err) {
      console.error('Error generating sound PDF:', err.message);
      if (pdfFile) await fs.unlink(pdfFile).catch(() => {});
      if (!res.headersSent) res.status(500).json({ error: 'Failed to generate PDF' });
    }
  });

  // ── Pipe Sizing Report ───────────────────────────────────────────────────
  router.post('/generate-pdf/pipe-sizing', requireAuth, async (req, res) => {
    let pdfFile = null;
    try {
      pdfFile = await runPythonScript('generate_pipe_sizing_pdf.py', req.body, 'pipe_sizing');
      await sendPdf(res, pdfFile, 'Pipe_Sizing_Installation_Report.pdf');
    } catch (err) {
      console.error('Error generating pipe sizing PDF:', err.message);
      if (pdfFile) await fs.unlink(pdfFile).catch(() => {});
      if (!res.headersSent) res.status(500).json({ error: 'Failed to generate PDF' });
    }
  });

  // ── Heat Loss Report ─────────────────────────────────────────────────────
  router.post('/generate-pdf/heat-loss', requireAuth, async (req, res) => {
    let pdfFile = null;
    try {
      pdfFile = await runPythonScript('generate_heat_loss_pdf.py', req.body, 'heat_loss');
      await sendPdf(res, pdfFile, 'Heat_Loss_Report.pdf');
    } catch (err) {
      console.error('Error generating heat loss PDF:', err.message);
      if (pdfFile) await fs.unlink(pdfFile).catch(() => {});
      if (!res.headersSent) res.status(500).json({ error: 'Failed to generate PDF' });
    }
  });

  // ── Radiator Schedule ────────────────────────────────────────────────────
  router.post('/generate-pdf/radiator-schedule', requireAuth, async (req, res) => {
    let pdfFile = null;
    try {
      pdfFile = await runPythonScript('generate_radiator_schedule_pdf.py', req.body, 'rad_sched');
      await sendPdf(res, pdfFile, 'Radiator_Schedule.pdf');
    } catch (err) {
      console.error('Error generating radiator schedule PDF:', err.message);
      if (pdfFile) await fs.unlink(pdfFile).catch(() => {});
      if (!res.headersSent) res.status(500).json({ error: 'Failed to generate PDF' });
    }
  });

  // ── Customer Pack (combined PDF) ─────────────────────────────────────────
  //
  // POST /api/generate-pdf/customer-pack
  // Requires authentication — fetches company data server-side.
  //
  // Body shape:
  // {
  //   heatLossData:        { ...same payload as /generate-pdf/heat-loss },
  //   radiatorScheduleData:{ ...same payload as /generate-pdf/radiator-schedule },
  //   mcsPerformanceData:  { ...same payload as /generate-pdf/performance } | null,
  //   mcsSoundData:        { ...same payload as /generate-pdf/sound } | null,
  //   clientData: {
  //     title, firstName, surname,
  //     propertyAddress,        // assembled address string
  //     totalHeatLossKw,        // numeric
  //     designFlowTemp,         // numeric
  //     quoteRef,               // optional
  //   }
  // }
  //
  // MCS documents are only generated and included if their data object is
  // present and non-empty (i.e. truthy and has at least one key).
  //
  router.post('/generate-pdf/customer-pack', requireAuth, async (req, res) => {
    const tempFiles = [];

    try {
      const companyId = req.user.companyId;

      // Fetch company record for cover letter template and branding
      const company = await companies.getById(companyId);
      if (!company) {
        return res.status(404).json({ error: 'Company not found' });
      }

      const {
        heatLossData,
        radiatorScheduleData,
        mcsPerformanceData,
        mcsSoundData,
        clientData = {},
      } = req.body;

      if (!heatLossData || !radiatorScheduleData) {
        return res.status(400).json({ error: 'heatLossData and radiatorScheduleData are required' });
      }

      // ── Build cover letter data ──────────────────────────────────────────
      // Determine which documents are being included so we can list them
      const includeMcsPerf  = mcsPerformanceData && Object.keys(mcsPerformanceData).length > 0;
      const includeMcsSound = mcsSoundData        && Object.keys(mcsSoundData).length > 0;

      const packContents = [
        'Heat Loss Calculation Report (BS EN 12831-1 / CIBSE DHDG 2026)',
        'Emitter Schedule',
      ];
      if (includeMcsPerf)  packContents.push('MCS 031 Heat Pump System Performance Estimate');
      if (includeMcsSound) packContents.push('MCS 020a) Sound Level Assessment');

      const coverLetterData = {
        company: {
          name:                 company.name,
          phone:                company.phone,
          email:                company.email,
          address:              company.address,
          mcsNumber:            company.mcs_number,
          coverLetterTemplate:  company.cover_letter_template || null,
        },
        client: {
          title:     clientData.title     || '',
          firstName: clientData.firstName || '',
          surname:   clientData.surname   || '',
        },
        project: {
          name:             clientData.projectName     || '',
          propertyAddress:  clientData.propertyAddress || '',
          totalHeatLossKw:  clientData.totalHeatLossKw ?? null,
          designFlowTemp:   clientData.designFlowTemp  ?? null,
          quoteRef:         clientData.quoteRef        || '',
        },
        packContents,
      };

      // ── Generate all PDFs in parallel where possible ─────────────────────
      const [coverPdf, heatLossPdf, radSchedPdf] = await Promise.all([
        runPythonScript('generate_cover_letter_pdf.py',      coverLetterData,    'cover_letter'),
        runPythonScript('generate_heat_loss_pdf.py',         heatLossData,       'heat_loss'),
        runPythonScript('generate_radiator_schedule_pdf.py', radiatorScheduleData, 'rad_sched'),
      ]);
      tempFiles.push(coverPdf, heatLossPdf, radSchedPdf);

      // ── Optional MCS documents ───────────────────────────────────────────
      let mcsPerformancePdf = null;
      let mcsSoundPdf       = null;

      if (includeMcsPerf) {
        mcsPerformancePdf = await runPythonScript(
          'generate_mcs_performance_pdf.py', mcsPerformanceData, 'mcs_perf'
        );
        tempFiles.push(mcsPerformancePdf);
      }

      if (includeMcsSound) {
        mcsSoundPdf = await runPythonScript(
          'generate_mcs_sound_pdf.py', mcsSoundData, 'mcs_sound'
        );
        tempFiles.push(mcsSoundPdf);
      }

      // ── Merge in document order ──────────────────────────────────────────
      const mergedPdf = await mergePdfs(
        [coverPdf, heatLossPdf, radSchedPdf, mcsPerformancePdf, mcsSoundPdf],
        'customer_pack'
      );
      tempFiles.push(mergedPdf);

      // Derive a filename from the client name if available
      const clientName = [clientData.firstName, clientData.surname]
        .filter(Boolean).join('_') || 'Customer';
      const filename = `${clientName}_HeatLoss_Pack.pdf`;

      await sendPdf(res, mergedPdf, filename);

    } catch (err) {
      console.error('Error generating customer pack:', err.message);
      if (!res.headersSent) res.status(500).json({ error: 'Failed to generate customer pack' });
    } finally {
      // Clean up all temp files that weren't already deleted by sendPdf
      for (const f of tempFiles) {
        if (f) await fs.unlink(f).catch(() => {});
      }
    }
  });

  return router;
};
