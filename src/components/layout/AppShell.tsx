import { useEffect, useRef } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { ArrowLeft, Bell, Sparkles } from 'lucide-react'
import type { ReactNode } from 'react'
import { BottomNav } from './BottomNav'
import { BrandMark } from '../ui'
import type { Role } from '../../types'

export function AppShell({ role }: { role: Role }) {
  const location = useLocation()
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior })
  }, [location.pathname])

  useEffect(() => {
    document.body.classList.toggle('theme-student', role === 'student')
    return () => document.body.classList.remove('theme-student')
  }, [role])

  return (
    <div className={`app-stage role-${role}`}>
      <div className="stage-aurora aurora-one" />
      <div className="stage-aurora aurora-two" />
      <aside className="stage-brand">
        <div className="stage-brand-top">
          <BrandMark size={46} tone="light" />
          <div>
            <strong>智汇中枢</strong>
            <span>ZHIHUI ORBIT</span>
          </div>
        </div>
        <div className="stage-brand-copy">
          <p className="stage-kicker">CAMPUS REQUEST ORCHESTRATION</p>
          <h1>
            把每一次
            <br />
            求助，接住。
          </h1>
          <p className="stage-desc">给诉求赋权，给基层减负。让跨部门协同不再靠人情，而靠一条清晰、可追踪的路径。</p>
        </div>
        <div className="stage-dept-row">
          {['后勤保障', '宿管中心', '学院办公室', '信息中心', '保卫处', '心理中心'].map((name) => (
            <span key={name}>{name}</span>
          ))}
        </div>
        <div className="stage-brand-footer">
          <span className="live-dot" />
          AI 中枢在线 · 6 个协同部门
        </div>
      </aside>

      <main className="app-device">
        <div className="device-chrome">
          <span className="device-time">9:41</span>
          <span className="device-island" />
          <span className="device-signals">
            <i />
            <i />
            <i />
          </span>
        </div>
        <div className="app-scroll" ref={scrollRef}>
          <Outlet />
        </div>
        <BottomNav role={role} />
      </main>

      <aside className="stage-status">
        <div className="status-panel">
          <div className="status-panel-head">
            <span className="live-dot" />
            LIVE · 实时协同
          </div>
          <div className="status-orbit">
            <div className="orbit-ring ring-a" />
            <div className="orbit-ring ring-b" />
            <div className="orbit-core">
              <Sparkles size={20} />
            </div>
            <span className="orbit-node node-a" />
            <span className="orbit-node node-b" />
            <span className="orbit-node node-c" />
          </div>
          <div className="status-panel-copy">
            <strong>AI 正在守候</strong>
            <p>诉求预检、风险识别、要素提取，在提交的瞬间完成。</p>
          </div>
        </div>
        <div className="status-mini-grid">
          <div>
            <strong>4.8</strong>
            <span>服务满意度</span>
          </div>
          <div>
            <strong>96%</strong>
            <span>按时办结</span>
          </div>
        </div>
        <p className="stage-fineprint">
          <Bell size={12} /> 这是一套以辅导员为流转中枢的校园协同督办系统
        </p>
      </aside>
    </div>
  )
}

export function PageHeader({
  title,
  eyebrow,
  back = false,
  right,
  transparent = false,
  className = '',
}: {
  title: string
  eyebrow?: string
  back?: boolean
  right?: ReactNode
  transparent?: boolean
  className?: string
}) {
  const navigate = useNavigate()
  return (
    <header className={`page-header ${transparent ? 'transparent' : ''} ${className}`}>
      <div className="page-header-row">
        {back ? (
          <button className="icon-button" onClick={() => navigate(-1)} aria-label="返回">
            <ArrowLeft size={19} />
          </button>
        ) : (
          <div className="page-header-dot">
            <span />
          </div>
        )}
        <div className="page-header-titles">
          {eyebrow && <span className="eyebrow">{eyebrow}</span>}
          <h1>{title}</h1>
        </div>
        <div className="page-header-right">{right}</div>
      </div>
    </header>
  )
}
