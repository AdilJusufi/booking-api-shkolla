import { Route, Routes } from 'react-router-dom'
import Layout from './components/Layout'
import ProtectedRoute from './components/ProtectedRoute'
import HomePage from './pages/HomePage'
import SearchPage from './pages/SearchPage'
import ClinicDetailPage from './pages/ClinicDetailPage'
import DoctorDetailPage from './pages/DoctorDetailPage'
import LoginPage from './pages/LoginPage'
import RegisterPage from './pages/RegisterPage'
import MyAppointmentsPage from './pages/MyAppointmentsPage'
import NotFoundPage from './pages/NotFoundPage'

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<HomePage />} />
        <Route path="/kerko" element={<SearchPage />} />
        <Route path="/klinika/:id" element={<ClinicDetailPage />} />
        <Route path="/mjeku/:id" element={<DoctorDetailPage />} />
        <Route path="/hyr" element={<LoginPage />} />
        <Route path="/regjistrohu" element={<RegisterPage />} />
        <Route
          path="/terminet"
          element={
            <ProtectedRoute>
              <MyAppointmentsPage />
            </ProtectedRoute>
          }
        />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  )
}
