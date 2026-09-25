# Mjediset (Environments)

Ky projekt ka dy mjedise plotësisht të ndara: **prodhimi** (patientë realë) dhe
**dev** (testim, të dhëna fiktive). Qëllimi: asgjë e shtyrë te `dev` s'mund të
prekë kurrë të dhëna reale, pavarësisht çfarë thyhet.

| | `main` | `dev` |
|---|---|---|
| Qëllimi | Kodi që u shërben patientëve realë | Testim përpara se diçka të shkojë në prodhim |
| Frontend | Vercel — deployment i **Production** | Vercel — **Preview** e vet, e lidhur me branch-in `dev` |
| Backend | Render — instanca e prodhimit | Render — instancë tjetër, e veçantë |
| Databaza | Neon — databaza e prodhimit | Neon — databazë tjetër, e veçantë, me të dhëna fiktive |
| `ASPNETCORE_ENVIRONMENT` | `Production` | **`Production`** (jo `Development` — shih poshtë) |

## Pse `dev` drejtohet me `ASPNETCORE_ENVIRONMENT=Production`

E papritur në shikim të parë, por e qëllimshme: `Development` në ASP.NET Core
aktivizon default-e më të lehta për siguri —
`Auth:RequireConfirmedEmail=false`, Swagger i hapur, mesazhe gabimi më të
detajuara. Nëse `dev` do t'i kishte këto, një bug i gjetur atje mund të mos
riprodhohet fare në prodhim (dhe anasjelltas) — pikërisht sepse mjedisi po
sillet ndryshe nga prodhimi. E vetmja gjë që duhet të dallojë `dev` nga
prodhimi është **cilën databazë dhe cilin origin frontend-i përdor**, jo sa i
rreptë është aplikacioni.

Kjo do të thotë: `dev` ka po atë sjellje sigurie si prodhimi, thjesht kundrejt
një databaze tjetër. Për të lejuar `Seed:Enabled=true` në `dev` (nevojitet për
të mbushur databazën me doktorë/klinika/pacientë fiktivë) pa e dobësuar
mbrojtjen për prodhimin real, ekziston një flamur shprehimisht i quajtur:

```
Seed__AllowOutsideDevelopment=true
```

Vendoset **VETËM** te instanca `dev` në Render. Prodhimi real nuk e vendos
kurrë këtë — shih `src/Booking.Api/Startup/EnvironmentGuard.cs` për logjikën
e plotë dhe arsyetimin.

## Workflow

```
feature branch → dev → testuar në deployment-in e dev → Pull Request → main
```

1. Puna e re fillon nga një branch i marrë nga `dev` (ose direkt nga `dev`,
   për ndryshime të vogla).
2. Push te `dev` → Vercel + Render rindërtojnë vetvetiu deployment-in e dev-it,
   kundrejt databazës Neon të dev-it.
3. Testohet te URL-ja e dev-it — çdo gjë që thyhet atje s'ka asnjë efekt te
   prodhimi, sepse s'ka lidhje as me databazën, as me frontend-in e prodhimit.
4. Kur është gati: Pull Request nga `dev` (ose feature branch) në `main`.
   `main` ka branch protection (shih poshtë) — kërkohet PR, jo push direkt.
5. Merge në `main` → Vercel + Render rindërtojnë deployment-in e **prodhimit**.

## Variablat e mjedisit

Këto vendosen te dashboard-et e Render/Vercel/Neon (asnjëherë në kod apo
`appsettings.json`) — vlerat aktuale për `dev` shtohen në Fazën 2, pasi të
krijohen shërbimet përkatëse.

**Backend (Render), të dyja instancat:**

| Variabla | Prodhimi | Dev |
|---|---|---|
| `ASPNETCORE_ENVIRONMENT` | `Production` | `Production` |
| `ConnectionStrings__BookingDb` | Neon (prod) | Neon (dev) — **tjetër databazë** |
| `Cors__AllowedOrigins__0` | URL-ja e Vercel prod | URL-ja e Vercel preview e dev-it |
| `Frontend__BaseUrl` | URL-ja e Vercel prod | URL-ja e Vercel preview e dev-it |
| `Seed__Enabled` | `false` | `true` |
| `Seed__AllowOutsideDevelopment` | (s'vendoset kurrë) | `true` |
| `Resend__ApiKey`, `Resend__FromAddress` | çelësi real | çelës testimi/i njëjti, sipas nevojës |
| `Cloudinary__*` | llogaria reale | llogaria reale ose një bucket/folder i veçantë |

**Frontend (Vercel), sipas branch-it:**

| Variabla | Production (nga `main`) | Preview (nga `dev`) |
|---|---|---|
| `VITE_API_URL` | URL-ja e Render prod | URL-ja e Render dev |
| `VITE_ENVIRONMENT` | `production` | `development` |

`VITE_ENVIRONMENT` kontrollon vetëm një shenjë të vogël vizuale në cep të
ekranit ("DEV"/"TESTING") që shfaqet sa herë s'është `production` — shih
`src/components/EnvironmentBadge.tsx`. Qëllimi: askush s'duhet të ngatërrojë
kurrë një sesion testimi me prodhimin real, thjesht duke parë ekranin.

Nëse `VITE_API_URL` mungon në një build të vendosur (jo `vite dev`/teste),
aplikacioni **NUK** bie mbrapa në ndonjë URL parazgjedhur — shfaq një faqe
gabimi konfigurimi (`src/components/ConfigErrorPage.tsx`) në vend që të
provojë të flasë me një backend të panjohur.

## Çështje e njohur, jo e zgjidhur ende (Faza 2)

`frontend/vercel.json` ka një Content-Security-Policy (aktualisht
`-Report-Only`, pra jo bllokuese) me `connect-src` që lejon shprehimisht vetëm
`https://api.rezervomjekun.com`. Kjo skedë aplikohet e njëjtë në çdo
deployment të Vercel-it (prod **dhe** çdo preview, `dev` përfshirë) — nuk ka
mënyrë të vendosen vlera të ndryshme sipas branch-it brenda vetë skedës.
Kur të krijohet URL-ja reale e Render-it për `dev`, kjo listë duhet
zgjeruar (ose CSP-ja duhet ristrukturuar) përpara se ndonjëherë të kalohet nga
`-Report-Only` në forcim real — përndryshe kërkesat e frontend-it të dev-it
drejt backend-it të dev-it do të shkelnin politikën.

## Branch protection në `main`

Kërkohet Pull Request për çdo ndryshim në `main` (pa push direkt), të paktën
1 approval, dhe (kur të ekzistojë) kalimi i testeve automatike përpara merge.
Shih raportin e sesionit që krijoi këtë skedë për detaje se çfarë ishte
aktualisht i konfigurueshëm te plani i GitHub-ut në përdorim.
