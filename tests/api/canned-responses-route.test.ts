import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { agent, cannedResponses, db, deleteCanned, getCanned, postCanned, putCanned, setupDb, supervisor } from './helpers'

beforeAll(setupDb)
beforeEach(() => db.delete(cannedResponses).run())

const input = (shortcode: string, over: Record<string, unknown> = {}) =>
  JSON.stringify({ name: `Name ${shortcode}`, shortcode, body: `Hi {{customer_name}}, ${shortcode}`, ...over })

async function seed(shortcode: string) {
  const res = await postCanned(supervisor, input(shortcode))
  expect(res.status).toBe(201)
  return (await res.json()) as { id: string; shortcode: string }
}

describe('GET /api/canned-responses', () => {
  it('lists every response for any signed-in user and filters by prefix', async () => {
    await seed('greet')
    await seed('refund')
    const all = await getCanned(agent('agent-a'))
    expect(all.status).toBe(200)
    expect((await all.json()).map((r: { shortcode: string }) => r.shortcode)).toEqual(['greet', 'refund'])

    const filtered = await getCanned(agent('agent-a'), '?prefix=GR')
    expect(await filtered.json()).toMatchObject([{ shortcode: 'greet', name: 'Name greet', body: 'Hi {{customer_name}}, greet' }])
  })

  it('requires a session', async () => {
    expect((await getCanned(null)).status).toBe(401)
  })
})

describe('supervisor writes', () => {
  it('creates, updates and deletes a response', async () => {
    const { id } = await seed('greet')
    const put = await putCanned(supervisor, id, input('hello', { body: 'Hello' }))
    expect(put.status).toBe(200)
    expect(await put.json()).toMatchObject({ id, shortcode: 'hello', body: 'Hello' })

    expect((await deleteCanned(supervisor, id)).status).toBe(204)
    expect(await (await getCanned(supervisor)).json()).toEqual([])
  })

  it('rejects a duplicate shortcode with 409', async () => {
    const { id } = await seed('greet')
    await seed('refund')
    expect((await postCanned(supervisor, input('greet'))).status).toBe(409)
    expect((await putCanned(supervisor, id, input('refund'))).status).toBe(409)
  })

  it('returns 404 for an unknown id', async () => {
    expect((await putCanned(supervisor, 'missing', input('x'))).status).toBe(404)
    expect((await deleteCanned(supervisor, 'missing')).status).toBe(404)
  })

  it.each([
    ['not json', 'nope'],
    ['missing name', input('x', { name: undefined })],
    ['blank body', input('x', { body: '  ' })],
    ['shortcode with a space', input('two words')],
    ['empty shortcode', input('')],
    ['non-string shortcode', input('x', { shortcode: 5 })],
  ])('rejects %s with 400', async (_, body) => {
    expect((await postCanned(supervisor, body)).status).toBe(400)
    const { id } = await seed('valid')
    expect((await putCanned(supervisor, id, body)).status).toBe(400)
  })

  it('forbids agents from writing', async () => {
    const { id } = await seed('greet')
    const a = agent('agent-a')
    expect((await postCanned(a, input('new'))).status).toBe(403)
    expect((await putCanned(a, id, input('greet'))).status).toBe(403)
    expect((await deleteCanned(a, id)).status).toBe(403)
    expect(await (await getCanned(a)).json()).toMatchObject([{ id, shortcode: 'greet' }])
  })

  it('requires a session for writes', async () => {
    expect((await postCanned(null, input('x'))).status).toBe(401)
    expect((await putCanned(null, 'x', input('x'))).status).toBe(401)
    expect((await deleteCanned(null, 'x')).status).toBe(401)
  })
})
