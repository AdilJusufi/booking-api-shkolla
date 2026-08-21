import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'

export default function NotFoundPage() {
  const { t } = useTranslation('common')
  return (
    <div className="container page notfound">
      <div className="notfound__code">404</div>
      <h1>{t('notFound.title')}</h1>
      <p>{t('notFound.message')}</p>
      <Link to="/" className="btn btn--primary btn--lg">{t('buttons.backHome')}</Link>
    </div>
  )
}
