import { Routes, Route } from 'react-router-dom'
import { useState } from 'react'
import Navbar from './components/Navbar'
import Landing from './pages/Landing'
import ProductDetail from './pages/ProductDetail'
import Cart from './components/Cart'

function App() {
  const [cartItems, setCartItems] = useState([])
  const [cartOpen, setCartOpen] = useState(false)

  const addToCart = (product, size) => {
    setCartItems((prev) => {
      const existing = prev.find(
        (item) => item.product.id === product.id && item.size === size
      )
      if (existing) {
        return prev.map((item) =>
          item.product.id === product.id && item.size === size
            ? { ...item, quantity: item.quantity + 1 }
            : item
        )
      }
      return [...prev, { product, size, quantity: 1 }]
    })
    setCartOpen(true)
  }

  const removeFromCart = (productId, size) => {
    setCartItems((prev) =>
      prev.filter(
        (item) => !(item.product.id === productId && item.size === size)
      )
    )
  }

  return (
    <div className="app">
      <Navbar
        cartCount={cartItems.reduce((sum, item) => sum + item.quantity, 0)}
        onCartClick={() => setCartOpen(!cartOpen)}
      />
      <main className="main-content">
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route
            path="/product/:id"
            element={<ProductDetail addToCart={addToCart} />}
          />
        </Routes>
      </main>
      <Cart
        items={cartItems}
        open={cartOpen}
        onClose={() => setCartOpen(false)}
        onRemove={removeFromCart}
      />
    </div>
  )
}

export default App
