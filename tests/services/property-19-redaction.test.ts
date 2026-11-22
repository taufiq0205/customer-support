// Feature: cx-support-tool, Property 19: PII redaction removes all recognised patterns
// Validates: Requirements 12.6
import fc from 'fast-check'
import { expect, it } from 'vitest'
import { redact } from '@/lib/services/redaction'

// A piece of text holding one PII token: `raw` goes in, `out` must come back, `secret` must vanish.
type Piece = { raw: string; out: string; secret: string }

const FILLER = ['hi', 'please', 'send', 'the', 'book', 'thanks', 'and', 'my', 'is', 'to']
const STREETS = ['Ampang', 'Mawar', 'Tun Razak']
const SG_ROADS = ['Bedok North Street', 'Orchard Road', 'Ang Mo Kio Avenue']
// Every fixed word a template can emit; generated names never sit inside one, so `secret` checks stay exact.
const RESERVED = [...FILLER, ...STREETS, ...SG_ROADS, 'order', 'number', 'jalan', 'blk', 'kuala lumpur', 'singapore']
  .join(' ')
  .toLowerCase()

const digits = (min: number, max = min) => fc.stringMatching(new RegExp(`^\\d{${min},${max}}$`))
const sep = fc.constantFrom('', ' ', '-')
const same = (raw: string, label: string): Piece => ({ raw, out: label, secret: raw })

const email = fc.stringMatching(/^[a-z0-9][a-z0-9._+-]{0,8}@[a-z0-9]{1,8}\.[a-z]{2,4}$/).map((e) => same(e, '[EMAIL]'))

const phone = fc.oneof(
  fc
    .tuple(fc.constantFrom('+60', '+60 ', '60', '0'), digits(1), sep, digits(3, 4), sep, digits(4))
    .map(([p, d, s1, a, s2, b]) => same(`${p}1${d}${s1}${a}${s2}${b}`, '[PHONE]')),
  fc
    .tuple(fc.constantFrom('', '+65', '+65 '), fc.constantFrom('6', '8', '9'), digits(3), sep, digits(4))
    .map(([p, f, a, s, b]) => same(`${p}${f}${a}${s}${b}`, '[PHONE]')),
)

// Keyword tokens keep at most 7 digits: longer runs read as phone numbers, which run first.
const order = fc.oneof(
  fc.tuple(fc.constantFrom('PB', 'PB-'), digits(5, 8)).map(([p, d]) => same(p + d, '[ORDER]')),
  fc
    .tuple(fc.constantFrom('order ', 'order #', 'order no. ', 'order number: '), fc.stringMatching(/^[A-Z]{0,3}\d{5,7}$/))
    .map(([k, t]) => ({ raw: k + t, out: `${k}[ORDER]`, secret: t })),
)

const n = fc.integer({ min: 1, max: 999 })
const address = fc.oneof(
  fc.tuple(fc.constantFrom('', 'No. '), n, fc.constantFrom('', ','), fc.constantFrom(...STREETS))
    .map(([no, num, c, st]) => same(`${no}${num}${c} Jalan ${st}`, '[ADDRESS]')),
  fc.tuple(fc.constantFrom('', 'Blk '), n, fc.constantFrom(...SG_ROADS), fc.integer({ min: 1, max: 9 }))
    .map(([blk, num, road, k]) => same(`${blk}${num} ${road} ${k}`, '[ADDRESS]')),
  fc.tuple(digits(2), digits(2, 4)).map(([a, b]) => same(`#${a}-${b}`, '[ADDRESS]')),
  digits(5).map((pc) => ({ raw: `${pc} Kuala Lumpur`, out: '[ADDRESS] Kuala Lumpur', secret: pc })),
  digits(6).map((pc) => ({ raw: `Singapore ${pc}`, out: 'Singapore [ADDRESS]', secret: pc })),
)

const name = fc
  .stringMatching(/^[A-Z][a-z]{3,8}( [A-Z][a-z]{3,8})?$/)
  .filter((nm) => nm.split(' ').every((part) => !RESERVED.includes(part.toLowerCase())))

it('replaces every recognised PII token with its label and leaves the filler intact', () => {
  fc.assert(
    fc.property(
      name,
      fc.array(fc.tuple(fc.constantFrom(...FILLER), fc.oneof(email, phone, order, address, fc.constant(null))), {
        minLength: 1,
        maxLength: 6,
      }),
      (customer, slots) => {
        const pieces = slots.map(([f, p]) => [f, p ?? same(customer, '[NAME]')] as const)
        const input = pieces.map(([f, p]) => `${f} ${p.raw}`).join(' ') + ' thanks'
        const result = redact(input, [customer])

        expect(result).toBe(pieces.map(([f, p]) => `${f} ${p.out}`).join(' ') + ' thanks')
        for (const [, p] of pieces) expect(result).not.toContain(p.secret)
      },
    ),
    { numRuns: 500 },
  )
})
