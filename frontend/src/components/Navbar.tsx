import { useState } from 'react'
import { Link, NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export default function Navbar() {
  const { isAuthenticated, user, logout } = useAuth()
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
          <span className="brand__mark" aria-hidden>＋</span>
          <span className="brand__name">Termini<span className="brand__tld">.ks</span></span>
        </Link>

        <button
          className="navbar__burger"
          aria-label="Menyja"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          <span /><span /><span />
        </button>

        <nav className={`navbar__links ${open ? 'is-open' : ''}`} onClick={() => setOpen(false)}>
          <NavLink to="/kerko" className="navlink">Gjej mjekun</NavLink>
          {isAuthenticated ? (
            <>
              <NavLink to="/terminet" className="navlink">Terminet e mia</NavLink>
              <span className="navbar__user">Përshëndetje, {user?.firstName}</span>
              <button className="btn btn--ghost" onClick={handleLogout}>Dil</button>
            </>
          ) : (
            <>
              <NavLink to="/hyr" className="navlink">Hyr</NavLink>
              <Link to="/regjistrohu" className="btn btn--primary">Regjistrohu</Link>
            </>
          )}
        </nav>
      </div>
    </header>
  )
}
