import { useState, useEffect } from 'react'
import { demoProducts } from '../data/demoProducts'

export function useProducts() {
  const [products, setProducts] = useState([])
  const [loading, setLoading] = useState(true)
  const [demoMode, setDemoMode] = useState(false)

  useEffect(() => {
    fetch('/api/products')
      .then((res) => {
        if (!res.ok) throw new Error(`Products API returned ${res.status}`)
        return res.json()
      })
      .then((data) => {
        setProducts(data.length ? data : demoProducts)
        setDemoMode(data.length === 0)
        setLoading(false)
      })
      .catch(() => {
        setProducts(demoProducts)
        setDemoMode(true)
        setLoading(false)
      })
  }, [])

  return { products, loading, demoMode }
}
