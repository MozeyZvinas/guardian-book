import { RouterProvider } from 'react-router'
import { MeProvider } from '../state/me'
import { router } from './router'

export function App() {
  return (
    <MeProvider>
      <RouterProvider router={router} />
    </MeProvider>
  )
}
