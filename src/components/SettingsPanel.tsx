import { useEffect, useState } from 'react'
import Dialog from '@mui/material/Dialog'
import DialogTitle from '@mui/material/DialogTitle'
import DialogContent from '@mui/material/DialogContent'
import DialogActions from '@mui/material/DialogActions'
import TextField from '@mui/material/TextField'
import InputAdornment from '@mui/material/InputAdornment'
import IconButton from '@mui/material/IconButton'
import Button from '@mui/material/Button'
import Typography from '@mui/material/Typography'
import Box from '@mui/material/Box'
import Visibility from '@mui/icons-material/Visibility'
import VisibilityOff from '@mui/icons-material/VisibilityOff'
import { useSettings } from '../hooks/useSettings'

interface SettingsPanelProps {
  /** Close the panel (e.g. backdrop click, Close button, or Escape). */
  onClose: () => void
}

/**
 * Modal to view/edit the wisp app token. The token is masked (password-style)
 * with a show/hide toggle, plus Save, Clear, and Close actions. Persisted
 * locally via `useSettings` (localStorage).
 */
export default function SettingsPanel({ onClose }: SettingsPanelProps) {
  const { appToken, setAppToken } = useSettings()
  const [draft, setDraft] = useState(appToken)
  const [reveal, setReveal] = useState(false)

  // Keep the draft in sync if the stored token changes while open.
  useEffect(() => {
    setDraft(appToken)
  }, [appToken])

  function save() {
    setAppToken(draft.trim())
    onClose()
  }

  function clear() {
    setDraft('')
    setAppToken('')
  }

  return (
    <Dialog
      open
      onClose={onClose}
      aria-labelledby="settings-title"
      fullWidth
      maxWidth="sm"
    >
      <DialogTitle id="settings-title">Settings</DialogTitle>
      <DialogContent>
        <TextField
          id="wisp-app-token"
          label="Wisp app token"
          type={reveal ? 'text' : 'password'}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') save()
          }}
          placeholder="paste app token…"
          fullWidth
          margin="normal"
          spellCheck={false}
          autoComplete="off"
          slotProps={{
            input: {
              endAdornment: (
                <InputAdornment position="end">
                  <IconButton
                    aria-label={reveal ? 'Hide token' : 'Show token'}
                    aria-pressed={reveal}
                    onClick={() => setReveal((v) => !v)}
                    edge="end"
                  >
                    {reveal ? <VisibilityOff /> : <Visibility />}
                  </IconButton>
                </InputAdornment>
              ),
            },
          }}
        />

        <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
          Stored locally in this browser (localStorage). Only needed if the wisp
          instance has{' '}
          <Box component="code" sx={{ color: 'primary.main' }}>
            WISP_APP_TOKEN
          </Box>{' '}
          set — otherwise leave it blank.
        </Typography>
      </DialogContent>
      <DialogActions>
        <Button color="inherit" onClick={clear}>
          Clear
        </Button>
        <Button onClick={onClose}>Close</Button>
        <Button variant="contained" onClick={save}>
          Save
        </Button>
      </DialogActions>
    </Dialog>
  )
}
