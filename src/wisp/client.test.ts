import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  WispError,
  createContract,
  deleteContract,
  getContract,
  listContracts,
  publishEvent,
} from './client'

/** One recorded `fetch` call: just the pieces the client actually sets. */
interface RecordedCall {
  url: string
  method: string
  headers: Record<string, string>
  body: string | null
}

/**
 * Install a `fetch` mock that responds with `body` and records every call.
 * Returns the recorded-calls array; test bodies inspect it in-place.
 */
function installFetchMock(
  status: number,
  body: unknown,
): RecordedCall[] {
  const calls: RecordedCall[] = []
  const fetchMock = vi.fn(
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString()
      const method = init?.method ?? 'GET'
      const headers: Record<string, string> = {}
      const rawHeaders = init?.headers as
        | Record<string, string>
        | Headers
        | undefined
      if (rawHeaders instanceof Headers) {
        rawHeaders.forEach((v, k) => {
          headers[k] = v
        })
      } else if (rawHeaders) {
        Object.assign(headers, rawHeaders)
      }
      calls.push({
        url,
        method,
        headers,
        body: (init?.body as string | undefined) ?? null,
      })
      return {
        ok: status >= 200 && status < 300,
        status,
        statusText: `HTTP ${status}`,
        json: async () => body,
      } as unknown as Response
    },
  )
  vi.stubGlobal('fetch', fetchMock)
  return calls
}

describe('wisp client', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  describe('getContract', () => {
    it('sends the app token when only the app token is set', async () => {
      const calls = installFetchMock(200, {
        contract_id: 'c1',
        status: 'ready',
        ttl_seconds_remaining: 100,
      })

      await getContract('c1', 'app-tok', undefined)

      expect(calls).toHaveLength(1)
      expect(calls[0].url).toBe('/wisp/contracts/c1')
      expect(calls[0].method).toBe('GET')
      expect(calls[0].headers.Authorization).toBe('Bearer app-tok')
    })

    it('sends the contract token when the app token is unset', async () => {
      const calls = installFetchMock(200, {
        contract_id: 'c1',
        status: 'ready',
        ttl_seconds_remaining: 100,
      })

      await getContract('c1', undefined, 'ctr-tok')

      expect(calls[0].headers.Authorization).toBe('Bearer ctr-tok')
    })

    it('prefers the app token when both are supplied', async () => {
      const calls = installFetchMock(200, {
        contract_id: 'c1',
        status: 'ready',
        ttl_seconds_remaining: 100,
      })

      await getContract('c1', 'app-tok', 'ctr-tok')

      expect(calls[0].headers.Authorization).toBe('Bearer app-tok')
    })

    it('treats an empty-string app token as unset and falls back to the contract token', async () => {
      const calls = installFetchMock(200, {
        contract_id: 'c1',
        status: 'ready',
        ttl_seconds_remaining: 100,
      })

      await getContract('c1', '', 'ctr-tok')

      expect(calls[0].headers.Authorization).toBe('Bearer ctr-tok')
    })

    it('sends no Authorization header when no tokens are supplied', async () => {
      const calls = installFetchMock(200, {
        contract_id: 'c1',
        status: 'ready',
        ttl_seconds_remaining: 100,
      })

      await getContract('c1')

      expect(calls[0].headers.Authorization).toBeUndefined()
    })

    it('percent-encodes the contract id in the URL', async () => {
      const calls = installFetchMock(200, {
        contract_id: 'c/1',
        status: 'ready',
        ttl_seconds_remaining: 0,
      })

      await getContract('c/1', 'app-tok')

      expect(calls[0].url).toBe('/wisp/contracts/c%2F1')
    })

    it('throws a WispError carrying wisp\'s error message on non-2xx', async () => {
      installFetchMock(401, { error: 'unauthorized' })

      await expect(getContract('c1')).rejects.toMatchObject({
        name: 'WispError',
        status: 401,
        message: 'unauthorized',
      })
    })

    it('throws a WispError for a 401 when the caller sent no token', async () => {
      installFetchMock(401, { error: 'unauthorized' })

      const err = await getContract('c1').catch((e) => e as unknown)

      expect(err).toBeInstanceOf(WispError)
      expect((err as WispError).status).toBe(401)
    })
  })

  describe('deleteContract', () => {
    it('sends DELETE with the app token when configured', async () => {
      const calls = installFetchMock(200, {
        contract_id: 'c1',
        status: 'released',
        ttl_seconds_remaining: 0,
      })

      await deleteContract('c1', 'app-tok', 'ctr-tok')

      expect(calls[0].method).toBe('DELETE')
      expect(calls[0].headers.Authorization).toBe('Bearer app-tok')
      expect(calls[0].url).toBe('/wisp/contracts/c1')
    })

    it('falls back to the contract token when the app token is unset', async () => {
      const calls = installFetchMock(200, {
        contract_id: 'c1',
        status: 'released',
        ttl_seconds_remaining: 0,
      })

      await deleteContract('c1', undefined, 'ctr-tok')

      expect(calls[0].method).toBe('DELETE')
      expect(calls[0].headers.Authorization).toBe('Bearer ctr-tok')
    })

    it('sends no Authorization header when no tokens are supplied', async () => {
      const calls = installFetchMock(200, {
        contract_id: 'c1',
        status: 'released',
        ttl_seconds_remaining: 0,
      })

      await deleteContract('c1')

      expect(calls[0].headers.Authorization).toBeUndefined()
    })
  })

  describe('createContract', () => {
    it('POSTs with the app token and a JSON body', async () => {
      const calls = installFetchMock(201, {
        contract_id: 'c1',
        token: 'ctr-tok',
        status: 'ready',
      })

      await createContract({ ttl_seconds: 60 }, 'app-tok')

      expect(calls[0].method).toBe('POST')
      expect(calls[0].url).toBe('/wisp/contracts')
      expect(calls[0].headers.Authorization).toBe('Bearer app-tok')
      expect(calls[0].headers['Content-Type']).toBe('application/json')
      expect(JSON.parse(calls[0].body ?? 'null')).toEqual({ ttl_seconds: 60 })
    })
  })

  describe('listContracts', () => {
    it('GETs /contracts with the app token', async () => {
      const calls = installFetchMock(200, { contracts: [] })

      await listContracts('app-tok')

      expect(calls[0].method).toBe('GET')
      expect(calls[0].url).toBe('/wisp/contracts')
      expect(calls[0].headers.Authorization).toBe('Bearer app-tok')
    })
  })

  describe('publishEvent', () => {
    it('POSTs /events with the app token and returns void on 2xx', async () => {
      const calls = installFetchMock(202, { status: 'published' })

      await expect(
        publishEvent({ type: 'x', data: {} }, 'app-tok'),
      ).resolves.toBeUndefined()

      expect(calls[0].method).toBe('POST')
      expect(calls[0].url).toBe('/wisp/events')
      expect(calls[0].headers.Authorization).toBe('Bearer app-tok')
    })

    it('throws WispError on a non-2xx response', async () => {
      installFetchMock(400, { error: 'bad type' })

      await expect(publishEvent({ type: '', data: {} })).rejects.toMatchObject({
        name: 'WispError',
        status: 400,
        message: 'bad type',
      })
    })
  })
})
