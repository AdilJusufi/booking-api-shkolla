-- =============================================================================
-- 2026-10 time-zone check (WR-03)  —  READ THIS WHOLE HEADER BEFORE RUNNING
-- =============================================================================
--
-- WHAT WENT WRONG
--   The doctor's "Mungesat" page (UnavailabilityPage) sent the absence times as
--   browser UTC instants (`toISOString()`, e.g. "2026-10-30T08:00:00Z" for
--   09:00 in Prishtina). The API then treated that value as Prishtina wall-clock
--   ("08:00 in Prishtina") and stored 07:00 UTC. Result: every absence created
--   from that page is stored EARLIER than intended by the clinic's UTC offset
--   on that day — 1 hour in winter (CET), 2 hours in summer (CEST) — when the
--   doctor's browser was set to Kosovo time (practically always).
--
-- WHAT IS AFFECTED
--   * "DoctorUnavailabilities": every row created before the fix was deployed.
--     The doctor page was the ONLY way to create an absence from the UI: the
--     admin API (POST /api/admin/doctors/{id}/unavailability) has no UI and the
--     seeder creates no absences.
--   * NOT affected (checked in code): appointments, reschedules, staff bookings,
--     working schedules, reminder and confirmation emails, reports. Those always
--     sent clinic wall-clock values that came from the API itself.
--
-- HOW TO USE
--   1. Back up Neon first (branch or point-in-time restore point). Always.
--   2. Run STEP 1 (read-only). It lists every absence with its stored time in
--      Prishtina wall-clock and the time it would become after the correction.
--   3. Check a few rows with the doctors if you can ("did you mean 09:00–17:00?").
--   4. Only then consider STEP 2. It is commented out on purpose.
--
-- WHEN STEP 2 IS SAFE
--   * Only for rows created BEFORE the fix was deployed to production. Replace
--     :fix_deployed_at_utc with that deploy time (UTC). Rows created after the
--     deploy are already correct and must not be shifted again.
--   * Only if the doctors entered the absences with their device in Kosovo time.
--     A doctor whose phone/laptop was in another zone got a different shift;
--     leave such rows out (add their Ids to the NOT IN list).
--   * Run it ONCE. Running it twice shifts the rows twice. The WHERE clause on
--     "UpdatedAt" below makes a second run a no-op for rows it already fixed.
--   * The shift moves an absence later by the offset. Re-check afterwards that no
--     confirmed appointment now overlaps a corrected absence (STEP 3).
-- =============================================================================


-- STEP 1 — READ-ONLY: list absences and what the correction would change.
SELECT
    u."Id",
    u."DoctorId",
    u."ClinicBranchId",
    u."Reason",
    u."CreatedAt"                                                         AS created_at_utc,
    (u."StartDateTime" AT TIME ZONE 'Europe/Belgrade')                    AS stored_start_prishtina,
    (u."EndDateTime"   AT TIME ZONE 'Europe/Belgrade')                    AS stored_end_prishtina,
    -- The stored wall-clock is what the browser actually meant in UTC:
    (((u."StartDateTime" AT TIME ZONE 'Europe/Belgrade') AT TIME ZONE 'UTC') AT TIME ZONE 'Europe/Belgrade')
                                                                          AS corrected_start_prishtina,
    (((u."EndDateTime"   AT TIME ZONE 'Europe/Belgrade') AT TIME ZONE 'UTC') AT TIME ZONE 'Europe/Belgrade')
                                                                          AS corrected_end_prishtina
FROM "DoctorUnavailabilities" u
-- WHERE u."CreatedAt" < TIMESTAMPTZ ':fix_deployed_at_utc'
ORDER BY u."StartDateTime";


-- STEP 2 — CORRECTION (commented out; see "WHEN STEP 2 IS SAFE" above).
-- Moves each affected row later by the clinic's UTC offset on that day by
-- re-reading the stored Prishtina wall-clock as the UTC instant it was meant to be.
--
-- BEGIN;
-- UPDATE "DoctorUnavailabilities" u
-- SET "StartDateTime" = (u."StartDateTime" AT TIME ZONE 'Europe/Belgrade') AT TIME ZONE 'UTC',
--     "EndDateTime"   = (u."EndDateTime"   AT TIME ZONE 'Europe/Belgrade') AT TIME ZONE 'UTC',
--     "UpdatedAt"     = now()
-- WHERE u."CreatedAt" < TIMESTAMPTZ ':fix_deployed_at_utc'
--   AND (u."UpdatedAt" IS NULL OR u."UpdatedAt" < TIMESTAMPTZ ':fix_deployed_at_utc')
--   AND u."Id" NOT IN ('00000000-0000-0000-0000-000000000000');  -- rows to leave alone
-- -- Inspect the result of STEP 1 again here, then:
-- COMMIT;   -- or ROLLBACK;


-- STEP 3 — READ-ONLY: confirmed/pending appointments that overlap an absence
-- (run after STEP 2; the clinic should reschedule these manually).
SELECT
    a."Id"                                          AS appointment_id,
    a."DoctorId",
    (a."StartDateTime" AT TIME ZONE 'Europe/Belgrade') AS appointment_start_prishtina,
    u."Id"                                          AS absence_id,
    (u."StartDateTime" AT TIME ZONE 'Europe/Belgrade') AS absence_start_prishtina,
    (u."EndDateTime"   AT TIME ZONE 'Europe/Belgrade') AS absence_end_prishtina
FROM "Appointments" a
JOIN "DoctorUnavailabilities" u
  ON u."DoctorId" = a."DoctorId"
 AND (u."ClinicBranchId" IS NULL OR u."ClinicBranchId" = a."ClinicBranchId")
 AND a."StartDateTime" < u."EndDateTime"
 AND a."EndDateTime"   > u."StartDateTime"
WHERE a."Status" IN (1, 2, 3, 4)   -- Pending, Confirmed, CheckedIn, InProgress
  AND a."StartDateTime" > now()
ORDER BY a."StartDateTime";
