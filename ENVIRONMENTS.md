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
| `Cloudinary__CloudName`, `Cloudinary__ApiKey`, `Cloudinary__ApiSecret` | llogaria reale | e njëjta llogari (ndarja bëhet me `RootFolder`) |
| `Cloudinary__RootFolder` | `rezervomjekun/prod` | `rezervomjekun/dev` |

`Cloudinary__RootFolder` është **e detyrueshme dhe pa vlerë parazgjedhje**. Nëse mungon ose është e pavlefshme,
ngarkimi i imazheve kthen **503 `uploads-not-configured`** (dhe logu emëron variablën) — kurrë nuk bie te rrënja e
llogarisë, sepse pikërisht kështu përzihen mjediset. Format: vetëm `a-z`, `0-9`, `-` dhe `/` mes segmenteve; pa `..`,
pa `/` në fillim ose në fund, pa shkronja të mëdha.

**Frontend (Vercel), sipas branch-it:**

| Variabla | Production (nga `main`) | Preview (nga `dev`) |
|---|---|---|
| `VITE_API_URL` | URL-ja e Render prod | URL-ja e Render dev |
| `VITE_ENVIRONMENT` | `production` | `development` |

`VITE_ENVIRONMENT` kontrollon (1) një shenjë të vogël vizuale në cep të
ekranit ("DEV"/"TESTING") që shfaqet sa herë s'është `production` — shih
`src/components/EnvironmentBadge.tsx`; qëllimi: askush s'duhet të ngatërrojë
kurrë një sesion testimi me prodhimin real, thjesht duke parë ekranin — dhe
(2) **indeksimin nga motorët e kërkimit**.

### Struktura e dosjeve në Cloudinary

Dev dhe prod ndajnë të njëjtën llogari Cloudinary, por secili shkruan vetëm nën rrënjën e vet. Të gjitha shtigjet
ndërtohen në një vend të vetëm (`CloudinaryFolders`), dhe e njëjta klasë përdoret edhe nga nënshkrimi edhe nga
validimi i URL-ve — klienti nuk zgjedh kurrë dosjen as `public_id`.

```
rezervomjekun/
├── prod/
│   ├── clinics/{clinicId}/logo/current     ← NË PËRDORIM (logo e klinikës)
│   ├── clinics/{clinicId}/cover/           ← e rezervuar (foto kopertinë e klinikës)
│   ├── clinics/{clinicId}/gallery/         ← e rezervuar (galeria e klinikës)
│   ├── branches/{branchId}/photo/          ← e rezervuar (foto e degës)
│   ├── doctors/{doctorId}/photo/current    ← NË PËRDORIM (foto e mjekut)
│   ├── users/{userId}/avatar/              ← e rezervuar (avatari i pacientit; NUK ndërtohet tani)
│   └── system/                             ← e rezervuar (logo për email-et, imazhe Open Graph)
└── dev/
    └── (e njëjta strukturë)
```

- **`public_id` fiks `current` + `overwrite` + `invalidate`**, të gjitha brenda nënshkrimit: një ngarkim i ri e
  zëvendëson të vjetrin, pa imazhe të papërdorura. Cache-i rifreskohet sepse URL-ja përmban versionin
  (`.../upload/v1712345678/...`), prandaj ruhet dhe shfaqet **me version**.
- **Validimi në server** (foto e mjekut) pranon vetëm
  `https://res.cloudinary.com/{cloud ynë}/image/upload/v{shifra}/{RootFolder}/doctors/{id}/photo/current.{jpg|jpeg|png|webp}`.
  URL-të nga mjedisi tjetër, nga struktura e vjetër (pa `RootFolder`), me `public_id` tjetër ose pa version refuzohen.
- **Imazhet ekzistuese nuk preken.** Logoja që prod ka tashmë te `clinics/{id}/logo/...` mbetet ku është; URL-ja është
  ruajtur në databazë dhe vazhdon të funksionojë. Ngarkimi i radhës shkon vetë në strukturën e re.
- **Dokumentet mjekësore të pacientëve NUK hyjnë kurrë në këtë strukturë.** Gjithçka këtu është asset publik
  (`upload`): kushdo me URL-në e lexon. Nëse ndonjëherë duhen dokumente, kërkojnë `type: authenticated` dhe një dizajn
  të veçantë.

### Indeksimi (SEO): vetëm `production` indeksohet

Në kohën e build-it (`vite.config.ts` → plugin `indexing-policy`,
logjika te `src/build/indexing.ts`):

| `VITE_ENVIRONMENT` | `/robots.txt` | `<meta name="robots">` te `index.html` |
|---|---|---|
| `production` | rregullat e vërteta (`robots.production.txt`) | asnjë — indeksohet |
| çdo vlerë tjetër **ose e pavendosur** | `Disallow: /` | `noindex, nofollow` |

**KUJDES:** te Vercel Production, `VITE_ENVIRONMENT` DUHET të jetë saktësisht
`production` (shkronja të vogla). Nëse mungon ose ka shkruarje tjetër, faqja
reale ndërtohet si `noindex` dhe Google do ta heqë nga rezultatet. Build-i
shfaq një paralajmërim `[indexing-policy]` sa herë që ndërtohet një version
jo-prodhim — kontrolloje te log-u i deployment-it të prodhimit që NUK del.
Rregullat reale të prodhimit ndryshohen te `frontend/robots.production.txt`
(jo më te `public/`).

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
