import { Routes, Route } from 'react-router-dom'
import { Layout } from './components/Layout'
import { Dashboard } from './pages/Dashboard'
import { Lancamentos } from './pages/Lancamentos'
import { Historico } from './pages/Historico'
import { Relatorios } from './pages/Relatorios'
import { Despesas } from './pages/Despesas'
import { Cadastros } from './pages/Cadastros'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Layout />}>
        <Route index element={<Dashboard />} />
        <Route path="lancamentos" element={<Lancamentos />} />
        <Route path="historico" element={<Historico />} />
        <Route path="relatorios" element={<Relatorios />} />
        <Route path="despesas" element={<Despesas />} />
        <Route path="cadastros" element={<Cadastros />} />
      </Route>
    </Routes>
  )
}
