import { Route, Routes } from 'react-router-dom'
import Layout from './components/Layout'
import PatientLayout from './components/PatientLayout'
import DoctorLayout from './components/DoctorLayout'
import AdminLayout from './components/AdminLayout'
import ProtectedRoute from './components/ProtectedRoute'
import HomePage from './pages/HomePage'
import SearchPage from './pages/SearchPage'
import ClinicDetailPage from './pages/ClinicDetailPage'
import DoctorDetailPage from './pages/DoctorDetailPage'
import LoginPage from './pages/LoginPage'
import RegisterPage from './pages/RegisterPage'
import MyAppointmentsPage from './pages/MyAppointmentsPage'
import AppointmentDetailPage from './pages/AppointmentDetailPage'
import MyProfilePage from './pages/MyProfilePage'
import DoctorCalendarPage from './pages/DoctorCalendarPage'
import WorkingSchedulePage from './pages/WorkingSchedulePage'
import MyClinicsPage from './pages/MyClinicsPage'
import ClinicDetailLayout from './components/ClinicDetailLayout'
import ClinicSettingsPage from './pages/ClinicSettingsPage'
import BranchesPage from './pages/BranchesPage'
import ServicesPage from './pages/ServicesPage'
import ClinicDoctorsPage from './pages/ClinicDoctorsPage'
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
        <Route path="/terminet/:id" element={<AppointmentDetailPage />} />
        <Route path="/llogaria" element={<MyProfilePage />} />
      </Route>
      <Route
        element={
          <ProtectedRoute role="Doctor">
            <DoctorLayout />
          </ProtectedRoute>
        }
      >
        <Route path="/mjeku-panel/kalendari" element={<DoctorCalendarPage />} />
        <Route path="/mjeku-panel/orari" element={<WorkingSchedulePage />} />
      </Route>
      <Route
        element={
          <ProtectedRoute role="ClinicAdmin">
            <AdminLayout />
          </ProtectedRoute>
        }
      >
        <Route path="/admin-panel/klinikat" element={<MyClinicsPage />} />
        <Route path="/admin-panel/klinikat/:id" element={<ClinicDetailLayout />}>
          <Route index element={<ClinicSettingsPage />} />
          <Route path="deget" element={<BranchesPage />} />
          <Route path="sherbimet" element={<ServicesPage />} />
          <Route path="mjeket" element={<ClinicDoctorsPage />} />
        </Route>
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
