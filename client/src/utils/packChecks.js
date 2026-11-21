// client/src/utils/packChecks.js
//
// One pre-flight check for the customer pack (Emitter Sizing) and the quote
// pack (Quote Builder), so both ask the same question in the same words.
//
// Simon, 20 Nov: two choices only — OK generates the pack as it stands,
// Cancel stops so the design can be put right first. Nothing is silently
// dropped from a pack.

import { designSummaryIncomplete } from './buildCustomerDesignSummaryPayload';
import { mcsSnapshotStatus } from './mcsSnapshotStatus';

// → array of { key, text } describing what is not ready. Empty = all ready.
export function packIssues(project, customerDesignData) {
  const issues = [];

  if (customerDesignData && designSummaryIncomplete(customerDesignData)) {
    const { missing, warning } = customerDesignData.counts;
    const parts = [];
    if (missing) parts.push(`${missing} missing`);
    if (warning) parts.push(`${warning} to check`);
    issues.push({
      key: 'design',
      text: `Customer design information: ${parts.join(', ')} (Heat Loss Summary). ` +
            'Missing items will print as "To be confirmed before installation".',
    });
  }

  const mcs = mcsSnapshotStatus(project);
  if (!mcs.hasSnapshot || !(Number(mcs.snapshot.spf) > 0)) {
    issues.push({
      key: 'mcs031_missing',
      text: 'MCS 031 performance estimate: none saved (MCS 031 tab → Calculate & Save). ' +
            'The pack will not include one.',
    });
  } else if (mcs.snapshot.systemProvides === 'hybrid') {
    issues.push({
      key: 'mcs031_hybrid',
      text: 'MCS 031 performance estimate: calculated as a hybrid system, which is no longer an option ' +
            '(MCS 031 tab → choose what the system provides → Recalculate & Save). The saved estimate will be printed as it is.',
    });
  } else if (mcs.inputsChanged) {
    issues.push({
      key: 'mcs031_inputs',
      text: 'MCS 031 performance estimate: inputs have changed since it was calculated ' +
            '(MCS 031 tab → Recalculate & Save). The saved estimate will be printed as it is.',
    });
  } else if (mcs.notesOutdated) {
    issues.push({
      key: 'mcs031_notes',
      text: 'MCS 031 performance estimate: calculated with an earlier warning notes table ' +
            '(MCS 031 tab → Recalculate & Save). The saved notes will be printed as they are.',
    });
  }

  return issues;
}

// true = go ahead. Asks only when something is not ready.
export function confirmPackIssues(issues, packName, confirm = window.confirm) {
  if (!issues.length) return true;
  return confirm(
    `Before generating the ${packName}:\n\n` +
    issues.map(i => `• ${i.text}`).join('\n\n') +
    `\n\nOK: generate the ${packName} anyway.\n` +
    'Cancel: stop, so you can put these right first.'
  );
}
