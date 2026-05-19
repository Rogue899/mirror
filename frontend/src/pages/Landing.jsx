import { useState, useEffect } from 'react'
import { useProducts } from '../hooks/useProducts'
import ProductCard from '../components/ProductCard'

const CATEGORIES = ['All', 'Men', 'Women', 'Tops', 'Bottoms', 'Outerwear']

function Landing() {
  const { products, loading, demoMode } = useProducts()
  const [activeCategory, setActiveCategory] = useState('All')
  const [showWelcome, setShowWelcome] = useState(true)

  useEffect(() => {
    const timer = setTimeout(() => setShowWelcome(false), 4000)
    return () => clearTimeout(timer)
  }, [])

  const filtered =
    activeCategory === 'All'
      ? products
      : products.filter((p) => p.category === activeCategory)

  return (
    <div className="landing">
      {showWelcome && (
        <div className="welcome-overlay">
          <h1 className="welcome-text">Welcome</h1>
          <p className="welcome-sub">Explore Our Collection</p>
        </div>
      )}

      <div className="landing-header">
        <div>
          <p className="landing-kicker">Smart Fit Mirror</p>
          <h1 className="landing-title">Explore Our Collection</h1>
        </div>
        {demoMode && <span className="demo-badge">Demo catalog</span>}
      </div>

      <div className="category-filters">
        {CATEGORIES.map((cat) => (
          <button
            key={cat}
            className={`filter-btn ${activeCategory === cat ? 'active' : ''}`}
            onClick={() => setActiveCategory(cat)}
          >
            {cat}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="loading">Loading collection...</div>
      ) : filtered.length === 0 ? (
        <div className="empty-state">No items in this category.</div>
      ) : (
        <div className="product-grid">
          {filtered.map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>
      )}
    </div>
  )
}

export default Landing
