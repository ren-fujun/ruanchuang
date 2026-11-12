import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowLeftRight,
  BadgeCheck,
  Building2,
  CalendarDays,
  ChevronRight,
  ClipboardCheck,
  DoorOpen,
  GraduationCap,
  HeartHandshake,
  Info,
  LifeBuoy,
  LogOut,
  MapPin,
  Phone,
  Settings,
  ShieldCheck,
  Sparkles,
  Star,
  UserRound,
  Users,
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useApi } from '../lib/useApi'
import { useToast } from '../context/ToastContext'
import type { Department } from '../types'
import { PageHeader } from '../components/layout/AppShell'
import { Avatar, BrandMark, Sheet } from '../components/ui'

export function ProfilePage() {
  const { user, signOut } = useAuth()
  const navigate = useNavigate()
  const { toast } = useToast()
  const isStudent = user?.role === 'student'
  const { data } = useApi<any>(isStudent ? '/student/home' : '/counselor/dashboard')
  const { data: deptData } = useApi<{ departments: Department[] }>('/departments')
  const [switchOpen, setSwitchOpen] = useState(false)
  const [aboutOpen, setAboutOpen] = useState(false)
  const [privacyOpen, setPrivacyOpen] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)
  const [departmentsOpen, setDepartmentsOpen] = useState(false)

  if (!user) return null

  const stats = isStudent
    ? [
        { label: '累计诉求', value: data?.stats?.total ?? '—' },
        { label: '正在推进', value: data?.stats?.active ?? '—' },
        { label: '已办结', value: data?.stats?.completed ?? '—' },
      ]
    : [
        { label: '在册学生', value: user.studentCount ?? 286 },
        { label: '待我审核', value: data?.stats?.pending ?? '—' },
        { label: '按时办结', value: `${data?.stats?.onTimeRate ?? 96}%` },
      ]

  const handleSwitch = async () => {
    await signOut()
    navigate('/login', { replace: true })
  }

  const showComingSoon = (label: string) => {
    toast(`${label}将在下一版本开放，当前演示版聚焦诉求协同主流程。`, 'info')
  }

  return (
    <div className="page profile-page">
      <PageHeader
        title="我的"
        right={
          <button className="icon-button" onClick={() => setAboutOpen(true)} aria-label="设置">
            <Settings size={19} />
          </button>
        }
      />

      <section className="profile-hero">
        <div className="profile-hero-grid" />
        <div className="profile-topline">
          <span className="profile-role-chip">
            {isStudent ? <GraduationCap size={13} /> : <Sparkles size={13} />}
            {isStudent ? '学生身份' : '辅导员身份'}
          </span>
          <span className="profile-verified"><BadgeCheck size={13} /> 已认证</span>
        </div>
        <div className="profile-main">
          <Avatar name={user.name} tone={user.avatarTone} size={72} online />
          <div className="profile-identity">
            <h1>{user.name}</h1>
            <p>{isStudent ? `${user.major} · ${user.className}` : user.title}</p>
            <span>{isStudent ? `学号 ${user.studentNo}` : user.scope}</span>
          </div>
        </div>
        <div className="profile-tags">
          <span><MapPin size={12} />{user.college}</span>
          {isStudent ? (
            <span><UserRound size={12} />辅导员 {user.counselor}</span>
          ) : (
            <span><Users size={12} />{user.studentCount} 名学生</span>
          )}
        </div>
        <span className="profile-hero-orbit" />
      </section>

      <section className="profile-stats">
        {stats.map((item) => (
          <div key={item.label}>
            <strong>{item.value}</strong>
            <span>{item.label}</span>
          </div>
        ))}
      </section>

      {!isStudent && (
        <section className="duty-card">
          <div className="duty-icon"><CalendarDays size={19} /></div>
          <div>
            <span className="eyebrow">ON DUTY</span>
            <strong>{user.onDuty}</strong>
            <p>值班期间，高风险工单将优先推送至你的手机。</p>
          </div>
          <span className="duty-live"><i />在岗</span>
        </section>
      )}

      <section className="profile-section">
        <div className="profile-section-title">
          <strong>{isStudent ? '我的服务' : '协同工作'}</strong>
        </div>
        <div className="menu-card">
          {isStudent ? (
            <>
              <button onClick={() => navigate('/student/tickets?filter=completed')}>
                <span className="menu-icon mint"><Star size={17} /></span>
                <span className="menu-copy"><strong>我的评价</strong><small>回看每一次服务的反馈</small></span>
                <ChevronRight size={16} />
              </button>
              <button onClick={() => setHelpOpen(true)}>
                <span className="menu-icon peach"><LifeBuoy size={17} /></span>
                <span className="menu-copy"><strong>帮助与反馈</strong><small>常见问题与人工入口</small></span>
                <ChevronRight size={16} />
              </button>
              <button onClick={() => setPrivacyOpen(true)}>
                <span className="menu-icon blue"><ShieldCheck size={17} /></span>
                <span className="menu-copy"><strong>隐私与安全</strong><small>谁可以看到我的诉求</small></span>
                <ChevronRight size={16} />
              </button>
            </>
          ) : (
            <>
              <button onClick={() => navigate('/counselor/dorm-check')}>
                <span className="menu-icon mint"><DoorOpen size={17} /></span>
                <span className="menu-copy"><strong>宿舍查寝</strong><small>夜间查寝打卡与异常记录</small></span>
                <ChevronRight size={16} />
              </button>
              <button onClick={() => navigate('/counselor/tickets?status=pending_review')}>
                <span className="menu-icon mint"><ClipboardCheck size={17} /></span>
                <span className="menu-copy"><strong>待我审核</strong><small>{data?.stats?.pending ?? 0} 条新诉求等待复核</small></span>
                <span className="menu-count">{data?.stats?.pending ?? 0}</span>
                <ChevronRight size={16} />
              </button>
              <button onClick={() => setDepartmentsOpen(true)}>
                <span className="menu-icon blue"><Building2 size={17} /></span>
                <span className="menu-copy"><strong>协同部门</strong><small>6 个部门 · 权责字典</small></span>
                <ChevronRight size={16} />
              </button>
              <button onClick={() => showComingSoon('值班日历')}>
                <span className="menu-icon peach"><CalendarDays size={17} /></span>
                <span className="menu-copy"><strong>值班与提醒</strong><small>高风险工单优先推送设置</small></span>
                <ChevronRight size={16} />
              </button>
            </>
          )}
        </div>
      </section>

      <section className="profile-section">
        <div className="profile-section-title">
          <strong>账号与支持</strong>
        </div>
        <div className="menu-card">
          <button onClick={() => setAboutOpen(true)}>
            <span className="menu-icon neutral"><Info size={17} /></span>
            <span className="menu-copy"><strong>关于智汇中枢</strong><small>版本 1.0.0 · 移动协同端</small></span>
            <ChevronRight size={16} />
          </button>
          <button onClick={() => setSwitchOpen(true)}>
            <span className="menu-icon neutral"><ArrowLeftRight size={17} /></span>
            <span className="menu-copy"><strong>切换演示身份</strong><small>{isStudent ? '进入辅导员协同中枢' : '进入学生诉求端'}</small></span>
            <ChevronRight size={16} />
          </button>
        </div>
      </section>

      <button className="signout-button" onClick={() => setSwitchOpen(true)}>
        <LogOut size={16} />
        退出当前身份
      </button>

      <footer className="profile-footer">
        <BrandMark size={28} tone="dark" />
        <span>智汇中枢 · 给诉求赋权，给基层减负</span>
      </footer>

      <Sheet
        open={switchOpen}
        onClose={() => setSwitchOpen(false)}
        title="要离开当前身份吗？"
        eyebrow="SWITCH IDENTITY"
        footer={
          <>
            <button className="secondary-button" onClick={() => setSwitchOpen(false)}>留在原地</button>
            <button className="primary-button" onClick={handleSwitch}>切换身份</button>
          </>
        }
      >
        <div className="switch-sheet">
          <span className="switch-icon"><ArrowLeftRight size={24} /></span>
          <p>退出后将回到身份选择页。演示数据会保留，你可以随时用另一个视角重新进入。</p>
        </div>
      </Sheet>

      <Sheet
        open={aboutOpen}
        onClose={() => setAboutOpen(false)}
        title="智汇中枢"
        eyebrow="ABOUT ZHIHUI"
      >
        <div className="about-sheet">
          <BrandMark size={64} tone="dark" />
          <h3>让每一次求助，都有回响。</h3>
          <p>以辅导员为流转中枢、AI 为调度引擎的学院级学生事务协同督办平台。移动端聚焦学生诉求表达与辅导员审核督办。</p>
          <div className="about-meta">
            <span>版本 1.0.0</span>
            <span>2026 · 移动协同端</span>
          </div>
          <div className="about-depts">
            {['宿管中心', '后勤保障', '学院办公室', '信息中心', '保卫处', '心理中心'].map((item) => (
              <span key={item}>{item}</span>
            ))}
          </div>
        </div>
      </Sheet>

      <Sheet
        open={privacyOpen}
        onClose={() => setPrivacyOpen(false)}
        title="你的诉求，被这样保护"
        eyebrow="PRIVACY & SAFETY"
      >
        <div className="privacy-sheet">
          <div>
            <ShieldCheck size={18} />
            <span><strong>最小可见</strong><p>学生仅可见本人工单，部门仅可见分派给自己的工单。</p></span>
          </div>
          <div>
            <HeartHandshake size={18} />
            <span><strong>敏感信息保护</strong><p>心理支持类工单默认隐藏联系方式，仅辅导员与心理中心可见。</p></span>
          </div>
          <div>
            <Sparkles size={18} />
            <span><strong>AI 有边界</strong><p>AI 仅用于摘要、分类与风险提示，不替代人工判断，不自动对外发送。</p></span>
          </div>
          <div>
            <Phone size={18} />
            <span><strong>紧急求助</strong><p>如你或同学处于紧急危险中，请立即拨打 120 / 110，或联系辅导员。</p></span>
          </div>
        </div>
      </Sheet>

      <Sheet
        open={helpOpen}
        onClose={() => setHelpOpen(false)}
        title="需要一点帮助？"
        eyebrow="HELP & FEEDBACK"
      >
        <div className="help-sheet">
          <div className="help-faq">
            <strong>诉求提交后多久会被看到？</strong>
            <p>处理时间需由学校确认；系统会提示辅导员优先关注高风险工单。</p>
          </div>
          <div className="help-faq">
            <strong>可以撤回或修改诉求吗？</strong>
            <p>审核前可在工单详情补充说明；如需撤回，请直接联系辅导员。</p>
          </div>
          <div className="help-contact">
            <span><Phone size={17} /></span>
            <div><strong>联系辅导员</strong><small>联系方式请以学校官方渠道为准</small></div>
          </div>
          <button className="help-feedback" onClick={() => toast('反馈入口已记录，感谢你的建议。', 'success')}>
            提交产品建议
          </button>
        </div>
      </Sheet>

      <Sheet
        open={departmentsOpen}
        onClose={() => setDepartmentsOpen(false)}
        title="协同部门与权责"
        eyebrow="RESPONSIBILITY DICTIONARY"
      >
        <div className="department-sheet">
          {(deptData?.departments || []).map((department) => (
            <div className="department-sheet-row" key={department.id}>
              <span
                className="department-symbol"
                style={{ background: department.soft, color: department.color }}
              >
                {department.short.slice(0, 1)}
              </span>
              <div>
                <strong>{department.name}</strong>
                <span>{department.contact}</span>
              </div>
              <em>{department.sla / 60}h SLA</em>
            </div>
          ))}
        </div>
      </Sheet>
    </div>
  )
}
