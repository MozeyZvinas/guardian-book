import { useState } from 'react'
import { useNavigate } from 'react-router'
import { signOut } from '../api/auth'
import { useMe } from '../state/me'
import { Button } from './Form'

export function SignOutButton() {
  const { clear } = useMe()
  const navigate = useNavigate()
  const [busy, setBusy] = useState(false)
  return (
    <Button
      type="button"
      variant="quiet"
      disabled={busy}
      onClick={async () => {
        setBusy(true)
        try {
          await signOut()
        } finally {
          clear()
          setBusy(false)
          void navigate('/', { replace: true })
        }
      }}
    >
      Sign out
    </Button>
  )
}
