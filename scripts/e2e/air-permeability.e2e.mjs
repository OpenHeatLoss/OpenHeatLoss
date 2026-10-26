// scripts/e2e/air-permeability.e2e.mjs
//
// End-to-end browser test of the B25 air permeability checklist (commits 4b–4d),
// against the LOCAL app at http://localhost:3100 backed by the scratch DB.
//
//   cd scripts/e2e && npm install && node air-permeability.e2e.mjs
//
// The server must already be running on port 3100 (this script never starts
// it). DATABASE_URL must point at localhost/ohl_b25_check — the same guard as
// the gate (scripts/lib/scratchDbGuard.mjs); it is used to verify what was
// saved, to confirm the app on 3100 uses the scratch DB, and to delete the
// test project at the end. Never reads .env.
//
// Uses a NEW anonymous project (fresh browser context, no login). Existing
// projects are never opened or changed; the script checks that at the end.
// Browser: the system Google Chrome via playwright-core (no download).
// Screenshots: scripts/e2e/out/ (gitignored).

import { mkdirSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { assertScratchUrl, connectScratch } from '../lib/scratchDbGuard.mjs';

assertScratchUrl();

const BASE = 'http://localhost:3100';          // fixed — no override
const CHROME = process.env.E2E_CHROME ?? '/usr/bin/google-chrome';
const OUT = fileURLToPath(new URL('./out/', import.meta.url));
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

// Table 2-11 values used below (age band 1945–1964).
const AGE_CATEGORY = '1945_1964';
const AGE_Q1 = 5.7;

// ---------------------------------------------------------------------------
// Reporting
// ---------------------------------------------------------------------------
const results = [];
let shot = 0;
const report = (name, pass, detail = '') => {
  results.push({ name, pass });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`);
};
const screenshot = async (page, name) => {
  const file = `${String(++shot).padStart(2, '0')}-${name}.png`;
  await page.screenshot({ path: OUT + file, fullPage: true });
  return file;
};
// Run one step: its checks throw on failure; a screenshot is always taken.
const step = async (page, name, fn) => {
  let pass = false, detail = '';
  try {
    detail = (await fn()) ?? '';
    pass = true;
  } catch (err) {
    detail = err.message.split('\n')[0];
  }
  const file = await screenshot(page, name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''));
  report(name, pass, `${detail}${detail ? '; ' : ''}${file}`);
  return pass;
};
const expect = (cond, msg) => { if (!cond) throw new Error(msg); };

// ---------------------------------------------------------------------------
// Pre-flight: the app must be up, and nothing is changed before we know the
// app on 3100 is backed by the scratch DB.
// ---------------------------------------------------------------------------
try {
  const r = await fetch(`${BASE}/api/anonymous/project`, { redirect: 'manual' });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
} catch (err) {
  console.error(`REFUSING TO RUN: the app is not reachable at ${BASE} (${err.message}). Start it first.`);
  process.exit(1);
}
// (That GET creates nothing: without a cookie it only reports "no project".)

const db = await connectScratch();
const snapshotOthers = async (excludeId = null) => {
  const { rows } = await db.query(`
    SELECT p.id, p.updated_at AS p_upd, d.updated_at AS d_upd,
           (SELECT count(*) FROM rooms r WHERE r.project_id = p.id) AS rooms
      FROM projects p LEFT JOIN design_params d ON d.project_id = p.id
     WHERE p.id IS DISTINCT FROM $1
     ORDER BY p.id`, [excludeId]);
  return JSON.stringify(rows);
};
const existingIds = new Set((await db.query('SELECT id FROM projects')).rows.map(r => r.id));
const before = await snapshotOthers();
const dp = async (id) => (await db.query('SELECT * FROM design_params WHERE project_id = $1', [id])).rows[0];

// ---------------------------------------------------------------------------
// Browser
// ---------------------------------------------------------------------------
const browser = await chromium.launch({ executablePath: CHROME, headless: true });
const context = await browser.newContext({ viewport: { width: 1400, height: 1000 } });   // fresh: no cookies
const page = await context.newPage();

// Every design_params save the page makes.
const saves = [];
page.on('request', req => {
  if (req.method() === 'PUT' && /\/api\/projects\/\d+\/design-params$/.test(req.url())) {
    saves.push(JSON.parse(req.postData() ?? '{}'));
  }
});
const savesSince = (n) => saves.length - n;
const lastSave = () => saves[saves.length - 1] ?? {};

let projectId = null;
let sessionToken = null;

// Locators
const section    = page.locator('h3', { hasText: /^Air Permeability$/ }).locator('xpath=../..');
const methodBtn  = (label) => section.getByRole('button', { name: new RegExp(`^${label}`) });
const card       = (title) => section.locator('div.flex.flex-col.border', { has: page.locator('p', { hasText: new RegExp(`^${title}$`) }) });
const useRadio   = (title) => card(title).getByRole('radio', { name: 'Use this candidate' });
const statRadio  = (label) => section.getByRole('radio', { name: label });
const effective  = section.locator('span.text-xl');
const savedBadge = section.getByText('✓ Saved');
const draftNote  = section.getByText(/stays in use and nothing is saved/);
const savingText = section.getByText('Saving…');

const gotoProjectInfo = async () => {
  await page.getByRole('button', { name: 'Project Info' }).click();
  await section.scrollIntoViewIfNeeded();
};

// Method selector directly under the heading: the section's first child is
// the heading row, the second the method buttons.
const methodOrder = () => section.evaluate((el) => {
  const kids = [...el.children];
  const headingRow = kids[0]?.querySelector('h3')?.textContent?.trim();
  const buttons = [...(kids[1]?.querySelectorAll('button') ?? [])].map(b => b.querySelector('span')?.textContent?.trim());
  return { headingRow, buttons };
});
const expectMethodOrder = async () => {
  const o = await methodOrder();
  expect(o.headingRow === 'Air Permeability', `first child is not the heading (${o.headingRow})`);
  expect(JSON.stringify(o.buttons) === JSON.stringify(['Table 2-11 default', 'Measured', 'Design target']),
    `second child is not the method selector (${JSON.stringify(o.buttons)})`);
};

const expectPickShown = async () => {
  expect(await card('Age band').locator('select').inputValue() === AGE_CATEGORY, 'Age band category not shown');
  expect(await useRadio('Age band').isChecked(), 'Age band "Use this candidate" not checked');
  expect(await statRadio('Lower quartile (Q1)').isChecked(), 'Q1 not checked');
  expect((await effective.textContent()).trim() === AGE_Q1.toFixed(1), `effective q50 ${await effective.textContent()}`);
};
const expectPickSaved = async () => {
  const row = await dp(projectId);
  expect(row.air_permeability_method === 'default_table' && row.q50_selection_basis === 'age_band'
    && row.q50_age_band === AGE_CATEGORY && row.q50_statistic === 'q1' && Object.is(row.q50, AGE_Q1),
    `database row: ${row.air_permeability_method}, ${row.q50_selection_basis}/${row.q50_age_band}/${row.q50_statistic}, q50 ${row.q50}`);
};

try {
  // -------------------------------------------------------------------------
  const created = await step(page, 'Open a new anonymous project', async () => {
    const createdResp = page.waitForResponse(r => r.request().method() === 'POST' && r.url().endsWith('/api/anonymous/project'));
    await page.goto(BASE);
    ({ projectId } = await (await createdResp).json());
    expect(Number.isInteger(projectId), `no project id (${projectId})`);
    sessionToken = (await context.cookies()).find(c => c.name === 'anon_token')?.value;
    // The app on 3100 must be backed by the scratch DB: our new project must
    // be there, with our session token, and must not be an existing project.
    const { rows } = await db.query('SELECT id, session_token FROM projects WHERE id = $1', [projectId]);
    expect(rows.length === 1 && sessionToken && rows[0].session_token === sessionToken,
      `project ${projectId} not found in ohl_b25_check with this session — is the app on 3100 using the scratch DB?`);
    expect(!existingIds.has(projectId), `project ${projectId} existed before the test`);
    await section.waitFor();
    await section.scrollIntoViewIfNeeded();
    return `project ${projectId}`;
  });
  if (!created) throw new Error('could not create the test project — stopping');

  // -------------------------------------------------------------------------
  await step(page, 'Method selector directly under the heading (Table 2-11)', expectMethodOrder);

  // -------------------------------------------------------------------------
  await step(page, 'No preselection on a new project', async () => {
    for (const t of ['Built form', 'Age band', 'Wall construction', 'All dwellings']) {
      expect(!(await useRadio(t).isChecked()), `${t} candidate is checked`);
    }
    for (const t of ['Built form', 'Age band', 'Wall construction']) {
      expect(await card(t).locator('select').inputValue() === '', `${t} has a category`);
    }
    for (const s of ['Mean', 'Median', 'Lower quartile (Q1)', 'Upper quartile (Q3)']) {
      expect(!(await statRadio(s).isChecked()), `${s} is checked`);
    }
    expect(await section.getByText(/No dwelling characteristic selected/).isVisible(), 'amber note missing');
    expect((await effective.textContent()).trim() === '8.6', `effective q50 ${await effective.textContent()}`);
    expect(saves.length === 0, `${saves.length} save(s) on open`);
  });

  // -------------------------------------------------------------------------
  await step(page, 'Pick Age band + 1945–1964 + Q1: "Saved" appears and the database has it', async () => {
    const n = saves.length;
    await card('Age band').locator('select').selectOption(AGE_CATEGORY);
    await useRadio('Age band').check();
    await page.waitForTimeout(300);
    expect(savesSince(n) === 0, `saved before a statistic was chosen (${savesSince(n)})`);
    await statRadio('Lower quartile (Q1)').check();
    await savedBadge.waitFor({ timeout: 5000 });
    expect(savesSince(n) === 1, `${savesSince(n)} saves, expected 1`);
    await expectPickShown();
    await expectPickSaved();
    expect(!(await section.getByText(/No dwelling characteristic selected/).isVisible()), 'amber note still shown');
  });

  // -------------------------------------------------------------------------
  await step(page, 'Add a room on the Rooms tab and return: pick survives', async () => {
    await page.getByRole('button', { name: /^Rooms \(0\)$/ }).click();
    await page.getByRole('button', { name: /Add Room/ }).first().click();
    await page.getByRole('button', { name: /^Rooms \(1\)$/ }).waitFor({ timeout: 5000 });   // reload from DB done
    await gotoProjectInfo();
    await expectPickShown();
    await expectPickSaved();
    return '1 room added';
  });

  // -------------------------------------------------------------------------
  await step(page, 'Close Project and reopen: pick survives', async () => {
    const close = page.getByRole('button', { name: /^Close( Project)?$/ });
    let how;
    if (await close.count()) {
      await close.first().click();
      throw new Error('Close Project is shown to this user; reopen-from-dashboard is not scripted');
    } else {
      // Anonymous users get no Close button (dashboard only). The equivalent:
      // drop all in-memory state with a full page load; the boot sequence
      // reloads the session's project from the database.
      await page.goto(BASE);
      how = 'no Close Project button for anonymous users — full page reload instead';
    }
    await section.waitFor();
    await section.scrollIntoViewIfNeeded();
    await expectPickShown();
    return how;
  });

  // -------------------------------------------------------------------------
  await step(page, 'Changing categories on cards not in use does not save; clears "Saved"; status line placed, no jump', async () => {
    const n = saves.length;
    let sawSaving = false;
    // "Saved" from the reload is not shown; make a fresh one to test clearing.
    await statRadio('Median').check();
    await savedBadge.waitFor({ timeout: 5000 });
    await statRadio('Lower quartile (Q1)').check();
    await savedBadge.waitFor({ timeout: 5000 });
    // Status line: below the picker panel, above Effective q50, centred, 14px.
    const effCard = effective.locator('xpath=../..');
    const layout = await savedBadge.evaluate((el, cardEl) => {
      const line = el.parentElement;
      const panel = line.previousElementSibling;
      const cs = getComputedStyle(line);
      return {
        lineTop: line.getBoundingClientRect().top, lineBottom: line.getBoundingClientRect().bottom,
        panelBottom: panel.getBoundingClientRect().bottom, cardTop: cardEl.getBoundingClientRect().top,
        nextIsCard: line.nextElementSibling === cardEl, align: cs.textAlign, size: cs.fontSize,
        weight: getComputedStyle(el).fontWeight,
      };
    }, await effCard.elementHandle());
    expect(layout.nextIsCard && layout.lineTop >= layout.panelBottom && layout.lineBottom <= layout.cardTop,
      `status line not between panel and Effective q50 (${JSON.stringify(layout)})`);
    expect(layout.align === 'center' && layout.size === '14px', `status line ${layout.align}, ${layout.size}`);
    const cardTopWithSaved = (await effCard.boundingBox()).y;
    const m = saves.length;
    await card('Built form').locator('select').selectOption('detached');
    expect(!(await savedBadge.isVisible()), '"Saved" still shown after a comparison change');
    const cardTopCleared = (await effCard.boundingBox()).y;
    expect(cardTopCleared === cardTopWithSaved, `Effective q50 card moved ${cardTopCleared - cardTopWithSaved}px when "Saved" cleared`);
    sawSaving ||= await savingText.isVisible();
    await card('Wall construction').locator('select').selectOption('solid_uninsulated');
    sawSaving ||= await savingText.isVisible();
    await card('Built form').locator('select').selectOption('flat');
    sawSaving ||= await savingText.isVisible();
    await page.waitForTimeout(500);
    expect(savesSince(m) === 0, `${savesSince(m)} save request(s) from comparison changes`);
    expect(savesSince(n) === 2, `${savesSince(n)} saves, expected 2 (Median, then Q1)`);
    expect(!sawSaving && !(await savingText.isVisible()), '"Saving…" was shown');
    expect(!(await savedBadge.isVisible()), '"Saved" reappeared');
    await expectPickShown();
    await expectPickSaved();
  });

  // -------------------------------------------------------------------------
  const numberInput = section.locator('input[type="number"]');
  const expectStillOnTable = async (n) => {
    expect(savesSince(n) === 0, `${savesSince(n)} save request(s)`);
    expect((await effective.textContent()).trim() === AGE_Q1.toFixed(1), `effective q50 ${await effective.textContent()}`);
    await expectPickSaved();
  };

  await step(page, 'Choose Measured: empty draft, nothing saved', async () => {
    const n = saves.length;
    await methodBtn('Measured').click();
    await draftNote.waitFor({ timeout: 2000 });
    expect(await numberInput.inputValue() === '', `draft input is not empty (${await numberInput.inputValue()})`);
    expect(!(await section.getByText(/Enter a value between/).isVisible()), 'error shown on an empty draft');
    await page.waitForTimeout(500);
    await expectStillOnTable(n);
    await expectMethodOrder();
  });

  await step(page, 'Empty draft, then a full design-params save: nothing invalid stored', async () => {
    // Anonymous users have no Save Project button ("Register free to Save"
    // opens the sign-up form). Stand-in: leave the empty draft and trigger
    // App's saveDesignParams from the MCS020 tab — it sends
    // buildDesignParamsPayload(currentProject), the same payload as Save
    // Project's design-params save.
    expect(await page.getByRole('button', { name: /Register free to Save/ }).count() === 1, 'no "Register free to Save" button');
    expect(await page.getByRole('button', { name: /^Save Project$/ }).count() === 0, 'a Save Project button is shown');
    const n = saves.length;
    await page.getByRole('button', { name: /^MCS020$/ }).click();
    const sound = page.locator('label', { hasText: 'A-weighted Sound Power Level' }).locator('xpath=..').locator('input');
    const resp = page.waitForResponse(r => r.request().method() === 'PUT' && /\/design-params$/.test(r.url()));
    await sound.focus();
    await sound.blur();
    expect((await resp).ok(), 'design-params save failed');
    expect(savesSince(n) === 1, `${savesSince(n)} saves, expected 1`);
    const body = lastSave();
    expect(body.airPermeabilityMethod === 'default_table' && Object.is(body.q50, AGE_Q1),
      `payload sent ${body.airPermeabilityMethod}, q50 ${body.q50}`);
    await expectPickSaved();
    await gotoProjectInfo();
    expect(!(await draftNote.isVisible()), 'draft still open after leaving the tab');
    await expectPickShown();
    return 'no Save Project for anonymous users — MCS020 save (same payload) instead';
  });

  await step(page, 'Draft back to Table 2-11 is free (invalid, valid + Table 2-11, valid + Keep)', async () => {
    const n = saves.length;
    await methodBtn('Measured').click();
    await numberInput.fill('0.4');
    await section.getByText(/current method's q₅₀ is still in use/).waitFor({ timeout: 2000 });
    await methodBtn('Table 2-11 default').click();
    await expectPickShown();
    // A valid figure typed but not yet blurred: leaving the draft must not save it.
    await methodBtn('Measured').click();
    await numberInput.fill('3');
    await methodBtn('Table 2-11 default').click();
    await expectPickShown();
    await methodBtn('Measured').click();
    await numberInput.fill('3');
    await section.getByRole('button', { name: 'Keep the current method' }).click();
    await expectPickShown();
    await page.waitForTimeout(500);
    await expectStillOnTable(n);
  });

  await step(page, 'Measured draft 5.2 saves method + 5.2 together on blur', async () => {
    const n = saves.length;
    await methodBtn('Measured').click();
    await numberInput.fill('5.2');
    await page.waitForTimeout(300);
    expect(savesSince(n) === 0, `saved while typing (${savesSince(n)})`);
    expect((await effective.textContent()).trim() === AGE_Q1.toFixed(1), 'draft keystrokes changed the effective q50');
    await numberInput.blur();
    await savedBadge.waitFor({ timeout: 5000 });
    expect(savesSince(n) === 1, `${savesSince(n)} saves, expected 1`);
    const body = lastSave();
    expect(body.airPermeabilityMethod === 'measured' && Object.is(body.q50, 5.2), `payload sent ${body.airPermeabilityMethod}, q50 ${body.q50}`);
    const row = await dp(projectId);
    expect(row.air_permeability_method === 'measured' && Object.is(row.q50, 5.2), `database: ${row.air_permeability_method}, q50 ${row.q50}`);
    expect(!(await draftNote.isVisible()), 'draft note still shown');
    expect((await effective.textContent()).trim() === '5.2', `effective q50 ${await effective.textContent()}`);
    await expectMethodOrder();
  });

  await step(page, 'Measured: unchanged blur does not save', async () => {
    const n = saves.length;
    await numberInput.focus();
    await numberInput.blur();
    await page.waitForTimeout(500);
    expect(savesSince(n) === 0, `${savesSince(n)} save request(s)`);
    expect(await savedBadge.isVisible(), '"Saved" cleared although nothing was typed');
  });

  await step(page, 'Measured 0.4: inline error, "Saved" cleared, no save; retyped 5.2 no save', async () => {
    const n = saves.length;
    expect(await savedBadge.isVisible(), 'precondition: "Saved" from the 5.2 save should be shown');
    await numberInput.fill('0.4');
    const error = section.getByText(/Enter a value between 0\.5 and 50/);
    await error.waitFor({ timeout: 2000 });
    expect(!(await savedBadge.isVisible()), '"Saved" shown beside the invalid 0.4');
    await numberInput.blur();
    await page.waitForTimeout(500);
    expect(savesSince(n) === 0, `${savesSince(n)} save request(s)`);
    expect((await effective.textContent()).trim() === '5.2', `effective q50 ${await effective.textContent()}`);
    expect(Object.is((await dp(projectId)).q50, 5.2), 'database q50 changed');
    // Retyping the saved value: valid but unchanged → no save on blur.
    await numberInput.fill('5.2');
    await numberInput.blur();
    await page.waitForTimeout(500);
    expect(savesSince(n) === 0, `${savesSince(n)} save request(s) after retyping 5.2`);
  });

  await step(page, 'Design target draft from Measured: back to Measured is free', async () => {
    const n = saves.length;
    await methodBtn('Design target').click();
    await draftNote.waitFor({ timeout: 2000 });
    expect(await numberInput.inputValue() === '', 'design target draft is not empty');
    await methodBtn('Measured').click();
    expect(await numberInput.inputValue() === '5.2', `measured input shows ${await numberInput.inputValue()}`);
    await page.waitForTimeout(500);
    expect(savesSince(n) === 0, `${savesSince(n)} save request(s)`);
    const row = await dp(projectId);
    expect(row.air_permeability_method === 'measured' && Object.is(row.q50, 5.2), `database: ${row.air_permeability_method}, q50 ${row.q50}`);
    // Leave 0.4 in the field for the next step (switching must not save it).
    await numberInput.fill('0.4');
  });

  // -------------------------------------------------------------------------
  await step(page, 'Measured back to Table 2-11 restores the earlier card', async () => {
    const n = saves.length;
    await methodBtn('Table 2-11 default').click();
    await savedBadge.waitFor({ timeout: 5000 });
    expect(savesSince(n) === 1, `${savesSince(n)} saves, expected 1 (the 0.4 must not have saved on blur)`);
    await expectPickShown();
    await expectPickSaved();
    await expectMethodOrder();
  });

  await step(page, 'Restored pick survives a full reload', async () => {
    await page.goto(BASE);
    await section.waitFor();
    await section.scrollIntoViewIfNeeded();
    await expectPickShown();
  });
} catch (err) {
  report('Run', false, err.message.split('\n')[0]);
} finally {
  await browser.close();

  // -------------------------------------------------------------------------
  // Cleanup: delete ONLY the project this run created — matched by id AND
  // this browser's anonymous session token, and absent before the run.
  // -------------------------------------------------------------------------
  if (projectId !== null && sessionToken && !existingIds.has(projectId)) {
    const del = await db.query('DELETE FROM projects WHERE id = $1 AND session_token = $2', [projectId, sessionToken]);
    report(`Test project ${projectId} deleted (rooms, design_params cascade)`, del.rowCount === 1, `${del.rowCount} row`);
  } else {
    report('Test project deleted', projectId === null, projectId === null ? 'none was created' : 'not deleted — check by hand');
  }
  const after = await snapshotOthers(projectId);
  report('No existing project changed (updated_at, design_params, room count)', after === before);
  await db.end();

  const failed = results.filter(r => !r.pass).length;
  console.log(`\n${failed ? 'FAILED' : 'PASSED'}: ${results.length - failed}/${results.length} steps. Screenshots in scripts/e2e/out/`);
  process.exitCode = failed ? 1 : 0;
}
