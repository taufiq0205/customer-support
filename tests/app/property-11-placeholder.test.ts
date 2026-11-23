// Feature: cx-support-tool, Property 11: Canned response placeholder substitution removes the token
// Validates: Requirements 6.5
import fc from 'fast-check'
import { expect, it } from 'vitest'
import { substitutePlaceholder } from '@/components/compose/canned-responses'

const TOKEN = '{{customer_name}}'
// Bias generated strings toward braces, the token's pieces, and `$` replacement patterns.
const piece = fc.oneof(fc.string(), fc.constantFrom('{', '}', '{{', '}}', 'customer_name', '$&', '$$', "$'"))
const text = fc.array(piece, { maxLength: 4 }).map((parts) => parts.join(''))
// Segments between tokens. The token cannot overlap itself, so splitting the joined body returns these segments.
const segments = fc.array(text.filter((s) => !s.includes(TOKEN)), { minLength: 2, maxLength: 5 })

it('replaces every token with the customer name', () => {
  fc.assert(
    fc.property(segments, text, (parts, name) => {
      expect(substitutePlaceholder(parts.join(TOKEN), name)).toBe(parts.join(name))
    }),
    { numRuns: 500 },
  )
})

// Braces in the text around a token could spell a new token, e.g. `{{` + `customer_name` + `}}`, so this half holds for brace-free text.
it('leaves no literal token behind', () => {
  const plain = text.map((s) => s.replace(/[{}]/g, ''))
  fc.assert(
    fc.property(fc.array(plain, { minLength: 2, maxLength: 5 }), plain, (parts, name) => {
      expect(substitutePlaceholder(parts.join(TOKEN), name)).not.toContain(TOKEN)
    }),
    { numRuns: 500 },
  )
})
