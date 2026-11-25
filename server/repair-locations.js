const campuses = ['A', 'B', 'C', 'D', 'E', 'F']

export const REPAIR_LOCATIONS = campuses.map((campus) => ({
  campus,
  buildings: Array.from({ length: 30 }, (_, buildingIndex) => ({
    id: `b${buildingIndex + 1}`,
    name: `${buildingIndex + 1}栋`,
    rooms: Array.from({ length: 20 }, (_, roomIndex) => `${roomIndex + 1}室`),
  })),
}))

export function resolveRepairLocation(campus, buildingId, room) {
  const campusEntry = REPAIR_LOCATIONS.find((item) => item.campus === campus)
  const building = campusEntry?.buildings.find((item) => item.id === buildingId)
  if (!building || !building.rooms.includes(room)) return null
  return {
    campus,
    buildingId: building.id,
    buildingName: building.name,
    room,
    label: `${campus}校区 · ${building.name} · ${room}`,
  }
}
