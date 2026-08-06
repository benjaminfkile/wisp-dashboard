import Box from '@mui/material/Box'
import Stack from '@mui/material/Stack'
import Chip from '@mui/material/Chip'
import Divider from '@mui/material/Divider'
import Typography from '@mui/material/Typography'
import type { GpuCapability } from '../wisp/types'

/**
 * Render a device's `vram_mb` human-readably: mebibytes below 1 GiB stay as
 * `MB` (e.g. `512 MB`); at/above 1 GiB they collapse to `GB` with at most one
 * decimal (e.g. `16384 -> 16 GB`, `24576 -> 24 GB`, `12800 -> 12.5 GB`).
 */
export function formatVram(mb: number): string {
  if (!Number.isFinite(mb) || mb <= 0) return '—'
  if (mb >= 1024) {
    const gb = Math.round((mb / 1024) * 10) / 10
    return `${Number.isInteger(gb) ? gb : gb.toFixed(1)} GB`
  }
  return `${mb} MB`
}

/**
 * The host GPU capability block, derived from `GET /images` `gpu`. Rendered
 * wherever the /images capability is shown (the New Lease dialog). Mirrors how
 * the other optional capability bits degrade: when the `gpu` object is absent
 * (older wisp) or the host reports `supported: false`, it renders **nothing**
 * — no empty-section noise. Otherwise it lists each device (class, VRAM
 * human-readably, id in a subdued monospace style), the per-lease `max_gpus`
 * cap, and the GPU isolation levels.
 */
export default function GpuCapabilitySection({
  gpu,
}: {
  gpu?: GpuCapability | null
}) {
  if (!gpu || !gpu.supported) return null

  const devices = gpu.devices ?? []
  const isolations = gpu.isolations ?? []

  return (
    <Box sx={{ mt: 2 }}>
      <Divider sx={{ mb: 1.5 }} />
      <Typography variant="subtitle2" gutterBottom>
        GPU
      </Typography>

      {devices.length > 0 ? (
        <Stack spacing={0.5}>
          {devices.map((d) => (
            <Stack
              key={d.id}
              direction="row"
              spacing={1}
              sx={{ alignItems: 'baseline', flexWrap: 'wrap' }}
            >
              <Typography variant="body2" sx={{ color: 'text.primary' }}>
                {d.class}
              </Typography>
              <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                {formatVram(d.vram_mb)}
              </Typography>
              <Box
                component="span"
                sx={{
                  fontFamily: 'monospace',
                  fontSize: '0.8125rem',
                  color: 'text.disabled',
                }}
              >
                {d.id}
              </Box>
            </Stack>
          ))}
        </Stack>
      ) : (
        <Typography variant="body2" color="text.secondary">
          No devices reported.
        </Typography>
      )}

      <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
        Max GPUs per lease:{' '}
        <Box component="span" sx={{ color: 'text.primary' }}>
          {gpu.max_gpus}
        </Box>
      </Typography>

      {isolations.length > 0 && (
        <Stack
          direction="row"
          spacing={1}
          sx={{ mt: 1, alignItems: 'center', flexWrap: 'wrap', rowGap: 1 }}
        >
          <Typography variant="body2" color="text.secondary">
            Isolations:
          </Typography>
          {isolations.map((iso) => (
            <Chip key={iso} size="small" variant="outlined" label={iso} />
          ))}
        </Stack>
      )}
    </Box>
  )
}
