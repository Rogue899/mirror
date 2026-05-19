import { useState } from 'react'

function ProductImage({ product, className = '' }) {
  const [failed, setFailed] = useState(false)

  if (!product.image || failed) {
    return (
      <div className={`product-image-fallback ${className}`}>
        <span>{product.category || 'Smart Fit'}</span>
      </div>
    )
  }

  return (
    <img
      src={product.image}
      alt={product.name}
      className={className}
      onError={() => setFailed(true)}
    />
  )
}

export default ProductImage