import { useState } from 'react'
import AppBar from '@mui/material/AppBar'
import Toolbar from '@mui/material/Toolbar'
import Typography from '@mui/material/Typography'
import IconButton from '@mui/material/IconButton'
import Container from '@mui/material/Container'
import Box from '@mui/material/Box'
import Paper from '@mui/material/Paper'
import SettingsIcon from '@mui/icons-material/Settings'
import HealthIndicator from './components/HealthIndicator'
import SettingsPanel from './components/SettingsPanel'

export default function App() {
  const [settingsOpen, setSettingsOpen] = useState(false)

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      <AppBar position="static" color="default" elevation={0} sx={{ borderBottom: 1, borderColor: 'divider' }}>
        <Toolbar sx={{ gap: 2 }}>
          <Typography variant="h6" component="h1" sx={{ flexGrow: 1, letterSpacing: '0.02em' }}>
            <Box component="span" sx={{ color: 'primary.main', mr: 1 }} aria-hidden="true">
              ◇
            </Box>
            Wisp Dashboard
          </Typography>
          <HealthIndicator />
          <IconButton
            aria-label="Settings"
            title="Settings"
            aria-haspopup="dialog"
            aria-expanded={settingsOpen}
            onClick={() => setSettingsOpen(true)}
          >
            <SettingsIcon />
          </IconButton>
        </Toolbar>
      </AppBar>

      <Box
        component="main"
        sx={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          p: { xs: 3, sm: 4 },
        }}
      >
        <Container maxWidth="md">
          <Paper variant="outlined" sx={{ p: 4, textAlign: 'center' }}>
            <Typography variant="h5" component="h2" gutterBottom>
              Lease management is coming next.
            </Typography>
            <Typography variant="body1" color="text.secondary">
              This is the app shell. It talks to a running wisp instance through
              the same-origin{' '}
              <Box component="code" sx={{ color: 'primary.main' }}>
                /wisp
              </Box>{' '}
              dev proxy. The header indicator polls{' '}
              <Box component="code" sx={{ color: 'primary.main' }}>
                /wisp/healthz
              </Box>{' '}
              to prove the proxy works end to end.
            </Typography>
          </Paper>
        </Container>
      </Box>

      {settingsOpen && <SettingsPanel onClose={() => setSettingsOpen(false)} />}
    </Box>
  )
}
