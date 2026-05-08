// client/src/components/admin/AdminPage.jsx
// Admin panel — accessible only to users with is_admin = true.
// Gated server-side via requireAdmin middleware on all /api/admin/* routes.
// Shows: all users, company, plan, project count, joined date.
// Actions: reset password, deactivate/reactivate, view user's projects.

import { useState, useEffect } from 'react';

export default function AdminPage({ currentUser, onBack }) {
  const [users, setUsers]           = useState([]);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState('');
  const [selectedUser, setSelectedUser] = useState(null); // user row for detail panel
  const [userProjects, setUserProjects] = useState([]);
  const [projectsLoading, setProjectsLoading] = useState(false);
  const [resetModal, setResetModal] = useState(null); // user row
  const [resetPassword, setResetPassword] = useState('');
  const [resetLoading, setResetLoading]   = useState(false);
  const [resetError, setResetError]       = useState('');
  const [resetSuccess, setResetSuccess]   = useState(false);
  const [actionMsg, setActionMsg]         = useState('');

  const loadUsers = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/admin/users');
      if (!res.ok) throw new Error('Failed to fetch users');
      const data = await res.json();
      setUsers(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadUsers(); }, []);

  const viewProjects = async (user) => {
    setSelectedUser(user);
    setUserProjects([]);
    setProjectsLoading(true);
    try {
      const res = await fetch(`/api/admin/users/${user.id}/projects`);
      const data = await res.json();
      setUserProjects(data);
    } catch {
      setUserProjects([]);
    } finally {
      setProjectsLoading(false);
    }
  };

  const toggleActive = async (user) => {
    const next = !user.is_active;
    try {
      await fetch(`/api/admin/users/${user.id}/active`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: next }),
      });
      setActionMsg(`${user.name} ${next ? 'reactivated' : 'deactivated'}`);
      setTimeout(() => setActionMsg(''), 3000);
      await loadUsers();
      if (selectedUser?.id === user.id) setSelectedUser(prev => ({ ...prev, is_active: next ? 1 : 0 }));
    } catch {
      setActionMsg('Action failed — please try again');
    }
  };

  const handleResetSubmit = async () => {
    if (resetPassword.length < 8) { setResetError('Password must be at least 8 characters'); return; }
    setResetLoading(true);
    setResetError('');
    try {
      const res = await fetch(`/api/admin/users/${resetModal.id}/reset-password`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: resetPassword }),
      });
      const data = await res.json();
      if (!res.ok) { setResetError(data.error || 'Reset failed'); return; }
      setResetSuccess(true);
      setResetPassword('');
    } catch {
      setResetError('Network error — please try again');
    } finally {
      setResetLoading(false);
    }
  };

  const planBadge = (plan) => {
    const colours = {
      free:  'bg-gray-100 text-gray-700',
      beta:  'bg-blue-100 text-blue-700',
      pro:   'bg-green-100 text-green-700',
    };
    return (
      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${colours[plan] || colours.free}`}>
        {plan}
      </span>
    );
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-red-700 text-white p-4 shadow">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold">Admin Panel</h1>
            <p className="text-red-200 text-sm">OpenHeatLoss platform management · logged in as {currentUser.email}</p>
          </div>
          <button
            onClick={onBack}
            className="bg-red-800 hover:bg-red-900 px-4 py-2 rounded text-sm font-semibold transition"
          >
            ← Back to dashboard
          </button>
        </div>
      </div>

      <div className="max-w-6xl mx-auto p-6 space-y-6">

        {/* Flash message */}
        {actionMsg && (
          <div className="bg-green-50 border border-green-300 text-green-800 rounded-lg px-4 py-3 text-sm font-medium">
            ✓ {actionMsg}
          </div>
        )}

        {/* Users table */}
        <div className="bg-white rounded-lg shadow-lg overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
            <h2 className="text-lg font-bold text-gray-900">Registered users ({users.length})</h2>
            <button
              onClick={loadUsers}
              className="text-sm text-blue-600 hover:underline"
            >
              Refresh
            </button>
          </div>

          {loading ? (
            <div className="p-8 text-center text-gray-500">Loading…</div>
          ) : error ? (
            <div className="p-8 text-center text-red-600">{error}</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-gray-600 text-xs uppercase tracking-wide">
                  <tr>
                    <th className="px-4 py-3 text-left">User</th>
                    <th className="px-4 py-3 text-left">Company</th>
                    <th className="px-4 py-3 text-left">Plan</th>
                    <th className="px-4 py-3 text-center">Projects</th>
                    <th className="px-4 py-3 text-left">Joined</th>
                    <th className="px-4 py-3 text-left">Status</th>
                    <th className="px-4 py-3 text-left">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {users.map(u => (
                    <tr
                      key={u.id}
                      className={`hover:bg-gray-50 transition ${!u.is_active ? 'opacity-50' : ''}`}
                    >
                      <td className="px-4 py-3">
                        <div className="font-medium text-gray-900">{u.name}</div>
                        <div className="text-gray-500 text-xs">{u.email}</div>
                        {u.is_admin && <span className="text-xs text-red-600 font-semibold">admin</span>}
                      </td>
                      <td className="px-4 py-3 text-gray-700">{u.company_name || '—'}</td>
                      <td className="px-4 py-3">{planBadge(u.plan)}</td>
                      <td className="px-4 py-3 text-center">
                        <button
                          onClick={() => viewProjects(u)}
                          className="text-blue-600 hover:underline font-medium"
                        >
                          {u.project_count}
                        </button>
                      </td>
                      <td className="px-4 py-3 text-gray-500 text-xs">
                        {new Date(u.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${u.is_active ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                          {u.is_active ? 'active' : 'inactive'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex gap-2 flex-wrap">
                          <button
                            onClick={() => { setResetModal(u); setResetPassword(''); setResetError(''); setResetSuccess(false); }}
                            className="text-xs bg-blue-50 hover:bg-blue-100 text-blue-700 px-2 py-1 rounded transition"
                          >
                            Reset pw
                          </button>
                          {/* Don't allow deactivating yourself */}
                          {u.id !== currentUser.id && (
                            <button
                              onClick={() => toggleActive(u)}
                              className={`text-xs px-2 py-1 rounded transition ${u.is_active
                                ? 'bg-orange-50 hover:bg-orange-100 text-orange-700'
                                : 'bg-green-50 hover:bg-green-100 text-green-700'
                              }`}
                            >
                              {u.is_active ? 'Deactivate' : 'Reactivate'}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* User projects panel — shown when a user's project count is clicked */}
        {selectedUser && (
          <div className="bg-white rounded-lg shadow-lg overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
              <h2 className="text-lg font-bold text-gray-900">
                Projects for {selectedUser.name}
              </h2>
              <button
                onClick={() => setSelectedUser(null)}
                className="text-gray-400 hover:text-gray-600 text-xl"
              >
                ×
              </button>
            </div>
            {projectsLoading ? (
              <div className="p-6 text-gray-500">Loading…</div>
            ) : userProjects.length === 0 ? (
              <div className="p-6 text-gray-500">No projects found.</div>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-gray-600 text-xs uppercase tracking-wide">
                  <tr>
                    <th className="px-4 py-3 text-left">Project name</th>
                    <th className="px-4 py-3 text-left">Status</th>
                    <th className="px-4 py-3 text-center">Rooms</th>
                    <th className="px-4 py-3 text-left">Last updated</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {userProjects.map(p => (
                    <tr key={p.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 font-medium text-gray-900">{p.name}</td>
                      <td className="px-4 py-3 text-gray-600 capitalize">{p.status}</td>
                      <td className="px-4 py-3 text-center text-gray-700">{p.room_count}</td>
                      <td className="px-4 py-3 text-gray-500 text-xs">
                        {new Date(p.updated_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>

      {/* Reset password modal */}
      {resetModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm">
            <div className="flex items-center justify-between p-6 border-b">
              <div>
                <h2 className="text-lg font-bold text-gray-900">Reset password</h2>
                <p className="text-sm text-gray-500 mt-0.5">{resetModal.email}</p>
              </div>
              <button
                onClick={() => setResetModal(null)}
                className="text-gray-400 hover:text-gray-600 text-2xl leading-none"
              >
                ×
              </button>
            </div>
            <div className="p-6 space-y-4">
              {resetSuccess ? (
                <div className="text-center space-y-3">
                  <div className="text-3xl">✓</div>
                  <p className="text-green-700 font-semibold">Password updated</p>
                  <button
                    onClick={() => setResetModal(null)}
                    className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 rounded-lg transition"
                  >
                    Done
                  </button>
                </div>
              ) : (
                <>
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-1">New password</label>
                    <input
                      type="password"
                      value={resetPassword}
                      onChange={e => setResetPassword(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && handleResetSubmit()}
                      placeholder="At least 8 characters"
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      autoFocus
                    />
                  </div>
                  {resetError && (
                    <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-3 py-2">
                      {resetError}
                    </div>
                  )}
                  <button
                    onClick={handleResetSubmit}
                    disabled={resetLoading}
                    className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-semibold py-2.5 rounded-lg transition"
                  >
                    {resetLoading ? 'Saving…' : 'Set new password'}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
