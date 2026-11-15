import { StudentAssistant } from './features/b/Assistant'
import { Navigate, Route, Routes } from 'react-router-dom'
import type { ReactNode } from 'react'
import { useAuth } from './context/AuthContext'
import { AppShell } from './components/layout/AppShell'
import { CounselorShell } from './components/layout/CounselorShell'
import { BrandMark } from './components/ui'
import { LoginPage } from './pages/Login'
import { StudentHome } from './pages/student/Home'
import { StudentTickets } from './pages/student/Tickets'
import { NewTicket } from './pages/student/NewTicket'
import { StudentTicketDetail } from './pages/student/TicketDetail'
import { CounselorHome } from './pages/counselor/Home'
import { CounselorTickets } from './pages/counselor/Tickets'
import { CounselorTicketDetail } from './pages/counselor/TicketDetail'
import { CounselorInsights } from './pages/counselor/Insights'
import { DormCheck } from './pages/counselor/DormCheck'
import { ContractTicketsDemo } from './features/contract-demo/ContractTicketsDemo'
import { MessagesPage } from './pages/Messages'
import { ProfilePage } from './pages/Profile'
import type { Role } from './types'

function LoadingScreen() {
  return (
    <div className="boot-screen">
      <div className="boot-orbit">
        <span className="boot-ring r1" />
        <span className="boot-ring r2" />
        <span className="boot-core"><BrandMark size={46} tone="light" /></span>
      </div>
      <strong>智汇中枢</strong>
      <span>正在连接校园协同网络…</span>
    </div>
  )
}

function RequireRole({ role, children }: { role: Role; children: ReactNode }) {
  const { user, loading } = useAuth()
  if (loading) return <LoadingScreen />
  if (!user) return <Navigate to="/login" replace />
  if (user.role !== role) {
    return <Navigate to={user.role === 'student' ? '/student/home' : '/counselor/home'} replace />
  }
  return <>{children}</>
}

function HomeRedirect() {
  const { user, loading } = useAuth()
  if (loading) return <LoadingScreen />
  if (!user) return <Navigate to="/login" replace />
  return <Navigate to={user.role === 'student' ? '/student/home' : '/counselor/home'} replace />
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/contract-demo/tickets" element={<ContractTicketsDemo />} />
      <Route path="/" element={<HomeRedirect />} />

      <Route
        element={
          <RequireRole role="student">
            <AppShell role="student" />
          </RequireRole>
        }
      >
        <Route path="/student/home" element={<StudentHome />} />
        <Route path="/student/tickets" element={<StudentTickets />} />
        <Route path="/student/tickets/:id" element={<StudentTicketDetail />} />
        <Route path="/student/assistant" element={<StudentAssistant />} />
        <Route path="/student/new" element={<NewTicket />} />
        <Route path="/student/messages" element={<MessagesPage />} />
        <Route path="/student/profile" element={<ProfilePage />} />
      </Route>

      <Route
        element={
          <RequireRole role="counselor">
            <CounselorShell />
          </RequireRole>
        }
      >
        <Route path="/counselor/home" element={<CounselorHome />} />
        <Route path="/counselor/tickets" element={<CounselorTickets />} />
        <Route path="/counselor/tickets/:id" element={<CounselorTicketDetail />} />
        <Route path="/counselor/dorm-check" element={<DormCheck />} />
        <Route path="/counselor/insights" element={<CounselorInsights />} />
        <Route path="/counselor/messages" element={<MessagesPage />} />
        <Route path="/counselor/profile" element={<ProfilePage />} />
      </Route>

      <Route path="*" element={<HomeRedirect />} />
    </Routes>
  )
}
