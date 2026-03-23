import { useNavigate } from 'react-router-dom'

function ProductCard({ product }) {
  const navigate = useNavigate()

  return (
    <div
      className="product-card"
      onClick={() => navigate(`/product/${product.id}`)}
    >
      <div className="card-image">
        <img src={product.image} alt={product.name} />
      </div>
      <div className="card-info">
        <h3 className="card-name">{product.name}</h3>
        <p className="card-price">${product.price.toFixed(2)}</p>
      </div>
    </div>
  )
}

export default ProductCard
