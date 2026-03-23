import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import ARPopup from '../components/ARPopup'

function ProductDetail({ addToCart }) {
  const { id } = useParams()
  const navigate = useNavigate()
  const [product, setProduct] = useState(null)
  const [selectedSize, setSelectedSize] = useState(null)
  const [showAR, setShowAR] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch(`/api/products/${id}`)
      .then((res) => res.json())
      .then((data) => {
        setProduct(data)
        if (data.sizes?.length) setSelectedSize(data.sizes[0])
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [id])

  if (loading) return <div className="loading">Loading...</div>
  if (!product) return <div className="loading">Product not found</div>

  return (
    <div className="product-detail">
      <button className="back-btn" onClick={() => navigate('/')}>
        &larr; Back to Collection
      </button>

      <div className="product-detail-content">
        <div className="product-image-large">
          <img src={product.image} alt={product.name} />
        </div>

        <div className="product-info">
          <h1 className="product-title">{product.name}</h1>
          <p className="product-price">${product.price.toFixed(2)}</p>
          <p className="product-description">{product.description}</p>

          <div className="size-selector">
            <h3>Select Size</h3>
            <div className="size-options">
              {product.sizes?.map((size) => (
                <button
                  key={size}
                  className={`size-btn ${selectedSize === size ? 'active' : ''}`}
                  onClick={() => setSelectedSize(size)}
                >
                  {size}
                </button>
              ))}
            </div>
          </div>

          <div className="product-actions">
            <button
              className="btn btn-secondary"
              onClick={() => addToCart(product, selectedSize)}
            >
              Add to Cart
            </button>
            <button
              className="btn btn-primary"
              onClick={() => setShowAR(true)}
            >
              Custom Fit
            </button>
          </div>
        </div>
      </div>

      {showAR && (
        <ARPopup
          product={product}
          onClose={() => setShowAR(false)}
          onAddToCart={(size) => {
            addToCart(product, size)
            setShowAR(false)
          }}
        />
      )}
    </div>
  )
}

export default ProductDetail
