import { useEffect, useState } from 'react'
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
import CircularProgress from '@mui/material/CircularProgress'
import { useContracts } from '../hooks/useContracts'
import { useWispClient } from '../hooks/useWispClient'
import GpuCapabilitySection from './GpuCapabilitySection'
import { WispError } from '../wisp/client'
import type {
  ContractResources,
  ImagesResponse,
  WispNetwork,
} from '../wisp/types'

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

/** Human label for each network mode shown in the dropdown. */
const NETWORK_LABEL: Record<WispNetwork, string> = {
  none: 'none — no network',
  open: 'open — full network',
  egress: 'egress — outbound only',
}

/** Parse a numeric string, returning `undefined` when blank/invalid. */
function parsePositive(value: string): number | undefined {
  const trimmed = value.trim()
  if (trimmed === '') return undefined
  const n = Number(trimmed)
  return Number.isFinite(n) && n > 0 ? n : undefined
}

/**
 * Modal that creates a new lease (contract) via `POST /contracts`. On open it
 * loads the image allow-list, default image, and operator limits from
 * `GET /images` and offers an image dropdown, a network select, and optional
 * cpus/memory_mb/pids resource fields (each capped to the configured limit when
 * non-zero). TTL is a friendly amount + unit producing `ttl_seconds`, capped to
 * `max_ttl_seconds` when set. If `GET /images` fails the dialog degrades to a
 * free-text image field and a default `open` network so a lease can still be
 * created. Errors surface as an inline MUI Alert (a 401 hints at the app token).
 */
export default function CreateLeaseDialog({
  open,
  onClose,
}: CreateLeaseDialogProps) {
  const { createLease } = useContracts()
  const { getImages } = useWispClient()

  const [amount, setAmount] = useState('60')
  const [unit, setUnit] = useState<Unit>('minutes')
  const [image, setImage] = useState('')
  const [network, setNetwork] = useState<WispNetwork>('open')
  const [cpus, setCpus] = useState('')
  const [memoryMb, setMemoryMb] = useState('')
  const [pids, setPids] = useState('')
  const [userdata, setUserdata] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Discovery from GET /images.
  const [discovery, setDiscovery] = useState<ImagesResponse | null>(null)
  const [loadingImages, setLoadingImages] = useState(false)
  // Non-blocking notice when GET /images failed — we fall back to free text.
  const [imagesError, setImagesError] = useState<string | null>(null)

  // Load the allow-list + limits each time the dialog opens.
  useEffect(() => {
    if (!open) return
    let cancelled = false
    setLoadingImages(true)
    setImagesError(null)
    getImages()
      .then((res) => {
        if (cancelled) return
        setDiscovery(res)
        setImage(res.default || res.images[0] || '')
        const nets = res.limits?.networks ?? []
        setNetwork(nets.includes('open') ? 'open' : nets[0] ?? 'open')
      })
      .catch((err) => {
        if (cancelled) return
        setDiscovery(null)
        setImage('')
        setNetwork('open')
        setImagesError(
          err instanceof Error
            ? `Couldn't load images (${err.message}); enter an image manually.`
            : "Couldn't load images; enter an image manually.",
        )
      })
      .finally(() => {
        if (!cancelled) setLoadingImages(false)
      })
    return () => {
      cancelled = true
    }
  }, [open, getImages])

  const limits = discovery?.limits
  const maxTtl = limits?.max_ttl_seconds ?? 0
  const maxCpus = limits?.max_cpus ?? 0
  const maxMemory = limits?.max_memory_mb ?? 0
  const maxPids = limits?.pids_limit ?? 0

  const amountNum = Number(amount)
  const ttlSeconds = Math.floor(amountNum) * UNIT_SECONDS[unit]
  const ttlPositive = Number.isFinite(amountNum) && ttlSeconds > 0
  const ttlOverMax = maxTtl > 0 && ttlSeconds > maxTtl
  const ttlValid = ttlPositive && !ttlOverMax

  const cpusNum = parsePositive(cpus)
  const memoryNum = parsePositive(memoryMb)
  const pidsNum = parsePositive(pids)
  const cpusOver = maxCpus > 0 && cpusNum !== undefined && cpusNum > maxCpus
  const memoryOver =
    maxMemory > 0 && memoryNum !== undefined && memoryNum > maxMemory
  const pidsOver = maxPids > 0 && pidsNum !== undefined && pidsNum > maxPids

  const imageValid = image.trim() !== ''
  const resourcesValid = !cpusOver && !memoryOver && !pidsOver
  const canSubmit =
    ttlValid && imageValid && resourcesValid && !loadingImages && !submitting

  function reset() {
    setAmount('60')
    setUnit('minutes')
    setImage(discovery ? discovery.default || discovery.images[0] || '' : '')
    setNetwork('open')
    setCpus('')
    setMemoryMb('')
    setPids('')
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
    if (!ttlPositive) {
      setError('TTL must be a positive whole number.')
      return
    }
    if (ttlOverMax) {
      setError(`TTL exceeds the configured max of ${maxTtl}s.`)
      return
    }
    if (!imageValid) {
      setError('An image is required.')
      return
    }
    if (!resourcesValid) {
      setError('One or more resource values exceed the configured limits.')
      return
    }

    // Clamp resources to the configured maxima and include only set fields.
    const resources: ContractResources = {}
    if (cpusNum !== undefined) {
      resources.cpus = maxCpus > 0 ? Math.min(cpusNum, maxCpus) : cpusNum
    }
    if (memoryNum !== undefined) {
      resources.memory_mb =
        maxMemory > 0 ? Math.min(memoryNum, maxMemory) : memoryNum
    }
    if (pidsNum !== undefined) {
      resources.pids = maxPids > 0 ? Math.min(pidsNum, maxPids) : pidsNum
    }
    const hasResources = Object.keys(resources).length > 0

    setSubmitting(true)
    setError(null)
    try {
      await createLease({
        ttl_seconds: ttlSeconds,
        image: image.trim() || undefined,
        network,
        resources: hasResources ? resources : undefined,
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

  const networks = limits?.networks ?? []

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
        {imagesError && (
          <Alert severity="warning" sx={{ mb: 2, mt: 1 }}>
            {imagesError}
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
                amount !== '' && ttlOverMax
                  ? `Max ${maxTtl}s`
                  : amount !== '' && !ttlPositive
                    ? 'Must be a positive integer'
                    : maxTtl > 0
                      ? `Max ${maxTtl}s`
                      : ' '
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

          {loadingImages ? (
            <Stack
              direction="row"
              spacing={1.5}
              sx={{ alignItems: 'center', my: 2 }}
            >
              <CircularProgress size={18} />
              <Box component="span" sx={{ color: 'text.secondary' }}>
                Loading images…
              </Box>
            </Stack>
          ) : discovery ? (
            <TextField
              id="lease-image"
              label="Image"
              select
              value={image}
              onChange={(e) => setImage(e.target.value)}
              helperText="One of the allow-listed images"
              fullWidth
              margin="normal"
            >
              {discovery.images.map((img) => (
                <MenuItem key={img} value={img}>
                  {img}
                  {img === discovery.default ? ' (default)' : ''}
                </MenuItem>
              ))}
            </TextField>
          ) : (
            <TextField
              id="lease-image"
              label="Image"
              value={image}
              onChange={(e) => setImage(e.target.value)}
              placeholder="e.g. ubuntu:24.04"
              helperText="Enter an allow-listed image"
              fullWidth
              margin="normal"
              spellCheck={false}
              autoComplete="off"
            />
          )}

          {discovery && networks.length > 0 ? (
            <TextField
              id="lease-network"
              label="Network"
              select
              value={network}
              onChange={(e) => setNetwork(e.target.value as WispNetwork)}
              helperText="Container network mode"
              fullWidth
              margin="normal"
            >
              {networks.map((net) => (
                <MenuItem key={net} value={net}>
                  {NETWORK_LABEL[net] ?? net}
                </MenuItem>
              ))}
            </TextField>
          ) : null}

          <Stack direction="row" spacing={2}>
            <TextField
              id="lease-cpus"
              label="CPUs (optional)"
              type="number"
              value={cpus}
              onChange={(e) => setCpus(e.target.value)}
              error={cpusOver}
              helperText={
                cpusOver
                  ? `Max ${maxCpus}`
                  : maxCpus > 0
                    ? `Max ${maxCpus}`
                    : ' '
              }
              slotProps={{ htmlInput: { min: 0, step: 'any' } }}
              sx={{ flex: 1 }}
            />
            <TextField
              id="lease-memory"
              label="Memory MB (optional)"
              type="number"
              value={memoryMb}
              onChange={(e) => setMemoryMb(e.target.value)}
              error={memoryOver}
              helperText={
                memoryOver
                  ? `Max ${maxMemory}`
                  : maxMemory > 0
                    ? `Max ${maxMemory}`
                    : ' '
              }
              slotProps={{ htmlInput: { min: 0, step: 1 } }}
              sx={{ flex: 1 }}
            />
            <TextField
              id="lease-pids"
              label="PIDs (optional)"
              type="number"
              value={pids}
              onChange={(e) => setPids(e.target.value)}
              error={pidsOver}
              helperText={
                pidsOver
                  ? `Max ${maxPids}`
                  : maxPids > 0
                    ? `Max ${maxPids}`
                    : ' '
              }
              slotProps={{ htmlInput: { min: 0, step: 1 } }}
              sx={{ flex: 1 }}
            />
          </Stack>

          <GpuCapabilitySection gpu={discovery?.gpu} />

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
        <Button variant="contained" onClick={submit} disabled={!canSubmit}>
          {submitting ? 'Creating…' : 'Create Lease'}
        </Button>
      </DialogActions>
    </Dialog>
  )
}
