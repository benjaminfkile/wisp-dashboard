import Paper from '@mui/material/Paper'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import CodeIcon from '@mui/icons-material/Code'
import type { TrackedContract } from '../hooks/useContracts'

/**
 * Placeholder for the exec tab. A later task replaces this with a one-shot /
 * streaming command runner over `POST /contracts/:id/exec`. The `contract`
 * prop is part of the stable tab API each panel receives.
 */
export default function ExecPanel({ contract }: { contract: TrackedContract }) {
  void contract
  return (
    <Paper variant="outlined" sx={{ p: 4, textAlign: 'center' }}>
      <Stack spacing={1.5} sx={{ alignItems: 'center' }}>
        <CodeIcon fontSize="large" color="disabled" />
        <Typography variant="h6" component="p">
          Exec coming soon
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Run commands against this lease and stream their output here.
        </Typography>
      </Stack>
    </Paper>
  )
}
