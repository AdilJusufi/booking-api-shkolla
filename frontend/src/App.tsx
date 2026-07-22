import { Route, Routes } from 'react-router-dom'
import Layout from './components/Layout'
import PatientLayout from './components/PatientLayout'
import ProtectedRoute from './components/ProtectedRoute'
import HomePage from './pages/HomePage'
import SearchPage from './pages/SearchPage'
import ClinicDetailPage from './pages/ClinicDetailPage'
import DoctorDetailPage from './pages/DoctorDetailPage'
import LoginPage from './pages/LoginPage'
import RegisterPage from './pages/RegisterPage'
import MyAppointmentsPage from './pages/MyAppointmentsPage'
import ConfirmEmailPage from './pages/ConfirmEmailPage'
import ForgotPasswordPage from './pages/ForgotPasswordPage'
import ResetPasswordPage from './pages/ResetPasswordPage'
import NotFoundPage from './pages/NotFoundPage'

export default function App() {
  return (
    <Routes>
      <Route path="/hyr" element={<LoginPage />} />
      <Route path="/konfirmo-email" element={<ConfirmEmailPage />} />
      <Route path="/harrova-fjalekalimin" element={<ForgotPasswordPage />} />
      <Route path="/rivendos-fjalekalimin" element={<ResetPasswordPage />} />
      <Route
        element={
          <ProtectedRoute role="Patient">
            <PatientLayout />
          </ProtectedRoute>
        }
      >
        <Route path="/terminet" element={<MyAppointmentsPage />} />
      </Route>
      <Route element={<Layout />}>
        <Route path="/" element={<HomePage />} />
        <Route path="/kerko" element={<SearchPage />} />
        <Route path="/klinika/:id" element={<ClinicDetailPage />} />
        <Route path="/mjeku/:id" element={<DoctorDetailPage />} />
        <Route path="/regjistrohu" element={<RegisterPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  )
}
