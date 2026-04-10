// client/src/components/project/ProjectDashboard.jsx
import { useState, useEffect } from 'react';
import { api } from '../../utils/api';

// All valid pipeline statuses with display labels and badge colours.
// These colour names map to Tailwind classes in BADGE_CLASSES below.
const STATUSES = {
  enquiry:             { label: 'Enquiry',         colour: 'grey'   },
  survey_booked:       { label: 'Survey booked',   colour: 'blue'   },
  survey_done:         { label: 'Survey done',     colour: 'blue'   },
  in_design:           { label: 'In design',       colour: 'amber'  },
  quote_sent:          { label: 'Quote sent',      colour: 'amber'  },
  quote_accepted:      { label: 'Quote accepted',  colour: 'amber'  },
  installation_booked: { label: 'Install booked',  colour: 'green'  },
  design_review:       { label: 'Design review',   colour: 'purple' },
  installed:           { label: 'Installed',       colour: 'purple' },
  commissioned:        { label: 'Commissioned',    colour: 'green'  },
  closed:              { label: 'Closed',          colour: 'grey'   },
  lost:                { label: 'Lost',            colour: 'red'    },
};

// The four visible pipeline columns.
// Each column owns a set of statuses — the grouping is display-only,
// the granular status value is always preserved in the database.
const COLUMNS = [
  {
    id:       'enquiry',
    label:    'Enquiry / Survey',
    border:   'border-gray-400',
    statuses: ['enquiry', 'survey_booked', 'survey_done'],
  },
  {
    id:       'quoting',
    label:    'Design / Quoting',
    border:   'border-amber-500',
    statuses: ['in_design', 'quote_sent', 'quote_accepted'],
  },
  {
    id:       'active',
    label:    'Booked / Active',
    border:   'border-green-600',
    statuses: ['installation_booked', 'design_review', 'installed'],
  },
  {
    id:       'closed',
    label:    'Closed',
    border:   'border-gray-400',
    statuses: ['commissioned', 'closed', 'lost'],
  },
];

// Tailwind badge classes keyed by colour name.
// Keeping these as a lookup avoids dynamic class construction,
// which Tailwind's JIT compiler can't detect and would purge.
const BADGE_CLASSES = {
  grey:   'bg-gray-100 text-gray-600',
  blue:   'bg-blue-100 text-blue-700',
  amber:  'bg-amber-100 text-amber-800',
  green:  'bg-green-100 text-green-700',
  purple: 'bg-purple-100 text-purple-700',
  red:    'bg-red-100 text-red-700',
};

const COUNT_BADGE_CLASSES = {
  grey:   'bg-gray-100 text-gray-600',
  amber:  'bg-amber-100 text-amber-800',
  green:  'bg-green-100 text-green-700',
};

// Small reusable badge — shows the human-readable status label
function StatusBadge({ status }) {
  const s = STATUSES[status] || { label: status, colour: 'grey' };
  return (
    <span className={`text-xs font-medium px-2 py-0.5 rounded ${BADGE_CLASSES[s.colour]}`}>
      {s.label}
    </span>
  );
}

// Individual project card within a pipeline column
function ProjectCard({ project, onOpen, onStatusChange }) {
  const projectName = project.project_name || '—';
  const clientName  = project.client_name?.trim();
  const postcode    = project.postcode || '—';
  const updated     = new Date(project.updated_at).toLocaleDateString('en-GB', {
    day: 'numeric', month: 'short', year: '2-digit',
  });

  const heatPump = project.heat_pump?.trim();

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-3 mb-2 hover:border-gray-300 hover:shadow-sm transition-all">

      {/* Top row: project name + current status badge */}
      <div className="flex justify-between items-start mb-1 gap-2">
        <div className="font-semibold text-sm text-gray-800 leading-tight">{projectName}</div>
        <StatusBadge status={project.status} />
      </div>

      {/* Client name, postcode and heat pump model if known */}
      <div className="text-xs text-gray-500 mb-3">
        {clientName && <span>{clientName} · </span>}
        {postcode}
        {heatPump && <span> · {heatPump}</span>}
      </div>

      {/* Bottom row: updated date, status changer, open button */}
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-gray-400 shrink-0">{updated}</span>
        <div className="flex gap-1 items-center">
          {/* Inline status dropdown — lets you move a job without opening it */}
          <select
            value={project.status || 'enquiry'}
            onChange={(e) => onStatusChange(project.project_id, e.target.value)}
            onClick={(e) => e.stopPropagation()}
            className="text-xs border border-gray-200 rounded px-1 py-0.5 text-gray-600 bg-white focus:ring-1 focus:ring-blue-500 cursor-pointer"
          >
            {Object.entries(STATUSES).map(([val, { label }]) => (
              <option key={val} value={val}>{label}</option>
            ))}
          </select>
          <button
            onClick={() => onOpen(project.project_id)}
            className="text-xs bg-blue-600 text-white px-2 py-0.5 rounded hover:bg-blue-700 transition whitespace-nowrap"
          >
            Open
          </button>
        </div>
      </div>
    </div>
  );
}

// Main dashboard component — renders the four-column pipeline
export default function ProjectDashboard({ onOpen, onStatusChange }) {
  const [projects, setProjects] = useState([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState(null);

  // Load dashboard data on mount.
  // Uses api.getDashboard() which hits GET /api/dashboard → v_project_dashboard.
  useEffect(() => {
    api.getDashboard()
      .then(data => { setProjects(data); setLoading(false); })
      .catch(err  => { setError(err.message); setLoading(false); });
  }, []);

  const handleStatusChange = async (projectId, newStatus) => {
    // Optimistic update: move the card immediately so the UI feels instant.
    // If the server call fails, we reload from the server to restore truth.
    setProjects(prev =>
      prev.map(p => p.project_id === projectId ? { ...p, status: newStatus } : p)
    );

    try {
      await api.updateProjectStatus(projectId, newStatus);
    } catch {
      // Server call failed — reload to restore accurate state
      api.getDashboard().then(setProjects);
    }

    // Notify parent (App.jsx) so it can refresh its own projects list
    // if it needs to (e.g. for the header project name display)
    onStatusChange?.(projectId, newStatus);
  };

  if (loading) {
    return (
      <div className="text-gray-500 text-sm py-12 text-center">
        Loading projects...
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-red-600 text-sm py-12 text-center">
        Could not load dashboard: {error}
      </div>
    );
  }

  if (projects.length === 0) {
    return (
      <div className="text-gray-400 text-sm py-12 text-center">
        No projects yet. Create your first one above.
      </div>
    );
  }

  return (
    <div className="grid grid-cols-4 gap-4">
      {COLUMNS.map(col => {
        const colProjects = projects.filter(p =>
          col.statuses.includes(p.status || 'enquiry')
        );

        // Count badge colour matches the column accent colour where we have one,
        // falls back to grey for the closed column
        const countColour = col.id === 'quoting' ? 'amber'
                          : col.id === 'active'  ? 'green'
                          : 'grey';

        return (
          <div key={col.id}>
            {/* Column header with coloured bottom border */}
            <div className={`flex justify-between items-center mb-3 pb-2 border-b-2 ${col.border}`}>
              <span className="text-sm font-semibold text-gray-700">{col.label}</span>
              <span className={`text-xs font-medium px-2 py-0.5 rounded ${COUNT_BADGE_CLASSES[countColour]}`}>
                {colProjects.length}
              </span>
            </div>

            {/* Card list — empty state if no projects in this column */}
            <div className="min-h-16">
              {colProjects.length === 0 ? (
                <div className="text-xs text-gray-400 text-center py-6 border border-dashed border-gray-200 rounded-lg">
                  None
                </div>
              ) : (
                colProjects.map(p => (
                  <ProjectCard
                    key={p.project_id}
                    project={p}
                    onOpen={onOpen}
                    onStatusChange={handleStatusChange}
                  />
                ))
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}