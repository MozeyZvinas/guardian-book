import { createBrowserRouter } from 'react-router'
import { Evidence } from '../routes/public/Evidence'
import { Landing } from '../routes/public/Landing'
import { NotFound } from '../routes/public/NotFound'
import { RouteError } from './RouteError'

// Public routes load eagerly. Each space (learner, guardian, teacher) and the account
// forms are their own lazily loaded chunks, so a phone never downloads the teacher console
// (spec 06 §2).
export const router = createBrowserRouter([
  { path: '/', element: <Landing />, errorElement: <RouteError /> },
  { path: '/evidence', element: <Evidence />, errorElement: <RouteError /> },
  {
    path: '/signup',
    lazy: () => import('../routes/public/SignUp').then((m) => ({ Component: m.SignUp })),
    errorElement: <RouteError />,
  },
  {
    path: '/signin',
    lazy: () => import('../routes/public/SignIn').then((m) => ({ Component: m.SignIn })),
    errorElement: <RouteError />,
  },
  // Learner space (spec 05 §4.2): L1 Today, L0 setup, L6 Brain, L8 Me.
  {
    path: '/today',
    lazy: () => import('../routes/learner/today/Today').then((m) => ({ Component: m.Today })),
    errorElement: <RouteError />,
  },
  {
    path: '/me/setup',
    lazy: () => import('../routes/learner/setup/Setup').then((m) => ({ Component: m.Setup })),
    errorElement: <RouteError />,
  },
  {
    path: '/brain',
    lazy: () => import('../routes/learner/brain/Brain').then((m) => ({ Component: m.Brain })),
    errorElement: <RouteError />,
  },
  {
    path: '/me',
    lazy: () => import('../routes/learner/me/Me').then((m) => ({ Component: m.Me })),
    errorElement: <RouteError />,
  },
  {
    path: '/bring',
    lazy: () => import('../routes/learner/bring/Bring').then((m) => ({ Component: m.Bring })),
    errorElement: <RouteError />,
  },
  {
    path: '/attempts/:id',
    lazy: () => import('../routes/learner/attempt/Attempt').then((m) => ({ Component: m.Attempt })),
    errorElement: <RouteError />,
  },
  {
    path: '/calendar',
    lazy: () => import('../routes/learner/calendar/Calendar').then((m) => ({ Component: m.Calendar })),
    errorElement: <RouteError />,
  },
  {
    path: '/teacher/classes/:id/notice',
    lazy: () => import('../routes/teacher/notice/Notice').then((m) => ({ Component: m.TeacherNotice })),
    errorElement: <RouteError />,
  },
  // B06: L4 fix it, L5 follow-up question.
  {
    path: '/attempts/:id/fix',
    lazy: () => import('../routes/learner/fix/Fix').then((m) => ({ Component: m.Fix })),
    errorElement: <RouteError />,
  },
  {
    path: '/items/:id',
    lazy: () => import('../routes/learner/item/Item').then((m) => ({ Component: m.Item })),
    errorElement: <RouteError />,
  },
  // Guardian space (spec 05 §4.3): G0 link, G1 this week, G2 notes, G3 calendar, G4 settings.
  {
    path: '/guardian/link',
    lazy: () => import('../routes/guardian/Link').then((m) => ({ Component: m.GuardianLink })),
    errorElement: <RouteError />,
  },
  {
    path: '/guardian',
    lazy: () => import('../routes/guardian/Home').then((m) => ({ Component: m.GuardianHome })),
    errorElement: <RouteError />,
  },
  {
    path: '/guardian/learners/:id',
    lazy: () => import('../routes/guardian/Week').then((m) => ({ Component: m.GuardianWeek })),
    errorElement: <RouteError />,
  },
  {
    path: '/guardian/notes',
    lazy: () => import('../routes/guardian/Notes').then((m) => ({ Component: m.GuardianNotes })),
    errorElement: <RouteError />,
  },
  {
    path: '/guardian/calendar',
    lazy: () => import('../routes/guardian/Calendar').then((m) => ({ Component: m.GuardianCalendar })),
    errorElement: <RouteError />,
  },
  {
    path: '/guardian/settings',
    lazy: () => import('../routes/guardian/Settings').then((m) => ({ Component: m.GuardianSettings })),
    errorElement: <RouteError />,
  },
  {
    path: '/teacher',
    lazy: () => import('../routes/teacher/Classes').then((m) => ({ Component: m.TeacherClasses })),
    errorElement: <RouteError />,
  },
  { path: '*', element: <NotFound /> },
])
