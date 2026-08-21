import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import LanguageSwitcher from './LanguageSwitcher'

export default function Footer() {
  const { t } = useTranslation('common')

  return (
    <footer className="footer">
      <div className="container footer__inner">
        <div className="footer__brand">
          <span className="brand__name">{t('brand.name')}<span className="brand__tld">{t('brand.tld')}</span></span>
          <p className="footer__tag">{t('footer.tagline')}</p>
        </div>
        <nav className="footer__col">
          <span className="footer__title">{t('footer.servicesTitle')}</span>
          <Link to="/kerko">{t('footer.findDoctor')}</Link>
          <Link to="/kerko">{t('footer.clinics')}</Link>
        </nav>
        <nav className="footer__col">
          <span className="footer__title">{t('footer.accountTitle')}</span>
          <Link to="/hyr">{t('footer.login')}</Link>
          <Link to="/regjistrohu">{t('footer.register')}</Link>
          <Link to="/terminet">{t('footer.myAppointments')}</Link>
        </nav>
        <div className="footer__col">
          <span className="footer__title">{t('footer.contactTitle')}</span>
          <span>{t('footer.contactCity')}</span>
          <span>{t('footer.contactEmail')}</span>
        </div>
        <nav className="footer__col">
          <span className="footer__title">{t('footer.legalTitle')}</span>
          <Link to="/politika-e-privatesise">{t('footer.privacyPolicy')}</Link>
          <Link to="/kushtet-e-perdorimit">{t('footer.termsOfService')}</Link>
        </nav>
        <LanguageSwitcher variant="footer" />
      </div>
      <div className="footer__bottom container">
        {t('footer.copyright', { year: new Date().getFullYear() })}
      </div>
    </footer>
  )
}
