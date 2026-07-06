# OpenHeatLoss — Backlog & Development Notes

Last updated: June 2026 (security hardening, Strict Mode boot fix, element type enhancements backlog)

---

## Bug tracker

### Active
None. All known bugs resolved.

### Closed (this session)
- B22 — Unauthenticated access to project data via GET /api/projects/:id —
  resolved. An anonymous session (anon_token cookie present, no auth_token)
  could fetch any registered project by guessing its ID. Fixed in
  getCompleteProject (database.js): anonymous sessions (companyId === null)
  are now blocked from accessing any project with company_id set. Closes
  both the unauthenticated access case and the post-logout exposure (anon_token
  cookie persists after logout but must not grant access to registered data).
- B23 — Address routes missing ownership checks — resolved. Three routes had
  no ownership verification: POST /api/projects/:projectId/addresses, PUT
  /api/addresses/:id, POST /api/projects/:projectId/addresses/link. Fixed in
  server.js using the existing ownsProject pattern. New getProjectForAddress
  helper added to database.js (joins project_addresses → projects). GDPR
  obligation: customer addresses are personal data; these routes are now
  correctly gated. GET /api/projects/:projectId/u-values remains an open
  low-risk gap (tracked in SECURITY.md — U-values are not personal data).
- B24 — React Strict Mode double-invoking boot sequence in development —
  resolved. Strict Mode runs useEffect twice on mount in dev builds. The boot
  sequence called POST /api/anonymous/project on both invocations, creating
  two projects with the same session_token 8ms apart. On registration,
  claimForUser claimed both; the lookup returned the empty duplicate rather
  than the project with the user's work. Fixed with a useRef guard (bootedRef)
  in App.jsx that short-circuits the second invocation. Production unaffected
  (Strict Mode is stripped from production builds). Pre-existing latent bug
  made visible by closer DB inspection during security testing — real users
  on the live site were never affected.

### Closed
- B1/T1 — Auth scoping and company_id hardcoding — resolved
- B2 — Anonymous → registered flow — verified working
- B3 — SQLite → PostgreSQL migration — resolved
- B4–B11 — Various auth, ventilation, UI bugs — resolved
- B12/B13 — MVHR ventilation warning — resolved. MVHR correctly suppresses
  the warning under the CIBSE reduced method. The 0.5 ACH verification against
  MVHR supply/extract rate is part of the full EN 12831-1 method only (parked).
  This is intentional — not a gap.
- B14 — Index circuit toggle not re-selectable — resolved. Snake_case field
  shadowing camelCase in normalisePipeSectionBody. Fixed in PipeSizing.jsx by
  explicitly setting include_in_index_circuit: undefined before toggle.
- B15 — Pipe section heat load/flow rate stale after save — resolved. Two
  causes: (1) normalisePipeSectionBody snake_case priority meant stale DB values
  overwrote new values — fixed by adding flow_rate and heat_load to explicit
  overrides in PipeSectionEditor calculateAndSave; (2) useWholeProperty sections
  were reading stale state rather than deriving live from project — fixed by
  adding effectiveHeatLoad/effectiveFlowRate derived constants in PipeSectionEditor.
- B16 — Pipe section staleness not clearing after save — resolved. Missing key
  prop on PipeSectionEditor caused React to reuse component instance, so useState
  initialiser never re-ran. Fixed with key={editingSection?.id ?? 'new'} in
  PipeSizing.jsx. Also fixed room-connected sections seeding stale stored
  heat_load on open — now recalculated from connected rooms in useState initialiser.
- B17 — Exposed envelope area incorrect after element delete — resolved.
  deleteElement in App.jsx now recalculates and saves exposedEnvelopeM2 after
  deletion if the deleted element was part of the envelope.
- B18 — Exposed envelope subtracting windows/doors — resolved. CIBSE DHDG 2026
  section 2.5.4.2 requires gross element area (no subtraction). Fixed in
  App.jsx updateElement envelope recalculation. DB fix applied: 91 rooms
  corrected across all user projects via direct SQL update.
- B19 — Exposed envelope not updating on element type change — resolved.
  field === 'elementType' added to envelope recalculation trigger conditions
  in App.jsx updateElement.
- B20 — construction_library.json missing windows and doors data — resolved.
- B21 — Radiator design output column missing connection factor — resolved.
  calculateOutputAtMWAT(effDt50, mwat) in rowCalcs (RoomRadiatorSchedule) and
  checkRoomSufficiency was returning raw thermal output without multiplying by
  the room connection type factor (BOE×0.96, TBSE×1.00, TBOE×1.05). Required
  ΔT50 target was correctly dividing by the factor, but delivered output was not
  derated, causing isSufficient to return true when the room was actually ~4%
  short (BOE case). Fixed in RadiatorSizing.jsx: connectionFactor applied to
  designOutput in rowCalcs and to radOutput accumulator in checkRoomSufficiency.
  Column header subtext updated from "eff. ΔT50 × conv. factor" to
  "eff. ΔT50 × conv. × conn." to reflect actual calculation.
  74 window records and 6 door records added to construction_library.json.
  RdSAPUValuePicker reads from bundled JSON not DB — data was in DB (140 rows)
  but never merged into the JSON bundle.

---

## Feature backlog

### Priority 1 — Next sessions

~~**Per-item markup implementation**~~ — DONE (2026-07). See Session log and
Design decisions. Migration 020 applied; company_category_markup_defaults
table + materials_list_items.markup_pct live on local dev; database.js,
server.js, api.js, QuoteBuilder.jsx, SettingsPage.jsx all updated and
smoke-tested by Simon on local dev machine.

**Editable / hierarchical materials categories — needs scoping session**
Raised while using the new per-item markup feature (2026-07): Simon wants
the ability to add sub-categories under the existing 9 fixed categories, or
possibly let each company fully customise their category set (rename, add,
archive), similar in spirit to a Xero-style editable chart of accounts.

Not yet scoped — deliberately parked rather than designed in the same
session that shipped per-item markup, because it's a materially bigger
change than it first appears:

- Categories are currently a **hardcoded closed enum** duplicated across two
  files (CATEGORIES in QuoteBuilder.jsx, MAT_CATEGORIES in SettingsPage.jsx),
  referenced as free-text strings (parent_category, category_key) with no
  DB-level referential integrity. Making them user-editable means promoting
  this to a real company_categories table — a structural change, not a
  content change.
- Renaming or archiving a category has real consequences for historical
  data: existing quote_snapshots bake in category labels at the time of
  snapshot; a live rename shouldn't silently alter what a past PDF/snapshot
  shows. Precedent: the "existing quotes are not touched or recalculated"
  principle from the per-item markup work applies here too — likely archive-
  don't-delete (Xero's own pattern for chart-of-accounts entries with
  historical transactions), not hard delete/rename-in-place.
- **Editable categories** (flat, rename/add/archive) and **sub-categories**
  (hierarchy) are two distinct features with different blast radius, not one:
  editable-flat is a data-source change; hierarchy changes the *shape* of
  every "group by category" operation in the app (Quote Summary rollups,
  RECC checklist scope-of-works assumptions, and the not-yet-built quote/
  contract PDF generator).
- Sequencing question resolved (2026-07): proceed with PDF generation now
  using the current fixed 9 categories; revisit category editability once
  Simon has clarified the actual use case (how deep nesting genuinely needs
  to go — likely much shallower than full accounting-style chart-of-accounts
  depth, since these categories serve quote presentation to a domestic
  customer, not tax/P&L structure). Building the PDF generator against a
  category model that might still change would design it against a moving
  target.

Next step: Simon to think through the actual use case (what sub-categories
he'd actually use day to day) before this gets scoped properly.

**Quote/contract document generation — needs scoping session**
Not yet designed. Simon wants to move away from the RECC document structure
(considered unwieldy for customers) toward a more digestible customer-facing
format, while still covering what's legally/compliance-necessary. Per-item
markup work has now landed, so this is no longer blocked. Simon to re-share
current RECC reference documents when scoping this properly.

**Quote/contract document generation — needs scoping session**
Not yet designed. Simon wants to move away from the RECC document structure
(considered unwieldy for customers) toward a more digestible customer-facing
format, while still covering what's legally/compliance-necessary. Depends on
the per-item markup work above landing first, since the PDF needs a settled
pricing model to render. Simon to re-share current RECC reference documents
when scoping this properly.

**RECC checklist — remove RECC-specific framing**
The pre-send checklist in QuoteBuilder.jsx (CHECKLIST_SECTIONS, ReccChecklist
component) is useful and should stay, but RECC membership is not universal
among users and won't be an MCS requirement going forward. Remove "RECC"
labelling/badges from the checklist items and section framing; keep the
underlying checks (most reflect genuinely good practice regardless of RECC
membership) reworded to stand on their own.

**Pipe sizing PDF revision**
The pipe sizing PDF was built against the old JSON blob storage format for pipe
sections. That column no longer exists (pipe sections are now in their own
normalised table). PDF is currently outputting mostly zeros. Needs rewriting to
query pipe_sections + pipe_materials + fittings tables directly, same as the
UI does. Upload generate_pipe_sizing_pdf.py (or equivalent) to start.

**Survey form — load-back workflow**
The QR code launch and static HTML survey form exist. What's missing is the
server-side endpoint to receive submitted survey responses and load them back
into the project. Design question to resolve first: does the survey response
create/update rooms and elements directly, or does it create a pending import
the engineer reviews before applying? The latter is safer but more UI work.

**Quote builder and RECC checklist — plan gating**
The Materials & Quote tab currently shows the full quote builder and RECC
checklist to all users including free/single-project plan. These features
are only relevant to MCS-accredited engineers on the multi-project plan.

Proposed behaviour (matching customer pack button pattern):
- Materials list: visible to all users (useful for single-project/DIY)
- Quote section: grayed out with "available on multi-project plan" for
  free/single-project users; fully active for pro/beta plan users
- RECC checklist: same gating as quote section

Implementation: pass currentUser into QuoteBuilder.jsx; derive
canUseQuote = currentUser?.plan === 'pro' || currentUser?.plan === 'beta';
render quote and checklist sections conditionally or with disabled overlay.
Mirrors the pattern used for the customer pack button in RadiatorSizing.jsx.

**Element type data integrity enhancements**
Two related improvements to prevent silent heat loss errors caused by incorrect
default ΔT values on element creation. Both follow the Ground Floor (Slab) /
Ground Floor (Suspended) type-split precedent already in the codebase.

*1. Ceiling (below unheated loft) element type*
Currently the tool uses RdSAP's "insulation at joists vs insulation at rafters"
framing for roof/ceiling elements. This is technically correct (it identifies
where the thermal boundary sits) but is opaque to engineers unfamiliar with
the RdSAP convention — "insulation at joists" does not obviously mean "this
element is a ceiling losing heat to a cold loft." Discovered during real-project
review: easy to miscategorise, and the error inflates heat loss for that room.

Add "Ceiling (below unheated loft)" as an explicit element type, mirroring the
Ground Floor split. This makes the thermal boundary unambiguous in the UI
without requiring prior knowledge of the RdSAP convention. The RdSAP
"insulation at joists" type can remain for backwards compatibility or be
migrated. Carries full external design ΔT (same as an external wall), not zero.

In-app help implication: the existing in-app help backlog item should include
a tooltip for roof/ceiling element types explaining the thermal boundary
distinction — this is the most common miscategorisation point for new users.

*2. Auto-set customDeltaT = 0 for elements between heated spaces*
New elements currently inherit the room's full design ΔT regardless of type.
For internal elements between two heated spaces (internal wall, internal
ceiling to heated room above, internal floor to heated room below) this
silently overstates heat loss. Zero is the correct default and the safer
error direction — an underestimate here is minor; an overestimate propagates
into radiator and pipe sizing.

Prerequisite: confirm ELEMENT_TYPES already distinguishes "internal to heated
space" from "internal to unheated space" (or add that distinction first).
"Ceiling (below unheated loft)" and "Roof (insulation at joists)" must
explicitly carry the full external ΔT and must not be included in the zero-ΔT
auto-set group. Implementation follows the existing updateElement handler
pattern for Ground Floor (Slab).

**Decimal place consistency sweep**
Several fields display excessive decimal places (up to 12dp in element area
calculations and other numeric outputs). Needs a methodical component-by-component
sweep to enforce consistent display precision.

Precision rules (display only — never round calculation inputs or intermediates):
- Area: 2dp
- U-values: 3dp
- Heat loss (W): 1dp; (kW): 2dp
- Temperatures: 1dp
- Flow rates: 1dp
- W/K coefficients: 2dp
- Percentages: 1dp

Approach: work through each tab's rendered output in turn — RoomEditor/
ElementEditor, Summary, RadiatorSizing, PipeSizing — applying toFixed() or
a shared formatNumber() utility at display time only. Calculation functions
must remain unchanged. A shared util (e.g. fmt.area(v), fmt.kw(v)) would be
cleaner than scattered toFixed() calls and makes future changes easier.

**Calculation basis export (CSV + PDF)**
Third-party technical reviewers (local authority building control, MCS auditors,
collaborating engineers) currently cannot verify the inputs behind a heat loss
figure — only the outputs are visible in the existing reports. This is a known
gap across heat loss tools and a meaningful differentiator to address.

What needs to be exportable:
- Design parameters: external design temp, reference temp, climate region,
  thermal bridging category, ventilation method
- Per room: name, floor area, volume, internal temp, ceiling height,
  exposed envelope area, ventilation method, ACH/infiltration rate,
  ventilation loss (W)
- Per element (within each room): type, description, gross area, net area
  (after window/door deduction from parent wall), U-value, U-value source,
  thermal bridging addition, effective U-value, design ΔT, design fabric
  loss (W), reference ΔT, typical fabric loss (W)
- Totals: per-room and building-level fabric loss, ventilation loss,
  generator load, emitter load

Two export formats serving different audiences:

CSV — flat/denormalised (one row per element, room data repeated). Allows
independent verification in Excel. Directly serves the open-data principle
— a user can take their data out of OHL and into any other tool. Server-side
generation is straightforward from existing normalised tables.
New route: GET /api/projects/:id/export/csv

PDF — dense room-by-room technical appendix, effectively a full Worksheet A2
for every room showing all element inputs. For formal submission alongside
the design report. ReportLab can handle it but layout needs care — consider
landscape A4 or A3 for the element tables. New Python generator:
generate_calculation_basis_pdf.py, following existing generator pattern.
New route: POST /api/generate-pdf/calculation-basis

Both exports should be accessible from the Summary tab (where the other
report exports live), clearly labelled as "Full calculation data — CSV" and
"Full calculation data — PDF". No plan gating — this is a core transparency
feature appropriate for all user tiers.

### Priority 2 — Before first company subscriber

~~**Company details settings tab**~~ — DONE (June 2026)
Company name, MCS number, RECC number, address, postcode, email, phone, website
fields implemented. Cover letter template with merge token support added.
Logo upload deferred — needs logo_url column and storage solution (future).

**User management settings tab** (currently a placeholder)
Ability for a company admin to invite additional users (send email link, user
sets password, gets linked to company_id), view active users, and
deactivate users. Requires transactional email (Resend recommended).
Role model: admin | user (simple two-tier is enough for now).

**Customer project share**
Engineer sends a share link to the client. Link opens a read-only HTML page
(or tab-based view matching the current tool style) showing:
- Project summary (address, design temps, heat loss)
- Heat pump and cylinder selection with SCOP estimate
- MCS performance estimate
- Emitter schedule (room by room)
- Quote totals (customer-facing category totals only, not the materials breakdown)

Implementation options:
- Signed time-limited token in the URL (no login required for client)
- Shared view rendered server-side or as a React route with `?token=` param
- Tab layout preferred over a long single page (better client UX)
- No editing capability — strictly read-only

This is a meaningful differentiator — the leading tools do this but their
shared view is a single long page that's hard to navigate.

**In-app help**
The tool contains significant domain knowledge that many users won't have.
U-values are the primary pain point — most engineers and self-builders don't
have an intuitive feel for typical values, what affects them, or how to find
certified values for specific products. Help content needed:

- **U-value explainer** — what a U-value is, typical ranges by element type
  (wall 0.18–2.1, window 1.0–5.0, etc.), where to find certified values
  (manufacturer datasheets, BEIS/BRE certified products, RdSAP as a fallback),
  and when RdSAP defaults are appropriate vs when a certified value is required
- **Per-field tooltips** — brief contextual help on fields where the correct
  input isn't obvious (thermal bridging addition, Te,ref, air permeability,
  design flow/return temps)
- **MCS compliance notes** — what the MCS audit actually checks; which fields
  feed the MCS 031 output and why they matter
- Tab-level "what is this for?" collapsible panels, matching the instruction
  video structure Simon is already recording

Implementation note: keep help content in JS/JSX constants (same rationale as
reference data — version-controlled, bundled, no round trip). A `helpContent.js`
file in utils would work well.

**Marketing website**
openheatloss.com currently serves the app directly. A search for "open heat
loss" returns the GitHub repo and an early YouTube video but no direct link to
the app or any explanatory landing page. This is a meaningful gap as the tool
becomes more widely known. Subdomain split recommended — app at
app.openheatloss.com, static marketing site at openheatloss.com. Four complete
static HTML pages already built (index, for-engineers, for-self-builders,
how-it-works). Hosting options: Cloudflare Pages or shared hosting.

### Priority 3 — SaaS infrastructure (before scaling beyond ~5 companies)

**Full sub-resource ownership verification**
Currently rooms, elements, u-values etc. use lightweight project-lookup helpers
(getProjectIdForRoom etc.) to check company ownership. This is correct but not
bulletproof — a malicious request with a valid session but wrong company_id
could theoretically probe. Before multi-company scale, every sub-resource PUT/
DELETE should join back to projects.company_id and verify against req.user.companyId.
One session to do this systematically across server.js.

**api.updateQuote / PUT /api/quotes/:id payload audit**
The quotes update handler in server.js uses the same hand-rolled, manually-
listed payload pattern that api.updateRoom used before the buildRoomPayload
consolidation (see 2026-06 session log). Every field added to the quotes
payload (most recently advance_amount; imminently the per-item markup work)
requires manually editing the SQL and the destructure in this one handler,
with no whitelist helper and no safety net if a field is missed. Same bug
class as the resolved api.updateRoom issue — deliberately deferred rather
than fixed inline during the advance_amount bug fix (2026-07) and the
per-item markup design work, to avoid conflating a structural refactor with
either of those focused changes. Do this once, after the per-item markup
work lands, so the audit accounts for the final field set rather than
needing to be revisited twice more.

**Auth hardening / SaaS auth layer**
Current: bcrypt + JWT in httpOnly cookies, hand-rolled. Works fine for small
scale. For a paid SaaS with multiple companies: consider Auth0 or Clerk (both
have generous free tiers) or hardened Passport.js. Adds social login, MFA,
session management. Not urgent — current auth is sound for early beta.

**Stripe billing integration**
When paid plans go live. Stripe handles PCI compliance, subscription lifecycle,
customer portal. Webhooks update users.plan in the DB. ~2 sessions to integrate.

**Row-level security**
Postgres RLS policies as a belt-and-braces layer under the application-level
company_id scoping. Worth adding before going beyond a handful of companies.

**DB snapshots before migrations**
Railway TCP proxy URL used for pg_dump from local machine. Beekeeper Studio
installed for GUI DB management. Always snapshot before any SQL touching live
data. Command:
  pg_dump "postgresql://postgres:PASSWORD@proxy.host:PORT/railway" \
    --no-owner --no-acl -f backup_$(date +%Y%m%d_%H%M%S).sql

### Priority 4 — Calculation / standards extensions

**Full BS EN 12831-1:2017 mode**
Alternative to the CIBSE reduced method, selectable at project level. For new
builds, self-builders, Passivhaus projects. Data model is already ready
(temp_factor, custom_delta_t, ventilation_method column). UI and calculation
changes documented in handover_en12831_full_method_v2.md.

**Ventilation design tool**
Show what mechanical ventilation provision would meet BS EN 12831-1 minimum
rates. Addresses a widely overlooked practice gap in retrofit. High value but
requires careful standards interpretation — park until full EN 12831 mode is
done.

**Weather compensation cut-off temperatures**
Design/commissioning input: outdoor temp at which heating turns on/off.
Companion to the modulation check already in the Summary.

**CIBSE age-band U-value defaults**
"Populate from standard values" button on the U-value library screen. Pre-fills
based on selected age band and construction type. Engineer overrides anything
that doesn't match. RdSAP10 already seeded as construction_library — this is
a UI feature to surface those values during project setup.

## Emitter sizing
- [ ] Per-model EN 442 n-exponent selection — currently fixed at n=1.3 (good default
      for panel radiators). Allow engineer to select exponent from radiator spec or
      enter manually. Relevant range: ~1.1 (UFH/fan coil) to ~1.5 (column radiators).
      Affects derated output calculation at low flow temperatures.

**Emitter sizing — rooms with both UFH and radiators**
Currently the bathroom case (UFH + towel rail) is not handled cleanly.
Parked — low frequency edge case.

**Minimum modulation condition clarification**
Manufacturers quote minimum modulation at varying conditions. Add a note and
optional condition input field to make clear what the modulation check assumes.

**MCS Quality Management System workflow**
Simon has flagged the MCS QMS requirement and the associated document/folder
workflow (currently managed manually outside the app) as a real pain point.
Deliberately not scoped or actioned yet — flagged during the quote/pricing
redesign session (2026-07) and explicitly parked to avoid scope creep into
that work. Worth a dedicated discussion on whether/how OHL could reduce this
admin burden, once the quote and document-generation work has landed — likely
touches document storage (see Cloudflare R2 note below) and possibly the
customer project share feature.

---

## Testing

**SMOKE_TEST.md** — created June 2026. Lives in project root. Run after every
meaningful deploy. Anchored to a 15-room reference project with known outputs:
- Generator heat loss: 5.20 kW
- Emitter heat load: 7.05 kW
- Index circuit: 20.97 kPa, 0.335 l/s
- System volume: 152 l
- Heat pump: Panasonic L Series 7 kW, min modulation 2.2 kW
- Design flow/return: 45/40°C

---

## Storage architecture note

**Cloudflare R2** is the recommended solution for all binary file storage:
- Company logos (for tool header and PDFs)
- Survey photos (on-site photos linked to a project)
- Commissioning photos
- Scanned documents (certificates, datasheets etc.)

R2 is S3-compatible — use `@aws-sdk/client-s3` with a custom endpoint, no
code difference from AWS S3. Free up to 10GB / 1M requests per month with
no egress fees (unlike S3 which charges for downloads). A Railway-hosted app
can talk to R2 directly over HTTPS — no special networking needed.

The `documents` table already exists in the schema. It needs:
- A `storage_url` or `r2_key` column to store the object reference
- An upload endpoint in server.js using the S3 SDK
- Presigned URLs for serving files back (keeps R2 bucket private)

One R2 bucket covers all three use cases. Implement when company details
(logo) becomes a priority — survey/commissioning photos can follow the same
pattern.

---

## Design decisions (rationale recorded)

**Per-item markup, not per-category or blanket — quote pricing model redesign (planned)**
The original quote pricing model (migration 011) used a single blanket
markup_pct applied to every category, with an escape hatch (category_overrides)
for typing in an absolute price when the blanket rate didn't fit. In practice
this was too coarse: markup needs differ by category (e.g. 20% on heat pumps
vs 30% on radiator valves/fittings, which carry higher transaction cost) and
even within a single category, by item (e.g. MCS registration filed under
"labour" needs 0% markup — it's a pass-through fee — while subcontracted
labour on the same job might need a real markup).

Decision: markup lives on the item, not the category or the quote.
- `materials_list_items` gains `markup_pct` (per row, freely editable)
- New `company_category_markup_defaults` table (company_id, category_key,
  default_markup_pct) — Settings-managed, same shape as materials_library —
  pre-fills new items' markup_pct based on category, but doesn't constrain
  what an item is actually saved with
- Category totals in the Quote Summary become pure read-only rollups:
  sum of (unit_cost × quantity × (1 + markup_pct/100)) per category —
  no editable input at the category level anymore
- The old absolute-price override (quotes.category_overrides) becomes
  unnecessary once per-item markup gives sufficient granularity — dropped
  from the UI, though the column itself is left in place (not backfilled,
  not dropped) since it's still read by old quotes' stored totals
- quotes.markup_pct is likewise left in place but unused by new code

Existing quotes are NOT touched or recalculated. materials_list_items.markup_pct
defaults to 0 for pre-existing rows (an honest "no markup recorded" value, not
an invented figure) and old quotes' already-computed totals
(total_ex_vat/total_inc_vat etc. on the quotes table) are untouched — this was
a deliberate choice to avoid any silent change to a quote that may already be
issued or accepted. New markup only applies going forward, to new items or
items explicitly edited after this ships.

UI: MaterialRow's markup_pct field is hidden by default (revealed on hover/
click, same convention as the existing save-to-library/delete icons) but the
row's total always reflects it, with a muted indicator shown when an item's
markup differs from its category's company default — preserves the ability
to scan a category and spot anomalies (e.g. two labour lines with different
treatment) without permanently widening every row.

**Unheated space / party wall delta T — engineer inputs boundary temperature**
Do not auto-derive the boundary temperature from a lookup table by space type.
Requiring the designer to state an assumed adjacent temperature (and own that
assumption) produces better designs than pre-filling it. A tooltip noting
typical values (unheated loft 0–5°C, unheated garage ~5°C, party wall to
unheated dwelling ~10°C) can guide without deciding. Maps cleanly onto
customDeltaT = Ti − Tadjacent. Full EN 12831-1 temp_factor implementation
later replaces this with a derived value.

Principle: automate the tedious parts (lookups, derived values) but keep the
engineer responsible for inputs requiring professional judgement.

**U-value manual override — not implemented**
A freeform override bypassing the library would break the MCS audit trail.
U-values must be anchored to a named library record. The inline "Add U-value"
form (added May 2026) provides the right escape hatch — saves to library with
a name, keeping every value traceable.

**Reference constants in JS files, not database**
Standards reference data (SAP infiltration tables, 50 Pa conversion factors,
regional reference temperatures, ELEMENT_TYPES etc.) is kept in utils/*.js
rather than the DB because: (1) it's tightly coupled to calculation logic —
changes should be atomic with the code that uses them; (2) Vite bundles it
at build time, no server round trip; (3) version control provides a better
audit trail than ad-hoc DB edits; (4) IDE autocompletion works across the
whole codebase. DB is correct for user-editable data (radiator library,
company U-values, rate cards) and large seeded datasets (RdSAP 244 records).

**Exposed envelope uses gross element area — no window/door subtraction**
CIBSE DHDG 2026 section 2.5.4.2 explicitly requires gross element area for
the exposed envelope calculation. Windows and external doors are NOT subtracted.
The envelope represents total exposed surface through which air leaks. Window/
door subtraction applies only to the fabric U-value calculation in
calculateTransmissionLoss(). This is distinct from the element area used for
heat loss, which does subtract child elements.

**Pipe section staleness — flag and require review, no auto-recalculation**
When heat pump output or design temperatures change, pipe sections are flagged
amber rather than auto-recalculated. A change in flow rate may require a change
in pipe diameter — auto-recalculating silently would hide that. The engineer
must open and re-save each flagged section to confirm pipe diameters are still
appropriate. This is consistent with how MCS-compliant tools handle design
changes: the pipe sizing should be a deliberate design act.

**W/m² outlier threshold — statistical with absolute floor**
Rooms flagged amber in the room-by-room summary if W/m² > max(2× building
mean, 80). The 80 W/m² floor prevents false positives on small rooms in
well-insulated buildings. Threshold is conservative and should be revised based
on user feedback. Typical UK retrofit ranges: pre-1919 solid brick 45–55 W/m²,
1960s cavity 25–40 W/m², well-insulated retrofit 15–25 W/m².

---

## Architecture notes

### Method scope (important for future work)
The current implementation uses the **CIBSE DHDG 2026 reduced method** for
BS EN 12831-1:2017. This is appropriate for:
- Existing domestic UK properties
- Naturally ventilated or MVHR buildings
- All combustion appliances room-sealed
- MCS MIS 3005-D compliant from April 2025

The 0.5 ACH check against MVHR supply/extract rate is **not required** under
this method. MVHR with stated efficiency satisfies the ventilation requirement
without verification against flow rates. This check belongs to the full
EN 12831-1 method only.

### Calculation load types — critical distinction
Three heat loss figures are used throughout the codebase. Using the wrong one
is a recurring source of bugs. See CALCULATIONS.md for full reference.

  EMITTER LOAD   = fabric (design) + ventEmitter (×2 orientation factor)
                   Source: calculateRoomTotal() — used for pipe sizing, emitter sizing
                   Always HIGHER than generator load for naturally ventilated buildings

  GENERATOR LOAD = fabric (design) + ventGeneratorDesign (×1 orientation factor)
                   Source: calculateTransmissionLoss() + ventGeneratorDesign from
                           calculateRoomVentilationEN12831()
                   Used for heat pump selection, W/K coefficient, MCS 031

  TYPICAL LOAD   = fabric (Te,ref) + ventGeneratorTypical
                   Used for modulation check (MCS 5.7.2)

calculateRoomTotal() returns EMITTER load. Do not use for heat pump sizing.

### camelCase requirement for calculation functions
All calculation functions (calculateRoomTotal, calculateTransmissionLoss etc.)
expect camelCase field names as mapped by App.jsx loadProject(). Calling them
on raw DB rows (snake_case) causes silent zero transmission loss because
el.uValue is undefined. Safe: any React component receiving project via props.
Unsafe: raw fetch() responses before loadProject() mapping.

### Materials / quote data model (migration 011; markup model superseded — see Design decisions)
- materials_library: company-scoped reusable item templates
- materials_list_items: job-level child lines, prices copied at time of use
- quote_snapshots: immutable version history, JSONB blob per snapshot
- labour_rate_cards + labour_rate_items: versioned company rate cards
- quotes.markup_pct, category_overrides, rate_card_id: added in migration 011,
  but markup_pct and category_overrides are legacy once the per-item markup
  redesign ships — see "Per-item markup" design decision above. rate_card_id
  remains current/in-use (unrelated to this change).

### Pipe sections data model (migration 010)
Pipe sections are stored in the normalised pipe_sections table, not in a JSON
blob on design_params. The old pipe_sections JSONB column no longer exists.
Any code or PDF generator referencing dp.pipe_sections or similar will return
null/empty. The pipe sizing PDF needs rewriting to use the pipe_sections table.

### normalisePipeSectionBody — snake_case priority rule
In server.js, normalisePipeSectionBody gives snake_case fields priority over
camelCase. This is correct for computed fields (pressure_drop, velocity) where
the fresh calculated value should win. But when sending updates from the editor,
always explicitly set the snake_case field in the payload if the camelCase value
is the one that changed — otherwise the old DB-sourced snake_case value in the
spread wins. See B15 and B16 for examples of this pattern causing bugs.

### Field naming convention
- DB: snake_case
- Server req.body / responses: passes through as-is
- React state / App.jsx: camelCase
- Translation: App.jsx loadProject() maps DB → camelCase
- Any new field: migration → database.js → App.jsx loadProject() → App.jsx save handler

### Quote → materials relationship
Materials list is internal cost tracking. Quote shows category totals to
client — computed as a rollup of each item's own markup_pct, not a single
category-level or quote-level rate (see "Per-item markup" design decision).
Snapshots capture the full state at a point in time.

---

## Session log

### 2026-07 — Per-item markup implementation shipped; categories discussion parked

**Feature shipped:**
Per-item markup fully implemented per the design agreed in the prior session
(see Design decisions — "Per-item markup, not per-category or blanket").

- Migration 020: company_category_markup_defaults table (company_id,
  category_key, default_markup_pct, UNIQUE(company_id, category_key));
  materials_list_items.markup_pct column (default 0, not backfilled)
- database.js: new companyCategoryMarkupDefaults object (getForCompany,
  getOne, set — upsert via ON CONFLICT); materialsListItems.create() signature
  changed to (projectId, companyId, data) — looks up company default via
  getOne() when markupPct not explicitly supplied (explicit 0 is respected,
  only undefined/null triggers fallback); materialsListItems.update() takes
  markup_pct directly, no fallback logic (edits never silently revert to
  policy); both import functions (importFromRadiatorSchedule,
  importFromPipeSections) gained companyId parameter, look up the company
  default once per import batch (not per row) and apply it to all imported
  items — deliberate per Simon's instruction that imports (e.g. 10+ radiators)
  should benefit from company policy the same way manual entry does
- server.js: companyId threaded through to materialsListItems.create() and
  both import routes via req.user?.companyId ?? null (anonymous sessions get
  null → 0% markup, no company policy exists for them); two new routes,
  GET/PUT /api/company/markup-defaults(/:categoryKey), requireAuth only
  (anonymous users have no company to manage defaults for)
- api.js: getMarkupDefaults, setMarkupDefault added, matching this file's
  plain fetch().then(r => r.json()) convention (no wrapper abstraction exists
  in this file — confirmed against actual source before writing, not assumed)
- QuoteBuilder.jsx: MaterialRow gained markup_pct field, hover/click reveal
  (matching the existing save-to-library/delete icon convention), muted
  anomaly indicator shown when an item's markup differs from its category's
  company default; QuoteSummary rewritten — blanket markup_pct input and
  CategoryOverrideRow/absolute-override UI removed entirely, category rows
  are now pure read-only rollups (materials total, marked-up total via new
  markedUpSubtotal() helper); quotes.markup_pct and quotes.category_overrides
  DB columns left in place, unused by new code (not dropped — still read by
  any pre-existing quote rows, though none needed backfilling per the
  decision not to touch existing quotes)
- SettingsPage.jsx: markup defaults management nested as a sub-section
  inside the existing Materials Library tab (Simon's call — conceptually
  the same "categories" the tab already manages), not a new top-level tab

Confirmed working and smoke-tested by Simon on local dev machine.

**Bug found and fixed during this session (tooling, not app code):**
migrate.js had no dotenv loading step, unlike server.js which does
`require('dotenv').config(...)` at the top. Running `node server/migrate.js`
directly failed to connect — DATABASE_URL was undefined in that process even
though it's correctly set in .env, because nothing had loaded the .env file
before migrate.js tried to read process.env.DATABASE_URL. Only worked
previously via the Railway deploy command, where Railway injects the env var
directly (dotenv.config() no-ops harmlessly there since there's no local
.env file to find). Fixed by adding the same dotenv line to migrate.js that
server.js already has. Pre-existing gap, not introduced by this session's
work — root cause confirmed before applying the fix rather than adopting the
inline `DATABASE_URL=... node migrate.js` workaround initially suggested,
since that pattern risks someone eventually pasting a production connection
string inline out of habit.

**Design discussion — not actioned, logged for future scoping:**
Editable/hierarchical materials categories raised by Simon after using the
new markup feature (see Priority 1 — "Editable / hierarchical materials
categories"). Deliberately not scoped in this session — identified as a
structurally bigger change than it first appears (categories are currently
a hardcoded closed enum, not a data model concept; hierarchy changes the
shape of every category-grouping operation in the app, not just its source).
Sequencing decided: proceed with quote/contract PDF generation next using
the current fixed category set, rather than let PDF generation design get
blocked on a category model that might still change.

### 2026-07 — Input bug fixes (QuoteBuilder) and markup model design

**Bugs fixed:**
- Materials list row flicker while typing — the debounced-save "saving"
  indicator in MaterialRow was conditionally rendered (mounted/unmounted),
  changing the row's height when it appeared, pushing all content below it
  down and back. Fixed by always rendering the indicator and toggling opacity
  instead of presence, so row height never changes.
- Quote summary category override input mangled typed figures (e.g. typing
  "2000" over "1400.00" produced "2.00") — the input was fully controlled by
  a derived value reformatted to 2dp on every keystroke, fighting cursor
  position while typing. Extracted CategoryOverrideRow with local string
  buffer, committing to parent state on blur/Enter only — matching the
  existing MaterialRow local-state pattern.
- Payment schedule "further advance" figure did not persist at all —
  advance_amount was pure client-side state, never sent to the server and
  never hydrated on load (four-layer rule violation; the column didn't exist
  in the DB at all). Migration 019 adds quotes.advance_amount; PUT
  /api/quotes/:id and QuoteBuilder.jsx load/save updated accordingly.

**Design work (no code yet — see Design decisions above):**
- Quote pricing model redesigned from blanket markup_pct + absolute
  category_overrides to per-item markup_pct on materials_list_items, with
  company-level per-category defaults (new company_category_markup_defaults
  table) as a starting point rather than a constraint. Existing quotes
  explicitly not touched or recalculated.
- Noted but deferred: quotes update handler (PUT /api/quotes/:id) has the
  same hand-rolled payload bug class as the resolved api.updateRoom issue —
  tracked as a Priority 3 audit item, to be done once the per-item markup
  fields land rather than mid-fix.
- Noted but deferred: BUS grant amount/status has no input in the Quote
  Summary UI despite the underlying project fields existing — surfaced while
  diagnosing the advance_amount bug, not yet actioned.
- Noted but deferred: MCS Quality Management System document/folder workflow
  pain point — flagged by Simon, explicitly parked to avoid scope creep into
  the pricing redesign; worth a dedicated session later.
- RECC-specific framing in the pre-send checklist flagged for removal (RECC
  membership not universal, not an MCS requirement going forward) — checks
  themselves retained, just reworded; not yet implemented.
- Quote/contract PDF generation scoping explicitly deferred until the
  per-item markup work lands, since the PDF needs a settled pricing model to
  render against.

### 2026-06 — Customer pack PDF, company details, plan gating

**Features added:**
- Customer pack PDF generation (Generate Customer Pack button in RadiatorSizing.jsx)
  — cover letter + heat loss report + emitter schedule + optional MCS 031/020,
  merged into a single PDF download. Cover letter uses merge tokens populated
  from project/client state at generation time.
- generate_cover_letter_pdf.py — new Python/ReportLab generator matching
  existing report style (colours, fonts, footer)
- merge_pdfs.py — PDF merger with self-installing pypdf fallback
  (pdftk and pikepdf not available on Railway)
- pdf-routes.js — refactored to factory function (requireAuth + companies
  injected); new POST /api/generate-pdf/customer-pack route fetches company
  data server-side using session companyId
- buildHeatLossPayload.js — shared utility in client/src/utils/ so
  RadiatorSizing can build an identical heat loss payload to Summary.jsx
- Company Details settings tab built out — company fields + cover letter
  template textarea with merge token reference panel; migration 018 adds
  cover_letter_template TEXT to companies table
- Customer pack and Generate Customer Pack button gated to pro/beta plan users;
  free/single-project users see a disabled grayed-out button with tooltip

**Bugs fixed during this work:**
- MCS 031/020 snapshots were passed raw to PDF generator — missing project/
  customer info (snapshot only stores calculation outputs, not project fields).
  Fixed: payloads now assembled from live project state + snapshot outputs,
  matching handleExportPDF in each MCS component
- MCS 020 assessment positions live in project.mcsSoundAssessments not in the
  snapshot itself — customer pack now reads from the correct field; inclusion
  guard requires soundPowerLevel > 0 and at least one assessment position

**Infrastructure:**
- Migration 018: cover_letter_template TEXT added to companies via
  addColumnIfMissing (idempotent)
- server.js: pdfRoutes early mount removed; factory mount added after
  requireAuth is defined

### 2026-06 — api.updateRoom audit & buildRoomPayload consolidation

**Foundation work — bug class closed:**
Three separate hand-rolled `api.updateRoom` payload objects consolidated into
calls to the existing `buildRoomPayload` helper. This closes the silent
data-loss bug class where fields added after a handler was written would be
silently dropped on save with no error or crash.

Call sites fixed:
- `updateRoom` handler (pattern 2) — 53 lines of manual field conditionals
  replaced with `buildRoomPayload(room, updates)`. Dead code removed:
  `ventilationFields`, `sapVentilationFields`, `en12831Fields` arrays and
  their associated ternaries were rendered redundant by the spread pattern
  already in `buildRoomPayload`.
- `_recalcRoomFromSegments` (pattern 3) — hand-rolled payload (field-for-field
  identical to `buildRoomPayload`) replaced with
  `buildRoomPayload(room, { volume: newVolume, floorArea: newFloorArea })`.
- `updateRadiatorSchedule` connection type handler (pattern 4, found during
  audit) — consolidated to `buildRoomPayload`. Also fixed a latent bug:
  `infiltrationRate` was defaulting to `|| 0.5` in this handler, inconsistent
  with both the calculation (which uses `?? 0`) and the other handlers.
  Confirmed safe: `infiltrationRate` is not consumed by the EN 12831 path at
  all; `0.5` minimum is a UI warning threshold only, not a calculation floor.

**What "closing the bug class" means here:**
`buildRoomPayload` is now the single authoritative source for the room payload
shape. Adding a new room field now requires updating only `buildRoomPayload`
— all three call sites benefit automatically. Previously, each call site had
to be manually updated, with no safety net if one was missed.

**Schema reference diagram produced:**
Full HTML schema diagram generated showing all tables grouped by functional
area (auth, projects, rooms/fabric, emitters, pipe sizing, quotes) with field
types, PK/FK relationships, and ventilation generation markers (GEN/LEG).
Ventilation layering across three generations now visible at a glance.
Saved locally for reference during ventilation field audit (planned).

**Investigations during session:**
- `infiltrationRate || 0.5` in pattern 4 investigated before removal — confirmed
  dead code. EN 12831 leakage rate computed from envelope data, not stored
  `infiltrationRate`. The `0.5` minimum at `en12831Calculations.js:187` is a
  `minACH` warning check, not a calculation floor.
- `circuits` and `pipe_sections` JSONB columns in `design_params` noted as
  likely migration artifacts (proper normalised tables now exist). To confirm
  and potentially retire in ventilation audit session.

### 2026-06 — Radiator sizing connection factor bug fix

**Bugs fixed:**
- B21: Radiator design output missing connection factor (RadiatorSizing.jsx)
  — rowCalcs designOutput and checkRoomSufficiency radOutput both called
  calculateOutputAtMWAT(effDt50, mwat) without applying the room connection
  type factor. Required ΔT50 target correctly divided by connectionFactor but
  delivered output was underated — BOE rooms could show as sufficient when ~4%
  short. Fixed by multiplying designOutput by connectionFactor in rowCalcs, and
  multiplying calculateOutputAtMWAT result by the room's connection factor in
  checkRoomSufficiency. Column header subtext updated to match.
  Documented in YouTube bugs & resolutions playlist.

---

### 2026-06 — Pipe sizing fixes, envelope bugs, W/m² warning, documentation

**Bugs fixed:**
- B14: Index circuit toggle (PipeSizing.jsx) — snake_case shadowing fix
- B15: Pipe section heat load/flow rate stale after save (PipeSectionEditor.jsx)
  — added flow_rate and heat_load to calculateAndSave explicit overrides;
  added effectiveHeatLoad/effectiveFlowRate derived constants for useWholeProperty
  sections so values always reflect current project state without save/re-open
- B16: Room-connected pipe section staleness not clearing after save
  (PipeSizing.jsx, PipeSectionEditor.jsx) — added key prop to PipeSectionEditor
  mount; useState initialiser now recalculates heatLoad/flowRate from connected
  rooms on open rather than seeding stale stored values
- B17: Exposed envelope not updated after element delete (App.jsx)
- B18: Exposed envelope incorrectly subtracting windows/doors (App.jsx) —
  CIBSE DHDG 2026 s.2.5.4.2 requires gross area; DB fix applied (91 rooms)
- B19: Exposed envelope not updating on element type change (App.jsx)
- B20: construction_library.json missing windows/doors — merged from seed JSON

**Features added:**
- Pipe section staleness detection in PipeSizing.jsx — amber banner, per-section
  badge, PDF export blocked when stale sections exist; detects changes to heat
  pump output, flow/return temps, and room heat losses
- W/m² outlier detection in Summary.jsx — amber row highlight and summary notice
  for rooms > max(2× building mean, 80 W/m²); threshold conservative, to be
  refined from user feedback

**Documentation:**
- CALCULATIONS.md created — reference document for load types, function guide,
  field naming rules, pipe sizing emitter vs generator distinction
- calculations.js — full JSDoc update including load type header and camelCase
  warning on calculateRoomTotal
- pipeMaterialData.js — documented velocity limits, do-not-store rule for
  isVelocityOK/maxVelocity, legacy key remapping, calculateFlowRate usage
- en12831Calculations.js — three-output header block added

**Testing:**
- SMOKE_TEST.md created with 10-section checklist anchored to reference project

**Infrastructure:**
- Beekeeper Studio installed on dev machine (AppImage, ~/Applications/)
- Railway DB connection configured (public TCP proxy for admin access)
- pg_dump snapshot procedure documented in Priority 3 above

### 2026-05 (session 3) — Project Info rework, region selector
- en12831VentilationData.js: default entry added to REGIONAL_REFERENCE_TEMPS
  (annualMean: 10.0, isDefault: true) — distinct from E/W Pennines at 10.0°C
- ProjectInfo.jsx: annualAvgTemp removed; Climate Region + Te,ref moved from
  VentilationSettings into Design Parameters; amber nudge on default 10.0°C
- VentilationSettings.jsx: Reference Temperature section removed
- App.jsx: referenceTemp defaults updated to 10.0 in loadProject and
  createProject; calculation safety fallback left at 10.6

### 2026-05 (session 2) — Login/dashboard fix, inline U-value add, backlog
- App.jsx: handleLogin now gates project auto-load on !hasDashboard;
  setCurrentProject(null) on login for dashboard users (clears anonymous project);
  onAddUValue={addUValueFromCalculator} threaded into RoomList;
  addUValueFromCalculator now returns saved u_value for auto-apply
- ElementEditor.jsx: AddUValueInlineForm component added — opens inline below
  element row, pre-set to element category, saves to library and auto-applies
  the new U-value to the triggering element row
- RoomList.jsx, RoomEditor.jsx: onAddUValue prop threaded through
- BACKLOG.md: design decisions section added

### 2026-05 — Materials list, quote builder, settings
- Migration 011: materials_library, materials_list_items, quote_snapshots,
  labour_rate_cards, labour_rate_items; quotes altered with markup_pct,
  category_overrides, rate_card_id
- database.js: labourRateCards, materialsLibrary, materialsListItems,
  quoteSnapshots objects added
- server.js: all new routes for above; PUT /api/quotes/:id updated
- api.js: all new client-side methods
- QuoteBuilder.jsx: full rewrite — materials list with parent/child structure,
  three pricing modes, import from radiator schedule and pipe sections, quote
  summary with markup and category overrides, snapshot history, RECC checklist
- SettingsPage.jsx: Materials Library tab and Rate Card tab added
- App.jsx: dashboard logout button, survey moved to ProjectInfo tab,
  tab renamed to Materials & Quote, onLaunchSurvey prop
- ProjectInfo.jsx: Survey button inline with Project Information heading

### Earlier sessions (summary)
- B1–B13 resolved; full Postgres migration; auth hardening; anonymous sessions;
  EN 12831/CIBSE reduced method; emitter sizing; pipe sizing (normalised tables);
  system volume; SCOP estimator; MCS031/020; radiator library seeding;
  RdSAP10 U-value library; PDF generation for all outputs; project dashboard;
  password reset; admin page

### 2026-06 — Security hardening & Strict Mode boot fix

**Security fixes:**
- B22: getCompleteProject (database.js) — anonymous sessions now blocked from
  accessing registered projects (company_id !== null check). Closes both
  unauthenticated access and post-logout exposure via persistent anon_token cookie.
- B23: Three address routes in server.js now gated with ownsProject check —
  POST /api/projects/:projectId/addresses, PUT /api/addresses/:id,
  POST /api/projects/:projectId/addresses/link. New getProjectForAddress helper
  in database.js looks up owning project via project_addresses join. GDPR
  obligation — customer addresses are personal data.
- Smoke test section 11 added: access control checks for ownership, auth
  required, rate limiting, CORS, and known remaining gaps.

**Bug fix:**
- B24: useRef bootedRef guard added to App.jsx boot useEffect — prevents
  React Strict Mode double-invocation creating duplicate anonymous projects
  in development. One import change (useRef added), one ref declaration,
  one guard line at the top of useEffect.

**Files changed:**
- server.js — getProjectForAddress imported; ownership checks on 3 address routes
- database.js — getProjectForAddress helper + export; anonymous session block
  in getCompleteProject
- App.jsx — useRef imported; bootedRef guard on boot useEffect

**SECURITY.md updated** — B22 and B23 closed; GET /api/projects/:projectId/u-values
remains as sole tracked open gap (low risk, not personal data).
