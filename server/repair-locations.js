export const REPAIR_LOCATIONS = [
  {
    campus: '主校区',
    buildings: [
      {
        id: 'dorm-3',
        name: '学生公寓 3 号楼',
        rooms: ['101', '208', '412', '一层公共区', '东侧车棚'],
      },
      {
        id: 'dorm-5',
        name: '学生公寓 5 号楼',
        rooms: ['208', '317', '一层大厅', '阳台公共区'],
      },
      {
        id: 'library',
        name: '图书馆',
        rooms: ['1F 东门', '1F 服务台', '4F 南侧自习区'],
      },
      {
        id: 'teach-a',
        name: '教学楼 A 座',
        rooms: ['1F 大厅', '2F 走廊', '2 号电梯'],
      },
      {
        id: 'teach-b',
        name: '教学楼 B 座',
        rooms: ['3F 走廊', '一楼梯间'],
      },
    ],
  },
  {
    campus: '异地校区',
    buildings: [
      {
        id: 'dorm-1',
        name: '学生公寓 1 号楼',
        rooms: ['101', '201', '一层大厅'],
      },
    ],
  },
]

export function resolveRepairLocation(campus, buildingId, room) {
  const campusEntry = REPAIR_LOCATIONS.find((item) => item.campus === campus)
  const building = campusEntry?.buildings.find((item) => item.id === buildingId)
  if (!building || !building.rooms.includes(room)) return null
  return {
    campus,
    buildingId: building.id,
    buildingName: building.name,
    room,
    label: `${building.name} · ${room}`,
  }
}
