import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import Chip from '@mui/material/Chip'
import Box from '@mui/material/Box'
import Stack from '@mui/material/Stack'
import Divider from '@mui/material/Divider'
import Typography from '@mui/material/Typography'
import { useCountdown, useElapsed } from '../hooks/useCountdown'
import LifecycleFeed from './LifecycleFeed'
import type { TrackedContract } from '../hooks/useContracts'
import type { ContractStatus } from '../wisp/types'

type ChipColor = 'success' | 'warning' | 'info' | 'default'

const STATUS_COLOR: Record<ContractStatus, ChipColor> = {
  requested: 'info',
  provisioning: 'warning',
  ready: 'success',
  expiring: 'warning',
  released: 'default',
  expired: 'default',
}

/** True when the contract will never change again (release/expiry reached). */
function isTerminal(c: TrackedContract): boolean {
  return c.ended === true || c.status === 'released' || c.status === 'expired'
}

/** Format whole seconds as `1h 02m 05s` (drops the hours part when zero). */
function formatDuration(total: number): string {
  const s = Math.max(0, Math.floor(total))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  const mm = String(m).padStart(2, '0')
  const ss = String(sec).padStart(2, '0')
  return h > 0 ? `${h}h ${mm}m ${ss}s` : `${m}m ${ss}s`
}

/** A labelled value row inside the details card. */
function Field({
  label,
  children,
  mono,
}: {
  label: string
  children: React.ReactNode
  mono?: boolean
}) {
  return (
    <Stack
      direction="row"
      spacing={2}
      sx={{ justifyContent: 'space-between', alignItems: 'baseline' }}
    >
      <Typography variant="body2" color="text.secondary" sx={{ flexShrink: 0 }}>
        {label}
      </Typography>
      <Typography
        variant="body2"
        sx={{
          textAlign: 'right',
          fontVariantNumeric: mono ? 'tabular-nums' : undefined,
          fontWeight: mono ? 600 : 400,
        }}
      >
        {children}
      </Typography>
    </Stack>
  )
}

/**
 * The Overview tab for a lease: a details card (status, image, network, created-at,
 * live uptime, live TTL countdown, computed expires-at) plus the live
 * lifecycle events feed. Uptime and the countdown tick locally every second;
 * the countdown re-syncs from the store's polled `ttl_seconds_remaining` and
 * freezes at 0 once the contract is terminal.
 */
export default function LeaseOverview({ contract }: { contract: TrackedContract }) {
  const terminal = isTerminal(contract)

  const uptime = useElapsed(contract.created_at, terminal)
  const remaining = useCountdown(
    contract.ttl_seconds_remaining ?? contract.ttl_seconds,
    terminal,
  )

  const expiresAt = contract.created_at + contract.ttl_seconds * 1000

  return (
    <Stack spacing={3}>
      <Card variant="outlined">
        <CardContent>
          <Stack spacing={1.5}>
            <Field label="Status">
              <Chip
                size="small"
                variant={terminal ? 'outlined' : 'filled'}
                color={STATUS_COLOR[contract.status]}
                label={contract.status}
              />
            </Field>
            <Divider flexItem />
            <Field label="Image">{contract.image || 'default'}</Field>
            {contract.network && <Field label="Network">{contract.network}</Field>}
            <Field label="Created">{new Date(contract.created_at).toLocaleString()}</Field>
            <Field label="Uptime" mono>
              {formatDuration(uptime)}
            </Field>
            <Field label="TTL remaining" mono>
              <Box
                component="span"
                sx={{
                  color: terminal
                    ? 'text.secondary'
                    : remaining <= 30
                      ? 'warning.main'
                      : 'text.primary',
                }}
              >
                {formatDuration(remaining)}
              </Box>
            </Field>
            <Field label="Expires">{new Date(expiresAt).toLocaleString()}</Field>
          </Stack>
        </CardContent>
      </Card>

      <Card variant="outlined">
        <CardContent>
          <LifecycleFeed contractId={contract.contract_id} />
        </CardContent>
      </Card>
    </Stack>
  )
}
