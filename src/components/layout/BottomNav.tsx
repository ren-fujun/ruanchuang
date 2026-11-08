import { useEffect } from 'react'
import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import {
  Bell,
  ChartNoAxesCombined,
  ClipboardList,
  Inbox,
  LayoutDashboard,
  Plus,
  UserRound,
} from 'lucide-react'
import { useApi } from '../../lib/useApi'
import type { Role } from '../../types'

const studentItems = [
  { to: '/student/home', label: '首页', icon: LayoutDashboard },
  { to: '/student/tickets', label: '进度', icon: ClipboardList },
  { to: '/student/messages', label: '消息', icon: Bell, badge: true },
  { to: '/student/profile', label: '我的', icon: UserRound },
]

const counselorItems = [
  { to: '/counselor/home', label: '中枢', icon: LayoutDashboard },
  { to: '/counselor/tickets', label: '工单', icon: Inbox, badgeCount: true },
  { to: '/counselor/insights', label: '洞察', icon: ChartNoAxesCombined },
  { to: '/counselor/profile', label: '我的', icon: UserRound },
]

export function BottomNav({ role }: { role: Role }) {
  const location = useLocation()
  const navigate = useNavigate()
  const { data, reload } = useApi<{ unread: number }>('/notifications')

  useEffect(() => {
    const refresh = () => reload()
    window.addEventListener('zhihui:refresh-unread', refresh)
    return () => window.removeEventListener('zhihui:refresh-unread', refresh)
  }, [reload])

  const unread = data?.unread || 0
  const isDetail =
    /\/tickets\/[^/]+$/.test(location.pathname) ||
    location.pathname.endsWith('/new') ||
    location.pathname.endsWith('/dorm-check')
  if (isDetail) return null

  const renderStudentItem = (item: (typeof studentItems)[number]) => {
    const Icon = item.icon
    return (
      <NavLink
        key={item.to}
        to={item.to}
        className={({ isActive }) => `dock-item ${isActive ? 'active' : ''}`}
      >
        <span className="dock-icon">
          <Icon size={20} strokeWidth={2.1} />
          {item.badge && unread > 0 && <i className="dock-badge">{unread > 9 ? '9+' : unread}</i>}
        </span>
        <span className="dock-label">{item.label}</span>
      </NavLink>
    )
  }

  if (role === 'student') {
    return (
      <nav className="bottom-dock student-dock" aria-label="学生端主导航">
        <div className="student-dock-inner">
          {studentItems.slice(0, 2).map(renderStudentItem)}
          <button className="dock-create" onClick={() => navigate('/student/new')} aria-label="发起新诉求">
            <span className="dock-create-orb">
              <Plus size={22} strokeWidth={2.4} />
            </span>
            <span className="dock-create-label">发起</span>
          </button>
          {studentItems.slice(2).map(renderStudentItem)}
        </div>
      </nav>
    )
  }

  return (
    <nav className="bottom-dock" aria-label="辅导员端主导航">
      <div className="dock-inner">
        {counselorItems.map((item) => {
          const Icon = item.icon
          return (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) => `dock-item ${isActive ? 'active' : ''}`}
            >
              <span className="dock-icon">
                <Icon size={20} strokeWidth={2.1} />
                {item.badgeCount && unread > 0 && <i className="dock-badge dot-only" />}
              </span>
              <span className="dock-label">{item.label}</span>
            </NavLink>
          )
        })}
      </div>
    </nav>
  )
}
