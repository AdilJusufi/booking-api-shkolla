# Features — source of truth

Written from the code on `booking-fix` (October 2026), not from notes. Each line is **Works**, **Partial** (what's missing) or **Not built**. If you change behaviour, update this file in the same commit.

## Platform-wide facts (read first)

| Topic | Status |
|---|---|
| **SMS** | **Not built.** `LoggingSmsService` only writes to the log. No patient receives an SMS. Do not promise SMS anywhere. |
| **In-app notifications** | **Not built.** No entity, endpoint or read state. The bell is hidden behind a flag (`NotificationsBell.tsx`). |
| **Emails** | **Partial.** Sent through Resend when `Resend:ApiKey` is set (not on dev). **Albanian only**, whatever the user's UI language. Patients created by clinic staff without an email get no messages at all. |
| **Languages** | **Partial.** UI in Albanian (source), English and Serbian (Latin). `en`/`sr` are machine translations awaiting review (`frontend/src/locales/UNREVIEWED.md`). |
| **Privacy Policy / Terms** | **Partial.** English-only drafts awaiting legal review; the banner says so in all three languages. |
| **Time zone** | **Works.** Every time a person types or sees is Europe/Belgrade, whatever the browser's zone; stored in UTC. See `ENVIRONMENTS.md` → "Koha dhe zonat kohore". |
| **PWA (install, offline shell)** | **Works.** Appointment, admin, doctor and patient data are never cached. |
| **Doctor licence verification** | **Not built.** Doctors are marked "verified" automatically when their clinic adds them. What the platform reviews is the **clinic** (SuperAdmin approval). Copy says exactly that. |
| **Payments** | **Not built.** Prices are informational; paid at the clinic. |

## Logged-out visitor

| Feature | Status |
|---|---|
| Home page: search by city + specialty, real platform counts, specialties, doctors, clinics | **Works.** Real data only; skeletons while loading, retry on error. |
| Search: clinics/doctors tabs, city/specialty filters, sort | **Works** |
| Clinic page: branches, services with real price/duration range, doctors | **Works** |
| Doctor page: branches, services with that doctor's price/duration | **Works** |
| Click a service → log in → back to the booking with service and branch kept | **Works** |
| Register as patient | **Works.** Email confirmation required in production (`Auth:RequireConfirmedEmail`). |
| Register a clinic (goes to SuperAdmin review) | **Works** |
| Forgot / reset password | **Works.** Same response whether or not the email exists, by design. |
| Privacy / Terms pages | **Partial** (see above) |

## Patient

| Feature | Status |
|---|---|
| Book: service → branch → day → time → confirm | **Works.** Confirmed instantly. Double booking prevented (app check + DB exclusion constraint). |
| Book for a family member ("Për kë është termini?") | **Works.** Only for the patient's own active family members; shown on lists, calendars and emails. |
| My appointments: list, filters, past visits not counted as active | **Works** |
| Appointment detail with the price agreed at booking | **Works** |
| Reschedule | **Works.** Creates a new appointment; the old one stays as "Riplanifikuar" and links to the new one (appointments rescheduled before October 2026 have no link). |
| Cancel (up to 12 hours before; refused inside the window) | **Works** |
| Profile edit | **Works** |
| Family members: add, edit, remove | **Works** |
| Change password (other devices signed out, this one kept) | **Works** |
| Confirmation / cancellation / reschedule emails | **Partial** (email only, Albanian only) |
| 24-hour reminder email with cancel link | **Partial** (email only, Albanian only) |

## Doctor

| Feature | Status |
|---|---|
| Calendar: list and day view; upcoming, today, this week (Mon–Sun), this month, last 3 months | **Works** |
| Patient search box | **Works** (filters the calendar; Enter from other pages opens it) |
| Appointment detail, internal note | **Works** |
| Mark Completed / No-show (only once the appointment has started) | **Works** |
| Weekly working schedule: add, edit, enable/disable, delete | **Works.** Changes that would leave booked appointments outside hours are refused with the list. |
| Absences: add (blocks exactly the times typed), list, delete | **Works.** **Partial:** an absence over an existing booking only notifies by email; the doctor isn't warned in the UI. |
| Profile photo | **Works** where Cloudinary is configured (not on dev). |
| Edit own biography, phone, specialties | **Not built** for the doctor (the clinic admin edits them). |
| Change password | **Works** |

## Clinic admin

| Feature | Status |
|---|---|
| Navigation: Klinikat / Terminet / Rezervo termin (desktop + mobile) | **Works** |
| My clinics dashboard cards (branches, doctors, services, today) | **Works**, including for a clinic still pending approval. |
| Appointments list: stats, status tabs, date range, search | **Works** |
| **Book for a patient (phone / front desk)** | **Works.** Exact phone/email lookup only; full surname shown only if the patient has been to this clinic; create the patient if not found (no duplicates, no welcome email); same slot rules as patients; marked "Rezervuar nga klinika" and audited. |
| Cancel (confirmation + optional reason; patient gets the normal cancellation email) / reschedule (same doctor and service, slot picker) from the appointments list | **Works.** Own clinic only; no 12-hour cutoff for staff; refused once the appointment has started. |
| Doctors: add (one-time credentials), edit, assign branches/services with per-doctor price & duration, schedules, photo, deactivate (with or without cancelling future appointments), reactivate | **Works** |
| Services: add, edit (applies to new bookings only), deactivate/reactivate (blocked while future appointments use it) | **Works** |
| Branches: add, edit, deactivate/reactivate (blocked while future appointments exist) | **Works** |
| Clinic settings (name, contact, website, description) | **Works** |
| Clinic logo | **Works** where Cloudinary is configured. |
| Report by date range (per doctor/branch/service, revenue from agreed prices) | **Works.** No PDF/CSV export (**Not built**). |
| Register another clinic | **Works** (goes to SuperAdmin review) |
| Deactivate own clinic | **Not built** for clinic admins (SuperAdmin only). |
| Change password | **Works** |

## SuperAdmin

| Feature | Status |
|---|---|
| Clinics: list/filter, approve, "reject" (implemented as deactivation), deactivate/reactivate, create, assign admin | **Works** |
| Unapproved clinics can't add branches, services or doctors (server-enforced) | **Works** |
| Specialties: create, edit (sq/en/sr names), delete | **Works** |
| Users: list/filter, activate/deactivate | **Works.** Cannot deactivate yourself or the last active SuperAdmin. |
| Audit logs: list, filter by entity/date, action filter on the loaded page | **Partial:** the action filter is client-side over the current page only. |
| Change password | **Works** |
