import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { SITE_NAME } from '../lib/seo'
import { useSeo } from '../lib/useSeo'

export default function NotFoundPage() {
  const { t } = useTranslation('common')
  // The SPA answers unknown URLs with HTTP 200, so the page itself has to keep them out of the index.
  useSeo({ title: `${t('notFound.title')} | ${SITE_NAME}`, noindex: true })
  return (
    <div className="container page notfound">
      <div className="notfound__code">404</div>
      <h1>{t('notFound.title')}</h1>
      <p>{t('notFound.message')}</p>
      <Link to="/" className="btn btn--primary btn--lg">{t('buttons.backHome')}</Link>
    </div>
  )
}
