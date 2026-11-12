import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowUpRight,
  ChevronRight,
  CircleDot,
  Clock3,
  Flame,
  Lightbulb,
  Radar,
  Sparkles,
  Star,
  TrendingUp,
} from 'lucide-react'
import { useApi } from '../../lib/useApi'
import type { InsightsData } from '../../types'
import { PageHeader } from '../../components/layout/AppShell'
import { DeptAvatar, EmptyState, ProgressRing, SkeletonPage } from '../../components/ui'

const categoryColors = ['#687f70', '#8fa495', '#b3c3b5', '#d0dcd1', '#9cae9d', '#dfe7e0', '#7a8e80', '#c1cec4']

export function CounselorInsights() {
  const navigate = useNavigate()
  const { data, loading, error, reload } = useApi<InsightsData>('/counselor/insights')

  const donut = useMemo(() => {
    if (!data?.categories.length) return '#e9eeea'
    const total = data.categories.reduce((sum, item) => sum + item.value, 0) || 1
    let cursor = 0
    const stops = data.categories.map((item, index) => {
      const start = cursor
      cursor += (item.value / total) * 100
      return `${categoryColors[index % categoryColors.length]} ${start}% ${cursor}%`
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
          <span className="insight-period">近 7 日趋势</span>
        }
      />

      <section className="insight-hero">
        <div className="insight-hero-top">
          <span className="insight-live"><i className="live-dot" />AI 复盘已更新</span>
        </div>
        <div className="insight-hero-main">
          <div>
            <span className="eyebrow">THIS WEEK</span>
            <h1><em>{summary.weekly}</em> 条新诉求</h1>
            <p>闭环率 {summary.closureRate}% · 高风险 {summary.highRisk} 条已纳入督办。</p>
          </div>
          <ProgressRing value={summary.closureRate} size={106} stroke={8} label={`${summary.closureRate}%`} sublabel="闭环率" tone="lime" />
        </div>
        <div className="insight-hero-stats">
          <div><span>满意度</span><strong>{summary.satisfaction}<small>/5</small></strong></div>
          <div><span>按时办结</span><strong>{summary.onTimeRate}<small>%</small></strong></div>
          <div><span>平均响应</span><strong>{summary.avgResponse}<small>h</small></strong></div>
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
          晚间 18:00–24:00 的诉求占全部工单的 {Math.round(((timeSlots.find((slot) => slot.name === '晚间')?.value || 0) / Math.max(summary.total, 1)) * 100)}%
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
            {categories.slice(0, 5).map((item, index) => (
              <div key={item.name}>
                <span><i style={{ background: categoryColors[index % categoryColors.length] }} />{item.name}</span>
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

      <section className="ai-suggestion">
        <span className="ai-suggestion-orb"><Lightbulb size={21} /></span>
        <div>
          <span className="eyebrow">AI SUGGESTION</span>
          <h3>{suggestion.title}</h3>
          <p>{suggestion.body}</p>
          <button
            onClick={() => {
              navigate('/counselor/tickets?overdue=true')
            }}
          >
            查看超时工单
            <ArrowUpRight size={14} />
          </button>
        </div>
        <span className="suggestion-scribble" />
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
                  <span>{department.total} 单 · 均响 {department.avgHours}h</span>
                </div>
                <div className="perf-bar"><i style={{ width: `${department.onTime}%`, background: department.color }} /></div>
              </div>
              <div className="dept-perf-score">
                <strong>{department.onTime}<small>%</small></strong>
                <span>按时</span>
              </div>
            </div>
          ))}
        </div>
      </section>



      <div className="insight-footnote">
        <CircleDot size={12} />
        统计口径包含全部协同部门
      </div>
    </div>
  )
}
