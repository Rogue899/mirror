import { useState, useEffect } from 'react'

export function useProducts() {
  const [products, setProducts] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/products')
      .then((res) => res.json())
      .then((data) => {
        setProducts(data)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  return { products, loading }
}
