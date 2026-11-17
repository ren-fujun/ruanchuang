import { useAuth } from '../../context/AuthContext'
import { request } from '../../lib/api'
import { LeavePanel } from './Leaves'
export function LeavePage() {
  const { user } = useAuth()
  return <div className="page"><LeavePanel role={user!.role} call={(path, body, method = 'POST') => request(path, {
    method: body === undefined ? 'GET' : method, body: body === undefined ? undefined : JSON.stringify(body),
  })} /></div>
}
