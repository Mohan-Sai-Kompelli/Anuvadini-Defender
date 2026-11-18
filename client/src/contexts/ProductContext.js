import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';

/**
 * Which Anuvadini product the user is looking at: 'attendance' or 'defender'.
 * The route decides it (/defender/* is Defender, everything else Attendance);
 * the choice is mirrored onto <html data-product> so the accent theme (see
 * styles/app-theme.css) can transition smoothly without remounting the app.
 */
const ProductContext = createContext({ product: 'attendance', setProduct: () => {} });

export const productForPath = (pathname) => (pathname.startsWith('/defender') ? 'defender' : 'attendance');

export const ProductProvider = ({ children }) => {
  const location = useLocation();
  const [product, setProductState] = useState(() => productForPath(window.location.pathname));

  // keep in sync with the URL (back / forward, deep links)
  useEffect(() => {
    setProductState(productForPath(location.pathname));
  }, [location.pathname]);

  useEffect(() => {
    document.documentElement.dataset.product = product;
  }, [product]);

  const setProduct = useCallback((p) => setProductState(p), []);
  const value = useMemo(() => ({ product, setProduct }), [product, setProduct]);
  return <ProductContext.Provider value={value}>{children}</ProductContext.Provider>;
};

export const useProduct = () => useContext(ProductContext);
export default ProductContext;
