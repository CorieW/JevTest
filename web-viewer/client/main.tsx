// Mount the React viewer without importing the JevTest runner into the browser.
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App.js'
import '@xyflow/react/dist/style.css'
import './styles.css'
const root = document.getElementById('root')
if (!root) throw new Error('Viewer root element is missing.')
createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
