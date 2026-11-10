import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowUpRight,
  ChevronRight,
  CircleDot,
  Clock3,
  Download,
  Flame,
  Lightbulb,
  Radar,
  Sparkles,
  Star,
  TrendingUp,
} from 'lucide-react'
import { useApi } from '../../lib/useApi'
import { useToast } from '../../context/ToastContext'
import type { InsightsData } from '../../types'
import { PageHeader } from '../../components/layout/AppShell'
import { DeptAvatar, EmptyState, ProgressRing, SkeletonPage } from '../../components/ui'

export function CounselorInsights() {
  const navigate = useNavigate()
  const { toast } = useToast()
  const { data, loading, error, reload } = useApi<InsightsData>('/counselor/insights')
  const [range, setRange] = useState<'7' | '30'>('7')

  const donut = useMemo(() => {
    if (!data) return ''
    const total = data.categories.reduce((sum, item) => sum + item.value, 0) || 1
    let cursor = 0
    const stops = data.categories.map((item) => {
      const start = cursor
      cursor += (item.value / total) * 100
      return `${item.color} ${start}% ${cursor}%`
    })
    return `conic-gradient(from -90deg, ${stops.join(', ')})`
  }, [data])

  if (loading && !data) return <SkeletonPage />
  if (error && !data) {
    return (
      <div className="page">
        <EmptyState title="洞察加载失败" body={error} action={<button className="primary-button small" onClick={reload}>重新加载</button>} />
      </div>
    )
  }
  if (!data) return null

  const { summary, week, categories, departments, hotTags, timeSlots, risk, suggestion } = data
  const weekMax = Math.max(...week.map((day) => Math.max(day.created, day.completed)), 1)
  const totalCategory = categories.reduce((sum, item) => sum + item.value, 0) || 1
  const maxTag = Math.max(...hotTags.map((tag) => tag.value), 1)
  const maxSlot = Math.max(...timeSlots.map((slot) => slot.value), 1)

  return (
    <div className="page insights-page">
      <PageHeader
        eyebrow="INSIGHT STUDIO"
        title="协同洞察"
        right={
          <div className="range-switch">
            <button className={range === '7' ? 'active' : ''} onClick={() => setRange('7')}>7天</button>
            <button
              onClick={() => {
                toast('近 30 天完整报表将在管理端开放，当前演示使用近 7 天数据。', 'info')
              }}
            >
              30天
            </button>
          </div>
        }
      />

      <section className="insight-hero">
        <div className="insight-hero-top">
          <span className="insight-live"><i className="live-dot" />AI 复盘已更新</span>
          <button
            onClick={() => {
              toast('数据报表将在管理端版本开放导出。', 'info')
            }}
          >
            <Download size={14} />
            导出
          </button>
        </div>
        <div className="insight-hero-main">
          <div>
            <span className="eyebrow">THIS WEEK</span>
            <h1><em>{summary.weekly}</em> 条新诉求</h1>
            <p>累计闭环率 {summary.closureRate == null ? '暂无数据' : `${summary.closureRate}%`} · 高风险 {summary.highRisk} 条需要关注。</p>
          </div>
          <ProgressRing value={summary.closureRate ?? 0} size={106} stroke={8} label={summary.closureRate == null ? '暂无' : `${summary.closureRate}%`} sublabel="累计闭环" tone="lime" />
        </div>
        <div className="insight-hero-stats">
          <div><span>满意度</span><strong>{summary.satisfaction == null ? '暂无' : summary.satisfaction}<small>{summary.satisfaction == null ? '' : '/5'}</small></strong></div>
          <div><span>按时办结</span><strong>{summary.onTimeRate == null ? '暂无' : summary.onTimeRate}<small>{summary.onTimeRate == null ? '' : '%'}</small></strong></div>
          <div><span>平均分派用时</span><strong>{summary.avgResponse == null ? '暂无' : summary.avgResponse}<small>{summary.avgResponse == null ? '' : 'h'}</small></strong></div>
          <div><span>高风险</span><strong className="coral-text">{summary.highRisk}<small>条</small></strong></div>
        </div>
        <span className="insight-orbit" />
      </section>

      <section className="insight-chart-card">
        <div className="chart-head">
          <div>
            <span className="eyebrow">REQUEST RHYTHM</span>
            <h2>一周诉求节奏</h2>
          </div>
          <div className="chart-legend">
            <span><i className="created" />受理</span>
            <span><i className="completed" />办结</span>
          </div>
        </div>
        <div className="big-chart">
          <div className="chart-grid-lines">
            <span /><span /><span /><span />
          </div>
          {week.map((day) => (
            <div className="big-chart-col" key={day.key}>
              <div className="big-chart-bars">
                <span className="chart-tooltip created-tip">{day.created}</span>
                <span className="big-bar created" style={{ height: `${Math.max(3, (day.created / weekMax) * 100)}%` }} />
                <span className="big-bar completed" style={{ height: `${Math.max(3, (day.completed / weekMax) * 100)}%` }} />
              </div>
              <em>{day.label}</em>
              <small>{day.date}</small>
            </div>
          ))}
        </div>
        <div className="chart-note">
          <TrendingUp size={14} />
          晚间 18:00–24:00 的诉求占全部工单的 {summary.total ? Math.round(((timeSlots.find((slot) => slot.name === '晚间')?.value || 0) / summary.total) * 100) : 0}%
        </div>
      </section>

      <section className="insight-donut-card">
        <div className="chart-head">
          <div>
            <span className="eyebrow">CATEGORY MIX</span>
            <h2>诉求类型分布</h2>
          </div>
          <span className="chart-total">{summary.total} 条</span>
        </div>
        <div className="donut-layout">
          <div className="donut" style={{ background: donut }}>
            <div className="donut-hole">
              <strong>{categories[0]?.value || 0}</strong>
              <span>最多 · {categories[0]?.name}</span>
            </div>
          </div>
          <div className="donut-legend">
            {categories.slice(0, 5).map((item) => (
              <div key={item.name}>
                <span><i style={{ background: item.color }} />{item.name}</span>
                <strong>{Math.round((item.value / totalCategory) * 100)}%</strong>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="insight-pair-grid">
        <div className="mini-insight-card">
          <div className="chart-head compact">
            <div><span className="eyebrow">HOT TAGS</span><h2>高频关键词</h2></div>
            <Flame size={16} className="flame" />
          </div>
          <div className="tag-cloud">
            {hotTags.slice(0, 6).map((tag, index) => (
              <span
                key={tag.name}
                className={`cloud-tag cloud-${index % 4}`}
                style={{ opacity: 0.68 + (tag.value / maxTag) * 0.32 }}
              >
                {tag.name}
              </span>
            ))}
          </div>
        </div>
        <div className="mini-insight-card">
          <div className="chart-head compact">
            <div><span className="eyebrow">TIME OF DAY</span><h2>提交时段</h2></div>
            <Clock3 size={16} />
          </div>
          <div className="time-slots">
            {timeSlots.map((slot) => (
              <div key={slot.name}>
                <span>{slot.name}<small>{slot.range}</small></span>
                <div><i style={{ width: `${Math.max(4, (slot.value / maxSlot) * 100)}%` }} /></div>
                <strong>{slot.value}</strong>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="risk-distribution">
        <div className="chart-head compact">
          <div><span className="eyebrow">RISK LAYERS</span><h2>风险分层</h2></div>
          <Radar size={16} />
        </div>
        <div className="risk-stack-bar">
          <span className="risk-seg high" style={{ width: `${(risk.high / Math.max(risk.high + risk.medium + risk.low, 1)) * 100}%` }} />
          <span className="risk-seg medium" style={{ width: `${(risk.medium / Math.max(risk.high + risk.medium + risk.low, 1)) * 100}%` }} />
          <span className="risk-seg low" style={{ width: `${(risk.low / Math.max(risk.high + risk.medium + risk.low, 1)) * 100}%` }} />
        </div>
        <div className="risk-stack-legend">
          <div><i className="high" /><span>高风险</span><strong>{risk.high}</strong></div>
          <div><i className="medium" /><span>需关注</span><strong>{risk.medium}</strong></div>
          <div><i className="low" /><span>常规</span><strong>{risk.low}</strong></div>
        </div>
      </section>

      <section className="dept-performance">
        <div className="chart-head">
          <div><span className="eyebrow">DEPARTMENT PULSE</span><h2>部门协同效率</h2></div>
          <button className="text-action" onClick={() => navigate('/counselor/tickets')}>查看工单<ChevronRight size={13} /></button>
        </div>
        <div className="dept-perf-list">
          {departments.map((department) => (
            <div className="dept-perf-row" key={department.id}>
              <DeptAvatar department={department} size={36} />
              <div className="dept-perf-main">
                <div>
                  <strong>{department.short}</strong>
                  <span>{department.total} 单 · 工单分派均时 {department.observedAvgHours == null ? '暂无' : `${department.observedAvgHours}h`}</span>
                </div>
                <div className="perf-bar"><i style={{ width: `${department.observedOnTime ?? 0}%`, background: department.color }} /></div>
              </div>
              <div className="dept-perf-score">
                <strong>{department.observedOnTime == null ? '暂无' : department.observedOnTime}<small>{department.observedOnTime == null ? '' : '%'}</small></strong>
                <span>关联工单按时率</span>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="ai-suggestion">
        <span className="ai-suggestion-orb"><Lightbulb size={21} /></span>
        <div>
          <span className="eyebrow">AI SUGGESTION</span>
          <h3>{suggestion.title}</h3>
          <p>{suggestion.body}</p>
          <button
            onClick={() => {
              toast('专项治理建议已加入待办，可在管理端查看。', 'success')
            }}
          >
            {suggestion.action}
            <ArrowUpRight size={14} />
          </button>
        </div>
        <span className="suggestion-scribble" />
      </section>

      <div className="insight-footnote">
        <CircleDot size={12} />
        数据每 10 分钟刷新 · 统计口径包含全部协同部门
      </div>
    </div>
  )
}
