import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Provider } from 'jotai'
import { BrowserRouter } from 'react-router'
import App from './App'
import './styles.css'

const queryClient = new QueryClient()

const root = document.getElementById('root')
if (!root) throw new Error('未找到应用挂载节点。')
createRoot(root).render(<StrictMode><QueryClientProvider client={queryClient}><Provider><BrowserRouter><App /></BrowserRouter></Provider></QueryClientProvider></StrictMode>)
