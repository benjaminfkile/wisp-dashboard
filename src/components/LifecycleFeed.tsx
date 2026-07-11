import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Chip from '@mui/material/Chip'
import List from '@mui/material/List'
import ListItem from '@mui/material/ListItem'
import ListItemIcon from '@mui/material/ListItemIcon'
import ListItemText from '@mui/material/ListItemText'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import AddCircleOutlineIcon from '@mui/icons-material/AddCircleOutlineOutlined'
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutlineOutlined'
import HourglassBottomIcon from '@mui/icons-material/HourglassBottom'
import LogoutIcon from '@mui/icons-material/Logout'
import TimerOffIcon from '@mui/icons-material/TimerOff'
import CircularProgress from '@mui/material/CircularProgress'
import type { SvgIconComponent } from '@mui/icons-material'
import { useWispClient } from '../hooks/useWispClient'
import { useEventStream } from '../hooks/useEventStream'
import type { LifecycleEvent, LifecycleEventType } from '../wisp/types'

/** The lifecycle event types this feed subscribes to. */
const LIFECYCLE_TYPES: LifecycleEventType[] = [
  'contract.created',
  'contract.ready',
  'contract.expiring',
  'contract.released',
  'contract.expired',
]

type FeedColor = 'info' | 'success' | 'warning' | 'default' | 'error'

/** Per-type icon + accent color for the timeline. */
const EVENT_STYLE: Record<
  LifecycleEventType,
  { icon: SvgIconComponent; color: FeedColor; label: string }
> = {
  'contract.created': { icon: AddCircleOutlineIcon, color: 'info', label: 'Created' },
  'contract.ready': { icon: CheckCircleOutlineIcon, color: 'success', label: 'Ready' },
  'contract.expiring': { icon: HourglassBottomIcon, color: 'warning', label: 'Expiring' },
  'contract.released': { icon: LogoutIcon, color: 'default', label: 'Released' },
  'contract.expired': { icon: TimerOffIcon, color: 'error', label: 'Expired' },
}

/** Format a receipt timestamp as a local wall-clock time. */
function formatTime(ms: number): string {
  return new Date(ms).toLocaleTimeString()
}

/**
 * Normalize a raw bus message into a `LifecycleEvent`, tolerating both the
 * flat shape and the documented `{type, data:{contract_id, status}}` wire
 * shape. Returns null when it is not a lifecycle event we understand.
 */
function toLifecycle(raw: unknown): LifecycleEvent | null {
  if (!raw || typeof raw !== 'object') return null
  const obj = raw as Record<string, unknown>
  const type = obj.type
  if (typeof type !== 'string') return null
  if (!LIFECYCLE_TYPES.includes(type as LifecycleEventType)) return null

  const data = (obj.data && typeof obj.data === 'object' ? obj.data : {}) as Record<
    string,
    unknown
  >
  const contract_id = (obj.contract_id ?? data.contract_id) as unknown
  const status = (obj.status ?? data.status) as unknown
  if (typeof contract_id !== 'string') return null

  return {
    type: type as LifecycleEventType,
    contract_id,
    status: (typeof status === 'string' ? status : 'requested') as LifecycleEvent['status'],
  }
}

/**
 * Live feed of wisp lifecycle bus events filtered to one contract. Opens a
 * WebSocket to `WS /events` (app token via query param) and renders the
 * matching events as a color-coded timeline list, newest first.
 */
export default function LifecycleFeed({ contractId }: { contractId: string }) {
  const client = useWispClient()
  const url = client.eventsWsUrl(LIFECYCLE_TYPES)
  const { events, status, likelyUnauthorized } = useEventStream(url)

  // Keep only the lifecycle events for this contract, preserving newest-first.
  const items = events
    .map((e) => ({ id: e.id, receivedAt: e.receivedAt, ev: toLifecycle(e.event) }))
    .filter((e): e is { id: number; receivedAt: number; ev: LifecycleEvent } => e.ev !== null)
    .filter((e) => e.ev.contract_id === contractId)

  return (
    <Box>
      <Stack
        direction="row"
        spacing={1}
        sx={{ alignItems: 'center', justifyContent: 'space-between', mb: 1 }}
      >
        <Typography variant="subtitle2" color="text.secondary">
          Lifecycle events
        </Typography>
        <Chip
          size="small"
          variant="outlined"
          color={status === 'open' ? 'success' : status === 'connecting' ? 'default' : 'error'}
          icon={
            status === 'connecting' ? <CircularProgress size={12} thickness={6} /> : undefined
          }
          label={`stream: ${status}`}
        />
      </Stack>

      {likelyUnauthorized && (
        <Alert severity="warning" variant="outlined" sx={{ mb: 1.5 }}>
          The events stream closed immediately. If wisp requires an app token, set
          it in <strong>Settings</strong>.
        </Alert>
      )}

      {items.length === 0 ? (
        <Typography variant="body2" color="text.secondary" sx={{ py: 2 }}>
          {status === 'open'
            ? 'Waiting for lifecycle events for this lease…'
            : 'No lifecycle events yet.'}
        </Typography>
      ) : (
        <List dense disablePadding>
          {items.map(({ id, receivedAt, ev }) => {
            const style = EVENT_STYLE[ev.type]
            const Icon = style.icon
            return (
              <ListItem key={id} disableGutters sx={{ alignItems: 'flex-start' }}>
                <ListItemIcon sx={{ minWidth: 36, mt: 0.5 }}>
                  <Icon
                    fontSize="small"
                    color={style.color === 'default' ? 'disabled' : style.color}
                  />
                </ListItemIcon>
                <ListItemText
                  primary={
                    <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                      <Typography variant="body2" sx={{ fontWeight: 600 }}>
                        {style.label}
                      </Typography>
                      <Chip
                        size="small"
                        variant="outlined"
                        color={style.color === 'default' ? undefined : style.color}
                        label={ev.type}
                        sx={{ height: 18, '& .MuiChip-label': { px: 0.75, fontSize: 11 } }}
                      />
                    </Stack>
                  }
                  secondary={formatTime(receivedAt)}
                />
              </ListItem>
            )
          })}
        </List>
      )}
    </Box>
  )
}
