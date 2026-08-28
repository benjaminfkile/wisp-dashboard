import { useState } from 'react'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import Chip from '@mui/material/Chip'
import Button from '@mui/material/Button'
import IconButton from '@mui/material/IconButton'
import Typography from '@mui/material/Typography'
import Box from '@mui/material/Box'
import Stack from '@mui/material/Stack'
import Tooltip from '@mui/material/Tooltip'
import Paper from '@mui/material/Paper'
import ContentCopyIcon from '@mui/icons-material/ContentCopy'
import CheckIcon from '@mui/icons-material/Check'
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutlined'
import WarningIcon from '@mui/icons-material/Warning'
import {
  useContracts,
  type PollError,
  type TrackedContract,
} from '../hooks/useContracts'
import { useGpuCapability } from '../hooks/useGpuCapability'
import type { ContractStatus, GpuDevice } from '../wisp/types'

type ChipColor = 'success' | 'warning' | 'info' | 'default'

/** Map a contract status to a themed Chip color. */
const STATUS_COLOR: Record<ContractStatus, ChipColor> = {
  requested: 'info',
  provisioning: 'warning',
  ready: 'success',
  expiring: 'warning',
  released: 'default',
  expired: 'default',
}

/** Terminal states — the Release action is disabled for these. */
function isTerminal(c: TrackedContract): boolean {
  return c.ended === true || c.status === 'released' || c.status === 'expired'
}

/** Shorten a contract id for display, keeping enough to disambiguate. */
function shortId(id: string): string {
  return id.length > 14 ? `${id.slice(0, 10)}…${id.slice(-4)}` : id
}

/** Format seconds as a human duration, e.g. `58m 12s` or `1h 03m`. */
function humanDuration(total?: number): string {
  if (total === undefined || total < 0) return '—'
  const s = Math.floor(total)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m`
  if (m > 0) return `${m}m ${String(sec).padStart(2, '0')}s`
  return `${sec}s`
}

/**
 * Render one assigned GPU device id as its class when resolvable against the
 * live inventory, else the bare id (a restart-reconciled lease may reference a
 * device the host no longer lists).
 */
function gpuLabel(id: string, byId: Map<string, GpuDevice>): string {
  return byId.get(id)?.class ?? id
}

/** Format a poll error as a short human summary (e.g. `poll: 401 unauthorized`). */
function pollErrorLabel(err: PollError): string {
  return err.status > 0
    ? `poll: ${err.status} ${err.message}`
    : `poll: ${err.message}`
}

/** A single tracked-contract card. */
function ContractCard({
  contract,
  devices,
  pollError,
}: {
  contract: TrackedContract
  devices?: GpuDevice[]
  pollError?: PollError
}) {
  const { releaseLease, removeLease, select } = useContracts()
  const [copied, setCopied] = useState(false)
  const [releasing, setReleasing] = useState(false)

  const terminal = isTerminal(contract)
  const byId = new Map((devices ?? []).map((d) => [d.id, d]))

  async function copyId() {
    try {
      await navigator.clipboard.writeText(contract.contract_id)
      setCopied(true)
      setTimeout(() => setCopied(false), 1200)
    } catch {
      // Clipboard unavailable — no-op.
    }
  }

  async function release() {
    setReleasing(true)
    try {
      await releaseLease(contract.contract_id)
    } finally {
      setReleasing(false)
    }
  }

  return (
    <Card
      variant="outlined"
      sx={{ opacity: terminal ? 0.6 : 1, transition: 'opacity 0.2s' }}
    >
      <CardContent>
        <Stack
          direction={{ xs: 'column', sm: 'row' }}
          spacing={2}
          sx={{
            alignItems: { xs: 'flex-start', sm: 'center' },
            justifyContent: 'space-between',
          }}
        >
          <Box sx={{ minWidth: 0 }}>
            <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
              <Typography
                variant="subtitle1"
                component="span"
                title={contract.contract_id}
                sx={{ fontWeight: 600 }}
              >
                {shortId(contract.contract_id)}
              </Typography>
              <Tooltip title={copied ? 'Copied!' : 'Copy contract id'}>
                <IconButton
                  size="small"
                  aria-label="Copy contract id"
                  onClick={copyId}
                >
                  {copied ? (
                    <CheckIcon fontSize="small" color="success" />
                  ) : (
                    <ContentCopyIcon fontSize="small" />
                  )}
                </IconButton>
              </Tooltip>
              <Chip
                size="small"
                variant={terminal ? 'outlined' : 'filled'}
                color={STATUS_COLOR[contract.status]}
                label={contract.status}
              />
              {!terminal && pollError && (
                <Tooltip title={pollErrorLabel(pollError)}>
                  <Chip
                    size="small"
                    variant="outlined"
                    color="warning"
                    icon={<WarningIcon fontSize="small" />}
                    label={
                      pollError.status > 0
                        ? `poll ${pollError.status}`
                        : 'poll failed'
                    }
                  />
                </Tooltip>
              )}
            </Stack>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
              image:{' '}
              <Box component="span" sx={{ color: 'text.primary' }}>
                {contract.image || 'default'}
              </Box>
              {contract.network && (
                <>
                  {'  ·  '}
                  network:{' '}
                  <Box component="span" sx={{ color: 'text.primary' }}>
                    {contract.network}
                  </Box>
                </>
              )}
              {contract.gpus && contract.gpus.length > 0 && (
                <>
                  {'  ·  '}
                  gpus:{' '}
                  <Box component="span" sx={{ color: 'text.primary' }}>
                    {contract.gpus.map((id) => gpuLabel(id, byId)).join(', ')}
                  </Box>
                </>
              )}
              {'  ·  '}
              remaining:{' '}
              <Box component="span" sx={{ color: 'text.primary' }}>
                {terminal ? '—' : humanDuration(contract.ttl_seconds_remaining)}
              </Box>
            </Typography>
          </Box>

          <Stack direction="row" spacing={1} sx={{ flexShrink: 0 }}>
            <Button
              size="small"
              variant="contained"
              onClick={() => select(contract.contract_id)}
            >
              Open
            </Button>
            <Button
              size="small"
              color="error"
              variant="outlined"
              onClick={release}
              disabled={terminal || releasing}
            >
              {releasing ? 'Releasing…' : 'Release'}
            </Button>
            {terminal && (
              <Tooltip title="Forget this contract">
                <IconButton
                  size="small"
                  aria-label="Remove contract"
                  onClick={() => removeLease(contract.contract_id)}
                >
                  <DeleteOutlineIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            )}
          </Stack>
        </Stack>
      </CardContent>
    </Card>
  )
}

/**
 * The live list of contracts this dashboard has created. Each card shows a
 * shortened id (with copy), a color-coded status chip, the image (and network),
 * any assigned GPUs (device class when resolvable against the live inventory,
 * else the bare id), and the human-readable remaining TTL, plus Release /
 * Remove actions. Status and TTL are kept live by the polling in
 * `ContractsProvider`.
 */
export default function ContractList() {
  const { contracts, pollErrors } = useContracts()
  const gpu = useGpuCapability()

  if (contracts.length === 0) {
    return (
      <Paper variant="outlined" sx={{ p: 4, textAlign: 'center' }}>
        <Typography variant="h6" component="p" gutterBottom>
          No leases yet.
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Create your first lease with the <strong>New Lease</strong> button to
          spin up a short-lived container.
        </Typography>
      </Paper>
    )
  }

  return (
    <Stack spacing={2}>
      {contracts.map((c) => (
        <ContractCard
          key={c.contract_id}
          contract={c}
          devices={gpu?.devices}
          pollError={pollErrors[c.contract_id]}
        />
      ))}
    </Stack>
  )
}
