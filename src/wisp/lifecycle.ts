// Pure helpers over ContractStatus, kept separate from the client so components
// and hooks can share the same classification. The dashboard treats:
//
// - `released` and `expired` as terminal (matches wisp: exec / shell are 409,
//   the reaper purges the contract shortly after);
// - `releasing` as a transient, non-terminal fence a `DELETE` installs before
//   killing the container (exec / shell are 409, `GET /contracts` excludes it,
//   a concurrent `DELETE` returns 200 echoing this status); it eventually
//   transitions to `released`.

import type { ContractStatus } from './types'

/** Wisp's terminal states. `releasing` is NOT here (it is a transient fence). */
export const TERMINAL_STATUSES: ReadonlySet<ContractStatus> = new Set<ContractStatus>([
  'released',
  'expired',
])

/** True when the status is one of wisp's terminal states. */
export function isTerminalStatus(status: ContractStatus): boolean {
  return TERMINAL_STATUSES.has(status)
}

/** True when the contract is inside the transient release fence. */
export function isReleasingStatus(status: ContractStatus): boolean {
  return status === 'releasing'
}
