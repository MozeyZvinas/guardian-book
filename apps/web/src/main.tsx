import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './design/tokens.css'
import './design/typography.css'
import './design/motion.css'
import { App } from './app/App'

const container = document.getElementById('root')
if (!container) throw new Error('index.html has no #root element')

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
