import { useState } from 'react'
import { Link, NavLink, useNavigate } from 'react-router-dom'
import { Moon, Sun } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../context/AuthContext'
import { useTheme } from '../context/ThemeContext'
import Logo from './Logo'

export default function Navbar() {
  const { t } = useTranslation('common')
  const { isAuthenticated, user, logout } = useAuth()
  const { theme, toggleTheme } = useTheme()
  const [open, setOpen] = useState(false)
  const navigate = useNavigate()

  function handleLogout() {
    logout()
    setOpen(false)
    navigate('/')
  }

  return (
    <header className="navbar">
      <div className="navbar__inner container">
        <Link to="/" className="brand" onClick={() => setOpen(false)}>
          <Logo variant="horizontal" size={28} />
        </Link>

        <button
          className="navbar__burger"
          aria-label={t('nav.menu')}
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          <span /><span /><span />
        </button>

        <nav className={`navbar__links ${open ? 'is-open' : ''}`} onClick={() => setOpen(false)}>
          <NavLink to="/kerko" className="navlink">{t('nav.findDoctor')}</NavLink>
          {isAuthenticated ? (
            <>
              <NavLink to="/terminet" className="navlink">{t('nav.myAppointments')}</NavLink>
              <span className="navbar__user">{t('nav.greeting', { firstName: user?.firstName })}</span>
              <button className="btn btn--ghost" onClick={handleLogout}>{t('nav.logout')}</button>
            </>
          ) : (
            <>
              <NavLink to="/hyr" className="navlink">{t('nav.login')}</NavLink>
              <Link to="/regjistrohu" className="btn btn--primary">{t('nav.register')}</Link>
            </>
          )}
          <button
            className="theme-toggle"
            type="button"
            aria-label={theme === 'dark' ? t('theme.switchToLight') : t('theme.switchToDark')}
            onClick={(e) => { e.stopPropagation(); toggleTheme() }}
          >
            {theme === 'dark' ? <Sun size={18} strokeWidth={1.5} /> : <Moon size={18} strokeWidth={1.5} />}
          </button>
        </nav>
      </div>
    </header>
  )
}
