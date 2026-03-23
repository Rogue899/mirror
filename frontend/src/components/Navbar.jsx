import { useNavigate } from 'react-router-dom'

function Navbar({ cartCount, onCartClick }) {
  const navigate = useNavigate()

  return (
    <nav className="navbar">
      <div className="nav-brand" onClick={() => navigate('/')}>
        Smart Fit Mirror
      </div>
      <button className="cart-toggle" onClick={onCartClick}>
        Cart {cartCount > 0 && <span className="cart-badge">{cartCount}</span>}
      </button>
    </nav>
  )
}

export default Navbar
