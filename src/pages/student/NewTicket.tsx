import { useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import type { ChangeEvent } from 'react'
import {
  ArrowLeft,
  ArrowRight,
  BedDouble,
  Check,
  CheckCircle2,
  ChevronRight,
  FileImage,
  FileText,
  GraduationCap,
  HeartHandshake,
  ImagePlus,
  LoaderCircle,
  MapPin,
  Mic,
  MoreHorizontal,
  Phone,
  Shield,
  ShieldAlert,
  Sparkles,
  Trash2,
  Wifi,
  Wrench,
  X,
} from 'lucide-react'
import { api, getToken } from '../../lib/api'
import { useToast } from '../../context/ToastContext'
import type { PrecheckResult, Ticket } from '../../types'
import { PageHeader } from '../../components/layout/AppShell'
import { RiskBadge } from '../../components/ui'

const categoryOptions = [
  { name: '宿舍生活', icon: BedDouble },
  { name: '校园设施', icon: Wrench },
  { name: '学籍教务', icon: FileText },
  { name: '奖助资助', icon: GraduationCap },
  { name: '心理支持', icon: HeartHandshake },
  { name: '安全保卫', icon: Shield },
  { name: '网络服务', icon: Wifi },
  { name: '其他', icon: MoreHorizontal },
]

const locations = ['学生公寓', '图书馆', '教学楼', '线上咨询']
const urgencyOptions = [
  { key: 'normal', label: '普通' },
  { key: 'high', label: '较急' },
  { key: 'urgent', label: '紧急' },
]

const formatSize = (bytes: number) => {
  if (bytes < 1024 * 1024) return `${Math.ceil(bytes / 1024)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

export function NewTicket() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { toast } = useToast()
  const initialCategory = searchParams.get('category')
  const hint = searchParams.get('hint')
  const draftKey = `zhihui_student_draft_${getToken().slice(-10) || 'guest'}`
  const savedDraft = (() => {
    try { return JSON.parse(localStorage.getItem(draftKey) || 'null') as { category?: string; text?: string; location?: string; urgency?: string } | null }
    catch { return null }
  })()
  const [step, setStep] = useState(1)
  const [category, setCategory] = useState(
    categoryOptions.some((item) => item.name === initialCategory) ? initialCategory! : savedDraft?.category || '智能识别',
  )
  const [text, setText] = useState(savedDraft?.text || '')
  const [location, setLocation] = useState(savedDraft?.location || '')
  const [urgency, setUrgency] = useState(savedDraft?.urgency || 'normal')
  const [attachments, setAttachments] = useState<{ name: string; type: string; size: string }[]>([])
  const [precheck, setPrecheck] = useState<PrecheckResult | null>(null)
  const [analyzing, setAnalyzing] = useState(false)
  const [precheckUnavailable, setPrecheckUnavailable] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState<Ticket | null>(null)
  const [resolved, setResolved] = useState(false)
  const [error, setError] = useState('')
  const [recognizing, setRecognizing] = useState(false)
  const recognitionRef = useRef<any>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (step === 1 && (text || location || category !== '智能识别' || urgency !== 'normal')) {
      localStorage.setItem(draftKey, JSON.stringify({ category, text, location, urgency, savedAt: Date.now() }))
    }
  }, [draftKey, category, text, location, urgency, step])

  useEffect(() => {
    return () => {
      try {
        recognitionRef.current?.stop?.()
      } catch {
        // noop
      }
    }
  }, [])

  const startAnalysis = async () => {
    if (text.trim().length < 6) {
      setError('再多说一点点吧，至少 6 个字，AI 才能理解发生了什么。')
      return
    }
    setError('')
    setStep(2)
    setAnalyzing(true)
    setPrecheck(null)
    setPrecheckUnavailable(false)
    try {
      const [result] = await Promise.all([
        api.precheck({ text, category, location }),
        new Promise((resolve) => window.setTimeout(resolve, 1100)),
      ])
      setPrecheck(result)
    } catch (err: any) {
      setError(err?.message || 'AI 预检暂时不可用，你可以重试，或核对后以人工草稿提交。')
      setPrecheckUnavailable(true)
      toast('AI 预检暂时不可用，表单已保留。', 'info')
    } finally {
      setAnalyzing(false)
    }
  }

  const submitTicket = async () => {
    setSubmitting(true)
    setError('')
    try {
      const result = await api.createTicket({
        description: text,
        category: precheck?.analysis.category || (category === '智能识别' ? '其他' : category),
        location: location || '未填写地点',
        urgency: precheck?.analysis.urgency || urgency,
        attachments,
        title: text.replace(/\s+/g, '').slice(0, 24),
      })
      setSubmitted(result.ticket)
      localStorage.removeItem(draftKey)
      setStep(3)
      toast('诉求已提交，等待辅导员审核。', 'success')
      window.dispatchEvent(new CustomEvent('zhihui:refresh-unread'))
    } catch (err: any) {
      setError(err?.message || '提交失败，请稍后再试。')
      toast(err?.message || '提交失败，请稍后再试。', 'error')
    } finally {
      setSubmitting(false)
    }
  }

  const handleFiles = (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []).slice(0, 4 - attachments.length)
    const mapped = files.map((file) => ({
      name: file.name,
      type: file.type.startsWith('video') ? 'video' : 'image',
      size: formatSize(file.size),
    }))
    setAttachments((current) => [...current, ...mapped].slice(0, 4))
    event.target.value = ''
    if (mapped.length) toast(`已添加 ${mapped.length} 个附件`, 'info')
  }

  const toggleVoice = () => {
    if (recognizing) {
      recognitionRef.current?.stop?.()
      setRecognizing(false)
      return
    }
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!SpeechRecognition) {
      toast('当前浏览器暂不支持语音识别，请先用文字描述。', 'error')
      return
    }
    try {
      const recognition = new SpeechRecognition()
      recognition.lang = 'zh-CN'
      recognition.continuous = false
      recognition.interimResults = true
      recognition.onresult = (event: any) => {
        let transcript = ''
        for (let index = event.resultIndex; index < event.results.length; index += 1) {
          transcript += event.results[index][0].transcript
        }
        if (transcript) setText((current) => `${current}${current ? ' ' : ''}${transcript}`)
      }
      recognition.onerror = () => {
        setRecognizing(false)
        toast('没有听清，可以再试一次或直接打字。', 'error')
      }
      recognition.onend = () => setRecognizing(false)
      recognitionRef.current = recognition
      recognition.start()
      setRecognizing(true)
      toast('正在聆听，请开始说话…', 'info')
    } catch {
      toast('麦克风暂时不可用，请检查浏览器权限。', 'error')
    }
  }

  const resetToForm = () => {
    setStep(1)
    setPrecheck(null)
    setError('')
  }

  return (
    <div className="page new-ticket-page">
      <PageHeader
        title={step === 3 ? '提交完成' : '发起诉求'}
        back={step !== 3}
        right={
          step < 3 ? (
            <button className="text-button subtle" onClick={() => navigate(-1)}>
              取消
            </button>
          ) : undefined
        }
      />

      {step < 3 && (
        <div className="wizard-steps">
          <div className={`wizard-step ${step >= 1 ? 'active' : ''} ${step > 1 ? 'done' : ''}`}>
            <span>{step > 1 ? <Check size={12} /> : '1'}</span>
            <em>描述情况</em>
          </div>
          <i className="wizard-line" />
          <div className={`wizard-step ${step >= 2 ? 'active' : ''}`}>
            <span>2</span>
            <em>AI 预检</em>
          </div>
          <i className="wizard-line" />
          <div className="wizard-step">
            <span>3</span>
            <em>提交</em>
          </div>
        </div>
      )}

      {step === 1 && (
        <div className="wizard-body enter-up">
          <section className="wizard-intro">
            <h1>发生了什么？</h1>
            <p>说清楚发生了什么就好，AI 会帮你整理。</p>
            {hint && (
              <div className="hint-banner">
                <Sparkles size={14} />
                正在查看「{hint}」
              </div>
            )}
          </section>

          <section className="form-block">
            <div className="form-label-row">
              <label>选择类型</label>
              <span>可智能识别</span>
            </div>
            <div className="category-grid">
              {categoryOptions.map(({ name, icon: Icon }) => (
                <button
                  key={name}
                  type="button"
                  className={category === name ? 'active' : ''}
                  onClick={() => setCategory(category === name ? '智能识别' : name)}
                >
                  <Icon size={18} />
                  <strong>{name}</strong>
                  {category === name && <i className="cat-check"><Check size={10} /></i>}
                </button>
              ))}
            </div>
          </section>

          <section className="form-block">
            <div className="form-label-row">
              <label>具体说说</label>
              <span>AI 会保密处理</span>
            </div>
            <div className={`composer ${text ? 'has-text' : ''}`}>
              <textarea
                value={text}
                maxLength={800}
                onChange={(event) => {
                  setText(event.target.value)
                  setError('')
                }}
                placeholder="比如：宿舍热水已经一周不稳定，晚上十点后基本只有温水，隔壁宿舍也有同样情况…"
              />
              <div className="composer-tools">
                <button
                  type="button"
                  className={`voice-button ${recognizing ? 'recording' : ''}`}
                  onClick={toggleVoice}
                >
                  {recognizing ? <span className="voice-bars"><i /><i /><i /><i /></span> : <Mic size={16} />}
                  {recognizing ? '正在聆听…' : '语音描述'}
                </button>
                <span className="char-count">{text.length} / 800</span>
              </div>
            </div>
          </section>

          <section className="form-block">
            <div className="form-label-row">
              <label>发生在哪里？</label>
              <span>选填</span>
            </div>
            <div className="input-wrap">
              <MapPin size={17} />
              <input
                value={location}
                onChange={(event) => setLocation(event.target.value)}
                placeholder="楼栋 / 教室 / 线上"
              />
              {location && (
                <button type="button" className="input-clear" onClick={() => setLocation('')}>
                  <X size={14} />
                </button>
              )}
            </div>
            <div className="location-chips">
              {locations.map((item) => (
                <button
                  key={item}
                  type="button"
                  className={location === item ? 'active' : ''}
                  onClick={() => setLocation(location === item ? '' : item)}
                >
                  {item}
                </button>
              ))}
            </div>
          </section>

          <section className="form-block">
            <div className="form-label-row">
              <label>有多着急？</label>
            </div>
            <div className="urgency-selector">
              {urgencyOptions.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  className={`${item.key} ${urgency === item.key ? 'active' : ''}`}
                  onClick={() => setUrgency(item.key)}
                >
                  <span className="urgency-radio"><i /></span>
                  <strong>{item.label}</strong>
                </button>
              ))}
            </div>
          </section>

          <section className="form-block">
            <div className="form-label-row">
              <label>现场图片 / 视频</label>
              <span>选填</span>
            </div>
            <div className="attachment-row">
              {attachments.map((file, index) => (
                <div className="attachment-tile" key={`${file.name}-${index}`}>
                  <FileImage size={18} />
                  <span>{file.name}</span>
                  <small>{file.size}</small>
                  <button
                    type="button"
                    onClick={() => setAttachments((current) => current.filter((_, i) => i !== index))}
                    aria-label="移除附件"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              ))}
              {attachments.length < 4 && (
                <button type="button" className="attachment-add" onClick={() => fileRef.current?.click()}>
                  <ImagePlus size={20} />
                  <span>添加</span>
                </button>
              )}
              <input
                ref={fileRef}
                type="file"
                accept="image/*,video/*"
                multiple
                hidden
                onChange={handleFiles}
              />
            </div>
          </section>

          {error && <div className="form-error">{error}</div>}

          <div className="wizard-trust">
            <Shield size={14} />
            仅相关老师与经办部门可见
          </div>

          <div className="wizard-actions">
            <button className="primary-button" type="button" onClick={startAnalysis}>
              <Sparkles size={17} />
              让 AI 先看看
            </button>
            <span className="wizard-ai-note">提交前，AI 只做预检与整理</span>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="wizard-body ai-review-body enter-up">
          {analyzing ? (
            <section className="ai-scanning">
              <div className="scan-visual">
                <div className="scan-ring ring-outer" />
                <div className="scan-ring ring-inner" />
                <div className="scan-core"><Sparkles size={26} /></div>
                <span className="scan-line" />
                <span className="scan-node s1" />
                <span className="scan-node s2" />
                <span className="scan-node s3" />
              </div>
              <h2>正在读懂你的诉求…</h2>
              <p>识别类型、风险与可协助的部门。</p>
            </section>
          ) : precheckUnavailable ? (
            <section className="precheck-unavailable card">
              <div className="ai-badge"><Sparkles size={13} /> AI 暂时未能完成预检</div>
              <h2>你的描述已经为你保留</h2>
              <p>{error || '你可以稍后重试，也可以核对当前填写内容后，以人工草稿提交。辅导员会在审核时复核分类和风险。'}</p>
              <div className="review-actions">
                <button className="secondary-button" type="button" onClick={() => { setStep(1); setError('') }}>
                  <ArrowLeft size={16} /> 返回修改
                </button>
                <button className="secondary-button" type="button" onClick={startAnalysis} disabled={analyzing}>
                  <Sparkles size={16} /> 重试预检
                </button>
                <button className="primary-button" type="button" onClick={submitTicket} disabled={submitting}>
                  {submitting ? '正在提交…' : '核对后提交草稿'}
                </button>
              </div>
            </section>
          ) : precheck && (
            <>
              <section className={`ai-result-hero ${precheck.analysis.risk === 'high' ? 'risk' : ''}`}>
                <div className="ai-result-top">
                  <span className="ai-badge">
                    <Sparkles size={13} />
                    AI 预检完成
                  </span>
                  <span className="confidence">初步建议，需人工复核</span>
                </div>
                <h2>
                  {precheck.analysis.risk === 'high'
                    ? '这需要被优先看见。'
                    : precheck.canSelfSolve
                      ? '也许可以先这样解决。'
                      : '已经帮你整理好了。'}
                </h2>
                <p>{precheck.analysis.summary}</p>
                <div className="ai-human-review-note"><span>AI 工单草稿 · 仅供参考</span>请核对内容后再提交，风险提示由人工复核，不代表自动定性。</div>
                <div className="ai-tags">
                  {precheck.analysis.tags.slice(0, 3).map((tag) => (
                    <span key={tag}>#{tag}</span>
                  ))}
                </div>
                <span className="ai-result-orbit" aria-hidden="true" />
              </section>

              {precheck.analysis.risk === 'high' && (
                <section className="risk-alert-card">
                  <div className="risk-alert-icon"><ShieldAlert size={22} /></div>
                  <div>
                    <strong>你不需要一个人扛着</strong>
                    <p>{precheck.analysis.riskReason}</p>
                    <div className="risk-alert-actions">
                      <a href="tel:057188208125"><Phone size={13} /> 24h 心理援助</a>
                      <span>提交后辅导员会优先联系你</span>
                    </div>
                  </div>
                </section>
              )}

              <section className="analysis-grid">
                <div>
                  <span className="analysis-label">识别类型</span>
                  <strong>{precheck.analysis.category}</strong>
                </div>
                <div>
                  <span className="analysis-label">建议时限</span>
                  <strong>{precheck.analysis.slaMinutes >= 60 ? `${precheck.analysis.slaMinutes / 60} 小时` : `${precheck.analysis.slaMinutes} 分钟`}</strong>
                </div>
                <div>
                  <span className="analysis-label">紧急程度</span>
                  <strong className={`text-${precheck.analysis.urgency}`}>
                    {precheck.analysis.urgency === 'urgent' ? '紧急' : precheck.analysis.urgency === 'high' ? '较急' : '普通'}
                  </strong>
                </div>
                <div>
                  <span className="analysis-label">风险等级</span>
                  <strong><RiskBadge risk={precheck.analysis.risk} label={precheck.analysis.risk === 'high' ? '高风险' : precheck.analysis.risk === 'medium' ? '需关注' : '低风险'} /></strong>
                </div>
              </section>

              <section className="suggested-depts">
                <span className="analysis-label">建议协同部门</span>
                <div>
                  {precheck.analysis.suggestedDepartmentNames.map((name) => (
                    <span className="suggested-dept" key={name}>{name}</span>
                  ))}
                </div>
              </section>

              {precheck.knowledge && (
                <section className={`knowledge-answer ${precheck.canSelfSolve ? '' : 'muted'}`}>
                  <div className="knowledge-answer-head">
                    <span className="knowledge-answer-icon"><Sparkles size={16} /></span>
                    <div>
                      <small>{precheck.canSelfSolve ? '可能不需要工单' : '知识库参考'}</small>
                      <strong>{precheck.knowledge.title}</strong>
                    </div>
                    {precheck.canSelfSolve && <span className="self-solve-badge">可自助解决</span>}
                  </div>
                  <p>{precheck.answer}</p>
                  {precheck.canSelfSolve && (
                    <div className="answer-steps">
                      {precheck.knowledge.steps.map((item, index) => (
                        <div key={item}>
                          <span>{index + 1}</span>
                          {item}
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="answer-source">
                    <span>依据：校内办事指南《{precheck.knowledge.title}》· {precheck.knowledge.updatedAt} 更新</span>
                    {precheck.canSelfSolve && (
                      <button type="button" onClick={() => setResolved(true)}>
                        按指引已解决
                        <ChevronRight size={13} />
                      </button>
                    )}
                  </div>
                </section>
              )}

              {error && <div className="form-error">{error}</div>}

              <div className="review-actions">
                <button className="secondary-button" type="button" onClick={resetToForm}>
                  <ArrowLeft size={16} />
                  返回修改
                </button>
                <button className="primary-button" type="button" onClick={submitTicket} disabled={submitting}>
                  {submitting ? <LoaderCircle size={17} className="spin" /> : <ArrowRight size={17} />}
                  {submitting ? '正在提交…' : precheck.canSelfSolve ? '仍要提交' : '确认提交'}
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {resolved && (
        <div className="resolved-layer">
          <div className="resolved-card">
            <div className="resolved-icon"><CheckCircle2 size={34} /></div>
            <h2>很高兴帮到你。</h2>
            <p>问题解决了就好。如果再次出现，随时回来。</p>
            <button className="primary-button" onClick={() => navigate('/student/home')}>回到首页</button>
            <button className="text-button" onClick={() => setResolved(false)}>还没解决，继续提交</button>
          </div>
        </div>
      )}

      {step === 3 && submitted && (
        <div className="submit-success enter-up">
          <div className="success-orbit">
            <div className="success-ring" />
            <div className="success-core"><Check size={29} /></div>
          </div>
          <div className="eyebrow">提交编号 · {submitted.id}</div>
          <h1>已经接住了。</h1>
          <p>
            {submitted.risk === 'high'
              ? '已标记为优先关注，辅导员会尽快联系你。'
              : '已进入辅导员审核队列，有进展会通知你。'}
          </p>

          <div className="success-ticket">
            <div className="success-ticket-top">
              <span>{submitted.category}</span>
              <span className={`risk-pill ${submitted.risk}`}>{submitted.risk === 'high' ? '优先关注' : '已受理'}</span>
            </div>
            <h3>{submitted.title}</h3>
            <div className="success-ticket-meta">
              <span><MapPin size={12} />{submitted.location}</span>
              <span>时限 {submitted.slaMinutes >= 60 ? `${submitted.slaMinutes / 60}h` : `${submitted.slaMinutes}m`}</span>
            </div>
          </div>

          <div className="success-actions">
            <button className="primary-button" onClick={() => navigate(`/student/tickets/${submitted.id}`)}>
              查看办理进度
              <ArrowRight size={17} />
            </button>
            <button className="text-button" onClick={() => navigate('/student/home')}>回到首页</button>
          </div>
          <div className="success-flow" aria-label="诉求办理流程">
            <span className="complete">已提交</span><i /><span>辅导员审核</span><i /><span>部门办理</span><i /><span>你来确认</span>
          </div>
          <div className="success-note">
            <Sparkles size={14} />
            有新的处理动作，我们会在消息里提醒你。
          </div>
        </div>
      )}
    </div>
  )
}
