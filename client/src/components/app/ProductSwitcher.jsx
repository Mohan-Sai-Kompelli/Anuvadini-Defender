import React from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { CalendarCheck, Activity } from 'lucide-react';
import { useProduct } from '../../contexts/ProductContext';

const PRODUCTS = [
  { id: 'attendance', label: 'Attendance', icon: CalendarCheck, home: '/dashboard' },
  { id: 'defender', label: 'Defender', icon: Activity, home: '/defender' },
];

/**
 * Switches between Attendance and Defender. Only the route and the accent
 * variables change; the application shell stays mounted.
 */
const ProductSwitcher = ({ onNavigate, enabled = ['attendance', 'defender'], collapsed = false }) => {
  const { product, setProduct } = useProduct();
  const navigate = useNavigate();
  const items = PRODUCTS.filter((p) => enabled.includes(p.id));

  const choose = (p) => {
    if (p.id === product) return;
    setProduct(p.id);
    navigate(p.home);
    onNavigate?.();
  };

  const onKey = (e) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    e.preventDefault();
    const i = items.findIndex((p) => p.id === product);
    const next = items[(i + (e.key === 'ArrowRight' ? 1 : items.length - 1)) % items.length];
    choose(next);
    requestAnimationFrame(() => document.getElementById(`product-${next.id}`)?.focus());
  };

  return (
    <div
      role="radiogroup"
      aria-label="Product"
      onKeyDown={onKey}
      className={`relative grid gap-1 rounded-xl border border-[color:var(--app-border)] bg-[color:var(--app-hover)] p-1 ${collapsed ? 'grid-cols-1' : 'grid-cols-2'}`}
    >
      {items.map((p) => {
        const Icon = p.icon;
        const active = p.id === product;
        return (
          <button
            key={p.id}
            id={`product-${p.id}`}
            type="button"
            role="radio"
            aria-checked={active}
            tabIndex={active ? 0 : -1}
            onClick={() => choose(p)}
            title={collapsed ? p.label : undefined}
            aria-label={p.label}
            className="app-focus relative flex h-9 items-center justify-center gap-1.5 rounded-lg text-[13px] font-semibold transition-colors"
            style={{ color: active ? 'var(--accent)' : 'var(--app-text-2)' }}
          >
            {active && (
              <motion.span
                layoutId="product-pill"
                className="absolute inset-0 rounded-lg bg-white shadow-[0_1px_2px_rgba(23,25,28,0.08),0_4px_10px_-6px_rgba(23,25,28,0.25)]"
                transition={{ type: 'spring', stiffness: 420, damping: 34 }}
              />
            )}
            <Icon className="relative h-4 w-4" aria-hidden="true" />
            {!collapsed && <span className="relative">{p.label}</span>}
          </button>
        );
      })}
    </div>
  );
};

export default ProductSwitcher;
