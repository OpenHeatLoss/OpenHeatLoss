# B26 rehearsal: migration 026 on a production restore

Migration 026 converts MVHR efficiency stored as a percentage (e.g. 85) to a
fraction (0.85) in `rooms` and `design_params`. Rehearse it on a local restore
of production before deploying. The gate (`scripts/b26_gate.mjs`) is
read-only and refuses to run unless `DATABASE_URL` points at `localhost`,
database `ohl_b26_check`.

Scratch URL used throughout (no password in it; `pg` takes it from
`~/.pgpass` or `PGPASSWORD`, as `pg_restore -U ohldev -h localhost` does):

```
postgresql://ohldev@localhost:5432/ohl_b26_check
```

**`migrate.js` loads `.env` with dotenv, which does not override a variable
that is already set.** Always pass `DATABASE_URL` on the same command line as
`node server/migrate.js`, as below, so it reaches the scratch DB and not
whatever `.env` names. Only ever type the scratch URL inline.

## Rehearsal

1. **Restore production into the scratch DB** (from a fresh `pg_dump -Fc`).
   The `ohldev` role cannot create databases, so `postgres` creates it, owned
   by `ohldev`:

   ```sh
   sudo -u postgres dropdb --if-exists ohl_b26_check
   sudo -u postgres createdb -O ohldev ohl_b26_check
   pg_restore -U ohldev -h localhost --no-owner --no-acl -d ohl_b26_check <production.dump>
   ```

2. **Before snapshot** (read-only):

   ```sh
   DATABASE_URL=postgresql://ohldev@localhost:5432/ohl_b26_check node scripts/b26_gate.mjs before
   ```

   It lists every `rooms` / `design_params` row with `mvhr_efficiency > 1`
   (ids and values). Check the list is what you expect from production. If it
   prints `NOTE: 026 will ABORT`, a value is over 100 or not finite; stop and
   look at it before going further.

3. **Migrate:**

   ```sh
   DATABASE_URL=postgresql://ohldev@localhost:5432/ohl_b26_check node server/migrate.js
   ```

   Expect `Applying migration 026`, one `026: <table> … mvhr_efficiency <old> -> <new>`
   line per row from step 2, then
   `026: converted N rooms row(s) and M design_params row(s); 0 rows with mvhr_efficiency > 1 remain`.

4. **After comparison:**

   ```sh
   DATABASE_URL=postgresql://ohldev@localhost:5432/ohl_b26_check node scripts/b26_gate.mjs after
   ```

   Must end `== GATE PASSED ==` (exit code 0).

5. **Idempotence: second migrate run.**

   ```sh
   DATABASE_URL=postgresql://ohldev@localhost:5432/ohl_b26_check node server/migrate.js
   DATABASE_URL=postgresql://ohldev@localhost:5432/ohl_b26_check node scripts/b26_gate.mjs after
   ```

   Expect `Migration 026 already applied — skipping`, and the gate passes again.

6. **Idempotence: the data fix itself** (the path a contingency migration
   would take). Forget 026, then let it run again on already-fixed data:

   ```sh
   psql -U ohldev -h localhost -d ohl_b26_check -c "DELETE FROM schema_migrations WHERE version = '026'"
   DATABASE_URL=postgresql://ohldev@localhost:5432/ohl_b26_check node server/migrate.js
   DATABASE_URL=postgresql://ohldev@localhost:5432/ohl_b26_check node scripts/b26_gate.mjs after
   ```

   Expect `Applying migration 026`, then
   `converted 0 rooms row(s) and 0 design_params row(s)`, and the gate passes.

7. **Optional: abort path.** Restore again (step 1), then make one value
   invalid and confirm nothing is written:

   ```sh
   psql -U ohldev -h localhost -d ohl_b26_check -c "UPDATE rooms SET mvhr_efficiency = 150 WHERE id = <an id from step 2>"
   DATABASE_URL=postgresql://ohldev@localhost:5432/ohl_b26_check node server/migrate.js   # exits 1
   psql -U ohldev -h localhost -d ohl_b26_check -c "SELECT id, mvhr_efficiency FROM rooms WHERE mvhr_efficiency > 1 ORDER BY id"
   psql -U ohldev -h localhost -d ohl_b26_check -c "SELECT version FROM schema_migrations WHERE version = '026'"
   ```

   Expect `026 aborted, nothing written: … rooms <id> (project …) = 150`, every
   value still as in step 2 (plus the 150), and no `026` row. Keep the scratch
   DB and the before file until after the deploy (clean-up is the last step).

## Deploy (DEVELOPMENT_PRINCIPLES §11.5)

B26 commit 5 (the server rejects MVHR efficiency outside 0–1) and migration
026 deploy together: until 026 has run, any save of an affected room is
refused.

1. **Pick a quiet time** and check the **Railway status page** first.
2. **Fresh `pg_dump` of production**, taken immediately before the deploy.
3. **Merge the GitHub PR with "Create a merge commit".** Railway deploys from
   `main`, and its deploy command runs `migrate.js` before the server starts.
   Never use Redeploy on an old build: it would run old code against the
   migrated database.
4. **Once the old container is gone**, check production:

   ```sql
   SELECT (SELECT COUNT(*) FROM rooms         WHERE mvhr_efficiency > 1) AS rooms,
          (SELECT COUNT(*) FROM design_params WHERE mvhr_efficiency > 1) AS dps;
   ```

   Both must be 0. If not (e.g. a save from the old container landed after
   026 ran), the contingency is a migration 027 that calls
   `fixMvhrPercentages('027')`, prepared on its own branch and merged only if
   needed. Re-check the counts after it deploys.
5. **Run `SMOKE_TEST.md`.**

## Clean-up (after the deploy and the post-deploy check)

`scripts/out/b26_before.json` and the dump hold production data (room names,
postcodes):

```sh
rm -f scripts/out/b26_before.json
rm -f <production.dump>
sudo -u postgres dropdb ohl_b26_check
```
