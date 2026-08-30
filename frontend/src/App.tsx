import { useEffect, useState } from 'react'
import { Route, Routes } from 'react-router-dom'
import { AlertTriangle } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useOnlineStatus } from './pwa/useOnlineStatus'
import OfflineFallback from './components/OfflineFallback'
import ErrorBoundary from './components/ErrorBoundary'
import Logo from './components/Logo'
import Layout from './components/Layout'
import PatientLayout from './components/PatientLayout'
import DoctorLayout from './components/DoctorLayout'
import AdminLayout from './components/AdminLayout'
import SuperAdminLayout from './components/SuperAdminLayout'
import ProtectedRoute from './components/ProtectedRoute'
import HomePage from './pages/HomePage'
import SearchPage from './pages/SearchPage'
import ClinicDetailPage from './pages/ClinicDetailPage'
import DoctorDetailPage from './pages/DoctorDetailPage'
import LoginPage from './pages/LoginPage'
import RegisterPage from './pages/RegisterPage'
import MyAppointmentsPage from './pages/MyAppointmentsPage'
import AppointmentDetailPage from './pages/AppointmentDetailPage'
import ConfirmBookingPage from './pages/ConfirmBookingPage'
import MyProfilePage from './pages/MyProfilePage'
import DependentsPage from './pages/DependentsPage'
import ChangePasswordPage from './pages/ChangePasswordPage'
import DoctorCalendarPage from './pages/DoctorCalendarPage'
import DoctorAppointmentDetailPage from './pages/DoctorAppointmentDetailPage'
import WorkingSchedulePage from './pages/WorkingSchedulePage'
import UnavailabilityPage from './pages/UnavailabilityPage'
import MyClinicsPage from './pages/MyClinicsPage'
import AdminAppointmentsPage from './pages/AdminAppointmentsPage'
import ClinicDetailLayout from './components/ClinicDetailLayout'
import ClinicSettingsPage from './pages/ClinicSettingsPage'
import BranchesPage from './pages/BranchesPage'
import ServicesPage from './pages/ServicesPage'
import ClinicDoctorsPage from './pages/ClinicDoctorsPage'
import ClinicReportPage from './pages/ClinicReportPage'
import SuperAdminClinicsPage from './pages/SuperAdminClinicsPage'
import SpecialtiesPage from './pages/SpecialtiesPage'
import UsersPage from './pages/UsersPage'
import AuditLogsPage from './pages/AuditLogsPage'
import ConfirmEmailPage from './pages/ConfirmEmailPage'
import ResendConfirmationPage from './pages/ResendConfirmationPage'
import ForgotPasswordPage from './pages/ForgotPasswordPage'
import ResetPasswordPage from './pages/ResetPasswordPage'
import PrivacyPolicyPage from './pages/PrivacyPolicyPage'
import TermsOfServicePage from './pages/TermsOfServicePage'
import NotFoundPage from './pages/NotFoundPage'

export default function App() {
  const online = useOnlineStatus()
  // The app shell is precached, so launching offline boots React rather than
  // hitting the browser's error page — but every screen needs the API. If we
  // have never had a connection this session there is nothing to render, so
  // say so plainly instead of showing an app-shaped shell of failed requests.
  // Once a connection has been seen, the persistent OfflineBanner takes over
  // and pages keep whatever they already loaded.
  const [everOnline, setEverOnline] = useState(online)
  useEffect(() => {
    if (online) setEverOnline(true)
  }, [online])

  if (!online && !everOnline) {
    return <OfflineFallback onRetry={() => window.location.reload()} />
  }

  return (
    <ErrorBoundary fallback={<RouteCrashFallback />}>
      <Routes>
      <Route path="/hyr" element={<LoginPage />} />
      <Route path="/konfirmo-email" element={<ConfirmEmailPage />} />
      <Route path="/konfirmo-email/ridergo" element={<ResendConfirmationPage />} />
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
        <Route path="/terminet/:id" element={<AppointmentDetailPage />} />
        <Route path="/rezervo/konfirmo" element={<ConfirmBookingPage />} />
        <Route path="/llogaria" element={<MyProfilePage />} />
        <Route path="/llogaria/anetaret" element={<DependentsPage />} />
        <Route path="/llogaria/fjalekalimi" element={<ChangePasswordPage />} />
      </Route>
      <Route
        element={
          <ProtectedRoute role="Doctor">
            <DoctorLayout />
          </ProtectedRoute>
        }
      >
        <Route path="/mjeku-panel/kalendari" element={<DoctorCalendarPage />} />
        <Route path="/mjeku-panel/terminet/:id" element={<DoctorAppointmentDetailPage />} />
        <Route path="/mjeku-panel/orari" element={<WorkingSchedulePage />} />
        <Route path="/mjeku-panel/mungesat" element={<UnavailabilityPage />} />
      </Route>
      <Route
        element={
          <ProtectedRoute role="ClinicAdmin">
            <AdminLayout />
          </ProtectedRoute>
        }
      >
        <Route path="/admin-panel/klinikat" element={<MyClinicsPage />} />
        <Route path="/admin-panel/terminet" element={<AdminAppointmentsPage />} />
        <Route path="/admin-panel/klinikat/:id" element={<ClinicDetailLayout />}>
          <Route index element={<ClinicSettingsPage />} />
          <Route path="deget" element={<BranchesPage />} />
          <Route path="sherbimet" element={<ServicesPage />} />
          <Route path="mjeket" element={<ClinicDoctorsPage />} />
          <Route path="raporti" element={<ClinicReportPage />} />
        </Route>
      </Route>
      <Route
        element={
          <ProtectedRoute role="SuperAdmin">
            <SuperAdminLayout />
          </ProtectedRoute>
        }
      >
        <Route path="/super-admin/klinikat" element={<SuperAdminClinicsPage />} />
        <Route path="/super-admin/specializimet" element={<SpecialtiesPage />} />
        <Route path="/super-admin/perdoruesit" element={<UsersPage />} />
        <Route path="/super-admin/regjistrat" element={<AuditLogsPage />} />
      </Route>
      <Route element={<Layout />}>
        <Route path="/" element={<HomePage />} />
        <Route path="/kerko" element={<SearchPage />} />
        <Route path="/klinika/:id" element={<ClinicDetailPage />} />
        <Route path="/mjeku/:id" element={<DoctorDetailPage />} />
        <Route path="/regjistrohu" element={<RegisterPage />} />
        <Route path="/politika-e-privatesise" element={<PrivacyPolicyPage />} />
        <Route path="/kushtet-e-perdorimit" element={<TermsOfServicePage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
      </Routes>
    </ErrorBoundary>
  )
}

function RouteCrashFallback() {
  const { t } = useTranslation('common')
  return (
    <div className="offline-page">
      <span className="offline-page__brand">
        <Logo variant="stacked" size={48} />
      </span>

      <div className="icon-circle icon-circle--danger">
        <AlertTriangle size={26} strokeWidth={1.5} />
      </div>

      <h1>{t('errorBoundary.pageTitle')}</h1>
      <p className="auth-sub">{t('errorBoundary.pageMessage')}</p>

      <button type="button" className="btn btn--primary" onClick={() => window.location.reload()}>
        {t('errorBoundary.reloadCta')}
      </button>
    </div>
  )
}
