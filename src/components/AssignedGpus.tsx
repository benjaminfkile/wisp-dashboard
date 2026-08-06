import Box from '@mui/material/Box'
import Stack from '@mui/material/Stack'
import type { GpuDevice } from '../wisp/types'

/**
 * The GPU device ids assigned to a contract (from its polled status), each
 * cross-referenced to the host capability's `devices` to resolve a class when
 * possible. A resolvable id shows its class with the id in a subdued monospace
 * style; an id **not** in the live inventory (e.g. a restart-reconciled lease
 * referencing a device the host no longer lists) renders as the bare id.
 *
 * Callers only mount this when `gpus` is non-empty.
 */
export default function AssignedGpus({
  gpus,
  devices,
}: {
  gpus: string[]
  devices?: GpuDevice[]
}) {
  const byId = new Map((devices ?? []).map((d) => [d.id, d]))

  return (
    <Stack spacing={0.25} sx={{ alignItems: 'flex-end', minWidth: 0 }}>
      {gpus.map((id) => {
        const dev = byId.get(id)
        return (
          <Box key={id} sx={{ fontSize: '0.875rem', lineHeight: 1.5 }}>
            {dev ? (
              <>
                <Box component="span" sx={{ color: 'text.primary' }}>
                  {dev.class}
                </Box>{' '}
                <Box
                  component="span"
                  sx={{ fontFamily: 'monospace', color: 'text.disabled' }}
                >
                  {id}
                </Box>
              </>
            ) : (
              <Box
                component="span"
                sx={{ fontFamily: 'monospace', color: 'text.secondary' }}
              >
                {id}
              </Box>
            )}
          </Box>
        )
      })}
    </Stack>
  )
}
