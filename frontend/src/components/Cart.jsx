import { useMemo, useState } from 'react'
import ProductImage from './ProductImage'

function buildCheckoutPattern(items, total) {
  const seed = items.reduce(
    (sum, item) => sum + item.product.id * item.quantity + item.size.length,
    Math.round(total * 100)
  )

  return Array.from({ length: 49 }, (_, index) => ((index * 17 + seed) % 5) < 2)
}

function Cart({ items, open, onClose, onRemove }) {
  const [checkoutOpen, setCheckoutOpen] = useState(false)
  const total = items.reduce(
    (sum, item) => sum + item.product.price * item.quantity,
    0
  )
  const checkoutPattern = useMemo(() => buildCheckoutPattern(items, total), [items, total])
  const checkoutCode = `SFM-${Math.round(total * 100).toString(36).toUpperCase()}`

  if (!open) return null

  return (
    <div className="cart-overlay" onClick={onClose}>
      <div className="cart-drawer" onClick={(e) => e.stopPropagation()}>
        <div className="cart-header">
          <h2>Your Cart</h2>
          <button className="close-btn" onClick={onClose}>
            &times;
          </button>
        </div>

        {items.length === 0 ? (
          <p className="cart-empty">Your cart is empty</p>
        ) : (
          <>
            <div className="cart-items">
              {items.map((item) => (
                <div
                  key={`${item.product.id}-${item.size}`}
                  className="cart-item"
                >
                  <ProductImage product={item.product} />
                  <div className="cart-item-info">
                    <h4>{item.product.name}</h4>
                    <p>
                      Size: {item.size} | Qty: {item.quantity}
                    </p>
                    <p>${(item.product.price * item.quantity).toFixed(2)}</p>
                  </div>
                  <button
                    className="remove-btn"
                    onClick={() => onRemove(item.product.id, item.size)}
                  >
                    &times;
                  </button>
                </div>
              ))}
            </div>
            <div className="cart-footer">
              <p className="cart-total">Total: ${total.toFixed(2)}</p>
              {checkoutOpen && (
                <div className="checkout-panel">
                  <div className="checkout-qr" aria-label="Demo checkout code">
                    {checkoutPattern.map((filled, index) => (
                      <span key={index} className={filled ? 'filled' : ''} />
                    ))}
                  </div>
                  <div>
                    <span className="checkout-label">Demo checkout</span>
                    <strong>{checkoutCode}</strong>
                  </div>
                </div>
              )}
              <button className="btn btn-primary" onClick={() => setCheckoutOpen((value) => !value)}>
                {checkoutOpen ? 'Hide Checkout' : 'Show Checkout'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

export default Cart
