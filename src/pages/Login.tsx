import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowRight,
  Fingerprint,
  GraduationCap,
  LockKeyhole,
  Radar,
  ShieldCheck,
  Sparkles,
  UserRound,
  Workflow,
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { BrandMark } from '../components/ui'
import type { Role } from '../types'

const accounts = {
  student: { account: '20230118', password: '123456' },
  counselor: { account: 'chenyuan', password: '123456' },
}

export function LoginPage() {
  const { user, signIn, demoSignIn } = useAuth()
  const navigate = useNavigate()
  const [role, setRole] = useState<Role>('student')
  const [account, setAccount] = useState(accounts.student.account)
  const [password, setPassword] = useState(accounts.student.password)
  const [loading, setLoading] = useState<'form' | 'demo' | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    if (user) navigate(user.role === 'student' ? '/student/home' : '/counselor/home', { replace: true })
  }, [user, navigate])

  const chooseRole = (next: Role) => {
    setRole(next)
    setAccount(accounts[next].account)
    setPassword(accounts[next].password)
    setError('')
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setError('')
    setLoading('form')
    try {
      const signed = await signIn(account, password, role)
      navigate(signed.role === 'student' ? '/student/home' : '/counselor/home', { replace: true })
    } catch (err: any) {
      setError(err?.message || '登录失败，请稍后再试。')
    } finally {
      setLoading(null)
    }
  }

  const quickEnter = async (target: Role) => {
    setError('')
    setLoading('demo')
    try {
      const signed = await demoSignIn(target)
      navigate(signed.role === 'student' ? '/student/home' : '/counselor/home', { replace: true })
    } catch (err: any) {
      setError(err?.message || '演示入口暂时不可用。')
    } finally {
      setLoading(null)
    }
  }

  return (
    <div className="login-stage">
      <div className="login-grid" />
      <div className="login-glow glow-a" />
      <div className="login-glow glow-b" />

      <section className="login-story">
        <div className="login-brand">
          <BrandMark size={46} tone="light" />
          <div>
            <strong>智汇中枢</strong>
            <span>ZHIHUI ORBIT</span>
          </div>
        </div>
        <div className="login-story-copy">
          <div className="login-kicker">
            <span className="live-dot" />
            AI · CAMPUS COORDINATION
          </div>
          <h1>
            让每一声求助，
            <br />
            <em>都有回响。</em>
          </h1>
          <p>以辅导员为流转中枢，把散落的诉求变成一条清晰、可追踪、有温度的处理路径。</p>
        </div>

        <div className="login-features">
          <div>
            <span><ScanIcon /></span>
            <strong>AI 前置预检</strong>
            <p>先理解，再分派</p>
          </div>
          <div>
            <span><Workflow size={18} /></span>
            <strong>跨部门协同</strong>
            <p>权责清晰可追溯</p>
          </div>
          <div>
            <span><Radar size={18} /></span>
            <strong>SLA 督办</strong>
            <p>超时自动升级</p>
          </div>
        </div>

        <div className="login-orbit" aria-hidden="true">
          <div className="login-orbit-ring orbit-1" />
          <div className="login-orbit-ring orbit-2" />
          <div className="login-orbit-ring orbit-3" />
          <div className="login-orbit-core">
            <Sparkles size={22} />
          </div>
          <span className="login-orbit-node n1" />
          <span className="login-orbit-node n2" />
          <span className="login-orbit-node n3" />
          <span className="login-orbit-label label-a">诉求</span>
          <span className="login-orbit-label label-b">协同</span>
          <span className="login-orbit-label label-c">督办</span>
        </div>

        <div className="login-story-foot">
          <span>给诉求赋权</span>
          <i />
          <span>给基层减负</span>
        </div>
      </section>

      <section className="login-panel-wrap">
        <div className="login-panel">
          <div className="mobile-brand">
            <BrandMark size={38} tone="dark" />
            <div>
              <strong>智汇中枢</strong>
              <span>辅导员跨部门协同督办系统</span>
            </div>
          </div>

          <header className="login-panel-head">
            <div className="eyebrow">WELCOME BACK</div>
            <h2>回到你的中枢</h2>
            <p>选择身份，进入移动协同工作台。</p>
          </header>

          <div className="role-switch" role="tablist" aria-label="选择身份">
            <button
              type="button"
              role="tab"
              aria-selected={role === 'student'}
              className={role === 'student' ? 'active' : ''}
              onClick={() => chooseRole('student')}
            >
              <GraduationCap size={18} />
              学生端
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={role === 'counselor'}
              className={role === 'counselor' ? 'active' : ''}
              onClick={() => chooseRole('counselor')}
            >
              <Fingerprint size={18} />
              辅导员端
            </button>
            <span className={`role-slider ${role}`} />
          </div>

          <form onSubmit={submit} className="login-form">
            <label className="field">
              <span>{role === 'student' ? '学号' : '辅导员账号'}</span>
              <div className="field-control">
                <UserRound size={17} />
                <input
                  value={account}
                  onChange={(event) => setAccount(event.target.value)}
                  placeholder={role === 'student' ? '请输入学号' : '请输入账号'}
                  autoComplete="username"
                />
              </div>
            </label>
            <label className="field">
              <span>密码</span>
              <div className="field-control">
                <LockKeyhole size={17} />
                <input
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="请输入密码"
                  autoComplete="current-password"
                />
              </div>
            </label>

            {error && <div className="form-error">{error}</div>}

            <button className="primary-button login-submit" type="submit" disabled={loading !== null}>
              {loading === 'form' ? (
                <span className="button-loading">正在进入中枢…</span>
              ) : (
                <>
                  进入{role === 'student' ? '学生端' : '辅导员端'}
                  <ArrowRight size={18} />
                </>
              )}
            </button>
          </form>

          <div className="quick-demo">
            <div className="quick-demo-rule">
              <span>或直接体验</span>
            </div>
            <div className="quick-demo-actions">
              <button type="button" onClick={() => quickEnter('student')} disabled={loading !== null}>
                <span className="demo-orb student-orb">林</span>
                <span>
                  <strong>学生视角</strong>
                  <small>提交 · 追踪 · 评价</small>
                </span>
                <ArrowRight size={15} />
              </button>
              <button type="button" onClick={() => quickEnter('counselor')} disabled={loading !== null}>
                <span className="demo-orb counselor-orb">陈</span>
                <span>
                  <strong>辅导员视角</strong>
                  <small>审核 · 分派 · 督办</small>
                </span>
                <ArrowRight size={15} />
              </button>
            </div>
          </div>

          <div className="login-privacy">
            <ShieldCheck size={14} />
            演示账号已预填 · 数据仅用于产品体验
          </div>
        </div>
      </section>
    </div>
  )
}

function ScanIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M4 8V5a1 1 0 0 1 1-1h3M20 8V5a1 1 0 0 0-1-1h-3M4 16v3a1 1 0 0 0 1 1h3M20 16v3a1 1 0 0 1-1 1h-3" />
      <path d="M8 12h8" strokeLinecap="round" />
    </svg>
  )
}
