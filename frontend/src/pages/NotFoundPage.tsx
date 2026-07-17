import { Link } from 'react-router-dom'

export default function NotFoundPage() {
  return (
    <div className="container page notfound">
      <div className="notfound__code">404</div>
      <h1>Faqja nuk u gjet</h1>
      <p>Ndoshta lidhja është e vjetër ose e gabuar.</p>
      <Link to="/" className="btn btn--primary btn--lg">Kthehu në ballinë</Link>
    </div>
  )
}
