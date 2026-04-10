// client/src/utils/api.js
const API_BASE = '/api';

export const api = {

  // ==========================================================
  // DASHBOARD
  // ==========================================================

  getDashboard: () =>
    fetch(`${API_BASE}/dashboard`).then(r => r.json()),

  // ==========================================================
  // COMPANY
  // ==========================================================

  getCompany: () =>
    fetch(`${API_BASE}/company`).then(r => r.json()),

  updateCompany: (data) =>
    fetch(`${API_BASE}/company`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }).then(r => r.json()),

  // ==========================================================
  // CLIENTS
  // ==========================================================

  getClients: () =>
    fetch(`${API_BASE}/clients`).then(r => r.json()),

  getClient: (id) =>
    fetch(`${API_BASE}/clients/${id}`).then(r => r.json()),

  searchClients: (q) =>
    fetch(`${API_BASE}/clients/search?q=${encodeURIComponent(q)}`).then(r => r.json()),

  // data shape: { title, firstName, surname, email, telephone, mobile, notes,
  //               address: { addressLine1, addressLine2, town, county, postcode, what3words } }
  createClient: (data) =>
    fetch(`${API_BASE}/clients`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }).then(r => r.json()),

  updateClient: (id, data) =>
    fetch(`${API_BASE}/clients/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }).then(r => r.json()),

  // ==========================================================
  // ADDRESSES
  // ==========================================================

  // Add a new address and link it to a client
  addClientAddress: (clientId, data) =>
    fetch(`${API_BASE}/clients/${clientId}/addresses`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }).then(r => r.json()),

  // Add a new address and link it to a project
  addProjectAddress: (projectId, data) =>
    fetch(`${API_BASE}/projects/${projectId}/addresses`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }).then(r => r.json()),

  // Link an existing address (e.g. client's) to a project
  linkAddressToProject: (projectId, addressId, addressType = 'installation') =>
    fetch(`${API_BASE}/projects/${projectId}/addresses/link`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ addressId, addressType, isPrimary: true }),
    }).then(r => r.json()),

  updateAddress: (id, data) =>
    fetch(`${API_BASE}/addresses/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }).then(r => r.json()),

  // ==========================================================
  // PROJECTS
  // ==========================================================

  getProjects: () =>
    fetch(`${API_BASE}/projects`).then(r => r.json()),

  getProject: (id) =>
    fetch(`${API_BASE}/projects/${id}`).then(r => r.json()),

  // data shape: { clientId, name, status, designer, installationAddressId? }
  createProject: (data) =>
    fetch(`${API_BASE}/projects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }).then(r => r.json()),

  // Updates project core fields only: name, status, designer, briefNotes
  updateProject: (id, data) =>
    fetch(`${API_BASE}/projects/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }).then(r => r.json()),

  // Updates all technical design data
  updateDesignParams: (projectId, data) =>
    fetch(`${API_BASE}/projects/${projectId}/design-params`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }).then(r => r.json()),

  updateProjectStatus: (id, status) =>
    fetch(`${API_BASE}/projects/${id}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    }).then(r => r.json()),

  deleteProject: (id) =>
    fetch(`${API_BASE}/projects/${id}`, {
      method: 'DELETE',
    }).then(r => r.json()),

  // ==========================================================
  // ROOMS
  // ==========================================================

  createRoom: (data) =>
    fetch(`${API_BASE}/rooms`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }).then(r => r.json()),

  updateRoom: (id, data) =>
    fetch(`${API_BASE}/rooms/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }).then(r => r.json()),

  deleteRoom: (id) =>
    fetch(`${API_BASE}/rooms/${id}`, {
      method: 'DELETE',
    }).then(r => r.json()),

  // ==========================================================
  // ELEMENTS
  // ==========================================================

  createElement: (data) =>
    fetch(`${API_BASE}/elements`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }).then(r => r.json()),

  updateElement: (id, data) =>
    fetch(`${API_BASE}/elements/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }).then(r => r.json()),

  deleteElement: (id) =>
    fetch(`${API_BASE}/elements/${id}`, {
      method: 'DELETE',
    }).then(r => r.json()),

  // ==========================================================
  // U-VALUE LIBRARY
  // ==========================================================

  getUValues: (projectId) =>
    fetch(`${API_BASE}/projects/${projectId}/u-values`).then(r => r.json()),

  createUValue: (data) =>
    fetch(`${API_BASE}/u-values`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }).then(r => r.json()),

  updateUValue: (id, data) =>
    fetch(`${API_BASE}/u-values/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }).then(r => r.json()),

  deleteUValue: (id) =>
    fetch(`${API_BASE}/u-values/${id}`, {
      method: 'DELETE',
    }).then(r => r.json()),

  // ==========================================================
  // RADIATOR SPECS
  // ==========================================================

  getRadiatorSpecs: () =>
    fetch(`${API_BASE}/radiator-specs`).then(r => r.json()),

  createRadiatorSpec: (data) =>
    fetch(`${API_BASE}/radiator-specs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }).then(r => r.json()),

  updateRadiatorSpec: (id, data) =>
    fetch(`${API_BASE}/radiator-specs/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }).then(r => r.json()),

  deleteRadiatorSpec: (id) =>
    fetch(`${API_BASE}/radiator-specs/${id}`, {
      method: 'DELETE',
    }).then(r => r.json()),

    getRadiatorSpecUsage: (id) =>
  fetch(`${API_BASE}/radiator-specs/${id}/usage`).then(r => r.json()),

  updateRadiatorSpec: (id, data) =>
    fetch(`${API_BASE}/radiator-specs/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }).then(r => r.json()),

  // ==========================================================
  // ROOM EMITTERS
  // ==========================================================

  createRoomEmitter: (data) =>
    fetch(`${API_BASE}/room-emitters`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }).then(r => r.json()),

  updateRoomEmitter: (id, data) =>
    fetch(`${API_BASE}/room-emitters/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }).then(r => r.json()),

  deleteRoomEmitter: (id) =>
    fetch(`${API_BASE}/room-emitters/${id}`, {
      method: 'DELETE',
    }).then(r => r.json()),

  // ==========================================================
  // RADIATOR SCHEDULE
  // ==========================================================

  getRadiatorSchedule: (roomId) =>
    fetch(`${API_BASE}/rooms/${roomId}/schedule`).then(r => r.json()),

  createRadiatorSchedule: (data) =>
    fetch(`${API_BASE}/schedule`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }).then(r => r.json()),

  updateRadiatorSchedule: (id, data) =>
    fetch(`${API_BASE}/schedule/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }).then(r => r.json()),

  deleteRadiatorSchedule: (id) =>
    fetch(`${API_BASE}/schedule/${id}`, {
      method: 'DELETE',
    }).then(r => r.json()),

  markRadiatorScheduleComplete: (roomId, isComplete) =>
    fetch(`${API_BASE}/rooms/${roomId}/schedule/complete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isComplete }),
    }).then(r => r.json()),

    // UFH Specs
  getUFHSpecs: (roomId) =>
    fetch(`${API_BASE}/rooms/${roomId}/ufh-specs`).then(r => r.json()),

  updateUFHSpecs: (roomId, data) =>
    fetch(`${API_BASE}/rooms/${roomId}/ufh-specs`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }).then(r => r.json()),

    deleteUFHSpecs: (roomId) =>
    fetch(`${API_BASE}/rooms/${roomId}/ufh-specs`, {
      method: 'DELETE',
    }).then(r => r.json()),

  // Survey
  getSurvey: (projectId) =>
    fetch(`${API_BASE}/projects/${projectId}/survey`).then(r => r.json()),

  saveSurvey: (projectId, data) =>
    fetch(`${API_BASE}/projects/${projectId}/survey`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }).then(r => r.json()),

  // Quotes
  getQuote: (projectId) =>
    fetch(`${API_BASE}/projects/${projectId}/quotes`).then(r => r.json()),

  createQuote: (projectId, data) =>
    fetch(`${API_BASE}/projects/${projectId}/quotes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }).then(r => r.json()),

  updateQuote: (quoteId, data) =>
    fetch(`${API_BASE}/quotes/${quoteId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }).then(r => r.json()),

  updateQuoteItems: (quoteId, items) =>
    fetch(`${API_BASE}/quotes/${quoteId}/items`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items }),
    }).then(r => r.json()),

  };