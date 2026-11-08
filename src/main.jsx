import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { escutarInstalacao } from './lib/instalar'

// O Chrome avisa logo ao abrir que dá para instalar: guarda antes de qualquer tela.
escutarInstalacao()

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
