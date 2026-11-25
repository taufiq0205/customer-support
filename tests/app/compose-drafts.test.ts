import { afterEach, expect, it, vi } from 'vitest'
import { ReplyDrafts } from '@/components/compose/drafts'

const fetchMock = vi.fn<typeof fetch>()
vi.stubGlobal('fetch', fetchMock)
afterEach(() => fetchMock.mockReset())

function delayResponse() {
  const response = Promise.withResolvers<Response>()
  fetchMock.mockReturnValueOnce(response.promise)
  return response.resolve
}

it('keeps a delayed suggestion with its originating case after switching', async () => {
  const complete = delayResponse()
  const drafts = new ReplyDrafts()
  drafts.edit('case-a', 'Case A draft')
  const pending = drafts.suggest('case-a')
  drafts.edit('case-b', 'Case B draft')
  complete(Response.json({ suggestion: 'Case A suggestion' }))
  await pending

  expect(fetchMock.mock.calls[0][0]).toBe('/api/conversations/case-a/ai-suggest')
  expect(drafts.get('case-b').text).toBe('Case B draft')
  expect(drafts.get('case-a').text).toBe('Case A draft\n\nCase A suggestion')
})

it('drops a completion if access was lost and the case was opened again', async () => {
  const complete = delayResponse()
  const drafts = new ReplyDrafts()
  drafts.edit('case-a', 'Old draft')
  const pending = drafts.suggest('case-a')
  drafts.discard('case-a')
  drafts.edit('case-a', 'New draft')
  complete(Response.json({ suggestion: 'Obsolete suggestion' }))
  await pending

  expect(drafts.get('case-a').text).toBe('New draft')
})

it('preserves edits made after submission even if they match the submitted text', async () => {
  const complete = delayResponse()
  const drafts = new ReplyDrafts()
  drafts.edit('case-a', 'Reply')
  const pending = drafts.send('case-a')
  drafts.edit('case-a', 'Reply with edits')
  drafts.edit('case-a', 'Reply')
  complete(Response.json({}, { status: 202 }))
  await pending

  expect(drafts.get('case-a').text).toBe('Reply')
})

it('requires an explicit retry after an unconfirmed duplicate response', async () => {
  fetchMock.mockResolvedValueOnce(Response.json({ error: 'unconfirmed_duplicate' }, { status: 409 }))
    .mockResolvedValueOnce(Response.json({}, { status: 202 }))
  const drafts = new ReplyDrafts()

  await drafts.retry('case-a', 'message-a', 'Reply')
  expect(drafts.get('case-a').retries.get('message-a')).toMatchObject({ kind: 'error', duplicate: true })
  await drafts.retry('case-a', 'message-a', 'Reply')

  expect(fetchMock.mock.calls.map(([, init]) => JSON.parse(String(init?.body)))).toEqual([
    { body: 'Reply' },
    { body: 'Reply', confirmResend: true },
  ])
})

it('clears inaccessible cases after reconnect and keeps authorized drafts', async () => {
  fetchMock.mockResolvedValueOnce(new Response(null, { status: 404 }))
    .mockResolvedValueOnce(new Response(null, { status: 200 }))
  const drafts = new ReplyDrafts()
  drafts.edit('case-a', 'Restricted draft')
  drafts.edit('case-b', 'Authorized draft')

  await drafts.recheckAccess()

  expect(drafts.get('case-a').text).toBe('')
  expect(drafts.get('case-b').text).toBe('Authorized draft')
})
