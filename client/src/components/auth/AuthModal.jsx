import { useState } from 'react';

// =============================================================================
// AUTH MODAL — with forgot password link
// =============================================================================
function AuthModal({ mode, error, loading, onRegister, onLogin, onSwitchMode, onClose }) {
  const [name, setName]         = useState('');
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm]   = useState('');
  const [localError, setLocalError] = useState('');
  const [showForgot, setShowForgot] = useState(false);

  const isRegister = mode === 'register';

  const handleSubmit = () => {
    setLocalError('');
    if (isRegister) {
      if (!name.trim()) { setLocalError('Please enter your name'); return; }
      if (!email.trim()) { setLocalError('Please enter your email'); return; }
      if (password.length < 8) { setLocalError('Password must be at least 8 characters'); return; }
      if (password !== confirm) { setLocalError('Passwords do not match'); return; }
      onRegister({ name: name.trim(), email: email.trim(), password });
    } else {
      if (!email.trim()) { setLocalError('Please enter your email'); return; }
      if (!password) { setLocalError('Please enter your password'); return; }
      onLogin({ email: email.trim(), password });
    }
  };

  const displayError = localError || error;

  if (showForgot) {
    return <ForgotPasswordModal onBack={() => setShowForgot(false)} onClose={onClose} />;
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between p-6 border-b">
          <div>
            <h2 className="text-xl font-bold text-gray-900">
              {isRegister ? 'Create your free account' : 'Log in to your account'}
            </h2>
            <p className="text-sm text-gray-500 mt-1">
              {isRegister ? 'Your project will be saved to your account.' : 'Welcome back — your project will load automatically.'}
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">×</button>
        </div>
        <div className="p-6 space-y-4">
          {isRegister && (
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">Your name</label>
              <input type="text" value={name} onChange={e => setName(e.target.value)}
                placeholder="Jane Smith" autoFocus
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
          )}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">Email address</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)}
              placeholder="jane@example.com" autoFocus={!isRegister}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">Password</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)}
              placeholder={isRegister ? 'At least 8 characters' : ''}
              onKeyDown={e => e.key === 'Enter' && !isRegister && handleSubmit()}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          {isRegister && (
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">Confirm password</label>
              <input type="password" value={confirm} onChange={e => setConfirm(e.target.value)}
                placeholder="Repeat password"
                onKeyDown={e => e.key === 'Enter' && handleSubmit()}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
          )}
          {displayError && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-3 py-2">{displayError}</div>
          )}
          <button onClick={handleSubmit} disabled={loading}
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-semibold py-2.5 rounded-lg transition">
            {loading ? (isRegister ? 'Creating account…' : 'Logging in…') : (isRegister ? 'Create account & save project' : 'Log in')}
          </button>
          {!isRegister && (
            <p className="text-center">
              <button onClick={() => setShowForgot(true)} className="text-sm text-gray-500 hover:text-blue-600 hover:underline transition">
                Forgot your password?
              </button>
            </p>
          )}
        </div>
        <div className="px-6 pb-6 text-center text-sm text-gray-500">
          {isRegister ? (
            <>Already have an account?{' '}
              <button onClick={() => onSwitchMode('login')} className="text-blue-600 hover:underline font-semibold">Log in</button>
            </>
          ) : (
            <>Don't have an account?{' '}
              <button onClick={() => onSwitchMode('register')} className="text-blue-600 hover:underline font-semibold">Register free</button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// FORGOT PASSWORD MODAL
// =============================================================================
function ForgotPasswordModal({ onBack, onClose }) {
  const [email, setEmail]     = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent]       = useState(false);
  const [error, setError]     = useState('');

  const handleSubmit = async () => {
    if (!email.trim()) { setError('Please enter your email address'); return; }
    setLoading(true); setError('');
    try {
      await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
      });
      setSent(true);
    } catch { setError('Network error — please try again'); }
    finally { setLoading(false); }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between p-6 border-b">
          <h2 className="text-xl font-bold text-gray-900">Reset your password</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">×</button>
        </div>
        <div className="p-6 space-y-4">
          {sent ? (
            <div className="text-center space-y-3">
              <div className="text-4xl">✉️</div>
              <p className="font-semibold text-gray-900">Check your inbox</p>
              <p className="text-sm text-gray-500">If an account exists for that email, we've sent a reset link. It expires in 1 hour.</p>
              <button onClick={onClose} className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2.5 rounded-lg transition">Done</button>
            </div>
          ) : (
            <>
              <p className="text-sm text-gray-600">Enter your email and we'll send you a link to reset your password.</p>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Email address</label>
                <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleSubmit()} placeholder="jane@example.com" autoFocus
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-3 py-2">{error}</div>}
              <button onClick={handleSubmit} disabled={loading}
                className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-semibold py-2.5 rounded-lg transition">
                {loading ? 'Sending…' : 'Send reset link'}
              </button>
              <p className="text-center">
                <button onClick={onBack} className="text-sm text-gray-500 hover:text-blue-600 hover:underline transition">← Back to log in</button>
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// RESET PASSWORD MODAL
// =============================================================================
function ResetPasswordModal({ token, onClose, onSuccess }) {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm]   = useState('');
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState('');

  const handleSubmit = async () => {
    if (password.length < 8) { setError('Password must be at least 8 characters'); return; }
    if (password !== confirm) { setError('Passwords do not match'); return; }
    setLoading(true); setError('');
    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Reset failed — the link may have expired'); return; }
      onSuccess();
    } catch { setError('Network error — please try again'); }
    finally { setLoading(false); }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between p-6 border-b">
          <div>
            <h2 className="text-xl font-bold text-gray-900">Set a new password</h2>
            <p className="text-sm text-gray-500 mt-1">Choose something secure — at least 8 characters.</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">×</button>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">New password</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)}
              placeholder="At least 8 characters" autoFocus
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">Confirm new password</label>
            <input type="password" value={confirm} onChange={e => setConfirm(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSubmit()} placeholder="Repeat password"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-3 py-2">{error}</div>}
          <button onClick={handleSubmit} disabled={loading}
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-semibold py-2.5 rounded-lg transition">
            {loading ? 'Saving…' : 'Set new password'}
          </button>
        </div>
      </div>
    </div>
  );
}

export { AuthModal, ForgotPasswordModal, ResetPasswordModal };
