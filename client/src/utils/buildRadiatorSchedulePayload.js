// client/src/utils/buildRadiatorSchedulePayload.js
//
// Shared utility that assembles the radiator schedule PDF payload.
// Used by RadiatorSizing.jsx for both the standalone export and the
// customer pack — one place to change the payload shape.
//
// roomData must already be computed by the caller (it requires access to
// checkRoomSufficiency and calculateMWAT which live in RadiatorSizing).
// This utility handles only the project-level fields that were previously
// duplicated and inconsistent between the two export paths.

export function buildRadiatorSchedulePayload(project, systemSettings, roomData) {
  return {
    projectName:       project.name              || 'Untitled Project',
    // Full joined address — matches buildHeatLossPayload and what the
    // Python generator uses for the "Location" header cell.
    location:         [project.customerAddressLine1, project.customerAddressLine2,
                       project.customerTown, project.customerPostcode]
                        .filter(Boolean).join(', ') || '',
    designer:          project.designer          || '',
    customerTitle:     project.customerTitle     || '',
    customerFirstName: project.customerFirstName || '',
    customerSurname:   project.customerSurname   || '',
    // customerAddress omits postcode — shown separately in the PDF header
    customerAddress:  [project.customerAddressLine1, project.customerAddressLine2,
                       project.customerTown]
                        .filter(Boolean).join(', ') || '',
    customerPostcode:  project.customerPostcode  || '',
    flowTemp:          systemSettings.flowTemp,
    returnTemp:        systemSettings.returnTemp,
    externalTemp:      project.externalTemp      ?? -3,
    totalHeatLoss:     roomData.reduce((s, r) => s + r.heatLoss, 0) / 1000,
    numberOfRooms:     roomData.length,
    rooms:             roomData,
  };
}
