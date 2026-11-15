import { useEffect, useRef, useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import {
  Bell,
  ChartNoAxesCombined,
  ChevronRight,
  DoorOpen,
  Inbox,
  LayoutDashboard,
  Menu,
  Search,
  X,
} from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { useApi } from '../../lib/useApi'
import { Avatar, BrandMark } from '../ui'

const navigation = [
  { to: '/counselor/home', label: '工作概览', icon: LayoutDashboard },
  { to: '/counselor/tickets', label: '工单管理', icon: Inbox },
  { to: '/counselor/insights', label: '协同洞察', icon: ChartNoAxesCombined },
  { to: '/counselor/dorm-check', label: '宿舍查寝', icon: DoorOpen },
  { to: '/counselor/messages', label: '消息中心', icon: Bell },
]

export function CounselorShell() {
  const { user } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const [menuOpen, setMenuOpen] = useState(false)
  const [search, setSearch] = useState('')
  const menuButton = useRef<HTMLButtonElement>(null)
  const sidebar = useRef<HTMLElement>(null)
  const content = useRef<HTMLElement>(null)
  const { data, reload } = useApi<{ unread: number }>('/notifications')
  const current = navigation.find((item) =>
    location.pathname.startsWith(item.to),
  )
  const pageName =
    location.pathname === '/counselor/profile'
      ? '个人中心'
      : current?.label || '工单详情'
  const unread = data?.unread || 0

  useEffect(() => {
    document.body.classList.add('theme-counselor')
    return () => document.body.classList.remove('theme-counselor')
  }, [])

  useEffect(() => {
    setMenuOpen(false)
    window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior })
  }, [location.pathname, location.search])

  useEffect(() => {
    const refresh = () => reload()
    window.addEventListener('zhihui:refresh-unread', refresh)
    return () => window.removeEventListener('zhihui:refresh-unread', refresh)
  }, [reload])

  useEffect(() => {
    if (!menuOpen) return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    sidebar.current?.querySelector<HTMLButtonElement>('button')?.focus()
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenuOpen(false)
      if (event.key !== 'Tab') return
      const focusable = sidebar.current?.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled])',
      )
      if (!focusable?.length) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    const desktop = window.matchMedia('(min-width: 1000px)')
    const closeOnDesktop = () => {
      if (desktop.matches) setMenuOpen(false)
    }
    desktop.addEventListener('change', closeOnDesktop)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.body.style.overflow = previousOverflow
      document.removeEventListener('keydown', closeOnEscape)
      desktop.removeEventListener('change', closeOnDesktop)
      menuButton.current?.focus()
    }
  }, [menuOpen])

  useEffect(() => {
    const root = content.current
    if (!root || window.matchMedia('(prefers-reduced-motion: reduce)').matches)
      return
    const observed = new Set<Element>()
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-revealed')
            observer.unobserve(entry.target)
          }
        })
      },
      { threshold: 0.06 },
    )
    const discover = () => {
      root
        .querySelectorAll(
          '[data-reveal], .insight-chart-card, .insight-donut-card, .dept-performance',
        )
        .forEach((element) => {
          if (observed.has(element)) return
          observed.add(element)
          element.classList.add('reveal-ready')
          observer.observe(element)
        })
    }
    discover()
    const updates = new MutationObserver(discover)
    updates.observe(root, { childList: true, subtree: true })
    let frame = 0
    const parallax = () => {
      if (frame) return
      frame = window.requestAnimationFrame(() => {
        root.style.setProperty(
          '--parallax-offset',
          `${Math.min(window.scrollY * 0.06, 26)}px`,
        )
        frame = 0
      })
    }
    window.addEventListener('scroll', parallax, { passive: true })
    return () => {
      observer.disconnect()
      updates.disconnect()
      window.removeEventListener('scroll', parallax)
      window.cancelAnimationFrame(frame)
    }
  }, [location.pathname])

  return (
    <div className="counselor-workspace role-counselor">
      <a className="workspace-skip" href="#workspace-content">
        跳转到主要内容
      </a>
      {menuOpen && (
        <button
          className="workspace-backdrop"
          aria-label="关闭导航"
          onClick={() => setMenuOpen(false)}
        />
      )}
      <aside
        ref={sidebar}
        className={`workspace-sidebar ${menuOpen ? 'is-open' : ''}`}
        aria-label="辅导员工作台导航"
      >
        <div className="workspace-brand">
          <NavLink to="/counselor/home">
            <BrandMark size={38} />
            <span>
              <strong>智汇中枢</strong>
              <small>校园协同督办</small>
            </span>
          </NavLink>
          <button
            className="workspace-mobile-close"
            aria-label="关闭导航"
            onClick={() => setMenuOpen(false)}
          >
            <X size={20} />
          </button>
        </div>
        <div className="workspace-context">
          <span className="workspace-context-icon">
            <DoorOpen size={17} />
          </span>
          <div>
            <strong>{user?.college || '学院工作空间'}</strong>
            <span>学工事务协同</span>
          </div>
        </div>
        <div className="workspace-nav-label">工作空间</div>
        <nav className="workspace-navigation" aria-label="辅导员主导航">
          {navigation.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) => (isActive ? 'active' : '')}
            >
              <Icon size={19} strokeWidth={1.7} />
              <span>{label}</span>
              {to.endsWith('/messages') && unread > 0 && (
                <small>{unread > 99 ? '99+' : unread}</small>
              )}
            </NavLink>
          ))}
        </nav>
        <div className="workspace-sidebar-footer">
          <NavLink className="workspace-account" to="/counselor/profile">
            <Avatar name={user?.name || '辅导员'} tone="sage" size={36} />
            <span>
              <strong>{user?.name}</strong>
              <small>辅导员</small>
            </span>
            <ChevronRight size={16} />
          </NavLink>
        </div>
      </aside>
      <div className="workspace-main">
        <header className="workspace-topbar">
          <div className="workspace-breadcrumb">
            <button
              ref={menuButton}
              className="workspace-menu-button"
              aria-label="打开导航"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen(true)}
            >
              <Menu size={20} />
            </button>
            <span>学工协同</span>
            <ChevronRight size={14} />
            <strong>{pageName}</strong>
          </div>
          <div className="workspace-topbar-actions">
            <form
              className="workspace-search"
              role="search"
              onSubmit={(event) => {
                event.preventDefault()
                navigate(
                  `/counselor/tickets${search.trim() ? `?q=${encodeURIComponent(search.trim())}` : ''}`,
                )
              }}
            >
              <Search size={16} />
              <input
                aria-label="搜索工单或学生"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="搜索工单或学生…"
              />
              <button type="submit" aria-label="提交搜索">
                <ChevronRight size={15} />
              </button>
            </form>
            <NavLink
              className="workspace-mobile-search"
              to="/counselor/tickets?search=1"
              aria-label="搜索工单"
            >
              <Search size={19} />
            </NavLink>
            <NavLink
              className="workspace-notifications"
              to="/counselor/messages"
              aria-label={`消息中心，${unread} 条未读`}
            >
              <Bell size={19} strokeWidth={1.7} />
              {unread > 0 && <i />}
            </NavLink>
          </div>
        </header>
        <main
          ref={content}
          className="workspace-content"
          id="workspace-content"
          tabIndex={-1}
        >
          <div className="workspace-ambient" aria-hidden="true" />
          <Outlet />
          <footer className="workspace-footer">
            <span>智汇中枢</span>
            <span>校园事务 · 协同有序</span>
          </footer>
        </main>
      </div>
    </div>
  )
}
