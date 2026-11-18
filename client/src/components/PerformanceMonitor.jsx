import { useEffect, useState } from 'react';

const PerformanceMonitor = () => {
  // Developer overlay: only shown with ?perf=1 in the URL.
  const enabled = typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('perf');
  const [metrics, setMetrics] = useState({
    loadTime: 0,
    renderTime: 0,
    memoryUsage: 0
  });

  useEffect(() => {
    const startTime = performance.now();
    
    // Monitor performance
    const observer = new PerformanceObserver((list) => {
      const entries = list.getEntries();
      entries.forEach((entry) => {
        if (entry.entryType === 'navigation') {
          setMetrics(prev => ({
            ...prev,
            loadTime: Math.round(entry.loadEventEnd - entry.loadEventStart)
          }));
        }
      });
    });

    observer.observe({ entryTypes: ['navigation'] });

    // Monitor memory usage
    const checkMemory = () => {
      if (performance.memory) {
        setMetrics(prev => ({
          ...prev,
          memoryUsage: Math.round(performance.memory.usedJSHeapSize / 1024 / 1024)
        }));
      }
    };

    const memoryInterval = setInterval(checkMemory, 5000);
    
    const endTime = performance.now();
    setMetrics(prev => ({
      ...prev,
      renderTime: Math.round(endTime - startTime)
    }));

    return () => {
      observer.disconnect();
      clearInterval(memoryInterval);
    };
  }, []);

  // Only show in development
  if (process.env.NODE_ENV !== 'development') {
    return null;
  }

  if (!enabled) return null;

  return (
    <div className="fixed bottom-4 right-4 bg-black bg-opacity-75 text-white text-xs p-2 rounded-lg z-50">
      <div>Load: {metrics.loadTime}ms</div>
      <div>Render: {metrics.renderTime}ms</div>
      <div>Memory: {metrics.memoryUsage}MB</div>
    </div>
  );
};

export default PerformanceMonitor;
