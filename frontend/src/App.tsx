import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { Layout } from './components/Layout'
import { Dashboard } from './pages/Dashboard'
import { OrderFlow } from './pages/OrderFlow'
import { Signals } from './pages/Signals'
import { Greeks } from './pages/Greeks'
import { Analytics } from './pages/Analytics'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Dashboard />} />
          <Route path="order-flow" element={<OrderFlow />} />
          <Route path="signals"    element={<Signals />} />
          <Route path="greeks"     element={<Greeks />} />
          <Route path="analytics"  element={<Analytics />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
