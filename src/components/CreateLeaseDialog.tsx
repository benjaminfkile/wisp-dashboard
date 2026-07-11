import { useState } from 'react'
import Dialog from '@mui/material/Dialog'
import DialogTitle from '@mui/material/DialogTitle'
import DialogContent from '@mui/material/DialogContent'
import DialogActions from '@mui/material/DialogActions'
import TextField from '@mui/material/TextField'
import MenuItem from '@mui/material/MenuItem'
import Button from '@mui/material/Button'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Stack from '@mui/material/Stack'
import { useContracts } from '../hooks/useContracts'
import { WispError } from '../wisp/client'

interface CreateLeaseDialogProps {
  /** Whether the dialog is open. */
  open: boolean
  /** Close the dialog (backdrop click, Cancel, Escape, or on success). */
  onClose: () => void
}

type Unit = 'seconds' | 'minutes' | 'hours'

const UNIT_SECONDS: Record<Unit, number> = {
  seconds: 1,
  minutes: 60,
  hours: 3600,
}

/**
 * Modal that creates a new lease (contract) via `POST /contracts`. TTL is a
 * friendly amount + unit that together produce `ttl_seconds`; preset and
 * userdata are optional. Errors surface as an inline MUI Alert (a 401 hints the
 * user to set their app token in Settings).
 */
export default function CreateLeaseDialog({
  open,
  onClose,
}: CreateLeaseDialogProps) {
  const { createLease } = useContracts()

  const [amount, setAmount] = useState('60')
  const [unit, setUnit] = useState<Unit>('minutes')
  const [preset, setPreset] = useState('')
  const [userdata, setUserdata] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const amountNum = Number(amount)
  const ttlSeconds = Math.floor(amountNum) * UNIT_SECONDS[unit]
  const ttlValid = Number.isFinite(amountNum) && ttlSeconds > 0

  function reset() {
    setAmount('60')
    setUnit('minutes')
    setPreset('')
    setUserdata('')
    setError(null)
    setSubmitting(false)
  }

  function handleClose() {
    if (submitting) return
    reset()
    onClose()
  }

  async function submit() {
    if (!ttlValid) {
      setError('TTL must be a positive whole number.')
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      await createLease({
        ttl_seconds: ttlSeconds,
        preset: preset.trim() || undefined,
        userdata: userdata.trim() ? userdata : undefined,
      })
      reset()
      onClose()
    } catch (err) {
      if (err instanceof WispError) {
        setError(
          err.status === 401
            ? `${err.message} — set a valid app token in Settings.`
            : err.message,
        )
      } else {
        setError(err instanceof Error ? err.message : 'Failed to create lease.')
      }
      setSubmitting(false)
    }
  }

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      aria-labelledby="create-lease-title"
      fullWidth
      maxWidth="sm"
    >
      <DialogTitle id="create-lease-title">New Lease</DialogTitle>
      <DialogContent>
        {error && (
          <Alert severity="error" sx={{ mb: 2, mt: 1 }}>
            {error}
          </Alert>
        )}

        <Box sx={{ mt: 1 }}>
          <Stack direction="row" spacing={2}>
            <TextField
              id="lease-ttl-amount"
              label="TTL"
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              error={amount !== '' && !ttlValid}
              helperText={
                amount !== '' && !ttlValid ? 'Must be a positive integer' : ' '
              }
              slotProps={{ htmlInput: { min: 1, step: 1 } }}
              sx={{ flex: 1 }}
            />
            <TextField
              id="lease-ttl-unit"
              label="Unit"
              select
              value={unit}
              onChange={(e) => setUnit(e.target.value as Unit)}
              helperText=" "
              sx={{ width: 140 }}
            >
              <MenuItem value="seconds">seconds</MenuItem>
              <MenuItem value="minutes">minutes</MenuItem>
              <MenuItem value="hours">hours</MenuItem>
            </TextField>
          </Stack>

          <TextField
            id="lease-preset"
            label="Preset (optional)"
            value={preset}
            onChange={(e) => setPreset(e.target.value)}
            placeholder="leave blank for the wisp default preset"
            fullWidth
            margin="normal"
            spellCheck={false}
            autoComplete="off"
          />

          <TextField
            id="lease-userdata"
            label="Userdata (optional)"
            value={userdata}
            onChange={(e) => setUserdata(e.target.value)}
            placeholder={'#!/bin/sh\n# provisioning script run at boot'}
            fullWidth
            multiline
            minRows={3}
            margin="normal"
            spellCheck={false}
            autoComplete="off"
            slotProps={{ htmlInput: { style: { fontFamily: 'inherit' } } }}
          />
        </Box>
      </DialogContent>
      <DialogActions>
        <Button color="inherit" onClick={handleClose} disabled={submitting}>
          Cancel
        </Button>
        <Button
          variant="contained"
          onClick={submit}
          disabled={submitting || !ttlValid}
        >
          {submitting ? 'Creating…' : 'Create Lease'}
        </Button>
      </DialogActions>
    </Dialog>
  )
}
