import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { WasmGate } from './components/WasmGate.tsx'

createRoot(document.getElementById('root')!).render(
  <WasmGate>
    <App />
  </WasmGate>,
)
