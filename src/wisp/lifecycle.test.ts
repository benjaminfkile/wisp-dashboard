import { describe, expect, it } from 'vitest'
import {
  TERMINAL_STATUSES,
  isReleasingStatus,
  isTerminalStatus,
} from './lifecycle'
import type { ContractStatus } from './types'

describe('lifecycle status helpers', () => {
  describe('TERMINAL_STATUSES', () => {
    it('contains released and expired', () => {
      expect(TERMINAL_STATUSES.has('released')).toBe(true)
      expect(TERMINAL_STATUSES.has('expired')).toBe(true)
    })

    it('does NOT contain releasing (it is a transient, non-terminal fence)', () => {
      expect(TERMINAL_STATUSES.has('releasing')).toBe(false)
    })

    it('does not contain any active state', () => {
      const active: ContractStatus[] = [
        'requested',
        'provisioning',
        'ready',
        'expiring',
      ]
      for (const s of active) {
        expect(TERMINAL_STATUSES.has(s)).toBe(false)
      }
    })
  })

  describe('isTerminalStatus', () => {
    it('is true for released and expired', () => {
      expect(isTerminalStatus('released')).toBe(true)
      expect(isTerminalStatus('expired')).toBe(true)
    })

    it('is false for releasing (transient fence, not terminal)', () => {
      expect(isTerminalStatus('releasing')).toBe(false)
    })

    it('is false for every non-terminal state', () => {
      const nonTerminal: ContractStatus[] = [
        'requested',
        'provisioning',
        'ready',
        'expiring',
        'releasing',
      ]
      for (const s of nonTerminal) {
        expect(isTerminalStatus(s)).toBe(false)
      }
    })
  })

  describe('isReleasingStatus', () => {
    it('is true only for releasing', () => {
      expect(isReleasingStatus('releasing')).toBe(true)
    })

    it('is false for every other state', () => {
      const others: ContractStatus[] = [
        'requested',
        'provisioning',
        'ready',
        'expiring',
        'released',
        'expired',
      ]
      for (const s of others) {
        expect(isReleasingStatus(s)).toBe(false)
      }
    })
  })
})
