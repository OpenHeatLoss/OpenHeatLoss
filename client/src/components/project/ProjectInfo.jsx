// client/src/components/project/ProjectInfo.jsx
import { useState } from 'react';
import { getMCSDataFromPostcode } from '../../utils/mcsData';
import VentilationSettings from './VentilationSettings';

// ---------------------------------------------------------------------------
// Reusable info card — read-only display with Edit button that reveals a form
// ---------------------------------------------------------------------------
function InfoCard({ title, subtitle, badge, summary, form, editing, onEdit,
                    onSave, onCancel, saving, saveLabel = 'Save' }) {
  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      <div className="bg-gray-50 px-4 py-3 flex items-center justify-between border-b border-gray-200">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-sm text-gray-700">{title}</span>
          {subtitle && <span className="text-xs text-gray-400">{subtitle}</span>}
        </div>
        <div className="flex items-center gap-2">
          {badge}
          {!editing && (
            <button onClick={onEdit}
              className="text-xs text-blue-600 hover:text-blue-700 border border-blue-300
                         px-3 py-1 rounded hover:bg-blue-50 transition">
              Edit
            </button>
          )}
        </div>
      </div>
      <div className="p-4">
        {editing ? (
          <>
            {form}
            <div className="flex gap-2 mt-4">
              <button onClick={onSave} disabled={saving}
                className="bg-blue-600 text-white px-4 py-2 rounded text-sm
                           hover:bg-blue-700 disabled:opacity-50 transition">
                {saving ? 'Saving…' : saveLabel}
              </button>
              <button onClick={onCancel}
                className="bg-gray-100 text-gray-700 px-4 py-2 rounded text-sm
                           hover:bg-gray-200 transition">
                Cancel
              </button>
            </div>
          </>
        ) : (
          summary
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Reusable address field block
// ---------------------------------------------------------------------------
function AddressFields({ values, onChange, showWhat3words = false }) {
  return (
    <div className="grid grid-cols-2 gap-4">
      <div className="col-span-2">
        <label className="block text-sm font-semibold mb-1">Address line 1</label>
        <input type="text" value={values.addressLine1 || ''}
          onChange={e => onChange('addressLine1', e.target.value)}
          className="w-full border border-gray-300 rounded px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
      </div>
      <div className="col-span-2">
        <label className="block text-sm font-semibold mb-1">Address line 2</label>
        <input type="text" value={values.addressLine2 || ''}
          onChange={e => onChange('addressLine2', e.target.value)}
          className="w-full border border-gray-300 rounded px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
      </div>
      <div>
        <label className="block text-sm font-semibold mb-1">Town</label>
        <input type="text" value={values.town || ''}
          onChange={e => onChange('town', e.target.value)}
          className="w-full border border-gray-300 rounded px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
      </div>
      <div>
        <label className="block text-sm font-semibold mb-1">County</label>
        <input type="text" value={values.county || ''}
          onChange={e => onChange('county', e.target.value)}
          className="w-full border border-gray-300 rounded px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
      </div>
      <div>
        <label className="block text-sm font-semibold mb-1">Postcode</label>
        <input type="text" value={values.postcode || ''}
          onChange={e => onChange('postcode', e.target.value.toUpperCase())}
          placeholder="e.g. BA2 4LJ"
          className="w-full border border-gray-300 rounded px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
      </div>
      {showWhat3words && (
        <div>
          <label className="block text-sm font-semibold mb-1">what3words</label>
          <input type="text" value={values.what3words || ''}
            onChange={e => onChange('what3words', e.target.value)}
            placeholder="e.g. ///filled.count.soap"
            className="w-full border border-gray-300 rounded px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------
export default function ProjectInfo({ project, onUpdate, onUpdateBatch, onUpdateClientAddress, onSaveInstallAddress }) {

  // ── Customer contact details ──────────────────────────────────────────────
  const [editingContact, setEditingContact] = useState(false);
  const [contactDraft, setContactDraft]     = useState({});
  const [savingContact, setSavingContact]   = useState(false);

  const startEditContact = () => {
    setContactDraft({
      customerTitle:     project.customerTitle     || '',
      customerFirstName: project.customerFirstName || '',
      customerSurname:   project.customerSurname   || '',
      customerTelephone: project.customerTelephone || '',
      customerMobile:    project.customerMobile    || '',
      customerEmail:     project.customerEmail     || '',
    });
    setEditingContact(true);
  };

  const saveContact = async () => {
    setSavingContact(true);
    if (onUpdateBatch) onUpdateBatch(contactDraft);
    setSavingContact(false);
    setEditingContact(false);
  };

  // ── Client contact address ────────────────────────────────────────────────
  const clientAddr = project.clientAddresses?.[0] || null;
  const [editingClientAddr, setEditingClientAddr] = useState(false);
  const [clientAddrDraft, setClientAddrDraft]     = useState({});
  const [savingClientAddr, setSavingClientAddr]   = useState(false);

  const startEditClientAddr = () => {
    setClientAddrDraft({
      addressLine1: clientAddr?.address_line_1 || '',
      addressLine2: clientAddr?.address_line_2 || '',
      town:         clientAddr?.town           || '',
      county:       clientAddr?.county         || '',
      postcode:     clientAddr?.postcode       || '',
    });
    setEditingClientAddr(true);
  };

  const saveClientAddr = async () => {
    if (!clientAddr?.id) return;
    setSavingClientAddr(true);
    await onUpdateClientAddress(clientAddr.id, clientAddrDraft);
    setSavingClientAddr(false);
    setEditingClientAddr(false);
  };

  // ── Installation address ──────────────────────────────────────────────────
  const [editingInstall, setEditingInstall] = useState(false);
  const [installDraft, setInstallDraft]     = useState({});
  const [savingInstall, setSavingInstall]   = useState(false);

  const installKeyMap = {
    addressLine1: 'customerAddressLine1',
    addressLine2: 'customerAddressLine2',
    town:         'customerTown',
    county:       'customerCounty',
    postcode:     'customerPostcode',
    what3words:   'customerWhat3words',
  };

  const startEditInstall = () => {
    setInstallDraft({
      addressLine1: project.customerAddressLine1 || '',
      addressLine2: project.customerAddressLine2 || '',
      town:         project.customerTown         || '',
      county:       project.customerCounty       || '',
      postcode:     project.customerPostcode     || '',
      what3words:   project.customerWhat3words   || '',
    });
    setEditingInstall(true);
  };

  const saveInstall = async () => {
    setSavingInstall(true);
    const mapped = {};
    Object.entries(installDraft).forEach(([k, v]) => { mapped[installKeyMap[k]] = v; });
    if (onSaveInstallAddress) {
      await onSaveInstallAddress(mapped);
    } else if (onUpdateBatch) {
      onUpdateBatch(mapped);
    }
    setSavingInstall(false);
    setEditingInstall(false);
  };

  // ── Read-only summary helpers ─────────────────────────────────────────────
  const contactSummary = (
    <dl className="text-sm text-gray-700 space-y-1">
      <div className="flex gap-2">
        <dt className="text-gray-400 w-20 shrink-0">Name</dt>
        <dd className="font-medium">
          {[project.customerTitle, project.customerFirstName, project.customerSurname]
            .filter(Boolean).join(' ') || <span className="text-gray-400 italic">Not set</span>}
        </dd>
      </div>
      {project.customerEmail && (
        <div className="flex gap-2">
          <dt className="text-gray-400 w-20 shrink-0">Email</dt>
          <dd>{project.customerEmail}</dd>
        </div>
      )}
      {project.customerTelephone && (
        <div className="flex gap-2">
          <dt className="text-gray-400 w-20 shrink-0">Tel</dt>
          <dd>{project.customerTelephone}</dd>
        </div>
      )}
      {project.customerMobile && (
        <div className="flex gap-2">
          <dt className="text-gray-400 w-20 shrink-0">Mobile</dt>
          <dd>{project.customerMobile}</dd>
        </div>
      )}
    </dl>
  );

  const addressSummary = (addr) => {
    if (!addr) return <p className="text-sm text-gray-400 italic">No address on record.</p>;
    const line1    = addr.address_line_1 || addr.addressLine1;
    const line2    = addr.address_line_2 || addr.addressLine2;
    const town     = addr.town;
    const county   = addr.county;
    const postcode = addr.postcode;
    const w3w      = addr.what3words;
    if (!line1 && !town && !postcode)
      return <p className="text-sm text-gray-400 italic">No address on record.</p>;
    return (
      <address className="not-italic text-sm text-gray-700 leading-6">
        {line1    && <div>{line1}</div>}
        {line2    && <div>{line2}</div>}
        {town     && <div>{town}</div>}
        {county   && <div>{county}</div>}
        {postcode && <div className="font-medium">{postcode}</div>}
        {w3w      && <div className="text-gray-400 text-xs mt-1">{w3w}</div>}
      </address>
    );
  };

  const installMCS = project.customerPostcode
    ? getMCSDataFromPostcode(project.customerPostcode)
    : null;

  const installSummary = (
    <>
      {addressSummary({
        address_line_1: project.customerAddressLine1,
        address_line_2: project.customerAddressLine2,
        town:           project.customerTown,
        county:         project.customerCounty,
        postcode:       project.customerPostcode,
        what3words:     project.customerWhat3words,
      })}
      {project.customerPostcode && (
        <div className="mt-3">
          {installMCS ? (
            <span className="text-xs text-green-700 bg-green-50 border border-green-200 px-3 py-1.5 rounded">
              ✓ {project.customerPostcode} — design temp {installMCS.lowTemp}°C · {installMCS.degreeDays} degree days
            </span>
          ) : (
            <span className="text-xs text-amber-700 bg-amber-50 border border-amber-200 px-3 py-1.5 rounded">
              ⚠ Postcode not in MCS 031 Table 1 — set design temperature manually
            </span>
          )}
        </div>
      )}
    </>
  );

  const mcsBadge = (
    <span className="text-xs bg-blue-50 text-blue-700 border border-blue-200 px-2 py-0.5 rounded font-medium">
      🌡 Sets design temperature
    </span>
  );

  return (
    <div className="space-y-8">

      {/* ── Project Information ─────────────────────────────────────── */}
      <div>
        <h2 className="text-xl font-bold mb-4 pb-2 border-b-2 border-gray-300">Project Information</h2>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-semibold mb-1">Project Name</label>
            <input type="text" value={project.name || ''}
              onChange={e => onUpdate('name', e.target.value)}
              className="w-full border border-gray-300 rounded px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
          </div>
          <div>
            <label className="block text-sm font-semibold mb-1">Designer / Engineer</label>
            <input type="text" value={project.designer || ''}
              onChange={e => onUpdate('designer', e.target.value)}
              className="w-full border border-gray-300 rounded px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
          </div>
          <div>
            <label className="block text-sm font-semibold mb-1">Status</label>
            <select value={project.status || 'enquiry'}
              onChange={e => onUpdate('status', e.target.value)}
              className="w-full border border-gray-300 rounded px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent">
              <option value="enquiry">Enquiry</option>
              <option value="survey_booked">Survey booked</option>
              <option value="survey_done">Survey done</option>
              <option value="in_design">In design</option>
              <option value="quote_sent">Quote sent</option>
              <option value="quote_accepted">Quote accepted</option>
              <option value="installation_booked">Install booked</option>
              <option value="design_review">Design review</option>
              <option value="installed">Installed</option>
              <option value="commissioned">Commissioned</option>
              <option value="closed">Closed</option>
              <option value="lost">Lost</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-semibold mb-1">Brief Notes</label>
            <input type="text" value={project.briefNotes || ''}
              onChange={e => onUpdate('briefNotes', e.target.value)}
              className="w-full border border-gray-300 rounded px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
          </div>
        </div>
      </div>

      {/* ── Customer Information ────────────────────────────────────── */}
      <div>
        <h2 className="text-xl font-bold mb-4 pb-2 border-b-2 border-gray-300">Customer Information</h2>
        <div className="space-y-4">

          <InfoCard
            title="Contact details"
            editing={editingContact}
            onEdit={startEditContact}
            onSave={saveContact}
            onCancel={() => setEditingContact(false)}
            saving={savingContact}
            saveLabel="Save contact"
            summary={contactSummary}
            form={
              <>
                <div className="grid grid-cols-3 gap-4 mb-4">
                  <div>
                    <label className="block text-sm font-semibold mb-1">Title</label>
                    <select value={contactDraft.customerTitle || ''}
                      onChange={e => setContactDraft(p => ({ ...p, customerTitle: e.target.value }))}
                      className="w-full border border-gray-300 rounded px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent">
                      <option value="">Select...</option>
                      <option value="Mr">Mr</option>
                      <option value="Mrs">Mrs</option>
                      <option value="Miss">Miss</option>
                      <option value="Ms">Ms</option>
                      <option value="Dr">Dr</option>
                      <option value="Prof">Prof</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-semibold mb-1">First Name</label>
                    <input type="text" value={contactDraft.customerFirstName || ''}
                      onChange={e => setContactDraft(p => ({ ...p, customerFirstName: e.target.value }))}
                      className="w-full border border-gray-300 rounded px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold mb-1">Surname</label>
                    <input type="text" value={contactDraft.customerSurname || ''}
                      onChange={e => setContactDraft(p => ({ ...p, customerSurname: e.target.value }))}
                      className="w-full border border-gray-300 rounded px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-semibold mb-1">Telephone</label>
                    <input type="tel" value={contactDraft.customerTelephone || ''}
                      onChange={e => setContactDraft(p => ({ ...p, customerTelephone: e.target.value }))}
                      className="w-full border border-gray-300 rounded px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold mb-1">Mobile</label>
                    <input type="tel" value={contactDraft.customerMobile || ''}
                      onChange={e => setContactDraft(p => ({ ...p, customerMobile: e.target.value }))}
                      className="w-full border border-gray-300 rounded px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-sm font-semibold mb-1">Email</label>
                    <input type="email" value={contactDraft.customerEmail || ''}
                      onChange={e => setContactDraft(p => ({ ...p, customerEmail: e.target.value }))}
                      className="w-full border border-gray-300 rounded px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
                  </div>
                </div>
              </>
            }
          />

          <InfoCard
            title="Client contact address"
            subtitle="billing / correspondence"
            editing={editingClientAddr}
            onEdit={startEditClientAddr}
            onSave={saveClientAddr}
            onCancel={() => setEditingClientAddr(false)}
            saving={savingClientAddr}
            saveLabel="Save address"
            summary={addressSummary(clientAddr)}
            form={
              <AddressFields
                values={clientAddrDraft}
                onChange={(field, val) => setClientAddrDraft(p => ({ ...p, [field]: val }))}
              />
            }
          />
        </div>
      </div>

      {/* ── Installation Address ────────────────────────────────────── */}
      <div>
        <h2 className="text-xl font-bold mb-4 pb-2 border-b-2 border-gray-300">Installation Address</h2>
        <InfoCard
          title="Installation address"
          badge={mcsBadge}
          editing={editingInstall}
          onEdit={startEditInstall}
          onSave={saveInstall}
          onCancel={() => setEditingInstall(false)}
          saving={savingInstall}
          saveLabel="Save address"
          summary={installSummary}
          form={
            <>
              <AddressFields
                values={installDraft}
                onChange={(field, val) =>
                  setInstallDraft(p => ({ ...p, [field]: field === 'postcode' ? val.toUpperCase() : val }))
                }
                showWhat3words
              />
              {installDraft.postcode && (
                <div className="mt-3">
                  {getMCSDataFromPostcode(installDraft.postcode) ? (
                    <span className="text-xs text-green-700 bg-green-50 border border-green-200 px-3 py-1.5 rounded">
                      ✓ {installDraft.postcode} — design temp {getMCSDataFromPostcode(installDraft.postcode).lowTemp}°C
                    </span>
                  ) : (
                    <span className="text-xs text-amber-700 bg-amber-50 border border-amber-200 px-3 py-1.5 rounded">
                      ⚠ Postcode not in MCS 031 Table 1
                    </span>
                  )}
                </div>
              )}
            </>
          }
        />
      </div>

      {/* ── Design Parameters ───────────────────────────────────────── */}
      <div>
        <h2 className="text-xl font-bold mb-4 pb-2 border-b-2 border-gray-300">Design Parameters</h2>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-semibold mb-1">External Design Temperature (°C)</label>
            <input type="number" step="0.1" value={project.externalTemp}
              onChange={e => onUpdate('externalTemp', parseFloat(e.target.value))}
              className="w-full border border-gray-300 rounded px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
            {project.mcsOutdoorLowTemp !== 0 ? (
              project.externalTemp !== project.mcsOutdoorLowTemp ? (
                <p className="text-xs mt-1">
                  <span className="text-amber-600 font-medium">✎ Custom value</span>
                  <span className="text-gray-500"> — postcode default: {project.mcsOutdoorLowTemp}°C (MCS MGD007)</span>
                </p>
              ) : (
                <p className="text-xs text-gray-500 mt-1">
                  From postcode lookup (MCS MGD007) — editable. Custom values are preserved on save.
                </p>
              )
            ) : (
              <p className="text-xs text-gray-500 mt-1">
                Auto-set from installation postcode using MCS MGD007. Enter postcode in Installation Address above.
              </p>
            )}
          </div>
          <div>
            <label className="block text-sm font-semibold mb-1">Annual Average Temperature (°C)</label>
            <input type="number" step="0.1" value={project.annualAvgTemp}
              onChange={e => onUpdate('annualAvgTemp', parseFloat(e.target.value))}
              className="w-full border border-gray-300 rounded px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
            <p className="text-xs text-gray-500 mt-1">
              Used for legacy calculations. For ventilation typical load, set the Reference Temperature (Te,ref) in the Ventilation section below.
            </p>
          </div>
        </div>
      </div>

      {/* ── Ventilation & Air Permeability ──────────────────────────── */}
      <div>
        <h2 className="text-xl font-bold mb-4 pb-2 border-b-2 border-gray-300">
          Ventilation & Air Permeability
        </h2>
        <VentilationSettings
          project={project}
          onUpdate={onUpdate}
          onUpdateBatch={onUpdateBatch}
        />
      </div>

    </div>
  );
}
