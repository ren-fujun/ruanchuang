import { RepairList, RepairCreate, RepairDetail } from "./features/c/Repairs";
import { KnowledgeCorrections } from "./features/c/Knowledge";
import { portalRole } from "./features/c/config";
import { PortalLogin } from "./features/c/PortalLogin";
import { PortalShell } from "./features/c/PortalShell";
import { PortalHome } from "./features/c/Home";
import { Bundles, BundleDetail } from "./features/c/Bundles";
import { TicketChanges } from "./features/c/TicketChanges";
import { Appointments } from "./features/c/Appointments";
import { Academic } from "./features/c/Academic";
import { StudentAssistant } from "./features/b/Assistant";
import { LeavePage } from "./features/b/LeavePage";
import { Navigate, Route, Routes } from "react-router-dom";
import type { ReactNode } from "react";
import { useAuth } from "./context/AuthContext";
import { BrandMark } from "./components/ui";
import { LoginPage } from "./pages/Login";
import { StudentTickets } from "./pages/student/Tickets";
import { NewTicket } from "./pages/student/NewTicket";
import { StudentTicketDetail } from "./pages/student/TicketDetail";
import { CounselorTickets } from "./pages/counselor/Tickets";
import { CounselorTicketDetail } from "./pages/counselor/TicketDetail";
import { CounselorInsights } from "./pages/counselor/Insights";
import { DormCheck } from "./pages/counselor/DormCheck";
import { ContractTicketsDemo } from "./features/contract-demo/ContractTicketsDemo";
import { MessagesPage } from "./pages/Messages";
import { ProfilePage } from "./pages/Profile";
import type { Role } from "./types";

function LoadingScreen() {
  return (
    <div className="boot-screen">
      <div className="boot-orbit">
        <span className="boot-ring r1" />
        <span className="boot-ring r2" />
        <span className="boot-core">
          <BrandMark size={46} tone="light" />
        </span>
      </div>
      <strong>智汇中枢</strong>
      <span>正在连接校园协同网络…</span>
    </div>
  );
}

function RequireRole({ role, children }: { role: Role; children: ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <LoadingScreen />;
  if (!user) return <Navigate to="/login" replace />;
  if (portalRole && user.role !== portalRole)
    return <Navigate to="/login" replace />;
  if (user.role !== role) {
    if (portalRole && user.role !== portalRole)
      return <Navigate to="/login" replace />;
    return (
      <Navigate
        to={user.role === "student" ? "/student/home" : "/counselor/home"}
        replace
      />
    );
  }
  return <>{children}</>;
}

function HomeRedirect() {
  const { user, loading } = useAuth();
  if (loading) return <LoadingScreen />;
  if (!user) return <Navigate to="/login" replace />;
  if (portalRole && user.role !== portalRole)
    return <Navigate to="/login" replace />;
  return (
    <Navigate
      to={user.role === "student" ? "/student/home" : "/counselor/home"}
      replace
    />
  );
}

export default function App() {
  return (
    <Routes>
      <Route
        path="/login"
        element={portalRole ? <PortalLogin role={portalRole} /> : <LoginPage />}
      />
      <Route path="/contract-demo/tickets" element={<ContractTicketsDemo />} />
      <Route path="/" element={<HomeRedirect />} />

      {(!portalRole || portalRole === "student") && (
        <Route
          element={
            <RequireRole role="student">
              <PortalShell role="student" />
            </RequireRole>
          }
        >
          <Route path="/student/home" element={<PortalHome role="student" />} />
          <Route path="/student/tickets" element={<StudentTickets />} />
          <Route
            path="/student/tickets/:id"
            element={<StudentTicketDetail />}
          />
          <Route
            path="/student/repairs"
            element={<RepairList role="student" />}
          />
          <Route path="/student/repairs/new" element={<RepairCreate />} />
          <Route
            path="/student/repairs/:id"
            element={<RepairDetail role="student" />}
          />
          <Route path="/student/assistant" element={<StudentAssistant />} />
          <Route path="/student/leaves" element={<LeavePage />} />
          <Route
            path="/student/academic"
            element={<Academic role="student" />}
          />
          <Route
            path="/student/appointments"
            element={<Appointments role="student" />}
          />
          <Route
            path="/student/tickets/:id/:action"
            element={<TicketChanges />}
          />
          <Route path="/student/new" element={<NewTicket />} />
          <Route path="/student/messages" element={<MessagesPage />} />
          <Route path="/student/profile" element={<ProfilePage />} />
        </Route>
      )}

      {(!portalRole || portalRole === "counselor") && (
        <Route
          element={
            <RequireRole role="counselor">
              <PortalShell role="counselor" />
            </RequireRole>
          }
        >
          <Route
            path="/counselor/home"
            element={<PortalHome role="counselor" />}
          />
          <Route
            path="/counselor/knowledge"
            element={<KnowledgeCorrections />}
          />
          <Route path="/counselor/tickets" element={<CounselorTickets />} />
          <Route
            path="/counselor/tickets/:id"
            element={<CounselorTicketDetail />}
          />
          <Route
            path="/counselor/bundles"
            element={<Navigate to="/counselor/repairs" replace />}
          />
          <Route
            path="/counselor/repairs"
            element={<RepairList role="counselor" />}
          />
          <Route
            path="/counselor/repairs/:id"
            element={<RepairDetail role="counselor" />}
          />
          <Route
            path="/counselor/bundles/:id"
            element={<Navigate to="/counselor/repairs" replace />}
          />
          <Route
            path="/counselor/appointments"
            element={<Appointments role="counselor" />}
          />
          <Route
            path="/counselor/academic"
            element={<Academic role="counselor" />}
          />
          <Route path="/counselor/dorm-check" element={<DormCheck />} />
          <Route path="/counselor/leaves" element={<LeavePage />} />
          <Route path="/counselor/insights" element={<CounselorInsights />} />
          <Route path="/counselor/messages" element={<MessagesPage />} />
          <Route path="/counselor/profile" element={<ProfilePage />} />
        </Route>
      )}

      <Route path="*" element={<HomeRedirect />} />
    </Routes>
  );
}
