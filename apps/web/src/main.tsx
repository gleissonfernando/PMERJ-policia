import '@fontsource-variable/inter'
import '@fontsource/oswald/500.css'
import '@fontsource/oswald/600.css'
import './index.css'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
