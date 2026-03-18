import { Component, type ReactNode } from 'react'
import { Routes, Route } from 'react-router-dom'
import { Layout } from './components/Layout'
import { Dashboard } from './pages/Dashboard'
import { Lancamentos } from './pages/Lancamentos'
import { Historico } from './pages/Historico'
import { Relatorios } from './pages/Relatorios'
import { Despesas } from './pages/Despesas'
import { Cadastros } from './pages/Cadastros'

class ErrorBoundary extends Component<{ children: ReactNode }, { error: string | null }> {
  state = { error: null }
  static getDerivedStateFromError(e: Error) { return { error: e.message } }
  render() {
    if (this.state.error) {
      return (
        <div className="flex items-center justify-center h-full">
          <div className="bg-red-50 border border-red-200 rounded p-6 max-w-lg">
            <h3 className="font-bold text-red-700 mb-2">Erro</h3>
            <p className="text-red-600 text-sm font-mono">{this.state.error}</p>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}

export default function App() {
  if (!window.electron) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-100">
        <div className="text-gray-500 text-sm">Este app deve ser executado no Electron.</div>
      </div>
    )
  }

  return (
    <ErrorBoundary>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<ErrorBoundary><Dashboard /></ErrorBoundary>} />
          <Route path="lancamentos" element={<ErrorBoundary><Lancamentos /></ErrorBoundary>} />
          <Route path="historico" element={<ErrorBoundary><Historico /></ErrorBoundary>} />
          <Route path="relatorios" element={<ErrorBoundary><Relatorios /></ErrorBoundary>} />
          <Route path="despesas" element={<ErrorBoundary><Despesas /></ErrorBoundary>} />
          <Route path="cadastros" element={<ErrorBoundary><Cadastros /></ErrorBoundary>} />
        </Route>
      </Routes>
    </ErrorBoundary>
  )
}
