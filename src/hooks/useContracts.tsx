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
import { TERMINAL_STATUSES } from '../wisp/lifecycle'
import type {
  ContractStatus,
  CreateContractRequest,
  WispNetwork,
} from '../wisp/types'

/** localStorage key under which tracked contracts are persisted. */
export const CONTRACTS_KEY = 'wisp.contracts'

/** Status-poll interval for non-terminal contracts. */
const POLL_INTERVAL_MS = 4000

/**
 * A contract this dashboard created and now tracks. The dashboard uses its
 * own persisted list as the source of truth (it does not read wisp's
 * `GET /contracts`), including the per-contract `token` returned only at
 * creation and required later for exec / shell, which is persisted so it
 * survives a page refresh.
 */
export interface TrackedContract {
  contract_id: string
  token: string
  /** The image this contract was created from (from the allow-list). */
  image?: string
  /** The network mode the contract was created with. */
  network?: WispNetwork
  ttl_seconds: number
  /** Client clock (`Date.now()`) at creation. */
  created_at: number
  status: ContractStatus
  ttl_seconds_remaining?: number
  /**
   * GPU device ids assigned to this contract, from the polled status payload.
   * Absent on older wisp or when no devices are assigned. Cross-reference to
   * the host `gpu.devices` (see `useGpuCapability`) to resolve a device class.
   */
  gpus?: string[]
  /** Locally forgotten-from-polling flag (released or destroyed). */
  ended?: boolean
}

/** Latest status-poll error for a specific contract, surfaced to the UI. */
export interface PollError {
  /** HTTP status when the failure was a WispError; `0` for non-HTTP errors. */
  status: number
  /** Human-readable message from wisp (or the underlying Error). */
  message: string
  /** Client clock at which the failure was observed. */
  at: number
}

export interface Contracts {
  contracts: TrackedContract[]
  /**
   * Latest status-poll error per contract id (cleared on the next successful
   * poll). Surfaced by the UI so a failing 4 s poll is visible instead of
   * silently freezing the displayed status.
   */
  pollErrors: Record<string, PollError>
  createLease(req: CreateContractRequest): Promise<TrackedContract>
  releaseLease(id: string): Promise<void>
  refresh(id: string): Promise<void>
  removeLease(id: string): void
  /** The contract whose detail view is open, or `null` for the list. */
  selectedId: string | null
  /** Open the detail view for `id`, or return to the list with `null`. */
  select(id: string | null): void
}

/** True when a contract should no longer be polled. */
function isDone(c: TrackedContract): boolean {
  return c.ended === true || TERMINAL_STATUSES.has(c.status)
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
  const [pollErrors, setPollErrors] = useState<Record<string, PollError>>({})
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const select = useCallback((id: string | null) => {
    setSelectedId(id)
  }, [])

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

  const clearPollError = useCallback((id: string) => {
    setPollErrors((prev) => {
      if (!(id in prev)) return prev
      const next = { ...prev }
      delete next[id]
      return next
    })
  }, [])

  const recordPollError = useCallback((id: string, err: unknown) => {
    const status = err instanceof WispError ? err.status : 0
    const message =
      err instanceof Error && err.message ? err.message : 'poll failed'
    setPollErrors((prev) => ({
      ...prev,
      [id]: { status, message, at: Date.now() },
    }))
  }, [])

  const createLease = useCallback(
    async (req: CreateContractRequest): Promise<TrackedContract> => {
      const res = await client.createContract(req)
      const tracked: TrackedContract = {
        contract_id: res.contract_id,
        token: res.token,
        image: req.image || undefined,
        network: req.network,
        ttl_seconds: req.ttl_seconds,
        created_at: Date.now(),
        status: res.status,
      }
      setContracts((prev) => [tracked, ...prev])
      return tracked
    },
    [client],
  )

  const contractsRef = useRef(contracts)
  contractsRef.current = contracts

  /** Look up the persisted per-contract token so it can be sent as a fallback. */
  const tokenFor = useCallback((id: string): string | undefined => {
    return contractsRef.current.find((c) => c.contract_id === id)?.token
  }, [])

  const releaseLease = useCallback(
    async (id: string): Promise<void> => {
      let status: ContractStatus = 'released'
      let ttlRemaining = 0
      try {
        const res = await client.deleteContract(id, tokenFor(id))
        status = res.status
        ttlRemaining = res.ttl_seconds_remaining
      } catch (err) {
        // A 404 means it's already gone; treat as released either way.
        if (!(err instanceof WispError && err.status === 404)) throw err
      }
      // Trust the wire status. `released` and `expired` are terminal; the
      // transient `releasing` fence keeps polling running until the terminal
      // transition lands, and a concurrent DELETE that saw `releasing` is
      // echoed here without a spurious jump to `released`.
      const fields: Partial<TrackedContract> = {
        status,
        ttl_seconds_remaining: ttlRemaining,
      }
      if (TERMINAL_STATUSES.has(status)) fields.ended = true
      patch(id, fields)
      clearPollError(id)
    },
    [client, patch, tokenFor, clearPollError],
  )

  const refresh = useCallback(
    async (id: string): Promise<void> => {
      try {
        const res = await client.getContract(id, tokenFor(id))
        patch(id, {
          status: res.status,
          ttl_seconds_remaining: res.ttl_seconds_remaining,
          // Reflect the live device assignment (absent on older wisp).
          gpus: res.gpus,
        })
        clearPollError(id)
      } catch (err) {
        if (err instanceof WispError && err.status === 404) {
          // Container destroyed / unknown — the contract is gone.
          patch(id, {
            ended: true,
            status: 'expired',
            ttl_seconds_remaining: 0,
          })
          clearPollError(id)
          return
        }
        recordPollError(id, err)
        throw err
      }
    },
    [client, patch, tokenFor, clearPollError, recordPollError],
  )

  const removeLease = useCallback((id: string) => {
    setContracts((prev) => prev.filter((c) => c.contract_id !== id))
    clearPollError(id)
    // If the removed contract was open in the detail view, return to the list.
    setSelectedId((cur) => (cur === id ? null : cur))
  }, [clearPollError])

  // Single app-wide poll loop for all non-terminal contracts. `refresh` is kept
  // in a ref so the interval never has to be torn down/recreated on each change.
  const refreshRef = useRef(refresh)
  refreshRef.current = refresh

  useEffect(() => {
    const tick = () => {
      for (const c of contractsRef.current) {
        if (!isDone(c)) {
          // `refresh` records failures into `pollErrors` for the UI; the next
          // tick retries. Any throw here is only for downstream awaiters.
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
      pollErrors,
      createLease,
      releaseLease,
      refresh,
      removeLease,
      selectedId,
      select,
    }),
    [
      contracts,
      pollErrors,
      createLease,
      releaseLease,
      refresh,
      removeLease,
      selectedId,
      select,
    ],
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
