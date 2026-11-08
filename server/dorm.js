import crypto from 'node:crypto'

const localDateKey = (value) => {
  const date = value instanceof Date ? value : new Date(value)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

const sortByTimeDesc = (a, b) => new Date(b.checkedAt).getTime() - new Date(a.checkedAt).getTime()

export const getDormOverview = (db) => {
  const dorm = db.dormCheck
  const records = [...(dorm?.records || [])].sort(sortByTimeDesc)
  const todayKey = localDateKey(new Date())
  const todayRecords = records.filter((item) => localDateKey(item.checkedAt) === todayKey)
  const latestByRoom = new Map()

  for (const record of records) {
    if (!latestByRoom.has(record.roomId)) latestByRoom.set(record.roomId, record)
  }

  const rooms = (dorm?.rooms || []).map((room) => {
    const latest = latestByRoom.get(room.id)
    const todayRecord = todayRecords.find((record) => record.roomId === room.id)
    let status = 'pending'
    if (todayRecord) {
      if (todayRecord.absentStudents?.length) status = 'absent'
      else if (todayRecord.result === 'exception') status = 'exception'
      else status = 'checked'
    }
    return {
      ...room,
      status,
      lastCheckAt: latest?.checkedAt || null,
      lastInspector: latest?.inspectorName || null,
      presentCount: latest?.presentCount ?? null,
      absentStudents: latest?.absentStudents || [],
      issues: latest?.issues || [],
      todayCheckedAt: todayRecord?.checkedAt || null,
    }
  })

  const checkedRooms = rooms.filter((room) => room.todayCheckedAt)
  const normal = rooms.filter((room) => room.status === 'checked').length
  const exception = rooms.filter((room) => room.status === 'exception').length
  const absent = rooms.filter((room) => room.status === 'absent').length

  return {
    date: todayKey,
    building: '3号楼',
    floor: 4,
    summary: {
      total: rooms.length,
      checked: checkedRooms.length,
      pending: rooms.length - checkedRooms.length,
      normal,
      exception,
      absent,
      progress: rooms.length ? Math.round((checkedRooms.length / rooms.length) * 100) : 0,
    },
    rooms,
    records: records.slice(0, 12),
  }
}

export const createDormRecord = (db, user, input) => {
  const dorm = db.dormCheck
  const room = dorm.rooms.find((item) => item.id === input.roomId)
  if (!room) return null

  const absentStudents = Array.isArray(input.absentStudents)
    ? [...new Set(input.absentStudents.filter((name) => room.students.includes(name)))]
    : []
  const issues = Array.isArray(input.issues)
    ? [...new Set(input.issues.filter((item) => typeof item === 'string' && item.trim()).map((item) => item.trim()))].slice(0, 5)
    : []
  const presentCount = Math.max(0, room.students.length - absentStudents.length)
  const result = absentStudents.length || issues.length ? 'exception' : 'normal'
  const checkedAt = new Date().toISOString()

  const record = {
    id: `DC-${crypto.randomUUID().slice(0, 8)}`,
    roomId: room.id,
    building: room.building,
    floor: room.floor,
    room: room.room,
    inspectorId: user.id,
    inspectorName: user.name,
    checkedAt,
    result,
    presentCount,
    absentStudents,
    issues,
    note: String(input.note || '').slice(0, 300),
    attachments: Array.isArray(input.attachments)
      ? input.attachments
          .filter((item) => item && typeof item.name === 'string')
          .slice(0, 3)
          .map((item) => ({ name: item.name, type: item.type === 'video' ? 'video' : 'image', size: String(item.size || '') }))
      : [],
  }

  dorm.records.unshift(record)
  // Keep the demo store bounded.
  dorm.records = dorm.records.slice(0, 200)
  return record
}

export const dormConstants = {
  issues: ['卫生', '用电安全', '消防通道', '晚归/未归'],
}
