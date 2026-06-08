import cars from '../../data/fh6_cars.json'
import carGroups from '../../data/fh6_car_groups.json'

interface Fh6CarCatalogEntry {
  display_name: string
  year?: number
  make?: string
  model?: string
  asset?: string
  car_id?: number
  confidence?: string
}

const carCatalog = cars as Record<string, Fh6CarCatalogEntry>
const carGroupCatalog = carGroups as {
  groups: Record<string, {
    display_name: string
    car_type: string
    car_class: string
    country: string
    score: number
  }>
}

function parseId(value: unknown): number | null {
  const raw = Array.isArray(value) ? value[0] : value
  if (raw === undefined || raw === null || raw === '') return null

  const id = Number(raw)
  return Number.isInteger(id) ? id : null
}

export default defineEventHandler((event) => {
  const query = getQuery(event)
  const carOrdinal = parseId(query.ordinal ?? query.carOrdinal ?? query.id)
  const carGroup = parseId(query.group ?? query.carGroup)
  const car = carOrdinal === null ? undefined : carCatalog[String(carOrdinal)]
  const carGroupMatch = carOrdinal === null ? undefined : carGroupCatalog.groups[String(carOrdinal)]

  return {
    carOrdinal,
    carGroup,
    car: carGroupMatch
      ? {
          id: carOrdinal,
          displayName: carGroupMatch.display_name,
          year: car?.year ?? null,
          make: car?.make ?? null,
          model: car?.model ?? null,
          asset: car?.asset ?? null,
          confidence: car?.confidence ?? null,
        }
      : car
        ? {
            id: car.car_id ?? carOrdinal,
            displayName: car.display_name,
            year: car.year ?? null,
            make: car.make ?? null,
            model: car.model ?? null,
            asset: car.asset ?? null,
            confidence: car.confidence ?? null,
          }
        : null,
    carGroupName: carGroupMatch?.car_type ?? null,
  }
})
