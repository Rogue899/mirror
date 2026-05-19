import { useNavigate } from 'react-router-dom'
import ProductImage from './ProductImage'

function ProductCard({ product }) {
  const navigate = useNavigate()

  return (
    <div
      className="product-card"
      onClick={() => navigate(`/product/${product.id}`)}
    >
      <div className="card-image">
        <ProductImage product={product} />
      </div>
      <div className="card-info">
        <span className="card-category">{product.category}</span>
        <h3 className="card-name">{product.name}</h3>
        <p className="card-price">${product.price.toFixed(2)}</p>
      </div>
    </div>
  )
}

export default ProductCard
