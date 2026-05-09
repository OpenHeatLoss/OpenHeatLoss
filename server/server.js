// server/server.js
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');
const crypto = require('crypto');
const cookieParser = require('cookie-parser');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

// JWT secret — set JWT_SECRET env var in Railway. Falls back to a random
// secret in development (users will be logged out on server restart, which
// is acceptable locally but not in production).
const JWT_SECRET = process.env.JWT_SECRET || crypto.randomBytes(32).toString('hex');
const BCRYPT_ROUNDS = 12;

const {
  pool,
  companies,
  addresses,
  clients,
  users,
  projects,
  designParams,
  rooms,
  elements,
  uValueLibrary,
  radiatorSpecs,
  roomEmitters,
  radiatorSchedule,
  ufhSpecs,
  getCompleteProject,
  cleanupAnonymousProjects,
  getProjectForRoom,
  getProjectForElement,
  getProjectForUValue,
  getProjectForEmitter,
  ownsProject,
  passwordResetTokens,
  pipeMaterialsLib,
  fittingsLib,
  pipeSections,
} = require('./database');

const radiatorScheduleRoutes = require('./routes/radiatorSchedule');
const pdfRoutes = require('./pdf-routes');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(bodyParser.json());
app.use(cookieParser());
app.use(express.static(path.join(__dirname, '..', 'public')));
app.use('/api', pdfRoutes);

// ------------------------------------------------------------
// ANONYMOUS SESSION MIDDLEWARE
// Runs on every request. Reads the anon_token cookie; if absent
// generates a new UUID and sets the cookie. The token is then
// available as req.anonToken throughout the request lifecycle.
// httpOnly + sameSite prevent trivial token theft/forgery.
// ------------------------------------------------------------
app.use((req, res, next) => {
  let token = req.cookies.anon_token;
  if (!token) {
    token = crypto.randomUUID();
    res.cookie('anon_token', token, {
      httpOnly: true,
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days — outlasts the 48-hour project expiry
    });
  }
  req.anonToken = token;
  next();
});

// Schedule router mounted AFTER anon middleware so req.anonToken is
// always set before requireAuthOrAnon runs inside the router.
app.use('/api', radiatorScheduleRoutes(requireAuthOrAnon));

// ------------------------------------------------------------
// AUTH MIDDLEWARE
// Reads the auth_token JWT cookie. If valid, attaches req.user
// = { id, email, companyId }. Routes that call requireAuth
// will return 401 if the cookie is missing or invalid.
// ------------------------------------------------------------
// requireAuth — registered users only. Used for dashboard/company/client routes
// that have no meaning for anonymous users.
function requireAuth(req, res, next) {
  const token = req.cookies.auth_token;
  if (!token) return res.status(401).json({ error: 'Not authenticated' });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Session expired — please log in again' });
  }
}

// requireAuthOrAnon — accepts either a valid JWT (registered user) or an
// anon_token cookie (anonymous user). Used on all data routes so that both
// user types can work, while still blocking completely unauthenticated calls.
// Sets req.user (registered) or leaves it undefined (anonymous, uses req.anonToken).
function requireAuthOrAnon(req, res, next) {
  const token = req.cookies.auth_token;
  if (token) {
    try {
      req.user = jwt.verify(token, JWT_SECRET);
      return next();
    } catch {
      return res.status(401).json({ error: 'Session expired — please log in again' });
    }
  }
  // No auth token — allow if they have an anon_token (set by the anon middleware above)
  if (req.anonToken) return next();
  res.status(401).json({ error: 'Not authenticated' });
}

// requireAdmin — registered users with is_admin = true only.
// The is_admin flag is embedded in the JWT at login time so this check
// requires no DB round-trip.
function requireAdmin(req, res, next) {
  const token = req.cookies.auth_token;
  if (!token) return res.status(401).json({ error: 'Not authenticated' });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    if (!req.user.isAdmin) return res.status(403).json({ error: 'Admin access required' });
    next();
  } catch {
    res.status(401).json({ error: 'Session expired — please log in again' });
  }
}

// ------------------------------------------------------------
// EMAIL HELPER (Resend)
// Requires RESEND_API_KEY environment variable.
// sendEmail returns true on success, false on failure — callers
// should handle the false case gracefully rather than throwing.
// ------------------------------------------------------------
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const EMAIL_FROM = process.env.EMAIL_FROM || 'noreply@openheatloss.com';
const APP_URL = process.env.APP_URL || 'https://openheatloss.com';

async function sendEmail({ to, subject, html }) {
  if (!RESEND_API_KEY) {
    console.warn('RESEND_API_KEY not set — email not sent to', to);
    return false;
  }
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ from: EMAIL_FROM, to, subject, html }),
    });
    if (!res.ok) {
      const err = await res.text();
      console.error('Resend error:', err);
      return false;
    }
    return true;
  } catch (err) {
    console.error('Email send failed:', err.message);
    return false;
  }
}

// ============================================================
// AUTH ENDPOINTS
// ============================================================

// GET /api/auth/me
// Called on app boot to check whether the visitor is already
// logged in. Returns { user } if authenticated, 401 if not.
// The frontend uses this to decide anonymous vs registered boot path.
app.get('/api/auth/me', requireAuth, async (req, res) => {
  try {
    const user = await users.getById(req.user.id);
    if (!user) return res.status(401).json({ error: 'User not found' });
    res.json({ user: { id: user.id, email: user.email, name: user.name, companyId: user.company_id, plan: user.plan, isAdmin: user.is_admin === true || user.is_admin === 1 } });
  } catch (error) {
    console.error('Error in /api/auth/me:', error);
    res.status(500).json({ error: 'Failed to fetch user' });
  }
});

// POST /api/auth/register
// Body: { email, password, name }
// Creates a company-of-one, creates the user, claims the anonymous
// project for this session (if one exists), issues a JWT cookie.
app.post('/api/auth/register', async (req, res) => {
  const { email, password, name } = req.body;

  if (!email || !password || !name) {
    return res.status(400).json({ error: 'Email, password and name are required' });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters' });
  }

  try {
    // Check email not already taken
    const existing = await users.getByEmail(email.toLowerCase().trim());
    if (existing) return res.status(409).json({ error: 'An account with this email already exists' });

    // Create a company record for this user (company-of-one model).
    // They can update their company name/details later in Settings.
    const companyResult = await pool.query(
      `INSERT INTO companies (name) VALUES ($1) RETURNING id`,
      [`${name}'s Company`]
    );
    const companyId = companyResult.rows[0].id;

    // Hash password and create user
    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    const userResult = await users.create({
      companyId,
      email: email.toLowerCase().trim(),
      name,
      passwordHash,
    });
    const userId = userResult.id;

    // Claim the anonymous project for this session (if one exists).
    // This is the key moment — their work is preserved on registration.
    const claimed = await projects.claimForUser(req.anonToken, userId, companyId);
    let projectId = null;
    if (claimed.changes > 0) {
      // Find the project we just claimed
      const claimedProject = await pool.query(
        'SELECT id FROM projects WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1',
        [userId]
      );
      if (claimedProject.rows[0]) projectId = claimedProject.rows[0].id;
    }

    // Issue JWT in an httpOnly cookie — 30-day expiry
    const token = jwt.sign(
      { id: userId, email: email.toLowerCase().trim(), companyId },
      JWT_SECRET,
      { expiresIn: '30d' }
    );
    res.cookie('auth_token', token, {
      httpOnly: true,
      sameSite: 'lax',
      maxAge: 30 * 24 * 60 * 60 * 1000,
    });

    res.status(201).json({
      user: { id: userId, email: email.toLowerCase().trim(), name, companyId, plan: 'free' },
      projectId,
    });

  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Registration failed' });
  }
});

// POST /api/auth/login
// Body: { email, password }
// Verifies credentials, issues JWT cookie.
// Returns { user, projectId } — projectId is their most recent project.
app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  try {
    const user = await users.getByEmail(email.toLowerCase().trim());
    if (!user) return res.status(401).json({ error: 'Invalid email or password' });

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) return res.status(401).json({ error: 'Invalid email or password' });

    // Find their most recent project
    const userProjects = await projects.getByUserId(user.id);
    const projectId = userProjects.length > 0 ? userProjects[0].id : null;

    const token = jwt.sign(
      { id: user.id, email: user.email, companyId: user.company_id, isAdmin: user.is_admin === true || user.is_admin === 1 },
      JWT_SECRET,
      { expiresIn: '30d' }
    );
    res.cookie('auth_token', token, {
      httpOnly: true,
      sameSite: 'lax',
      maxAge: 30 * 24 * 60 * 60 * 1000,
    });

    res.json({
      user: { id: user.id, email: user.email, name: user.name, companyId: user.company_id, plan: user.plan, isAdmin: user.is_admin === true || user.is_admin === 1 },
      projectId,
    });

  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

// POST /api/auth/logout
// Clears the auth cookie.
app.post('/api/auth/logout', (req, res) => {
  res.clearCookie('auth_token');
  res.json({ ok: true });
});

// POST /api/auth/forgot-password
// Body: { email }
// Generates a one-time reset token, stores it, sends an email via Resend.
// Always returns 200 regardless of whether the email exists — prevents enumeration.
app.post('/api/auth/forgot-password', async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'Email is required' });

  try {
    const user = await users.getByEmail(email.toLowerCase().trim());
    if (user) {
      const token = crypto.randomBytes(32).toString('hex');
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

      await passwordResetTokens.create(user.id, token, expiresAt);

      const resetUrl = `${APP_URL}?reset=${token}`;
      await sendEmail({
        to: user.email,
        subject: 'Reset your OpenHeatLoss password',
        html: `
          <p>Hi ${user.name},</p>
          <p>Someone requested a password reset for your OpenHeatLoss account.</p>
          <p>
            <a href="${resetUrl}" style="
              display:inline-block;padding:12px 24px;
              background:#2563eb;color:#fff;border-radius:6px;
              text-decoration:none;font-weight:bold;
            ">Reset my password</a>
          </p>
          <p>This link expires in 1 hour. If you didn't request this, you can safely ignore it.</p>
          <p style="color:#6b7280;font-size:13px;">
            Or paste this link into your browser:<br>${resetUrl}
          </p>
        `,
      });
    }
    // Always return 200 — don't reveal whether the email exists
    res.json({ ok: true });
  } catch (error) {
    console.error('Forgot password error:', error);
    res.status(500).json({ error: 'Failed to process request' });
  }
});

// POST /api/auth/reset-password
// Body: { token, password }
// Validates the token and sets a new password.
app.post('/api/auth/reset-password', async (req, res) => {
  const { token, password } = req.body;
  if (!token || !password) {
    return res.status(400).json({ error: 'Token and password are required' });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters' });
  }

  try {
    const resetToken = await passwordResetTokens.getValid(token);
    if (!resetToken) {
      return res.status(400).json({ error: 'This reset link is invalid or has expired' });
    }

    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    await users.updatePassword(resetToken.user_id, passwordHash);

    // Mark token used and clean up any other tokens for this user
    await passwordResetTokens.markUsed(resetToken.id);
    await passwordResetTokens.deleteForUser(resetToken.user_id);

    res.json({ ok: true });
  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({ error: 'Failed to reset password' });
  }
});

// ============================================================
// ADMIN ENDPOINTS
// All routes require requireAdmin middleware.
// ============================================================

// GET /api/admin/users
// Returns all registered users with company name and project count.
app.get('/api/admin/users', requireAdmin, async (req, res) => {
  try {
    const allUsers = await users.getAllForAdmin();
    res.json(allUsers);
  } catch (error) {
    console.error('Admin users error:', error);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

// GET /api/admin/users/:id/projects
// Returns all projects for a given user (for support view).
app.get('/api/admin/users/:id/projects', requireAdmin, async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT
        p.id, p.name, p.status, p.created_at, p.updated_at,
        COUNT(r.id)::INTEGER AS room_count
      FROM projects p
      LEFT JOIN rooms r ON r.project_id = p.id
      WHERE p.user_id = $1 AND p.session_token IS NULL
      GROUP BY p.id
      ORDER BY p.updated_at DESC
    `, [req.params.id]);
    res.json(rows);
  } catch (error) {
    console.error('Admin user projects error:', error);
    res.status(500).json({ error: 'Failed to fetch user projects' });
  }
});

// PUT /api/admin/users/:id/reset-password
// Body: { password }
// Admin force-sets a user's password (no token required).
app.put('/api/admin/users/:id/reset-password', requireAdmin, async (req, res) => {
  const { password } = req.body;
  if (!password || password.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters' });
  }
  try {
    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    await users.updatePassword(req.params.id, passwordHash);
    res.json({ ok: true });
  } catch (error) {
    console.error('Admin reset password error:', error);
    res.status(500).json({ error: 'Failed to reset password' });
  }
});

// PUT /api/admin/users/:id/active
// Body: { isActive: true|false }
// Deactivates or reactivates a user account.
app.put('/api/admin/users/:id/active', requireAdmin, async (req, res) => {
  try {
    await users.setActive(req.params.id, req.body.isActive !== false);
    res.json({ ok: true });
  } catch (error) {
    console.error('Admin set active error:', error);
    res.status(500).json({ error: 'Failed to update user status' });
  }
});

// ============================================================
// ANONYMOUS SESSIONS
// ============================================================

// GET /api/anonymous/project
// Returns { projectId } for this visitor's anonymous session.
// projectId is null if no live anonymous project exists yet.
// The frontend uses this on boot to decide whether to load an
// existing project or create a fresh one.
app.get('/api/anonymous/project', async (req, res) => {
  try {
    const existing = await projects.getBySessionToken(req.anonToken);
    if (existing) {
      // Refresh the 48-hour window while the user is active
      await projects.refreshAnonymousExpiry(req.anonToken);
      return res.json({ projectId: existing.id });
    }
    res.json({ projectId: null });
  } catch (error) {
    console.error('Error looking up anonymous project:', error);
    res.status(500).json({ error: 'Failed to look up anonymous project' });
  }
});

// POST /api/anonymous/project
// Creates a new anonymous project for this session token.
// Seeds design_params immediately (same as the registered flow).
// Returns { projectId } so the frontend can load it normally.
app.post('/api/anonymous/project', async (req, res) => {
  try {
    const result = await projects.createAnonymous(req.anonToken);
    const projectId = result.id;
    await designParams.createForProject(projectId);
    res.status(201).json({ projectId });
  } catch (error) {
    console.error('Error creating anonymous project:', error);
    res.status(500).json({ error: 'Failed to create anonymous project' });
  }
});

// ============================================================
// DASHBOARD
// ============================================================

app.get('/api/dashboard', requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM v_project_dashboard WHERE company_id = $1',
      [req.user.companyId]
    );
    res.json(rows);
  } catch (error) {
    console.error('Error fetching dashboard:', error);
    res.status(500).json({ error: 'Failed to fetch dashboard' });
  }
});

// ============================================================
// COMPANIES
// ============================================================

app.get('/api/company', requireAuth, async (req, res) => {
  try {
    const company = await companies.getById(req.user.companyId);
    res.json(company);
  } catch (error) {
    console.error('Error fetching company:', error);
    res.status(500).json({ error: 'Failed to fetch company' });
  }
});

app.put('/api/company', requireAuth, async (req, res) => {
  try {
    await companies.update(req.user.companyId, req.body);
    const updated = await companies.getById(req.user.companyId);
    res.json(updated);
  } catch (error) {
    console.error('Error updating company:', error);
    res.status(500).json({ error: 'Failed to update company' });
  }
});

// ============================================================
// CLIENTS
// ============================================================

// Search clients — used by the new project modal
// GET /api/clients/search?q=williams  or  ?q=BA2
app.get('/api/clients/search', requireAuth, async (req, res) => {
  try {
    const q = req.query.q || '';
    if (q.trim().length < 2) {
      return res.json([]);
    }
    const results = await clients.search(q, req.user.companyId);
    res.json(results);
  } catch (error) {
    console.error('Error searching clients:', error);
    res.status(500).json({ error: 'Failed to search clients' });
  }
});

// Get all clients
app.get('/api/clients', requireAuth, async (req, res) => {
  try {
    const all = await clients.getAll(req.user.companyId);
    res.json(all);
  } catch (error) {
    console.error('Error fetching clients:', error);
    res.status(500).json({ error: 'Failed to fetch clients' });
  }
});

// Get single client
app.get('/api/clients/:id', requireAuth, async (req, res) => {
  try {
    const client = await clients.getById(req.params.id);
    if (!client) return res.status(404).json({ error: 'Client not found' });
    if (client.company_id !== req.user.companyId) {
      return res.status(403).json({ error: 'Not authorised' });
    }
    const clientAddresses = await addresses.getByClientId(req.params.id);
    res.json({ ...client, addresses: clientAddresses });
  } catch (error) {
    console.error('Error fetching client:', error);
    res.status(500).json({ error: 'Failed to fetch client' });
  }
});

// Create client (optionally with an address in the same request)
app.post('/api/clients', requireAuth, async (req, res) => {
  try {
    const { address: addressData, ...clientData } = req.body;

    // Create the client record scoped to this user's company
    const result = await clients.create({ ...clientData, companyId: req.user.companyId });
    const clientId = result.id;

    // If address data was supplied, create the address and link it
    if (addressData && (addressData.addressLine1 || addressData.postcode)) {
      const addrResult = await addresses.create({
        ...addressData,
        companyId: req.user.companyId,
      });
      await addresses.linkToClient(clientId, addrResult.id, 'contact', 1);
    }

    const newClient = await clients.getById(clientId);
    const clientAddresses = await addresses.getByClientId(clientId);
    res.status(201).json({ ...newClient, addresses: clientAddresses });
  } catch (error) {
    console.error('Error creating client:', error);
    res.status(500).json({ error: 'Failed to create client' });
  }
});

// Update client details
app.put('/api/clients/:id', requireAuth, async (req, res) => {
  try {
    const client = await clients.getById(req.params.id);
    if (!client) return res.status(404).json({ error: 'Client not found' });
    if (client.company_id !== req.user.companyId) {
      return res.status(403).json({ error: 'Not authorised' });
    }
    await clients.update(req.params.id, req.body);
    const updated = await clients.getById(req.params.id);
    const clientAddresses = await addresses.getByClientId(req.params.id);
    res.json({ ...updated, addresses: clientAddresses });
  } catch (error) {
    console.error('Error updating client:', error);
    res.status(500).json({ error: 'Failed to update client' });
  }
});

// ============================================================
// ADDRESSES
// ============================================================

// Add a new address and link it to a client
app.post('/api/clients/:clientId/addresses', requireAuth, async (req, res) => {
  try {
    const { addressType = 'contact', isPrimary = false, ...addressData } = req.body;
    const addrResult = await addresses.create({ ...addressData, companyId: req.user.companyId });
    await addresses.linkToClient(
      req.params.clientId, addrResult.id, addressType, isPrimary
    );
    if (isPrimary) {
      await addresses.setClientPrimary(req.params.clientId, addrResult.id);
    }
    const updated = await addresses.getByClientId(req.params.clientId);
    res.status(201).json(updated);
  } catch (error) {
    console.error('Error adding client address:', error);
    res.status(500).json({ error: 'Failed to add address' });
  }
});

// Add a new address and link it to a project
app.post('/api/projects/:projectId/addresses', requireAuthOrAnon, async (req, res) => {
  try {
    const { addressType = 'installation', isPrimary = true, ...addressData } = req.body;
    const addrResult = await addresses.create({ ...addressData, companyId: req.user?.companyId || null });
    await addresses.linkToProject(
      req.params.projectId, addrResult.id, addressType, isPrimary
    );
    if (isPrimary) {
      await addresses.setProjectPrimary(req.params.projectId, addrResult.id);
    }
    const updated = await addresses.getByProjectId(req.params.projectId);
    res.status(201).json(updated);
  } catch (error) {
    console.error('Error adding project address:', error);
    res.status(500).json({ error: 'Failed to add address' });
  }
});

// Update an address record directly
app.put('/api/addresses/:id', requireAuthOrAnon, async (req, res) => {
  try {
    await addresses.update(req.params.id, req.body);
    const updated = await addresses.getById(req.params.id);
    res.json(updated);
  } catch (error) {
    console.error('Error updating address:', error);
    res.status(500).json({ error: 'Failed to update address' });
  }
});

// Link an existing address to a project
// (used when "use client's address" is selected at project creation)
app.post('/api/projects/:projectId/addresses/link', requireAuthOrAnon, async (req, res) => {
  try {
    const { addressId, addressType = 'installation', isPrimary = true } = req.body;
    await addresses.linkToProject(
      req.params.projectId, addressId, addressType, isPrimary
    );
    if (isPrimary) {
      await addresses.setProjectPrimary(req.params.projectId, addressId);
    }
    const updated = await addresses.getByProjectId(req.params.projectId);
    res.status(201).json(updated);
  } catch (error) {
    console.error('Error linking address to project:', error);
    res.status(500).json({ error: 'Failed to link address' });
  }
});

// ============================================================
// PROJECTS
// ============================================================

app.get('/api/projects', requireAuth, async (req, res) => {
  try {
    const allProjects = await projects.getAll(req.user.companyId);
    res.json(allProjects);
  } catch (error) {
    console.error('Error fetching projects:', error);
    res.status(500).json({ error: 'Failed to fetch projects' });
  }
});

app.get('/api/projects/:id', requireAuthOrAnon, async (req, res) => {
  try {
    const companyId    = req.user?.companyId ?? null;
    const sessionToken = req.user ? null : req.anonToken;
    const project = await getCompleteProject(req.params.id, { companyId, sessionToken });
    if (!project) return res.status(404).json({ error: 'Project not found' });
    res.json(project);
  } catch (error) {
    console.error('Error fetching project:', error);
    res.status(500).json({ error: 'Failed to fetch project' });
  }
});

// Create project — also seeds design_params and optionally links an address.
// Expected body: { clientId, name, status, designer, installationAddressId? }
// installationAddressId: pass the client's address id to reuse it,
// or omit and add an address separately afterwards.
app.post('/api/projects', requireAuthOrAnon, async (req, res) => {
  try {
    const { installationAddressId, ...projectData } = req.body;

    // 1. Create the project row — always scope companyId from server context
    if (req.user) projectData.companyId = req.user.companyId;
    const result = await projects.create(projectData);
    const projectId = result.id;

    // 2. Seed design_params with defaults immediately
    await designParams.createForProject(projectId);

    // 3. If an installation address was supplied, link it
    if (installationAddressId) {
      await addresses.linkToProject(projectId, installationAddressId, 'installation', 1);
    }

    const companyId2    = req.user?.companyId || null;
    const sessionToken2 = req.user ? null : req.anonToken;
    const newProject = await getCompleteProject(projectId, { companyId: companyId2, sessionToken: sessionToken2 });
    res.status(201).json(newProject);
  } catch (error) {
    console.error('Error creating project:', error);
    res.status(500).json({ error: 'Failed to create project' });
  }
});

// Update project core fields (name, status, designer, brief_notes)
app.put('/api/projects/:id', requireAuthOrAnon, async (req, res) => {
  try {
    await projects.update(req.params.id, req.body);
    const updatedProject = await projects.getById(req.params.id);
    res.json(updatedProject);
  } catch (error) {
    console.error('Error updating project:', error);
    res.status(500).json({ error: 'Failed to update project' });
  }
});

// Lightweight status-only update (used by dashboard cards)
app.patch('/api/projects/:id/status', requireAuth, async (req, res) => {
  try {
    const { status } = req.body;
    const validStatuses = [
      'enquiry', 'survey_booked', 'survey_done',
      'in_design', 'quote_sent', 'quote_accepted',
      'installation_booked', 'design_review', 'installed',
      'commissioned', 'closed', 'lost',
    ];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: 'Invalid status value' });
    }
    await pool.query(
      'UPDATE projects SET status = $1, updated_at = NOW() WHERE id = $2',
      [status, req.params.id]
    );
    res.json({ id: req.params.id, status });
  } catch (error) {
    console.error('Error updating status:', error);
    res.status(500).json({ error: 'Failed to update status' });
  }
});

app.delete('/api/projects/:id', requireAuth, async (req, res) => {
  try {
    await projects.delete(req.params.id);
    res.json({ message: 'Project deleted successfully' });
  } catch (error) {
    console.error('Error deleting project:', error);
    res.status(500).json({ error: 'Failed to delete project' });
  }
});

// ============================================================
// DESIGN PARAMS
// All technical/design data is saved here, separate from the
// project core fields above.
// ============================================================

app.put('/api/projects/:id/design-params', requireAuthOrAnon, async (req, res) => {
  try {
    await designParams.update(req.params.id, req.body);
    const updated = await designParams.getByProjectId(req.params.id);
    res.json(updated);
  } catch (error) {
    console.error('Error updating design params:', error);
    res.status(500).json({ error: 'Failed to update design params' });
  }
});

// ============================================================
// ROOMS
// ============================================================

app.get('/api/projects/:projectId/rooms', requireAuthOrAnon, async (req, res) => {
  try {
    const projectRooms = await rooms.getByProjectId(req.params.projectId);
    res.json(projectRooms);
  } catch (error) {
    console.error('Error fetching rooms:', error);
    res.status(500).json({ error: 'Failed to fetch rooms' });
  }
});

app.post('/api/rooms', requireAuthOrAnon, async (req, res) => {
  try {
    const project = await projects.getById(req.body.projectId);
    if (!ownsProject(project, req)) return res.status(403).json({ error: 'Not authorised' });
    const result = await rooms.create(req.body);
    const newRoom = await rooms.getById(result.id);
    res.status(201).json(newRoom);
  } catch (error) {
    console.error('Error creating room:', error);
    res.status(500).json({ error: 'Failed to create room' });
  }
});

app.put('/api/rooms/:id', requireAuthOrAnon, async (req, res) => {
  try {
    const project = await getProjectForRoom(req.params.id);
    if (!ownsProject(project, req)) return res.status(403).json({ error: 'Not authorised' });
    await rooms.update(req.params.id, req.body);
    const updatedRoom = await rooms.getById(req.params.id);
    res.json(updatedRoom);
  } catch (error) {
    console.error('Error updating room:', error);
    res.status(500).json({ error: 'Failed to update room' });
  }
});

app.delete('/api/rooms/:id', requireAuthOrAnon, async (req, res) => {
  try {
    const project = await getProjectForRoom(req.params.id);
    if (!ownsProject(project, req)) return res.status(403).json({ error: 'Not authorised' });
    await rooms.delete(req.params.id);
    res.json({ message: 'Room deleted successfully' });
  } catch (error) {
    console.error('Error deleting room:', error);
    res.status(500).json({ error: 'Failed to delete room' });
  }
});

// ============================================================
// ELEMENTS
// ============================================================

app.get('/api/rooms/:roomId/elements', requireAuthOrAnon, async (req, res) => {
  try {
    const roomElements = await elements.getByRoomId(req.params.roomId);
    res.json(roomElements);
  } catch (error) {
    console.error('Error fetching elements:', error);
    res.status(500).json({ error: 'Failed to fetch elements' });
  }
});

app.post('/api/elements', requireAuthOrAnon, async (req, res) => {
  try {
    const project = await getProjectForRoom(req.body.roomId);
    if (!ownsProject(project, req)) return res.status(403).json({ error: 'Not authorised' });
    const result = await elements.create(req.body);
    const newElement = await elements.getById(result.id);
    res.status(201).json(newElement);
  } catch (error) {
    console.error('Error creating element:', error);
    res.status(500).json({ error: 'Failed to create element' });
  }
});

app.put('/api/elements/:id', requireAuthOrAnon, async (req, res) => {
  try {
    const project = await getProjectForElement(req.params.id);
    if (!ownsProject(project, req)) return res.status(403).json({ error: 'Not authorised' });
    await elements.update(req.params.id, req.body);
    const updatedElement = await elements.getById(req.params.id);
    res.json(updatedElement);
  } catch (error) {
    console.error('Error updating element:', error);
    res.status(500).json({ error: 'Failed to update element' });
  }
});

app.delete('/api/elements/:id', requireAuthOrAnon, async (req, res) => {
  try {
    const project = await getProjectForElement(req.params.id);
    if (!ownsProject(project, req)) return res.status(403).json({ error: 'Not authorised' });
    await elements.delete(req.params.id);
    res.json({ message: 'Element deleted successfully' });
  } catch (error) {
    console.error('Error deleting element:', error);
    res.status(500).json({ error: 'Failed to delete element' });
  }
});

// ============================================================
// U-VALUE LIBRARY
// ============================================================

app.get('/api/projects/:projectId/u-values', requireAuthOrAnon, async (req, res) => {
  try {
    const library = await uValueLibrary.getByProjectId(req.params.projectId);
    res.json(library);
  } catch (error) {
    console.error('Error fetching U-value library:', error);
    res.status(500).json({ error: 'Failed to fetch U-value library' });
  }
});

app.post('/api/u-values', requireAuthOrAnon, async (req, res) => {
  try {
    const project = await projects.getById(req.body.projectId);
    if (!ownsProject(project, req)) return res.status(403).json({ error: 'Not authorised' });
    const result = await uValueLibrary.create(req.body);
    res.status(201).json({ id: result.id });
  } catch (error) {
    console.error('Error creating U-value:', error);
    res.status(500).json({ error: 'Failed to create U-value' });
  }
});

app.put('/api/u-values/:id', requireAuthOrAnon, async (req, res) => {
  try {
    const project = await getProjectForUValue(req.params.id);
    if (!ownsProject(project, req)) return res.status(403).json({ error: 'Not authorised' });
    await uValueLibrary.update(req.params.id, req.body);
    res.json({ message: 'U-value updated successfully' });
  } catch (error) {
    console.error('Error updating U-value:', error);
    res.status(500).json({ error: 'Failed to update U-value' });
  }
});

app.delete('/api/u-values/:id', requireAuthOrAnon, async (req, res) => {
  try {
    const project = await getProjectForUValue(req.params.id);
    if (!ownsProject(project, req)) return res.status(403).json({ error: 'Not authorised' });
    await uValueLibrary.delete(req.params.id);
    res.json({ message: 'U-value deleted successfully' });
  } catch (error) {
    console.error('Error deleting U-value:', error);
    res.status(500).json({ error: 'Failed to delete U-value' });
  }
});

// ============================================================
// RADIATOR SPECS
// ============================================================

// GET /api/radiator-specs
// Returns global specs + caller's own (company or anonymous).
// No auth required — anonymous users get global + their session specs.
app.get('/api/radiator-specs', requireAuthOrAnon, async (req, res) => {
  try {
    const companyId    = req.user?.companyId ?? null;
    const sessionToken = req.user ? null : req.anonToken;
    const specs = await radiatorSpecs.getAll({ companyId, sessionToken });
    res.json(specs);
  } catch (error) {
    console.error('Error fetching radiator specs:', error);
    res.status(500).json({ error: 'Failed to fetch radiator specs' });
  }
});

// POST /api/radiator-specs
// Creates a new spec. Scope and ownership are set server-side from
// the request context — the client never sets scope/companyId directly.
// requireAuthOrAnon ensures req.user is populated for registered users
// so scope is correctly set to 'company' rather than 'anonymous'.
app.post('/api/radiator-specs', requireAuthOrAnon, async (req, res) => {
  try {
    const isAuthenticated = !!req.user;
    const scope        = isAuthenticated ? 'company'   : 'anonymous';
    const companyId    = isAuthenticated ? req.user.companyId : null;
    const sessionToken = isAuthenticated ? null : req.anonToken;

    const result = await radiatorSpecs.create({
      ...req.body,
      scope,
      companyId,
      sessionToken,
    });
    res.status(201).json({ id: result.id });
  } catch (error) {
    console.error('Error creating radiator spec:', error);
    res.status(500).json({ error: 'Failed to create radiator spec' });
  }
});

// PUT /api/radiator-specs/:id
// Only allows updating specs owned by the caller — cannot edit global specs
// or another company's specs.
app.put('/api/radiator-specs/:id', async (req, res) => {
  try {
    const spec = await radiatorSpecs.getById(req.params.id);
    if (!spec) return res.status(404).json({ error: 'Spec not found' });

    // Block editing global specs entirely
    if (spec.scope === 'global') {
      return res.status(403).json({ error: 'Global radiator specs cannot be edited' });
    }

    // Registered user can only edit their own company's specs
    if (spec.scope === 'company' && req.user) {
      if (spec.company_id !== req.user.companyId) {
        return res.status(403).json({ error: 'Not authorised to edit this spec' });
      }
    }

    // Anonymous user can only edit specs from their own session
    if (spec.scope === 'anonymous' && !req.user) {
      if (spec.session_token !== req.anonToken) {
        return res.status(403).json({ error: 'Not authorised to edit this spec' });
      }
    }

    await radiatorSpecs.update(req.params.id, {
      ...req.body,
      // Preserve original scope/ownership — client cannot change these
      scope:        spec.scope,
      companyId:    spec.company_id,
      sessionToken: spec.session_token,
    });
    res.json({ message: 'Radiator spec updated successfully' });
  } catch (error) {
    console.error('Error updating radiator spec:', error);
    res.status(500).json({ error: 'Failed to update radiator spec' });
  }
});

// DELETE /api/radiator-specs/:id
// Only allows deleting specs owned by the caller — cannot delete global specs.
app.delete('/api/radiator-specs/:id', async (req, res) => {
  try {
    const spec = await radiatorSpecs.getById(req.params.id);
    if (!spec) return res.status(404).json({ error: 'Spec not found' });

    if (spec.scope === 'global') {
      return res.status(403).json({ error: 'Global radiator specs cannot be deleted' });
    }

    if (spec.scope === 'company' && req.user) {
      if (spec.company_id !== req.user.companyId) {
        return res.status(403).json({ error: 'Not authorised to delete this spec' });
      }
    }

    if (spec.scope === 'anonymous' && !req.user) {
      if (spec.session_token !== req.anonToken) {
        return res.status(403).json({ error: 'Not authorised to delete this spec' });
      }
    }

    await radiatorSpecs.delete(req.params.id);
    res.json({ message: 'Radiator spec deleted successfully' });
  } catch (error) {
    console.error('Error deleting radiator spec:', error);
    res.status(500).json({ error: 'Failed to delete radiator spec' });
  }
});

// GET /api/radiator-specs/:id/usage
// Unchanged — no ownership check needed, read-only.
app.get('/api/radiator-specs/:id/usage', async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT COUNT(*) as count FROM radiator_schedule WHERE radiator_spec_id = $1',
      [req.params.id]
    );
    res.json({ count: parseInt(rows[0].count) });
  } catch (error) {
    console.error('Error fetching radiator usage:', error);
    res.status(500).json({ error: 'Failed to fetch usage count' });
  }
});

// ============================================================
// PIPE MATERIALS LIBRARY
// ============================================================

// GET /api/pipe-materials
// Returns all pipe materials (global + company) with sizes.
// Also ensures global library rows exist for this company on first load.
app.get('/api/pipe-materials', requireAuthOrAnon, async (req, res) => {
  try {
    const companyId = req.user?.companyId;
    if (!companyId) return res.status(400).json({ error: 'Company context required' });
    await pipeMaterialsLib.ensureGlobalForCompany(companyId);
    const materials = await pipeMaterialsLib.getForCompany(companyId);
    res.json(materials);
  } catch (error) {
    console.error('Get pipe materials error:', error);
    res.status(500).json({ error: 'Failed to fetch pipe materials' });
  }
});

// POST /api/pipe-materials
// Create a company-specific pipe material.
app.post('/api/pipe-materials', requireAuthOrAnon, async (req, res) => {
  try {
    const companyId = req.user?.companyId;
    if (!companyId) return res.status(400).json({ error: 'Company context required' });
    const result = await pipeMaterialsLib.create(companyId, req.body);
    // Add sizes if provided
    if (Array.isArray(req.body.sizes)) {
      for (const size of req.body.sizes) {
        await pipeMaterialsLib.addSize(result.rows[0].id, size);
      }
    }
    const materials = await pipeMaterialsLib.getForCompany(companyId);
    res.json(materials);
  } catch (error) {
    console.error('Create pipe material error:', error);
    res.status(500).json({ error: 'Failed to create pipe material' });
  }
});

// PUT /api/pipe-materials/:id
app.put('/api/pipe-materials/:id', requireAuthOrAnon, async (req, res) => {
  try {
    const companyId = req.user?.companyId;
    if (!companyId) return res.status(400).json({ error: 'Company context required' });
    await pipeMaterialsLib.update(req.params.id, companyId, req.body);
    const materials = await pipeMaterialsLib.getForCompany(companyId);
    res.json(materials);
  } catch (error) {
    console.error('Update pipe material error:', error);
    res.status(500).json({ error: 'Failed to update pipe material' });
  }
});

// DELETE /api/pipe-materials/:id
// Only company-scoped materials can be deleted.
app.delete('/api/pipe-materials/:id', requireAuthOrAnon, async (req, res) => {
  try {
    const companyId = req.user?.companyId;
    if (!companyId) return res.status(400).json({ error: 'Company context required' });
    await pipeMaterialsLib.delete(req.params.id, companyId);
    const materials = await pipeMaterialsLib.getForCompany(companyId);
    res.json(materials);
  } catch (error) {
    console.error('Delete pipe material error:', error);
    res.status(500).json({ error: 'Failed to delete pipe material' });
  }
});

// ============================================================
// FITTINGS LIBRARY
// ============================================================

// GET /api/fittings
app.get('/api/fittings', requireAuthOrAnon, async (req, res) => {
  try {
    const companyId = req.user?.companyId;
    if (!companyId) return res.status(400).json({ error: 'Company context required' });
    await fittingsLib.ensureGlobalForCompany(companyId);
    const fittings = await fittingsLib.getForCompany(companyId);
    res.json(fittings);
  } catch (error) {
    console.error('Get fittings error:', error);
    res.status(500).json({ error: 'Failed to fetch fittings' });
  }
});

// POST /api/fittings
app.post('/api/fittings', requireAuthOrAnon, async (req, res) => {
  try {
    const companyId = req.user?.companyId;
    if (!companyId) return res.status(400).json({ error: 'Company context required' });
    await fittingsLib.create(companyId, req.body);
    const fittings = await fittingsLib.getForCompany(companyId);
    res.json(fittings);
  } catch (error) {
    console.error('Create fitting error:', error);
    res.status(500).json({ error: 'Failed to create fitting' });
  }
});

// PUT /api/fittings/:id
// Updates name, k_value, description, unit_cost.
// unit_cost updates are allowed on global rows (price is company-specific data).
app.put('/api/fittings/:id', requireAuthOrAnon, async (req, res) => {
  try {
    const companyId = req.user?.companyId;
    if (!companyId) return res.status(400).json({ error: 'Company context required' });
    if (req.body.unitCostOnly) {
      await fittingsLib.updateCost(req.params.id, companyId, req.body.unitCost);
    } else {
      await fittingsLib.update(req.params.id, companyId, req.body);
    }
    const fittings = await fittingsLib.getForCompany(companyId);
    res.json(fittings);
  } catch (error) {
    console.error('Update fitting error:', error);
    res.status(500).json({ error: 'Failed to update fitting' });
  }
});

// DELETE /api/fittings/:id
app.delete('/api/fittings/:id', requireAuthOrAnon, async (req, res) => {
  try {
    const companyId = req.user?.companyId;
    if (!companyId) return res.status(400).json({ error: 'Company context required' });
    await fittingsLib.delete(req.params.id, companyId);
    const fittings = await fittingsLib.getForCompany(companyId);
    res.json(fittings);
  } catch (error) {
    console.error('Delete fitting error:', error);
    res.status(500).json({ error: 'Failed to delete fitting' });
  }
});

// ============================================================
// PIPE SECTIONS
// ============================================================

// GET /api/projects/:id/pipe-sections
app.get('/api/projects/:id/pipe-sections', requireAuthOrAnon, async (req, res) => {
  try {
    const project = await projects.getById(req.params.id);
    if (!project || !ownsProject(project, req)) return res.status(403).json({ error: 'Not authorised' });
    const sections = await pipeSections.getForProject(req.params.id);
    res.json(sections);
  } catch (error) {
    console.error('Get pipe sections error:', error);
    res.status(500).json({ error: 'Failed to fetch pipe sections' });
  }
});

// normalisePipeSectionBody — accepts either camelCase (from React state) or
// snake_case (from PipeSectionEditor calculateAndSave) and returns camelCase
// for the pipeSections DB layer.
function normalisePipeSectionBody(body) {
  const pipeMaterialId = body.pipeMaterialId ?? body.pipe_material_id;
  return {
    id:                        body.id,
    name:                      body.name,
    pipeMaterialId:            pipeMaterialId ? parseInt(pipeMaterialId) : null,
    nominalSize:               body.nominalSize      ?? body.nominal_size      ?? body.diameter,
    lengthM:                   parseFloat(body.lengthM ?? body.length_m ?? body.length ?? 0),
    flowRate:                  parseFloat(body.flowRate         ?? body.flow_rate         ?? 0),
    heatLoad:                  parseFloat(body.heatLoad         ?? body.heat_load         ?? 0),
    velocity:                  parseFloat(body.velocity         ?? 0),
    pressureDrop:              parseFloat(body.pressureDrop     ?? body.pressure_drop     ?? 0),
    straightPipePressureDrop:  parseFloat(body.straightPipePressureDrop ?? body.straight_pipe_pressure_drop ?? 0),
    fittingsPressureDrop:      parseFloat(body.fittingsPressureDrop     ?? body.fittings_pressure_drop     ?? 0),
    fittingsMethod:            body.fittingsMethod   ?? body.fittings_method   ?? 'percentage',
    fittingPercentage:         parseFloat(body.fittingPercentage ?? body.fitting_percentage ?? 20),
    waterTemperature:          parseFloat(body.waterTemperature ?? body.water_temperature  ?? 50),
    useWholeProperty:          !!(body.useWholeProperty ?? body.use_whole_property ?? false),
    includeInIndexCircuit:     !!(body.includeInIndexCircuit ?? body.include_in_index_circuit ?? false),
    connectedRooms:            body.connectedRooms   ?? body.connected_rooms   ?? [],
    displayOrder:              parseInt(body.displayOrder ?? body.display_order ?? 0),
    fittings:                  body.fittings         ?? [],
  };
}

// POST /api/projects/:id/pipe-sections
app.post('/api/projects/:id/pipe-sections', requireAuthOrAnon, async (req, res) => {
  try {
    const project = await projects.getById(req.params.id);
    if (!project || !ownsProject(project, req)) return res.status(403).json({ error: 'Not authorised' });
    const data = normalisePipeSectionBody(req.body);
    const result = await pipeSections.create(req.params.id, data);
    const sectionId = result.rows[0].id;
    if (Array.isArray(data.fittings)) {
      await pipeSections.replaceFittings(sectionId, data.fittings);
    }
    const sections = await pipeSections.getForProject(req.params.id);
    res.json(sections);
  } catch (error) {
    console.error('Create pipe section error:', error.message, error.detail ?? '');
    res.status(500).json({ error: 'Failed to create pipe section', detail: error.message });
  }
});

// PUT /api/pipe-sections/:id
app.put('/api/pipe-sections/:id', requireAuthOrAnon, async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT project_id FROM pipe_sections WHERE id=$1', [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Section not found' });
    const project = await projects.getById(rows[0].project_id);
    if (!ownsProject(project, req)) return res.status(403).json({ error: 'Not authorised' });
    const data = normalisePipeSectionBody(req.body);
    await pipeSections.update(req.params.id, rows[0].project_id, data);
    if (Array.isArray(data.fittings)) {
      await pipeSections.replaceFittings(req.params.id, data.fittings);
    }
    const sections = await pipeSections.getForProject(rows[0].project_id);
    res.json(sections);
  } catch (error) {
    console.error('Update pipe section error:', error.message, error.detail ?? '');
    res.status(500).json({ error: 'Failed to update pipe section', detail: error.message });
  }
});

// DELETE /api/pipe-sections/:id
app.delete('/api/pipe-sections/:id', requireAuthOrAnon, async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT project_id FROM pipe_sections WHERE id=$1', [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Section not found' });
    const project = await projects.getById(rows[0].project_id);
    if (!ownsProject(project, req)) return res.status(403).json({ error: 'Not authorised' });
    await pipeSections.delete(req.params.id, rows[0].project_id);
    const sections = await pipeSections.getForProject(rows[0].project_id);
    res.json(sections);
  } catch (error) {
    console.error('Delete pipe section error:', error);
    res.status(500).json({ error: 'Failed to delete pipe section' });
  }
});

// ============================================================
// ROOM EMITTERS
// ============================================================

app.post('/api/room-emitters', requireAuthOrAnon, async (req, res) => {
  try {
    const project = await getProjectForRoom(req.body.roomId);
    if (!ownsProject(project, req)) return res.status(403).json({ error: 'Not authorised' });
    const result = await roomEmitters.create(req.body);
    res.status(201).json({ id: result.id });
  } catch (error) {
    console.error('Error creating room emitter:', error);
    res.status(500).json({ error: 'Failed to create room emitter' });
  }
});

app.put('/api/room-emitters/:id', requireAuthOrAnon, async (req, res) => {
  try {
    const project = await getProjectForEmitter(req.params.id);
    if (!ownsProject(project, req)) return res.status(403).json({ error: 'Not authorised' });
    await roomEmitters.update(req.params.id, req.body);
    res.json({ message: 'Room emitter updated successfully' });
  } catch (error) {
    console.error('Error updating room emitter:', error);
    res.status(500).json({ error: 'Failed to update room emitter' });
  }
});

app.delete('/api/room-emitters/:id', requireAuthOrAnon, async (req, res) => {
  try {
    const project = await getProjectForEmitter(req.params.id);
    if (!ownsProject(project, req)) return res.status(403).json({ error: 'Not authorised' });
    await roomEmitters.delete(req.params.id);
    res.json({ message: 'Room emitter deleted successfully' });
  } catch (error) {
    console.error('Error deleting room emitter:', error);
    res.status(500).json({ error: 'Failed to delete room emitter' });
  }
});

// ============================================================
// UFH SPECS
// ============================================================

// Get UFH spec for a room
app.get('/api/rooms/:roomId/ufh-specs', requireAuthOrAnon, async (req, res) => {
  try {
    const spec = await ufhSpecs.getByRoomId(req.params.roomId);
    res.json(spec || null);
  } catch (error) {
    console.error('Error fetching UFH spec:', error);
    res.status(500).json({ error: 'Failed to fetch UFH spec' });
  }
});

// Create or update UFH spec for a room (upsert)
app.put('/api/rooms/:roomId/ufh-specs', requireAuthOrAnon, async (req, res) => {
  try {
    await ufhSpecs.upsert(req.params.roomId, req.body);
    const updated = await ufhSpecs.getByRoomId(req.params.roomId);
    res.json(updated);
  } catch (error) {
    console.error('Error saving UFH spec:', error);
    res.status(500).json({ error: 'Failed to save UFH spec' });
  }
});

app.delete('/api/rooms/:roomId/ufh-specs', requireAuthOrAnon, async (req, res) => {
  try {
    await ufhSpecs.delete(req.params.roomId);
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting UFH spec:', error);
    res.status(500).json({ error: 'Failed to delete UFH spec' });
  }
});

// ============================================================
// SURVEY CHECKLIST
// ============================================================

// Get saved survey for a project (returns null if none saved yet)
app.get('/api/projects/:id/survey', requireAuthOrAnon, async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT data FROM survey_checklists WHERE project_id = $1',
      [req.params.id]
    );
    if (!rows[0]) return res.json(null);
    res.json(typeof rows[0].data === 'string' ? JSON.parse(rows[0].data) : rows[0].data);
  } catch (error) {
    console.error('Error fetching survey:', error);
    res.status(500).json({ error: 'Failed to fetch survey' });
  }
});

// Save (upsert) survey data for a project
app.post('/api/projects/:id/survey', requireAuthOrAnon, async (req, res) => {
  try {
    await pool.query(
      `INSERT INTO survey_checklists (project_id, data, updated_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (project_id) DO UPDATE SET
         data = EXCLUDED.data,
         updated_at = NOW()`,
      [req.params.id, JSON.stringify(req.body)]
    );
    res.json({ saved: true });
  } catch (error) {
    console.error('Error saving survey:', error);
    res.status(500).json({ error: 'Failed to save survey' });
  }
});

// ============================================================
// QUOTES
// ============================================================

// Get the most recent quote for a project, with its line items
app.get('/api/projects/:id/quotes', requireAuthOrAnon, async (req, res) => {
  try {
    const quoteRes = await pool.query(
      'SELECT * FROM quotes WHERE project_id = $1 ORDER BY created_at DESC LIMIT 1',
      [req.params.id]
    );
    const quote = quoteRes.rows[0];
    if (!quote) return res.json(null);

    const itemsRes = await pool.query(
      'SELECT * FROM quote_items WHERE quote_id = $1 ORDER BY display_order, id',
      [quote.id]
    );
    const items = itemsRes.rows;

    // Parse the checklist JSON blob if present
    let checklist = null;
    if (quote.notes) {
      try { checklist = JSON.parse(quote.notes); } catch { checklist = null; }
    }

    res.json({ ...quote, items, checklist });
  } catch (error) {
    console.error('Error fetching quote:', error);
    res.status(500).json({ error: 'Failed to fetch quote' });
  }
});

// Create a new quote for a project
// Auto-generates the reference: YYYY-NNN (sequential across all quotes)
app.post('/api/projects/:id/quotes', requireAuthOrAnon, async (req, res) => {
  try {
    const year = new Date().getFullYear();

    // Count quotes created this year to get the next sequential number
    const countRes = await pool.query(
      `SELECT COUNT(*) as n FROM quotes WHERE EXTRACT(YEAR FROM created_at) = $1`,
      [year]
    );
    const count = parseInt(countRes.rows[0].n);

    const reference = `${year}-${String(count + 1).padStart(3, '0')}`;

    const insertRes = await pool.query(
      `INSERT INTO quotes
         (project_id, reference, version, status, prepared_by,
          valid_days, survey_basis, total_ex_vat, vat_amount,
          total_inc_vat, bus_grant, client_pays, deposit_amount,
          hourly_rate, issued_at)
       VALUES ($1, $2, 1, 'draft', $3, 30, 'full', 0, 0, 0, 7500, 0, 0, 0, NOW())
       RETURNING *`,
      [req.params.id, reference, req.body.preparedBy || '']
    );
    const newQuote = insertRes.rows[0];

    res.status(201).json({ ...newQuote, items: [], checklist: null });
  } catch (error) {
    console.error('Error creating quote:', error);
    res.status(500).json({ error: 'Failed to create quote' });
  }
});

// Update quote header fields
app.put('/api/quotes/:id', requireAuthOrAnon, async (req, res) => {
  try {
    const d = req.body;
    await pool.query(
      `UPDATE quotes SET
         status = $1, survey_basis = $2, prepared_by = $3,
         valid_days = $4, total_ex_vat = $5, vat_amount = $6,
         total_inc_vat = $7, bus_grant = $8, client_pays = $9,
         deposit_amount = $10, hourly_rate = $11,
         notes = $12,
         updated_at = NOW()
       WHERE id = $13`,
      [
        d.status || 'draft',
        d.surveyBasis || 'full',
        d.preparedBy || '',
        d.validDays || 30,
        d.totalExVat || 0,
        d.vatAmount || 0,
        d.totalIncVat || 0,
        d.busGrant || 7500,
        d.clientPays || 0,
        d.depositAmount || 0,
        d.hourlyRate || 0,
        d.checklist ? JSON.stringify(d.checklist) : null,
        req.params.id,
      ]
    );
    res.json({ saved: true });
  } catch (error) {
    console.error('Error updating quote:', error);
    res.status(500).json({ error: 'Failed to update quote' });
  }
});

// Replace all line items for a quote in one call.
// Simpler than individual item CRUD for this UI — we just
// delete all existing items and insert the current set.
app.put('/api/quotes/:id/items', requireAuthOrAnon, async (req, res) => {
  try {
    const items = req.body.items || [];

    await pool.query('DELETE FROM quote_items WHERE quote_id = $1', [req.params.id]);

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      await pool.query(
        `INSERT INTO quote_items
           (quote_id, item_type, description, quantity,
            unit_price, total_price, is_optional, display_order)
         VALUES ($1, $2, $3, $4, $5, $6, 0, $7)`,
        [
          req.params.id,
          item.itemType || 'goods',
          item.description,
          item.quantity || 1,
          item.unitPrice || 0,
          item.totalPrice || 0,
          i,
        ]
      );
    }

    res.json({ saved: true, count: items.length });
  } catch (error) {
    console.error('Error updating quote items:', error);
    res.status(500).json({ error: 'Failed to update quote items' });
  }
});


// ============================================================
// SERVE Survey
// ============================================================

// Explicit route for the survey tool
app.get('/survey.html', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'survey.html'));
});

// ============================================================
// SERVE FRONTEND — SPA catch-all
// Must be registered after all /api routes so API calls still
// resolve correctly. Sends index.html for any non-API path,
// which lets React Router handle client-side navigation and
// prevents 404s on browser refresh or direct URL entry.
// ============================================================

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

// ============================================================
// STARTUP
// ============================================================

// Postgres connection pool handles readiness — no waitForDb needed.
// cleanupAnonymousProjects() runs once on startup, then we listen.
(async () => {
  await cleanupAnonymousProjects();
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`API available at http://localhost:${PORT}/api`);
  });
})();
