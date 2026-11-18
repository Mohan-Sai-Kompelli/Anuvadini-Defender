import React, { Children, Fragment, useLayoutEffect, useRef, useState } from "react";
import "./StackStory.css";

function Card({ children, index, isFirst }) {
  const scaleRef = useRef(null);
  const [scale, setScale] = useState(1);

  useLayoutEffect(() => {
    const el = scaleRef.current;
    if (!el) return;
    const fit = () => {
      // Calculate available height (subtracting topbar and margins)
      const avail = window.innerHeight - 80; 
      const natural = el.scrollHeight;
      // Shrink content proportionally if it overflows the available height
      const s = natural > 0 ? Math.min(1, avail / natural) : 1;
      setScale(Number.isFinite(s) ? s : 1);
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    window.addEventListener("resize", fit);
    
    // Adjust scale after nested elements/charts animate in
    const t = setTimeout(fit, 1200); 
    return () => { 
      ro.disconnect(); 
      window.removeEventListener("resize", fit); 
      clearTimeout(t); 
    };
  }, []);

  return (
    <div 
      id={`chapter-${index}`} 
      className={"stack-card" + (isFirst ? " is-first" : "")} 
      style={{ zIndex: index + 1 }}
    >
      <div 
        ref={scaleRef} 
        className="stack-scale" 
        style={{ 
          transform: scale < 1 ? `scale(${scale})` : undefined
        }}
      >
        {children}
      </div>
    </div>
  );
}

export default function StackStory({ children }) {
  const items = Children.toArray(children).filter(Boolean);
  return (
    <div className="stack-story">
      {items.map((c, i) => (
        <Fragment key={i}>
          <Card index={i} isFirst={i === 0}>{c}</Card>
          {i < items.length - 1 && <div className="stack-spacer" aria-hidden />}
        </Fragment>
      ))}
    </div>
  );
}
