import React, { useEffect, useRef, useState } from 'react';

// Easing cubic-bezier matching NATS Maps EASE: [0.16, 1, 0.3, 1]
const EASE = 'cubic-bezier(0.16, 1, 0.3, 1)';

const ScrollReveal = ({
  children,
  delay = 0,
  y = 28, // NATS Maps uses 28
  duration = 800, // NATS Maps uses 0.8s
  blur = 10, // NATS Maps uses 10px
  once = true,
  className = '',
  style = {},
  stagger = false,
  staggerGap = 80, // delay in ms between elements
}) => {
  const ref = useRef(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          if (once) observer.unobserve(el);
        } else if (!once) {
          setVisible(false);
        }
      },
      { threshold: 0.05, rootMargin: '0px 0px -80px 0px' } // -80px margin matches NATS Maps
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [once]);

  if (stagger) {
    // Clone children and inject staggered delays
    const arrayChildren = React.Children.toArray(children);
    return (
      <div ref={ref} className={className} style={style}>
        {arrayChildren.map((child, index) => {
          if (!React.isValidElement(child)) return child;
          const childDelay = delay + index * staggerGap;
          
          const childStyle = {
            opacity: visible ? 1 : 0,
            transform: visible ? 'translateY(0px)' : `translateY(${y}px)`,
            filter: blur > 0 ? (visible ? 'blur(0px)' : `blur(${blur}px)`) : undefined,
            transition: `opacity ${duration}ms ${EASE} ${childDelay}ms,
                         transform ${duration}ms ${EASE} ${childDelay}ms,
                         filter ${duration}ms ${EASE} ${childDelay}ms`,
            willChange: 'opacity, transform, filter',
            ...child.props.style,
          };
          
          return React.cloneElement(child, {
            style: childStyle,
            className: `${child.props.className || ''}`,
          });
        })}
      </div>
    );
  }

  const baseStyle = {
    opacity: visible ? 1 : 0,
    transform: visible ? 'translateY(0px)' : `translateY(${y}px)`,
    filter: blur > 0 ? (visible ? 'blur(0px)' : `blur(${blur}px)`) : undefined,
    transition: `opacity ${duration}ms ${EASE} ${delay}ms,
                 transform ${duration}ms ${EASE} ${delay}ms,
                 filter ${duration}ms ${EASE} ${delay}ms`,
    willChange: 'opacity, transform, filter',
    ...style,
  };

  return (
    <div ref={ref} style={baseStyle} className={className}>
      {children}
    </div>
  );
};

export default ScrollReveal;
