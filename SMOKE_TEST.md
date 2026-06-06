# OpenHeatLoss — Smoke Test Checklist

**Reference project:** [insert project name]  
**Last verified:** [date]  
**Verified by:** Simon

Run this checklist after every meaningful deploy. Tick each item only when
confirmed — don't skim. The reference project figures are the regression
anchors: if they change unexpectedly, something has broken.

---

## 0. Pre-deploy

- [ ] Review which files changed this session
- [ ] Flag any changes touching: calculations, save/load paths, PDF generators
- [ ] Note the current reference project heat loss before deploying: **5.20 kW**

---

## 1. Auth & navigation

- [ ] Log out, confirm landing page loads
- [ ] Anonymous session: create a new project, add one room, add one element —
      confirm a heat loss figure appears
- [ ] Log in with registered account, confirm dashboard loads
- [ ] Open reference project from dashboard

---

## 2. Reference project — core figures

Open the reference project and confirm the following match exactly.
Any change here is a regression until proven otherwise.

| Output | Expected | Actual | ✓ |
|--------|----------|--------|---|
| External design temp | −4.6 °C | | |
| Reference temp (Te,ref) | 10.6 °C | | |
| Effective q50 | 16.6 m³/h·m² | | |
| Generator heat loss | 5.20 kW | | |
| Emitter heat load | 7.05 kW | | |
| Index circuit pressure loss | 20.97 kPa | | |
| Index circuit flow rate | 0.335 l/s | | |
| System volume | 152 l | | |

---

## 3. Save / reload cycle

- [ ] Make a minor change (e.g. edit a room name)
- [ ] Save
- [ ] Hard reload the page (Ctrl+Shift+R)
- [ ] Reload the project — confirm the change persisted
- [ ] Confirm generator heat loss still reads **5.20 kW** after reload

---

## 4. U-value library & RdSAP picker

- [ ] Open the U-value library — confirm entries load (should include 8 suspended
      timber floor entries created via the floor U-value editor)
- [ ] Open the RdSAP picker, select **Wall (external)** — confirm records load
- [ ] Select **Window or Glazing**, choose a glazing type — confirm records load
      *(this was the silent failure mode: empty list with no error)*
- [ ] Select **External Door** — confirm records load
- [ ] Select **Party Wall** — confirm records load
- [ ] Select **Roof** — confirm records load
- [ ] Select **Exposed / Semi-exposed Floor** — confirm records load
- [ ] Add one U-value to the library via the inline Add form — confirm it appears
      in the library and can be selected on an element

---

## 5. Room editor — calculation inputs

- [ ] Open a room with a **suspended timber floor** — confirm U-value is present
      and the floor element shows a sensible heat loss contribution
- [ ] Open a room with **UFH** (3 rooms have UFH added for instruction video) —
      confirm the emitter sizing tab shows UFH output, not an error
- [ ] Open a room with **radiators** — confirm emitter sizing shows radiator
      output and flow rate
- [ ] Check thermal bridging addition is set and saving correctly on at least
      one room (change it, save, reload, confirm it round-tripped)

---

## 6. Room editor — geometry tools

- [ ] **Segment calculator:** open one of the two rooms set up with segments,
      confirm the room area matches the expected segmented total
- [ ] **Roof profile calculator:** open one of the 3 curved/sloped ceiling rooms,
      confirm the single-slope calculator produces the expected area/volume,
      and that it feeds through to the heat loss correctly
- [ ] Confirm that manually entered totals in the other segmented room still
      show correctly (fudged totals should not have been overwritten)

---

## 7. Heat pump & SCOP

- [ ] Confirm heat pump shows **Panasonic L Series 7 kW**
- [ ] Confirm design flow/return temps: **45 °C / 40 °C**
- [ ] Confirm modulation check is present in Summary — minimum output **2.2 kW**
- [ ] Confirm SCOP estimate is present and a plausible figure (typically 2.5–3.5
      for this flow temp and climate region)
- [ ] Confirm no unexpected warnings in the Summary tab

---

## 8. Pipe sizing

- [ ] Open pipe sizing tab — confirm sections load (not blank / zeros)
- [ ] Confirm index circuit shows pressure loss **20.97 kPa**, flow rate **0.335 l/s**
- [ ] Confirm pipe material and diameter selections are retained after reload

---

## 9. PDF generation

Trigger each PDF and confirm: it downloads, is not blank, and key figures match
the reference values above.

- [ ] **Heat loss PDF** — check total heat loss figure on summary page
- [ ] **Emitter schedule PDF** — check at least one room's radiator output is present
- [ ] **Pipe sizing PDF** — check index circuit figures are present (not zeros)
      *(pipe sizing PDF was recently rewritten — keep a close eye on this one)*

---

## 10. Admin

- [ ] Log in as admin, confirm admin page loads and user list is present
- [ ] Confirm reference project is visible under the correct company

---

## Notes / failures this run

_Record anything unexpected here, even if it turned out to be benign._

```
Date:
Deploy description:
Issues found:
```

---

## When to add to this list

Add a new checklist item whenever:
- Something breaks in production that wasn't caught by this checklist
- A new feature ships that has its own critical path
- A calculation changes and produces a new set of expected reference values
  (update the table in section 2 at the same time)
