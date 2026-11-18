import React, { useRef } from 'react';

/**
 * TiltCard — Wraps children in a 3D tilting container with a dynamic shine overlay.
 * Uses vanilla React mouse listeners to set custom CSS properties.
 */
const TiltCard = ({ children, className = '', max = 8 }) => {
  const ref = useRef(null);

  const handleMouseMove = (e) => {
    if (!ref.current) return;
    const el = ref.current;
    const rect = el.getBoundingClientRect();
    const px = (e.clientX - rect.left) / rect.width;
    const py = (e.clientY - rect.top) / rect.height;

    // Calculate rotation angles
    const rx = ((0.5 - py) * 2 * max).toFixed(2) + 'deg';
    const ry = ((px - 0.5) * 2 * max).toFixed(2) + 'deg';

    // Set custom properties for 3D rotation and gradient position
    el.style.setProperty('--rx', rx);
    el.style.setProperty('--ry', ry);
    el.style.setProperty('--mx', (px * 100).toFixed(1) + '%');
    el.style.setProperty('--my', (py * 100).toFixed(1) + '%');
  };

  const handleMouseLeave = () => {
    if (!ref.current) return;
    const el = ref.current;
    el.style.setProperty('--rx', '0deg');
    el.style.setProperty('--ry', '0deg');
  };

  return (
    <div
      ref={ref}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      className={`tilt ${className}`}
    >
      {children}
      <span className="tilt-glow" aria-hidden="true" />
    </div>
  );
};

export default TiltCard;
