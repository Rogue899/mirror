function Cart({ items, open, onClose, onRemove }) {
  if (!open) return null

  const total = items.reduce(
    (sum, item) => sum + item.product.price * item.quantity,
    0
  )

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
                  <img src={item.product.image} alt={item.product.name} />
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
              <button className="btn btn-primary">Checkout</button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

export default Cart
