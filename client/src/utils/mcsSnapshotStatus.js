// client/src/utils/mcsSnapshotStatus.js
//
// Is the saved MCS 031 estimate (project.mcsCalculationSnapshot) still valid
// for the project as it stands? Moved out of MCS031PerformanceEstimator so the
// tab's "Recalculate" banner and the customer / quote pack checks give the
// same answer.
//
// Two ways a snapshot goes out of date:
//   inputsChanged — any input the calculation reads has changed since it was
//                   saved (fingerprint below). Includes designFlowTemp, which
//                   Emitter Sizing also edits.
//   notesOutdated — saved before the warning notes table was regenerated from
//                   the official calculator (no / older notesVersion).
//
// The fingerprint must list every project field the estimator's calculation
// reads. Changing its shape marks every existing snapshot "inputs changed",
// so only add fields when the calculation starts reading them.
//
// No-EPC route (Appendix A): its inputs — reason, listed SCoP / DHW
// efficiency and their sources, and the heat loss figures the load comes
// from — are added ONLY when that route is selected. EPC-route snapshots
// saved before step 6 keep the same fingerprint and are not flagged.

import { MCS031_NOTES_VERSION } from './mcsWarningNotes';
import { isAppendixA, appendixAFingerprintPart } from './mcsAppendixA';

export function mcsInputFingerprint(project) {
  const base = {
    epcSpaceHeatingDemand: project.epcSpaceHeatingDemand,
    epcHotWaterDemand: project.epcHotWaterDemand,
    epcTotalFloorArea: project.epcTotalFloorArea,
    mcsHeatPumpType: project.mcsHeatPumpType,
    mcsEmitterType: project.mcsEmitterType,
    mcsUFHType: project.mcsUFHType,
    mcsSystemProvides: project.mcsSystemProvides,
    designFlowTemp: project.designFlowTemp,
    mcsCylinderVolume: project.mcsCylinderVolume,
    mcsPasteurizationFreq: project.mcsPasteurizationFreq,
    customerPostcode: project.customerPostcode,
  };
  if (isAppendixA(project)) base.appendixA = appendixAFingerprintPart(project);
  return JSON.stringify(base);
}

export function mcsSnapshotStatus(project) {
  const snapshot = project?.mcsCalculationSnapshot || null;
  const fingerprint = mcsInputFingerprint(project || {});
  if (!snapshot) {
    return { snapshot: null, fingerprint, hasSnapshot: false, inputsChanged: false, notesOutdated: false, stale: false };
  }
  const inputsChanged = snapshot.inputFingerprint !== fingerprint;
  const notesOutdated = snapshot.notesVersion !== MCS031_NOTES_VERSION;
  return { snapshot, fingerprint, hasSnapshot: true, inputsChanged, notesOutdated, stale: inputsChanged || notesOutdated };
}
