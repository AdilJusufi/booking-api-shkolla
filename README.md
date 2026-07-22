# Booking API — Rezervimi i termineve në klinika private (Prishtinë)

Web API me .NET 8 që u mundëson qytetarëve të kërkojnë klinika e doktorë, të shohin
oraret e lira dhe të rezervojnë termine online. Sistemi është **multi-clinic**: një API
e vetme menaxhon shumë klinika, degë, doktorë dhe specializime (dentare, pediatri,
oftalmologji, dermatologji, kardiologji, ORL, mjekësi familjare etj.).

Projekt mësimor i ndërtuar me praktika reale industrie — Clean Architecture, PostgreSQL,
JWT me refresh-token rotation, mbrojtje të garantuar nga double-booking dhe teste integrimi
mbi databazë reale.

---

## Përmbajtja

1. [Arkitektura](#arkitektura)
2. [Teknologjitë](#teknologjitë)
3. [Si të startohet me Docker (mënyra më e lehtë)](#si-të-startohet-me-docker)
4. [Si të startohet lokalisht (pa Docker për API-n)](#si-të-startohet-lokalisht)
5. [Migrations](#migrations)
6. [Test users (seed)](#test-users-seed)
7. [Shembuj API requests](#shembuj-api-requests)
8. [Authentication flow](#authentication-flow)
9. [Rregullat e rezervimit](#rregullat-e-rezervimit)
10. [Mbrojtja nga double-booking](#mbrojtja-nga-double-booking)
11. [Testet](#testet)
12. [Known limitations](#known-limitations)
13. [Hapat e ardhshëm](#hapat-e-ardhshëm)

---

## Arkitektura

Modular Monolith me parimet e Clean Architecture — varësitë rrjedhin gjithmonë nga jashtë brenda:

```
Booking.sln
├── src/
│   ├── Booking.Domain          ← entitetet, enums, value objects, rregullat e pastra
│   │                             (SlotGenerator, BookingPolicy) — ZERO varësi të jashtme
│   ├── Booking.Application     ← DTOs, kontratat e servisave (use cases), validators
│   │                             (FluentValidation) — varet vetëm nga Domain
│   ├── Booking.Infrastructure  ← EF Core + PostgreSQL, Identity, JWT, queries/services,
│   │                             migrations, seed, njoftimet — implementon kontratat e Application
│   └── Booking.Api             ← controllers, middleware, auth pipeline, Swagger, rate limiting
└── tests/
    ├── Booking.Tests.Unit         ← logjika e pastër (slotet, statuset, validimet)
    └── Booking.Tests.Integration  ← API e plotë kundër PostgreSQL real (Testcontainers)
```

**Parimi kryesor:** Domain dhe Application nuk dinë asgjë për databazën apo HTTP.
Gjithë logjika e rezervimit (gjenerimi i sloteve, kalimi i statuseve, afati i anulimit)
është kod i pastër i testueshëm pa infrastrukturë.

## Teknologjitë

| Shtresa | Teknologjia |
|---|---|
| Runtime | .NET 8, C# (nullable enabled, `WarningsAsErrors=nullable`) |
| Databaza | PostgreSQL 16, EF Core 8 + Npgsql |
| Auth | ASP.NET Core Identity + JWT (access 15 min) + refresh token rotation (hash në DB) |
| Validimi | FluentValidation (filter automatik për çdo request) |
| Logging | Serilog (console, request logging, correlation ID) |
| Dokumentimi | Swagger/OpenAPI me buton **Authorize** për JWT |
| Testet | xUnit, FluentAssertions, Moq, Testcontainers.PostgreSql, WebApplicationFactory |
| Deploy | Docker multi-stage + docker-compose |

## Si të startohet me Docker

Parakusht: Docker Desktop.

```bash
docker compose up --build
```

Kjo ngre PostgreSQL + API-n, aplikon migrations automatikisht dhe mbush seed data.

- Swagger UI: http://localhost:8080/swagger
- Health check: http://localhost:8080/health

## Si të startohet lokalisht

Parakusht: .NET 8 SDK + një PostgreSQL lokal (mund ta ngresh vetëm DB-në me Docker):

```bash
docker compose up postgres -d
```

Pastaj përshtat connection string-un në `src/Booking.Api/appsettings.Development.json` —
compose-postgres dëgjon në **portin 5433 të host-it**:
`Host=localhost;Port=5433;Database=booking;Username=booking;Password=booking_dev_pw` — dhe:

```bash
dotnet run --project src/Booking.Api
```

Në Development migrations aplikohen dhe seed-i mbushet automatikisht në startim
(`Database:ApplyMigrationsOnStartup` + `Seed:Enabled` në appsettings.Development.json).

Swagger: http://localhost:5080/swagger

## Migrations

dotnet-ef është i instaluar si local tool (`.config/dotnet-tools.json`):

```bash
# krijo migration të ri pas ndryshimit të modelit
dotnet ef migrations add EmriIMigrationit -p src/Booking.Infrastructure -s src/Booking.Api -o Persistence/Migrations

# apliko manualisht në databazë
dotnet ef database update -p src/Booking.Infrastructure -s src/Booking.Api
```

Në design time përdoret `DesignTimeDbContextFactory` — connection string-u merret nga
env var `BOOKING_CONNECTION` ose bie te vlera lokale e development-it.

## Test users (seed)

Seed-i aktivizohet vetëm në Development/Docker. Passwordet vijnë nga konfigurimi
(`Seed:SuperAdminPassword`, `Seed:DefaultUserPassword`) — **kurrë në kod**.
Vlerat e development-it: `Dev123!SuperAdmin` / `Dev123!Booking` (shih appsettings.Development.json / docker-compose.yml).

| Roli | Email | Password |
|---|---|---|
| SuperAdmin | `superadmin@booking.dev` | `Seed:SuperAdminPassword` |
| ClinicAdmin (Klinika Dardania) | `admin@dardania.booking.dev` | `Seed:DefaultUserPassword` |
| Doctor (dentist) | `arben.gashi@booking.dev` | `Seed:DefaultUserPassword` |
| Doctor (dentist) | `blerta.krasniqi@booking.dev` | `Seed:DefaultUserPassword` |
| Doctor (dentist) | `driton.berisha@booking.dev` | `Seed:DefaultUserPassword` |
| Doctor (pediatër) | `elira.hoxha@booking.dev` | `Seed:DefaultUserPassword` |
| Doctor (pediatër) | `fatos.rexhepi@booking.dev` | `Seed:DefaultUserPassword` |
| Patient | `pacienti@booking.dev` | `Seed:DefaultUserPassword` |

Seed përmban: 2 klinika në Prishtinë (Klinika Dentare Dardania me 2 degë, Klinika
Pediatrike Sunny me 1 degë), 8 specializime, 5 shërbime, 5 doktorë me orar
Hën–Pre 08:00–12:00 & 13:00–17:00 (grid 30-minutësh), 1 pacient testues me 1 dependent.

## Shembuj API requests

**Regjistrimi i pacientit**

```http
POST /api/auth/register
Content-Type: application/json

{
  "firstName": "Filan",
  "lastName": "Fisteku",
  "email": "filan@test.dev",
  "phoneNumber": "+383 44 123 456",
  "password": "Fjalekalim1",
  "dateOfBirth": "1995-04-20",
  "gender": "Male",
  "city": "Prishtinë"
}
```

**Kërkimi i klinikave** (publik, me filtra + pagination)

```http
GET /api/clinics?city=Prishtinë&searchTerm=dentare&page=1&pageSize=20
```

**Slotet e lira** (publik) — datat kthehen në orën e Prishtinës:

```http
GET /api/doctors/{doctorId}/available-slots?branchId={branchId}&serviceId={serviceId}&date=2026-08-17
```

**Rezervimi i terminit** (kërkon token të pacientit; ora lokale e Prishtinës)

```http
POST /api/appointments
Authorization: Bearer {accessToken}
Content-Type: application/json

{
  "doctorId": "...",
  "clinicBranchId": "...",
  "medicalServiceId": "...",
  "startDateTime": "2026-08-17T09:00:00",
  "patientNote": "Dhimbje dhëmbi"
}
```

**Anulimi / riplanifikimi**

```http
POST /api/appointments/{id}/cancel        { "reason": "..." }
POST /api/appointments/{id}/reschedule    { "newStartDateTime": "2026-08-17T13:30:00" }
```

Formati i listave me pagination:

```json
{ "items": [], "page": 1, "pageSize": 20, "totalItems": 0, "totalPages": 0 }
```

Gabimet kthehen si **ProblemDetails (RFC 7807)** me `type`, `title`, `status`, `detail`,
`instance` dhe `traceId`. Statuset: 200/201/204, 400, 401, 403, 404, 409 (konflikt slotesh),
422 (validim / shkelje rregulli), 429 (rate limit).

## Authentication flow

1. `POST /api/auth/register` ose `/login` → kthen **access token** (JWT, 15 min) +
   **refresh token** (7 ditë, kthehet vetëm një herë — në DB ruhet vetëm SHA-256 hash-i).
2. Klienti dërgon `Authorization: Bearer {accessToken}` në çdo kërkesë.
3. Kur access token-i skadon: `POST /api/auth/refresh-token` → **rotation**: token-i i vjetër
   revokohet, lëshohet çift i ri, zinxhiri ruhet (`ReplacedByTokenId`).
4. **Reuse detection**: nëse dikush paraqet një refresh token tashmë të rotuar,
   revokohen TË GJITHA sesionet e userit (shenjë vjedhjeje).
5. `POST /api/auth/revoke-token` për logout; ndryshimi/rivendosja e password-it
   revokon gjithashtu të gjitha sesionet.
6. Lockout: 5 tentime të dështuara → llogaria bllokohet 15 min. Login/register/reset
   kanë rate limiting sipas IP-së.

Rolet: **Patient**, **Doctor**, **ClinicAdmin**, **SuperAdmin**. Përveç roleve,
çdo service kontrollon **pronësinë e resursit**: pacienti sheh vetëm terminet e veta
(404 për të huajat), doktori vetëm kalendarin e vet, ClinicAdmin vetëm klinikat e caktuara
(`TenantAccessService`).

## Rregullat e rezervimit

1. Asnjë rezervim në të kaluarën.
2. Vetëm brenda orarit të doktorit (`DoctorWorkingSchedule`, me `ValidFrom/ValidUntil`).
3. Jo gjatë bllokimeve (`DoctorUnavailability` — pushime, pauza, festa; për një degë ose të gjitha).
4. Asnjë mbivendosje terminesh për të njëjtin doktor (3 shtresa mbrojtjeje — shih më poshtë).
5. Shërbimi duhet të ofrohet nga doktori (`DoctorService`).
6. Doktori duhet të punojë në degën e zgjedhur (`DoctorClinicBranch`).
7. Kohëzgjatja merret nga `DoctorService.CustomDurationMinutes ?? MedicalService.DurationMinutes`.
8. Fillimi duhet të përputhet me një slot nga `available-slots` (i njëjti burim i së vërtetës).
9. I njëjti person (pacienti ose i njëjti dependent) s'mund të ketë dy termine njëkohësisht.
   *Vendim dizajni:* prindi MUND të ketë termine paralele për dy fëmijë të ndryshëm.
10. Rezervimi për fëmijë: `DependentId` duhet t'i përkasë pacientit të kyçur (ndryshe 403).
11. Pacienti anulon/riplanifikon vetëm deri `Booking:CancellationCutoffHours` (default 12) orë
    para terminit; ClinicAdmin s'ka kufizim, por çdo veprim i tij shkon në **AuditLog**.
12. Riplanifikimi krijon termin të ri (`Pending`); i vjetri mbetet si histori me status `Rescheduled`.
13. Në databazë të gjitha datat ruhen në **UTC** (`timestamptz`); API pranon dhe kthen
    orën e Prishtinës (IANA `Europe/Belgrade`, CET/CEST).

Cikli i statuseve (zbatohet nga `BookingPolicy`):

```
Pending ──► Confirmed ──► CheckedIn ──► InProgress ──► Completed
   │             │             │
   └──► CancelledByPatient / CancelledByClinic / Rescheduled / NoShow
```

## Mbrojtja nga double-booking

Tri shtresa të pavarura:

1. **Kontroll aplikativ** — para INSERT-it verifikohet disponueshmëria me të njëjtin
   algoritëm si `available-slots` (`AvailabilityService.IsSlotAvailableAsync`).
   Jep mesazhe të qarta 409, por vetëm ai s'mjafton për kërkesa paralele.
2. **PostgreSQL exclusion constraint** (`btree_gist`) — garancia përfundimtare në databazë:

   ```sql
   ALTER TABLE "Appointments" ADD CONSTRAINT "EX_Appointments_DoctorOverlap"
   EXCLUDE USING gist ("DoctorId" WITH =, tstzrange("StartDateTime","EndDateTime",'[)') WITH &&)
   WHERE ("Status" IN ('Pending','Confirmed','CheckedIn','InProgress'));
   ```

   Nga dy kërkesa simultane vetëm INSERT-i i parë fiton; i dyti merr SqlState `23P01`,
   që API e përkthen në **HTTP 409**. Intervali `[)` lejon terminet ngjitur (10:00–10:30, 10:30–11:00).
   Testohet me dy kërkesa reale paralele në testet e integrimit.
3. **Optimistic concurrency** — kolona e sistemit `xmin` e PostgreSQL si concurrency token;
   dy UPDATE konkurrentë (p.sh. anulim + riplanifikim njëkohësisht) → njëri merr 409.

Slotet e lira **nuk ruhen** në databazë — gjenerohen dinamikisht nga orari + rezervimet +
bllokimet (`SlotGenerator`, kod i pastër në Domain, 100% i mbuluar me unit tests).

## Testet

```bash
# unit tests — pa asnjë varësi të jashtme
dotnet test tests/Booking.Tests.Unit

# integration tests — kërkojnë Docker (Testcontainers ngre PostgreSQL real)
dotnet test tests/Booking.Tests.Integration

# të gjitha
dotnet test
```

Testet e integrimit ngrenë API-n e plotë kundër PostgreSQL real sepse mbrojtja
nga double-booking jeton në databazë (exclusion constraint) dhe nuk ekziston
në InMemory/SQLite. Mbulohen: register/login/refresh-rotation, kërkimi i klinikave,
slotet, krijimi/anulimi/riplanifikimi, **double booking me dy kërkesa paralele**,
pronësia e resurseve (404 për terminet e të huajve), dependentët e huaj (403)
dhe tenant isolation i ClinicAdmin (403 për klinikë të huaj).

## Known limitations

- **Njoftimet** janë implementime logging (mock) — struktura është gati për
  SendGrid/Twilio/operator lokal SMS dhe për background jobs (Hangfire/Quartz),
  por dërgimi real s'është integruar. Reminder-i para terminit kërkon një scheduler.
- **Pa të dhëna mjekësore**: sistemi qëllimisht NUK ruan diagnoza/anamneza (V1) —
  vetëm shënime administrative.
- **`IsOpen`** në kërkimin e klinikave bazohet vetëm në oraret e punës, jo në bllokimet individuale.
- **Email confirmation** është i detyrueshëm vetëm kur `Auth:RequireConfirmedEmail=true`
  (production); në development është i fikur se email-et vetëm logohen.
- Mbivendosja e pacientit (rregulli 9) zbatohet vetëm në aplikacion, jo me constraint —
  teorikisht dy kërkesa paralele të të njëjtit pacient te dy doktorë të ndryshëm mund të
  kalojnë të dyja (rast ekstrem, i pranuar me vetëdije).
- Nuk ka ende CI/CD pipeline dhe versionim të API-t (v1 implicit).

## Hapat e ardhshëm

1. Background jobs (Hangfire/Quartz) për reminder-ët + dërgim real email/SMS
   (në Kosovë: Viber/WhatsApp janë kanali kryesor — email-i lexohet pak).
2. Frontend (React/Vue) mbi këtë API — kalendari i sloteve është gati për UI.
3. CI/CD me GitHub Actions (build + teste + docker push).
4. Raporte më të pasura për klinikat (no-show rate, orët më të kërkuara).
5. Vlerësimet/recensionet e doktorëve.
6. Multi-gjuhësi (sq/en/sr) në mesazhet e gabimeve.

---

*Projekt mësimor — ndërtuar për nxënësit që të mësojnë BE + DB + (së shpejti) FE
me një rast real përdorimi nga Prishtina.*
