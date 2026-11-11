import { describe, it, expect } from 'vitest'
import type { School } from '../types'
import { normalize, searchSchools } from './search'

const schools: School[] = [
  { id: 'michigan', name: 'Michigan', aliases: ['Wolverines', 'U of M'] },
  { id: 'michigan-state', name: 'Michigan State', aliases: ['MSU'] },
  { id: 'central-michigan', name: 'Central Michigan', aliases: ['CMU'] },
  { id: 'miami-fl', name: 'Miami (FL)', aliases: ['The U'] },
  { id: 'miami-oh', name: 'Miami (OH)', aliases: ['Miami of Ohio'] },
  { id: 'texas-am', name: 'Texas A&M', aliases: ['TAMU'] },
  { id: 'ole-miss', name: 'Ole Miss', aliases: ['Mississippi'] },
  { id: 'st-johns', name: "St. John's" },
]
const ids = (q: string) => searchSchools(schools, q).map((s) => s.id)

describe('searchSchools', () => {
  it('empty query → nothing', () => {
    expect(ids('')).toEqual([])
    expect(ids('   ')).toEqual([])
  })
  it('exact name first, then prefixes, then later words', () => {
    expect(ids('michigan')).toEqual([
      'michigan',
      'michigan-state',
      'central-michigan',
    ])
    expect(ids('mich')).toEqual([
      'michigan',
      'michigan-state',
      'central-michigan',
    ])
  })
  it('matches aliases', () => {
    expect(ids('msu')).toEqual(['michigan-state'])
    expect(ids('mississippi')).toEqual(['ole-miss'])
    expect(ids('wolv')).toEqual(['michigan'])
  })
  it('ignores case, punctuation and ampersands', () => {
    expect(ids('TEXAS A&M')).toEqual(['texas-am'])
    expect(ids('texas a')).toEqual(['texas-am'])
    expect(ids('st johns')).toEqual(['st-johns'])
    expect(ids('miami oh')).toEqual(['miami-oh'])
    expect(normalize("  St.  John's ")).toBe('st johns')
  })
  it('respects the limit', () => {
    expect(searchSchools(schools, 'm', 2)).toHaveLength(2)
  })
})
