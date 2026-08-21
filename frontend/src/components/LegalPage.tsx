import { useTranslation } from 'react-i18next'
import { AlertTriangle, Languages } from 'lucide-react'

interface LegalSection {
  heading: string
  body: string
}

interface LegalPageProps {
  /** Key under the 'legal' namespace: 'privacyPolicy' or 'termsOfService'. */
  contentKey: 'privacyPolicy' | 'termsOfService'
}

/**
 * Shared renderer for the two legal routes. The content itself is always
 * English, regardless of the active UI language — see legal.json's own
 * comment and UNREVIEWED.md: the draft is still moving through legal review,
 * and translating it now would mean re-translating it after every revision.
 * Only the two notice banners (draft status, translation-pending) come from
 * the active-language namespaces, since those are ordinary UI chrome.
 */
export default function LegalPage({ contentKey }: LegalPageProps) {
  const { t } = useTranslation('legal')

  const sections = t(`${contentKey}.sections`, { returnObjects: true }) as LegalSection[]

  return (
    <div className="container page legal-page">
      <h1>{t(`${contentKey}.heading`)}</h1>

      <div className="legal-page__notice legal-page__notice--draft">
        <AlertTriangle size={16} strokeWidth={1.5} />
        <span>
          <strong>{t(`${contentKey}.draftNoticeLabel`)}</strong> — {t(`${contentKey}.draftNotice`)}
        </span>
      </div>

      <div className="legal-page__notice legal-page__notice--translation">
        <Languages size={16} strokeWidth={1.5} />
        <span>{t(`${contentKey}.translationNotice`)}</span>
      </div>

      <p className="legal-page__intro">{t(`${contentKey}.intro`)}</p>

      <div className="prose legal-page__body">
        {sections.map((section) => (
          <section key={section.heading}>
            <h2>{section.heading}</h2>
            <p>{section.body}</p>
          </section>
        ))}
      </div>
    </div>
  )
}
