export const formatTime = (iso: string) => {
  const date = new Date(iso)
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}

export const formatDate = (iso: string) => {
  const date = new Date(iso)
  return `${date.getMonth() + 1}月${date.getDate()}日`
}

export const formatDateTime = (iso: string) => `${formatDate(iso)} ${formatTime(iso)}`

export const formatMonthDay = (iso: string) => {
  const date = new Date(iso)
  return `${String(date.getMonth() + 1).padStart(2, '0')}.${String(date.getDate()).padStart(2, '0')}`
}

export const relativeTime = (iso: string) => {
  const delta = Date.now() - new Date(iso).getTime()
  const minutes = Math.floor(delta / 60000)
  if (minutes < 1) return '刚刚'
  if (minutes < 60) return `${minutes} 分钟前`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} 小时前`
  const days = Math.floor(hours / 24)
  if (days === 1) return '昨天'
  if (days < 7) return `${days} 天前`
  return formatDate(iso)
}

export const countdownText = (minutesLeft: number) => {
  if (minutesLeft < 0) {
    const abs = Math.abs(minutesLeft)
    if (abs >= 60) return `已超时 ${Math.floor(abs / 60)} 小时 ${abs % 60} 分`
    return `已超时 ${abs} 分钟`
  }
  if (minutesLeft >= 1440) return `剩余 ${Math.ceil(minutesLeft / 1440)} 天`
  if (minutesLeft >= 60) return `剩余 ${Math.floor(minutesLeft / 60)} 小时 ${minutesLeft % 60} 分`
  return `剩余 ${minutesLeft} 分钟`
}

export const shortCountdown = (minutesLeft: number) => {
  if (minutesLeft < 0) {
    const abs = Math.abs(minutesLeft)
    return abs >= 60 ? `超时 ${Math.floor(abs / 60)}h` : `超时 ${abs}m`
  }
  if (minutesLeft >= 1440) return `${Math.ceil(minutesLeft / 1440)}d`
  if (minutesLeft >= 60) return `${Math.floor(minutesLeft / 60)}h ${minutesLeft % 60}m`
  return `${minutesLeft}m`
}

export const greeting = () => {
  const hour = new Date().getHours()
  if (hour < 6) return '夜深了'
  if (hour < 11) return '早上好'
  if (hour < 14) return '中午好'
  if (hour < 18) return '下午好'
  return '晚上好'
}

export const todayLabel = () => {
  const date = new Date()
  const week = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][date.getDay()]
  return `${date.getMonth() + 1} 月 ${date.getDate()} 日 · ${week}`
}

export const statusClass = (status: string) => {
  const map: Record<string, string> = {
    pending_review: 'pending',
    assigned: 'assigned',
    processing: 'processing',
    awaiting_confirm: 'confirm',
    completed: 'completed',
  }
  return map[status] || 'pending'
}

export const riskClass = (risk: string) => (risk === 'high' ? 'risk-high' : risk === 'medium' ? 'risk-medium' : 'risk-low')

export const urgencyClass = (urgency: string) =>
  urgency === 'urgent' ? 'urgent' : urgency === 'high' ? 'high' : 'normal'

export const initials = (name: string) => name.slice(-2)

export const plural = (n: number, unit = '条') => `${n} ${unit}`
