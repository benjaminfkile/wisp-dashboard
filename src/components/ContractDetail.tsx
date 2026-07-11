import { useState } from 'react'
import Box from '@mui/material/Box'
import Stack from '@mui/material/Stack'
import Button from '@mui/material/Button'
import IconButton from '@mui/material/IconButton'
import Chip from '@mui/material/Chip'
import Tabs from '@mui/material/Tabs'
import Tab from '@mui/material/Tab'
import Tooltip from '@mui/material/Tooltip'
import Typography from '@mui/material/Typography'
import ArrowBackIcon from '@mui/icons-material/ArrowBack'
import ContentCopyIcon from '@mui/icons-material/ContentCopy'
import CheckIcon from '@mui/icons-material/Check'
import { useContracts, type TrackedContract } from '../hooks/useContracts'
import type { ContractStatus } from '../wisp/types'
import LeaseOverview from './LeaseOverview'
import ConsolePanel from './ConsolePanel'
import ExecPanel from './ExecPanel'

type ChipColor = 'success' | 'warning' | 'info' | 'default'

const STATUS_COLOR: Record<ContractStatus, ChipColor> = {
  requested: 'info',
  provisioning: 'warning',
  ready: 'success',
  expiring: 'warning',
  released: 'default',
  expired: 'default',
}

function isTerminal(c: TrackedContract): boolean {
  return c.ended === true || c.status === 'released' || c.status === 'expired'
}

/** Shorten a contract id for display, keeping enough to disambiguate. */
function shortId(id: string): string {
  return id.length > 14 ? `${id.slice(0, 10)}…${id.slice(-4)}` : id
}

/** Renders `children` only when its tab is active, keeping mounts scoped. */
function TabPanel({
  active,
  children,
}: {
  active: boolean
  children: React.ReactNode
}) {
  return (
    <Box role="tabpanel" hidden={!active} sx={{ pt: 3 }}>
      {active && children}
    </Box>
  )
}

/**
 * Per-lease detail surface: a header (id + copy, status chip, Back, Release)
 * and a Tabs control with Overview / Console / Exec. Overview is implemented
 * here; Console and Exec render placeholder panels that later tasks replace.
 * Each tab panel receives the selected `TrackedContract` as `contract`.
 */
export default function ContractDetail({
  contract,
}: {
  contract: TrackedContract
}) {
  const { select, releaseLease } = useContracts()
  const [tab, setTab] = useState(0)
  const [copied, setCopied] = useState(false)
  const [releasing, setReleasing] = useState(false)

  const terminal = isTerminal(contract)

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
    <Box>
      <Stack
        direction={{ xs: 'column', sm: 'row' }}
        spacing={2}
        sx={{
          alignItems: { xs: 'flex-start', sm: 'center' },
          justifyContent: 'space-between',
          mb: 1,
        }}
      >
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center', minWidth: 0 }}>
          <Button
            size="small"
            variant="text"
            color="inherit"
            startIcon={<ArrowBackIcon />}
            onClick={() => select(null)}
          >
            Back
          </Button>
          <Typography
            variant="h6"
            component="h2"
            title={contract.contract_id}
            sx={{ fontWeight: 600 }}
          >
            {shortId(contract.contract_id)}
          </Typography>
          <Tooltip title={copied ? 'Copied!' : 'Copy contract id'}>
            <IconButton size="small" aria-label="Copy contract id" onClick={copyId}>
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
        </Stack>

        <Button
          size="small"
          color="error"
          variant="outlined"
          onClick={release}
          disabled={terminal || releasing}
          sx={{ flexShrink: 0 }}
        >
          {releasing ? 'Releasing…' : 'Release'}
        </Button>
      </Stack>

      <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
        <Tabs value={tab} onChange={(_, v) => setTab(v as number)} aria-label="Lease detail tabs">
          <Tab label="Overview" id="lease-tab-0" aria-controls="lease-tabpanel-0" />
          <Tab label="Console" id="lease-tab-1" aria-controls="lease-tabpanel-1" />
          <Tab label="Exec" id="lease-tab-2" aria-controls="lease-tabpanel-2" />
        </Tabs>
      </Box>

      <TabPanel active={tab === 0}>
        <LeaseOverview contract={contract} />
      </TabPanel>
      <TabPanel active={tab === 1}>
        <ConsolePanel contract={contract} />
      </TabPanel>
      <TabPanel active={tab === 2}>
        <ExecPanel contract={contract} />
      </TabPanel>
    </Box>
  )
}
