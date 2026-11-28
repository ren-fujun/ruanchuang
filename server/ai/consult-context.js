import { ruleAppointmentAdvice } from '../b/appointment-advice.js'

const clean = (v, max = 300) => typeof v === 'string' ? v.trim().slice(0, max) : ''
// Only verbatim student statements enter the structured factual record.
export function consultationContext(session, text, parsed = {}) {
  const round = session.turns.length + 1
  const changed = /不是.{1,60}?[，,。；;]?\s*(?:而是|是)|不是.{0,80}[，,。；;].{0,10}(?:我想|我要)|改成|改问|现在想|不问.{0,20}了/.test(text)
  const activeSinceTurn = changed ? round : (session.context?.activeSinceTurn || 1)
  const previous = changed ? [] : (session.context?.facts || [])
  const statements = session.turns.map((t, i) => ({ turn: i + 1, text: t.text })).concat({ turn: round, text })
  const facts = (Array.isArray(parsed.facts) ? parsed.facts : []).slice(0, 8).flatMap(f => {
    const quote = clean(f?.quote), sourceTurn = Number(f?.sourceTurn)
    if (!quote || !Number.isInteger(sourceTurn) || sourceTurn < activeSinceTurn || !statements.find(s => s.turn === sourceTurn)?.text.includes(quote)) return []
    return [{ text: quote, sourceTurn }]
  })
  const merged = [...previous, ...facts, { text: text.trim(), sourceTurn: round }]
  return { topic: clean(parsed.topic, 100) || text.slice(0, 100),
    facts: merged.filter((f, i) => merged.findIndex(x => x.text === f.text && x.sourceTurn === f.sourceTurn) === i).slice(-8),
    updatedTurn: round, activeSinceTurn, corrected: changed }
}

export function contextSummary(context) {
  return context.facts.filter((f, i, all) => !all.some((other, j) => j !== i && other.sourceTurn === f.sourceTurn && other.text.length > f.text.length && other.text.includes(f.text))).map(f => f.text).join('；').slice(-2000)
}

export function contextAdvice(context) {
  return ruleAppointmentAdvice(context.facts.map(f => f.text).join('；'))
}
