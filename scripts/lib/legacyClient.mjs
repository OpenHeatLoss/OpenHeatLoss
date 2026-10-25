// scripts/lib/legacyClient.mjs
//
// The pre-B25 production client code (main before the B25 branch), kept as a
// copy in scripts/out/legacy_client_<rev>/ so the B25 scripts can run it
// unmodified. Missing files are rebuilt from git; a copy that differs from
// git is refused rather than silently overwritten.
//
// The copy must hold the whole import closure of the baseline calculation:
// calculations.js imports './en12831Calculations' relatively, so loading the
// current calculations.js would pull in the current resolveQ50.

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const LEGACY_REV = '8c453e1';

const FILES = ['calculations.js', 'en12831Calculations.js', 'en12831VentilationData.js', 'mcsData.js'];

const root = fileURLToPath(new URL('../../', import.meta.url));
export const legacyDir = fileURLToPath(new URL(`../out/legacy_client_${LEGACY_REV}/`, import.meta.url));

const gitShow = (file) => {
  const r = spawnSync('git', ['show', `${LEGACY_REV}:client/src/utils/${file}`],
    { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (r.status !== 0) throw new Error(`git show ${LEGACY_REV}:client/src/utils/${file} failed: ${r.stderr}`);
  return r.stdout;
};

// Returns the folder path (with trailing slash) once every file matches git.
export const ensureLegacyClient = () => {
  mkdirSync(legacyDir, { recursive: true });
  for (const file of FILES) {
    const expected = gitShow(file);
    const path = legacyDir + file;
    if (!existsSync(path)) {
      writeFileSync(path, expected);
      console.log(`legacy client: rebuilt ${file} from git ${LEGACY_REV}`);
    } else if (readFileSync(path, 'utf8') !== expected) {
      throw new Error(`${path} differs from git ${LEGACY_REV}. Delete ${legacyDir} to rebuild it.`);
    }
  }
  return legacyDir;
};
