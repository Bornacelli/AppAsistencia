import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import { AuthProvider } from './context/AuthContext'
import { ToastProvider } from './context/ToastContext'
import { AlertProvider } from './context/AlertContext'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <AlertProvider>
          <ToastProvider>
            <App />
          </ToastProvider>
        </AlertProvider>
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>
)
