# OpenHeatLoss

**Open-source heat loss calculation and system design for heat pump retrofit installations.**

OpenHeatLoss implements the CIBSE Domestic Heating Design Guide 2026 reduced method for BS EN 12831-1:2017 heat loss calculation, producing MCS MIS 3005-D compliant documentation for heating engineers. It is built to be used in practice, not just as a reference — the tool is actively used for real retrofit projects.

Live at [openheatloss.com](https://openheatloss.com)

---

## What it does

- **Heat loss calculation** — BS EN 12831-1:2017 via the CIBSE DHDG 2026 reduced method. Generator load, emitter load, typical load at Te,ref, W/K coefficient, 5-stage ventilation, thermal bridging, ground floor treatment (slab vs suspended), minimum modulation temperature check.
- **Radiator and emitter sizing** — EN 442 exponent method for radiators, EN 1264-2:2021 for underfloor heating. Handles new, retained and replacement emitters, enclosure factors, no-TRV flags and UFH actuator flags.
- **Pipe sizing** — Hazen-Williams method across multiple materials (copper, polybutylene, MLCP, PEX-AL-PEX) with corrected velocity limits, fittings resistance database, manual index circuit selection and pump head output.
- **System volume** — Total volume, effective open volume, MCS 020 20 L/kW modulation check, expansion vessel guidance, radiator flow rates for PICV/PITRV pre-setting.
- **SCOP estimator** — Carnot η from EN 14511 test points, W/K-derived weather compensation curve (LMTD exponent method), per-bin COP, EN 14825 UK bin hours, defrost penalty, DHW SCOP (daily reheat + pasteurisation).
- **PDF outputs** — Heat loss report, radiator schedule, pipe sizing schedule. MCS MIS 3005-D terminology throughout.
- **Project dashboard** — Client and project management for registered engineers. Quotation builder included.
- **Survey tool** — On-site survey checklist (QR code access for tablet/phone completion to come).

---

## Standards implemented

| Standard | Coverage |
|---|---|
| BS EN 12831-1:2017 | CIBSE DHDG 2026 reduced method (full method planned) |
| CIBSE DHDG 2026 | Ventilation calculation, ground floor treatment, thermal bridging |
| MCS MIS 3005-D | Documentation output, design flow |
| EN 442 | Radiator output correction (exponent method) |
| EN 1264-2:2021 | Underfloor heating sizing |
| EN 14511 | Heat pump test point input |
| EN 14825:2022 | SCOP calculation (Annex C bin hours) |

---

## Tech stack

PERN stack — Postgres, Express, React, Node.js — built with Vite.

```
client/         React frontend (Vite)
  src/
    components/ UI components by module
    utils/      Calculation engine, API client, constants
server/         Express/Node backend
  server.js     API routes and auth
  database.js   PostgreSQL data layer (node-postgres)
  *.py          PDF generation (ReportLab)
public/         Vite build output, served by Express
```

Key dependencies: `node-postgres`, `bcrypt`, `jsonwebtoken`, `cookie-parser`, `ReportLab` (Python, PDF generation).

---

## Getting started

### Prerequisites

- Node.js 20+
- Python 3.12+ (for PDF generation)
- PostgreSQL 14+

### Local setup

```bash
# Clone the repository
git clone https://github.com/your-org/openheatloss.git
cd openheatloss

# Install Node dependencies
npm install

# Install Python dependencies
pip install reportlab

# Set environment variables (copy and edit the example)
cp .env.example .env
```

Edit `.env`:

```env
DATABASE_URL=postgresql://user:password@localhost:5432/openheatloss
JWT_SECRET=your-secret-here          # any long random string
PORT=3000                            # optional, defaults to 3000
```

### Database setup

Create a local Postgres database:

```bash
createdb openheatloss
```

The schema is managed by `server/migrate.js`. In development, run it once manually before starting the server:

```bash
node server/migrate.js
```

`migrate.js` is idempotent — safe to run multiple times. It creates all tables, views, and records applied migrations in a `schema_migrations` table. In production (Docker) it runs automatically before the server starts.

### Run in development

```bash
# Terminal 1 — backend
node server/server.js

# Terminal 2 — frontend (with hot reload)
cd client && npm run dev
```

The Vite dev server proxies `/api` requests to the Node backend. Open `http://localhost:5173`.

### Build for production

```bash
cd client && npm run build
# Vite outputs to /public — Express serves this directly
node server/server.js
```

---

## Deployment

The reference deployment uses [Railway](https://railway.app) with a managed Postgres service, built via Docker. The `Dockerfile` at the project root performs a multi-stage build — compiling the React frontend in a builder stage, then assembling a lean Node + Python runtime image.

On container start, `migrate.js` runs automatically before the server, creating or updating the schema on first deploy and applying any new migrations on subsequent deploys:

```
CMD ["sh", "-c", "node server/migrate.js && node server/server.js"]
```

Required environment variables (set in Railway service settings):

| Variable | Description |
|---|---|
| `DATABASE_URL` | Injected automatically by Railway Postgres |
| `JWT_SECRET` | A long random string — set this before going live |
| `PORT` | Set automatically by Railway |

Anonymous sessions expire after 48 hours. Registered user data is retained indefinitely. A startup cleanup runs on each deploy to remove expired anonymous data.

---

## User accounts and plans

OpenHeatLoss supports anonymous use (single project, 48-hour expiry) and registered accounts (persistent projects). The project dashboard is available to registered engineers on the `beta` or `pro` plan.

To grant beta access to an engineer after they have registered, run the following against your Postgres database:

```sql
UPDATE users SET plan = 'beta' WHERE email = 'engineer@example.com';
```

---

## Licence

[AGPL v3](LICENSE)

OpenHeatLoss is free and open source. If you deploy a modified version as a hosted service, the AGPL requires you to make your modifications available under the same licence. The hosted service at [openheatloss.com](https://openheatloss.com) is operated by Mysa Heating Ltd.

---

## Contributing

Contributions are welcome. The areas most likely to benefit from outside input are:

- **Calculation review** — If you are a heating engineer or building physicist and spot a discrepancy with BS EN 12831-1:2017, CIBSE DHDG 2026, or any of the referenced standards, please open an issue with the specific clause and your reasoning.
- **Full BS EN 12831-1:2017 method** — The CIBSE reduced method covers the majority of domestic retrofits. The full method (per-element temperature factors, n50-based infiltration, ISO 13370 ground floors) is the next major feature.
- **UI and accessibility** — The frontend is functional but there is room for improvement, particularly on mobile and for accessibility.
- **Additional emitter types** — Fan coil units and other emitter types are not yet modelled.

### How to contribute

1. Fork the repository and create a branch from `main`.
2. Make your changes. If you are changing calculation logic, include a note on which clause of the relevant standard your change implements or corrects.
3. Open a pull request with a clear description of the change and its rationale.

There is no formal code style enforcer at present — match the conventions you see in the file you are editing.

### Reporting issues

Please use GitHub Issues. For calculation discrepancies, include the specific standard reference, the expected result and the actual result. For bugs, include steps to reproduce.

---

## Acknowledgements

Calculation methodology follows CIBSE Domestic Heating Design Guide 2026 and BS EN 12831-1:2017. The SCOP estimation approach uses EN 14825:2022 Annex C bin hours for the UK climate.
