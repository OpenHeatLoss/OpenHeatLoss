// client/src/components/project/NewProjectModal.jsx
import { useState, useEffect, useRef } from 'react';
import { api } from '../../utils/api';

// Steps in the modal flow
const STEP_SEARCH  = 'search';   // Search for existing client
const STEP_NEW     = 'new';      // Create new client form
const STEP_ADDRESS = 'address';  // Installation address step

// ----------------------------------------------------------------
// AddressFields must be defined OUTSIDE NewProjectModal.
// If it were inside, React would treat it as a new component type
// on every render (every keystroke), unmount and remount it,
// and the focused input would lose focus each time.
// ----------------------------------------------------------------
function AddressFields({ values, onChange, label }) {
  return (
    <div>
      {label && (
        <p className="text-sm font-semibold text-gray-700 mb-3">{label}</p>
      )}
      <div className="space-y-3">
        <input
          type="text"
          placeholder="Address line 1"
          value={values.addressLine1}
          onChange={e => onChange('addressLine1', e.target.value)}
          className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
        <input
          type="text"
          placeholder="Address line 2"
          value={values.addressLine2}
          onChange={e => onChange('addressLine2', e.target.value)}
          className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
        <div className="grid grid-cols-2 gap-3">
          <input
            type="text"
            placeholder="Town"
            value={values.town}
            onChange={e => onChange('town', e.target.value)}
            className="border border-gray-300 rounded px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
          <input
            type="text"
            placeholder="County"
            value={values.county}
            onChange={e => onChange('county', e.target.value)}
            className="border border-gray-300 rounded px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <input
            type="text"
            placeholder="Postcode"
            value={values.postcode}
            onChange={e => onChange('postcode', e.target.value.toUpperCase())}
            className="border border-gray-300 rounded px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
          <input
            type="text"
            placeholder="what3words (optional)"
            value={values.what3words}
            onChange={e => onChange('what3words', e.target.value)}
            className="border border-gray-300 rounded px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>
      </div>
    </div>
  );
}


export default function NewProjectModal({ onCreated, onCancel }) {
  // -- Search step state --
  const [searchQuery, setSearchQuery]   = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching]       = useState(false);
  const [step, setStep]                 = useState(STEP_SEARCH);

  // -- Selected / new client state --
  const [selectedClient, setSelectedClient] = useState(null);
  const [newClient, setNewClient] = useState({
    title: '', firstName: '', surname: '',
    email: '', telephone: '', mobile: '', notes: '',
  });

  // -- Address step state --
  // useClientAddress: true = reuse client's primary address
  //                   false = enter a separate installation address
  const [useClientAddress, setUseClientAddress] = useState(true);
  const [installAddress, setInstallAddress] = useState({
    addressLine1: '', addressLine2: '', town: '',
    county: '', postcode: '', what3words: '',
  });

  // -- New client address (captured alongside the client) --
  const [clientAddress, setClientAddress] = useState({
    addressLine1: '', addressLine2: '', town: '',
    county: '', postcode: '', what3words: '',
  });

  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState(null);
  const searchRef = useRef(null);

  // Focus the search box on mount
  useEffect(() => {
    searchRef.current?.focus();
  }, []);

  // Debounced search — fires 300ms after the user stops typing
  useEffect(() => {
    if (searchQuery.trim().length < 2) {
      setSearchResults([]);
      return;
    }
    setSearching(true);
    const timer = setTimeout(async () => {
      try {
        const results = await api.searchClients(searchQuery);
        setSearchResults(results);
      } catch {
        setSearchResults([]);
      } finally {
        setSearching(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const handleSelectClient = (client) => {
    setSelectedClient(client);
    setStep(STEP_ADDRESS);
  };

  const handleNewClientSubmit = () => {
    if (!newClient.surname.trim()) {
      setError('Surname is required');
      return;
    }
    setError(null);
    // Move to address step — client gets created alongside the project
    setStep(STEP_ADDRESS);
  };

  const handleCreate = async () => {
    setSaving(true);
    setError(null);
    try {
      let clientId;

      if (selectedClient) {
        // Existing client — use their id directly
        clientId = selectedClient.id;
      } else {
        // Create new client with their address
        const created = await api.createClient({
          ...newClient,
          address: clientAddress,
        });
        clientId = created.id;
      }

      // Determine the installation address id to link to the project
      let installationAddressId = null;

      if (useClientAddress) {
        // Reuse the client's primary address
        // For an existing client it's already on their record.
        // For a new client we just created it — fetch it back.
        const clientRecord = await api.getClient(clientId);
        const primary = clientRecord.addresses?.find(a => a.is_primary);
        installationAddressId = primary?.id || null;
      }
      // If useClientAddress is false we'll add the installation address
      // after project creation via a separate call.

      // Build the project name from surname + postcode
      const postcode = useClientAddress
        ? (selectedClient?.postcode || clientAddress.postcode)
        : installAddress.postcode;
      const surname  = selectedClient?.surname || newClient.surname;
      const projectName = `${surname}${postcode ? ' — ' + postcode.toUpperCase() : ''}`;

      // Create the project
      const project = await api.createProject({
        clientId,
        name: projectName,
        status: 'enquiry',
        installationAddressId,
      });

      // If a separate installation address was entered, add it now
      if (!useClientAddress && installAddress.postcode) {
        await api.addProjectAddress(project.id, {
          ...installAddress,
          addressType: 'installation',
          isPrimary: true,
        });
      }

      onCreated(project.id);
    } catch (err) {
      setError('Something went wrong — please try again.');
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  // ----------------------------------------------------------------
  // Render
  // ----------------------------------------------------------------
  return (
    // Faux modal overlay — uses normal flow so iframe height works correctly
    <div style={{
      minHeight: '500px',
      background: 'rgba(0,0,0,0.45)',
      display: 'flex',
      alignItems: 'flex-start',
      justifyContent: 'center',
      paddingTop: '60px',
      paddingBottom: '40px',
    }}>
      <div className="bg-white rounded-lg shadow-xl w-full max-w-lg mx-4 overflow-hidden">

        {/* Header */}
        <div className="bg-blue-600 text-white px-6 py-4 flex justify-between items-center">
          <h2 className="text-lg font-semibold">
            {step === STEP_SEARCH  && 'New project — find client'}
            {step === STEP_NEW     && 'New project — new client'}
            {step === STEP_ADDRESS && 'New project — installation address'}
          </h2>
          <button
            onClick={onCancel}
            className="text-blue-200 hover:text-white text-xl leading-none"
          >
            ✕
          </button>
        </div>

        <div className="p-6 space-y-5">

          {/* ---- STEP: SEARCH ---- */}
          {step === STEP_SEARCH && (
            <>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Search by name or postcode
                </label>
                <input
                  ref={searchRef}
                  type="text"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  placeholder="e.g. Williams or BA2 4LJ"
                  className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              {/* Search results */}
              {searching && (
                <p className="text-sm text-gray-500">Searching...</p>
              )}

              {!searching && searchResults.length > 0 && (
                <div className="border border-gray-200 rounded-lg overflow-hidden">
                  {searchResults.map(client => (
                    <button
                      key={client.id}
                      onClick={() => handleSelectClient(client)}
                      className="w-full text-left px-4 py-3 hover:bg-blue-50 border-b border-gray-100 last:border-0 transition"
                    >
                      <div className="font-semibold text-sm text-gray-800">
                        {client.title && `${client.title} `}
                        {client.first_name} {client.surname}
                      </div>
                      <div className="text-xs text-gray-500 mt-0.5">
                        {[client.address_line_1, client.town, client.postcode]
                          .filter(Boolean).join(', ')}
                      </div>
                    </button>
                  ))}
                </div>
              )}

              {!searching && searchQuery.trim().length >= 2 && searchResults.length === 0 && (
                <p className="text-sm text-gray-500">No clients found.</p>
              )}

              {/* Divider */}
              <div className="flex items-center gap-3">
                <div className="flex-1 border-t border-gray-200" />
                <span className="text-xs text-gray-400">or</span>
                <div className="flex-1 border-t border-gray-200" />
              </div>

              <button
                onClick={() => setStep(STEP_NEW)}
                className="w-full border-2 border-dashed border-blue-300 text-blue-600 rounded-lg py-3 text-sm font-semibold hover:bg-blue-50 transition"
              >
                + Create new client
              </button>
            </>
          )}

          {/* ---- STEP: NEW CLIENT ---- */}
          {step === STEP_NEW && (
            <>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Title</label>
                  <select
                    value={newClient.title}
                    onChange={e => setNewClient(p => ({ ...p, title: e.target.value }))}
                    className="w-full border border-gray-300 rounded px-2 py-2 text-sm focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">—</option>
                    {['Mr','Mrs','Miss','Ms','Dr','Prof'].map(t => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">First name</label>
                  <input
                    type="text"
                    value={newClient.firstName}
                    onChange={e => setNewClient(p => ({ ...p, firstName: e.target.value }))}
                    className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">
                    Surname <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={newClient.surname}
                    onChange={e => setNewClient(p => ({ ...p, surname: e.target.value }))}
                    className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Email</label>
                  <input
                    type="email"
                    value={newClient.email}
                    onChange={e => setNewClient(p => ({ ...p, email: e.target.value }))}
                    className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Telephone</label>
                  <input
                    type="tel"
                    value={newClient.telephone}
                    onChange={e => setNewClient(p => ({ ...p, telephone: e.target.value }))}
                    className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Mobile</label>
                <input
                  type="tel"
                  value={newClient.mobile}
                  onChange={e => setNewClient(p => ({ ...p, mobile: e.target.value }))}
                  className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <AddressFields
                label="Client contact address"
                values={clientAddress}
                onChange={(field, val) =>
                  setClientAddress(p => ({ ...p, [field]: val }))
                }
              />

              {error && (
                <p className="text-sm text-red-600">{error}</p>
              )}
            </>
          )}

          {/* ---- STEP: ADDRESS ---- */}
          {step === STEP_ADDRESS && (
            <>
              {/* Show who we're creating the project for */}
              <div className="bg-gray-50 rounded-lg px-4 py-3 text-sm">
                <span className="text-gray-500">Client: </span>
                <span className="font-semibold text-gray-800">
                  {selectedClient
                    ? `${selectedClient.title ? selectedClient.title + ' ' : ''}${selectedClient.first_name} ${selectedClient.surname}`
                    : `${newClient.title ? newClient.title + ' ' : ''}${newClient.firstName} ${newClient.surname}`
                  }
                </span>
              </div>

              <div>
                <p className="text-sm font-semibold text-gray-700 mb-3">
                  Installation address
                </p>

                {/* Only offer "use client address" if client has one */}
                {(selectedClient?.postcode || clientAddress.postcode) && (
                  <div className="space-y-2 mb-4">
                    <label className="flex items-center gap-3 cursor-pointer">
                      <input
                        type="radio"
                        checked={useClientAddress}
                        onChange={() => setUseClientAddress(true)}
                        className="text-blue-600"
                      />
                      <span className="text-sm text-gray-700">
                        Same as client contact address
                        {(selectedClient?.postcode || clientAddress.postcode) && (
                          <span className="text-gray-500 ml-1">
                            ({selectedClient?.postcode || clientAddress.postcode})
                          </span>
                        )}
                      </span>
                    </label>
                    <label className="flex items-center gap-3 cursor-pointer">
                      <input
                        type="radio"
                        checked={!useClientAddress}
                        onChange={() => setUseClientAddress(false)}
                        className="text-blue-600"
                      />
                      <span className="text-sm text-gray-700">
                        Different installation address
                      </span>
                    </label>
                  </div>
                )}

                {(!useClientAddress || (!selectedClient?.postcode && !clientAddress.postcode)) && (
                  <AddressFields
                    values={installAddress}
                    onChange={(field, val) =>
                      setInstallAddress(p => ({ ...p, [field]: val }))
                    }
                  />
                )}
              </div>

              {error && (
                <p className="text-sm text-red-600">{error}</p>
              )}
            </>
          )}
        </div>

        {/* Footer buttons */}
        <div className="px-6 pb-6 flex justify-between gap-3">
          {/* Back button */}
          <button
            onClick={() => {
              setError(null);
              if (step === STEP_ADDRESS) {
                setStep(selectedClient ? STEP_SEARCH : STEP_NEW);
              } else if (step === STEP_NEW) {
                setStep(STEP_SEARCH);
              } else {
                onCancel();
              }
            }}
            className="text-sm text-gray-500 hover:text-gray-700 transition"
          >
            ← Back
          </button>

          {/* Forward / create button */}
          {step === STEP_SEARCH && (
            <span className="text-xs text-gray-400 self-center">
              Select a client or create a new one above
            </span>
          )}

          {step === STEP_NEW && (
            <button
              onClick={handleNewClientSubmit}
              className="bg-blue-600 text-white px-5 py-2 rounded-lg hover:bg-blue-700 text-sm font-semibold transition"
            >
              Next: address →
            </button>
          )}

          {step === STEP_ADDRESS && (
            <button
              onClick={handleCreate}
              disabled={saving}
              className="bg-green-600 text-white px-5 py-2 rounded-lg hover:bg-green-700 text-sm font-semibold transition disabled:opacity-50"
            >
              {saving ? 'Creating...' : 'Create project'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}