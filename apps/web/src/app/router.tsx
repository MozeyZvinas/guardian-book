import { createBrowserRouter } from 'react-router'
import { Evidence } from '../routes/public/Evidence'
import { Landing } from '../routes/public/Landing'
import { NotFound } from '../routes/public/NotFound'
import { RouteError } from './RouteError'

// Public routes only in B01. Learner, guardian and teacher spaces arrive with their briefs,
// each as its own lazily loaded chunk (spec 06 §2).
export const router = createBrowserRouter([
  { path: '/', element: <Landing />, errorElement: <RouteError /> },
  { path: '/evidence', element: <Evidence />, errorElement: <RouteError /> },
  { path: '*', element: <NotFound /> },
])
