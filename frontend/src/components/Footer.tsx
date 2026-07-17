import { Link } from 'react-router-dom'

export default function Footer() {
  return (
    <footer className="footer">
      <div className="container footer__inner">
        <div className="footer__brand">
          <span className="brand__name">Termini<span className="brand__tld">.ks</span></span>
          <p className="footer__tag">Rezervo terminin te mjeku — shpejt e pa telefonata.</p>
        </div>
        <nav className="footer__col">
          <span className="footer__title">Shërbimet</span>
          <Link to="/kerko">Gjej mjekun</Link>
          <Link to="/kerko">Klinikat</Link>
        </nav>
        <nav className="footer__col">
          <span className="footer__title">Llogaria</span>
          <Link to="/hyr">Hyr</Link>
          <Link to="/regjistrohu">Regjistrohu</Link>
          <Link to="/terminet">Terminet e mia</Link>
        </nav>
        <div className="footer__col">
          <span className="footer__title">Kontakt</span>
          <span>Prishtinë, Kosovë</span>
          <span>info@termini.ks</span>
        </div>
      </div>
      <div className="footer__bottom container">
        © {new Date().getFullYear()} Termini.ks — Projekt demonstrues.
      </div>
    </footer>
  )
}
