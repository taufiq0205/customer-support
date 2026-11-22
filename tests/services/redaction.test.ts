// Unit tests for lib/services/redaction.ts. All fixtures are synthetic.
// Validates: Requirements 12.6
import { describe, expect, it } from 'vitest'
import { redact } from '@/lib/services/redaction'

describe('redact', () => {
  it.each([
    ['Email me at jane.doe+books@example.com.my please', 'Email me at [EMAIL] please'],
    ['Reply to SITI_99@mail.co.', 'Reply to [EMAIL].'],
  ])('emails: %s', (input, expected) => expect(redact(input)).toBe(expected))

  it.each([
    '+60 12-345 6789',
    '+60123456789',
    '60123456789',
    '012-3456789',
    '012 345 6789',
    '011-1234 5678',
    '03-1234 5678',
    '+65 9123 4567',
    '+6581234567',
    '91234567',
    '6123 4567',
  ])('phones: %s', (phone) => expect(redact(`call me at ${phone} today`)).toBe('call me at [PHONE] today'))

  it.each([
    ['my order PB-123456 is late', 'my order [ORDER] is late'],
    ['ref PB123456', 'ref [ORDER]'],
    ['order #AB12345 has a typo', 'order #[ORDER] has a typo'],
    ['Order no. 784512 please', 'Order no. [ORDER] please'],
    ['order number: 2026111234', 'order number: [ORDER]'],
  ])('orders: %s', (input, expected) => expect(redact(input)).toBe(expected))

  it.each([
    ['send to No. 12, Jalan Ampang.', 'send to [ADDRESS].'],
    ['12 jalan SS 2/24, 47300 Petaling Jaya', '[ADDRESS], [ADDRESS] Petaling Jaya'],
    ['Blk 123 Bedok North Street 1 #05-12 Singapore 460123', '[ADDRESS] [ADDRESS] Singapore [ADDRESS]'],
    ['8 Orchard Road', '[ADDRESS]'],
  ])('addresses: %s', (input, expected) => expect(redact(input)).toBe(expected))

  it('redacts the full name and each part of 3+ chars, case-insensitively and whole-word only', () => {
    expect(redact('Hi Siti Aminah, siti here. Alibaba sent it to ALI.', ['Siti Aminah', 'Ali'])).toBe(
      'Hi [NAME], [NAME] here. Alibaba sent it to [NAME].',
    )
    expect(redact('Tan Ah Kow said ah ok', ['Tan Ah Kow'])).toBe('[NAME] said ah ok')
  })

  it('escapes regex metacharacters in names', () => {
    const names = ["Sean O'Brien (Jr.)"]
    expect(redact("Thanks Sean O'Brien (Jr.)! Mr O'Brien called.", names)).toBe('Thanks [NAME]! Mr [NAME] called.')
    expect(redact('JxR stays', ['J.R'])).toBe('JxR stays')
  })

  it('ignores empty and whitespace-only names', () => {
    expect(redact('nothing to hide', ['', '   '])).toBe('nothing to hide')
  })

  it('redacts several PII types in one message', () => {
    const input =
      'Hi, this is Nur Aisyah (nur.aisyah@example.com, 012-345 6789). Order PB-556677 should go to No. 5, Jalan Mawar, 43000 Kajang.'
    expect(redact(input, ['Nur Aisyah'])).toBe(
      'Hi, this is [NAME] ([EMAIL], [PHONE]). Order [ORDER] should go to [ADDRESS], [ADDRESS] Kajang.',
    )
  })

  it.each([
    'I ordered 2 books, 50 pages each, for RM 89.90 on 12 March.',
    'Can you check the status of my order? It has been 3 days.',
    'The album is 20x30 cm with 120 photos, delivered in 5-7 working days.',
    'Order 3 of 10 arrived on 2026-11-20 at 10:45.',
  ])('leaves text without PII unchanged: %s', (input) => expect(redact(input, ['Farah Lim'])).toBe(input))
})
