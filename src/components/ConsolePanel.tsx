import Paper from '@mui/material/Paper'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import TerminalIcon from '@mui/icons-material/Terminal'
import type { TrackedContract } from '../hooks/useContracts'

/**
 * Placeholder for the interactive console tab. A later task replaces this with
 * an xterm.js terminal driven over `WS /contracts/:id/shell`. The `contract`
 * prop is part of the stable tab API each panel receives.
 */
export default function ConsolePanel({ contract }: { contract: TrackedContract }) {
  void contract
  return (
    <Paper variant="outlined" sx={{ p: 4, textAlign: 'center' }}>
      <Stack spacing={1.5} sx={{ alignItems: 'center' }}>
        <TerminalIcon fontSize="large" color="disabled" />
        <Typography variant="h6" component="p">
          Console coming soon
        </Typography>
        <Typography variant="body2" color="text.secondary">
          An interactive terminal for this lease will live here.
        </Typography>
      </Stack>
    </Paper>
  )
}
