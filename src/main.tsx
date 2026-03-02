import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import './app/globals.css'
import { DataProvider } from '@/lib/data-provider'
import { AuthProvider } from '@/lib/auth-context'
import { VaultProvider } from '@/lib/vault-context'
import { CustomAlert } from '@/components/ui/custom-alert'
import { ThemeProvider } from './components/ThemeContext'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <VaultProvider>
          <DataProvider>
            <ThemeProvider>
              <App />
              <CustomAlert />
            </ThemeProvider>
          </DataProvider>
        </VaultProvider>
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>,
)
