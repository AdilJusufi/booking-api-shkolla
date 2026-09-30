import { Outlet, useMatch } from 'react-router-dom'
import Navbar from './Navbar'
import Footer from './Footer'

export default function Layout() {
  // The doctor page hosts the booking widget — no footer there, so the flow
  // ends at the booking CTA instead of trailing into site links.
  // (/rezervo/konfirmo lives under PatientLayout, which has no footer.)
  const isBookingFlow = useMatch('/mjeku/:id')

  return (
    <div className="app-shell">
      <Navbar />
      <main className="app-main">
        <Outlet />
      </main>
      {!isBookingFlow && <Footer />}
    </div>
  )
}
