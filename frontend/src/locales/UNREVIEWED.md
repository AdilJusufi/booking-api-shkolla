# Unreviewed translations

Albanian (`sq`) is the source of truth — every string in this app was written
in Albanian first. Everything under `en/` and `sr/` was produced as a
first-pass machine translation to get the i18n structure working end-to-end,
**not proofread by a native/fluent speaker**, and must not be treated as
launch-ready.

This matters more than usual here: this is a medical booking app, and a
mistranslated cancellation or status string has a real cost (a confused
patient, an empty clinic slot). Do not ship `en` or `sr` copy to real users
before it has been reviewed.

## What needs review

- **All of `en/*.json`** — machine-translated.
- **All of `sr/*.json`** — machine-translated. Latin script, as specified (not
  Cyrillic — more common in Kosovo).
- **`sq/*.json`** is the original Albanian copy carried over from the
  hardcoded strings already in production, so it does not need translation
  review — but a native speaker should still skim it once during this same
  pass, since some of it was itself written quickly during earlier
  development.
- **Serbian pluralisation** (`_one` / `_few` / `_many` / `_other` suffixes)
  needs particular attention: the grammatical forms were generated from CLDR
  plural rules, not confirmed against real usage per string. Get a native
  speaker to check every `_few` / `_many` pair, not just spot-check.

## How this file is kept up to date

As each namespace is extracted (see the sequence in the i18n project plan),
this file's checklist below is updated. When a string is reviewed and fixed,
remove it from the list. An empty list under a namespace means that
namespace's `en`/`sr` copy has been reviewed.

## Checklist by namespace

- [ ] `common` — en
- [ ] `common` — sr
- [ ] `auth` — en
- [ ] `auth` — sr
- [ ] `patient` — en
- [ ] `patient` — sr
- [ ] `doctor` — en
- [ ] `doctor` — sr
- [ ] `admin` — en
- [ ] `admin` — sr
- [ ] `legal` — en/sr — **not applicable yet**: the legal text itself is still
      an unreviewed English draft awaiting a lawyer's sign-off (see
      `src/pages/PrivacyPolicyPage.tsx` / `TermsOfServicePage.tsx`). Do not
      translate `legal` into `sq` or `sr` until that draft is final —
      translating a moving document means re-translating every revision.
