import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { useWispClient } from './useWispClient'
import { WispError } from '../wisp/client'
import type { ContractStatus, CreateContractRequest } from '../wisp/types'

/** localStorage key under which tracked contracts are persisted. */
export const CONTRACTS_KEY = 'wisp.contracts'

/** Status-poll interval for non-terminal contracts. */
const POLL_INTERVAL_MS = 4000

/**
 * A contract this dashboard created and now tracks. Wisp has no "list
 * contracts" endpoint, so the dashboard is the source of truth for which
 * contracts exist — including the per-contract `token` (returned only at
 * creation and required later for exec / shell), which is persisted so it
 * survives a page refresh.
 */
export interface TrackedContract {
  contract_id: string
  token: string
  preset?: string
  ttl_seconds: number
  /** Client clock (`Date.now()`) at creation. */
  created_at: number
  status: ContractStatus
  ttl_seconds_remaining?: number
  /** Locally forgotten-from-polling flag (released or destroyed). */
  ended?: boolean
}

export interface Contracts {
  contracts: TrackedContract[]
  createLease(req: CreateContractRequest): Promise<TrackedContract>
  releaseLease(id: string): Promise<void>
  refresh(id: string): Promise<void>
  removeLease(id: string): void
  /** The contract whose detail view is open, or `null` for the list. */
  selectedId: string | null
  /** Open the detail view for `id`, or return to the list with `null`. */
  select(id: string | null): void
}

/** Terminal states that are never polled. */
const TERMINAL: ReadonlySet<ContractStatus> = new Set<ContractStatus>([
  'released',
  'expired',
])

/** True when a contract should no longer be polled. */
function isDone(c: TrackedContract): boolean {
  return c.ended === true || TERMINAL.has(c.status)
}

/** Read persisted tracked contracts, tolerating unavailable/corrupt storage. */
function readContracts(): TrackedContract[] {
  try {
    const raw = localStorage.getItem(CONTRACTS_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? (parsed as TrackedContract[]) : []
  } catch {
    return []
  }
}

/** Persist tracked contracts, tolerating unavailable storage. */
function writeContracts(contracts: TrackedContract[]): void {
  try {
    localStorage.setItem(CONTRACTS_KEY, JSON.stringify(contracts))
  } catch {
    // Storage unavailable (private mode / disabled) — keep in-memory state.
  }
}

const ContractsContext = createContext<Contracts | null>(null)

/**
 * Provides the app-wide list of tracked contracts, persisted to localStorage,
 * and runs a single background interval that polls every non-terminal contract
 * for live status + remaining TTL.
 */
export function ContractsProvider({ children }: { children: ReactNode }) {
  const client = useWispClient()
  const [contracts, setContracts] = useState<TrackedContract[]>(readContracts)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const select = useCallback((id: string | null) => {
    setSelectedId(id)
  }, [])

  // Persist on every change.
  useEffect(() => {
    writeContracts(contracts)
  }, [contracts])

  /** Merge a partial patch into one contract by id. */
  const patch = useCallback(
    (id: string, fields: Partial<TrackedContract>) => {
      setContracts((prev) =>
        prev.map((c) =>
          c.contract_id === id ? { ...c, ...fields } : c,
        ),
      )
    },
    [],
  )

  const createLease = useCallback(
    async (req: CreateContractRequest): Promise<TrackedContract> => {
      const res = await client.createContract(req)
      const tracked: TrackedContract = {
        contract_id: res.contract_id,
        token: res.token,
        preset: req.preset || undefined,
        ttl_seconds: req.ttl_seconds,
        created_at: Date.now(),
        status: res.status,
      }
      setContracts((prev) => [tracked, ...prev])
      return tracked
    },
    [client],
  )

  const releaseLease = useCallback(
    async (id: string): Promise<void> => {
      try {
        await client.deleteContract(id)
      } catch (err) {
        // A 404 means it's already gone — treat as released either way.
        if (!(err instanceof WispError && err.status === 404)) throw err
      }
      patch(id, {
        ended: true,
        status: 'released',
        ttl_seconds_remaining: 0,
      })
    },
    [client, patch],
  )

  const refresh = useCallback(
    async (id: string): Promise<void> => {
      try {
        const res = await client.getContract(id)
        patch(id, {
          status: res.status,
          ttl_seconds_remaining: res.ttl_seconds_remaining,
        })
      } catch (err) {
        if (err instanceof WispError && err.status === 404) {
          // Container destroyed / unknown — the contract is gone.
          patch(id, {
            ended: true,
            status: 'expired',
            ttl_seconds_remaining: 0,
          })
          return
        }
        throw err
      }
    },
    [client, patch],
  )

  const removeLease = useCallback((id: string) => {
    setContracts((prev) => prev.filter((c) => c.contract_id !== id))
    // If the removed contract was open in the detail view, return to the list.
    setSelectedId((cur) => (cur === id ? null : cur))
  }, [])

  // Single app-wide poll loop for all non-terminal contracts. `refresh` is kept
  // in a ref so the interval never has to be torn down/recreated on each change.
  const refreshRef = useRef(refresh)
  refreshRef.current = refresh
  const contractsRef = useRef(contracts)
  contractsRef.current = contracts

  useEffect(() => {
    const tick = () => {
      for (const c of contractsRef.current) {
        if (!isDone(c)) {
          // Swallow transient errors; the next tick retries.
          void refreshRef.current(c.contract_id).catch(() => {})
        }
      }
    }
    const id = setInterval(tick, POLL_INTERVAL_MS)
    return () => clearInterval(id)
  }, [])

  const value = useMemo<Contracts>(
    () => ({
      contracts,
      createLease,
      releaseLease,
      refresh,
      removeLease,
      selectedId,
      select,
    }),
    [contracts, createLease, releaseLease, refresh, removeLease, selectedId, select],
  )

  return (
    <ContractsContext.Provider value={value}>
      {children}
    </ContractsContext.Provider>
  )
}

/**
 * Access the tracked-contracts store. Must be used within `ContractsProvider`.
 */
export function useContracts(): Contracts {
  const ctx = useContext(ContractsContext)
  if (!ctx) {
    throw new Error('useContracts must be used within a ContractsProvider')
  }
  return ctx
}
