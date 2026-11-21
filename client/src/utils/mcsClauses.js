// client/src/utils/mcsClauses.js
//
// MCS standard references in one place. MCS has more than one version of the
// heat pump design standard live on its website at once, with different clause
// numbering (the customer information list is 5.9.2 in MIS 3005-D V3.0 and
// 3.8.1 in another version). When MCS renumbers or reissues, change this file
// only — every screen and PDF that cites a clause reads it from here.

export const MCS_DESIGN_STANDARD = {
  name:      'MIS 3005-D',
  version:   'V3.0',
  title:     'The Heat Pump Design Standard',
  published: 'December 2025',
};

export const designStandardLabel = () =>
  `${MCS_DESIGN_STANDARD.name} ${MCS_DESIGN_STANDARD.version}`;

// Information to be given to the customer in writing before installation.
export const CUSTOMER_DESIGN_INFO_CLAUSE = '5.9.2';

export const CUSTOMER_DESIGN_INFO_ITEMS = [
  { key: 'a', clause: '5.9.2(a)', title: 'Room heat losses (W/m²)' },
  { key: 'b', clause: '5.9.2(b)', title: 'Daily hot water demand' },
  { key: 'c', clause: '5.9.2(c)', title: 'Emitter types and dimensions' },
  { key: 'd', clause: '5.9.2(d)', title: 'Design emitter temperature (worst performing room)' },
  { key: 'e', clause: '5.9.2(e)', title: 'New hot water cylinder and recovery rate' },
  { key: 'f', clause: '5.9.2(f)', title: 'Design flow temperature leaving the heat pump, before any blending' },
  { key: 'g', clause: '5.9.2(g)', title: 'SCoP/SPER at the design flow temperature' },
];

export const DHW_CLAUSES = {
  demand:        '5.6.2',
  cylinderSize:  '5.6.3',
  reheatAgreed:  '5.6.4',
};

// MCS 031 calculator the SPF table and warning notes are generated from.
export const MCS031_CALCULATOR = 'MCS031-HPSPE v4.02';
