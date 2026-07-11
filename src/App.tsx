import { useState } from 'react'
import AppBar from '@mui/material/AppBar'
import Toolbar from '@mui/material/Toolbar'
import Typography from '@mui/material/Typography'
import IconButton from '@mui/material/IconButton'
import Button from '@mui/material/Button'
import Container from '@mui/material/Container'
import Box from '@mui/material/Box'
import AddIcon from '@mui/icons-material/Add'
import SettingsIcon from '@mui/icons-material/Settings'
import HealthIndicator from './components/HealthIndicator'
import SettingsPanel from './components/SettingsPanel'
import CreateLeaseDialog from './components/CreateLeaseDialog'
import ContractList from './components/ContractList'
import ContractDetail from './components/ContractDetail'
import { useContracts } from './hooks/useContracts'

export default function App() {
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)
  const { contracts, selectedId } = useContracts()

  const selected = selectedId
    ? contracts.find((c) => c.contract_id === selectedId) ?? null
    : null

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
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={() => setCreateOpen(true)}
          >
            New Lease
          </Button>
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
          p: { xs: 3, sm: 4 },
        }}
      >
        <Container maxWidth="md">
          {selected ? (
            <ContractDetail contract={selected} />
          ) : (
            <>
              <Typography variant="h5" component="h2" gutterBottom>
                Leases
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
                Contracts this dashboard has created. Status and remaining TTL
                are polled live from wisp.
              </Typography>
              <ContractList />
            </>
          )}
        </Container>
      </Box>

      <CreateLeaseDialog open={createOpen} onClose={() => setCreateOpen(false)} />
      {settingsOpen && <SettingsPanel onClose={() => setSettingsOpen(false)} />}
    </Box>
  )
}
