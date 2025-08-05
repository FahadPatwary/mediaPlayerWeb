'use client';

import { useEffect, useRef } from 'react';

interface PerformanceMetrics {
  fcp?: number; // First Contentful Paint
  lcp?: number; // Largest Contentful Paint
  fid?: number; // First Input Delay
  cls?: number; // Cumulative Layout Shift
  ttfb?: number; // Time to First Byte
}

class PerformanceTracker {
  private metrics: PerformanceMetrics = {};
  private observer?: PerformanceObserver;

  constructor() {
    this.initializeObserver();
    this.trackNavigationTiming();
  }

  private initializeObserver() {
    if (typeof window === 'undefined' || !('PerformanceObserver' in window)) {
      return;
    }

    try {
      // Track Web Vitals
      this.observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          switch (entry.entryType) {
            case 'paint':
              if (entry.name === 'first-contentful-paint') {
                this.metrics.fcp = entry.startTime;
              }
              break;
            case 'largest-contentful-paint':
              this.metrics.lcp = entry.startTime;
              break;
            case 'first-input':
              const fidEntry = entry as PerformanceEventTiming;
              this.metrics.fid = fidEntry.processingStart - entry.startTime;
              break;
            case 'layout-shift':
              const clsEntry = entry as PerformanceEntry & { hadRecentInput: boolean; value: number };
              if (!clsEntry.hadRecentInput) {
                this.metrics.cls = (this.metrics.cls || 0) + clsEntry.value;
              }
              break;
          }
        }
        this.reportMetrics();
      });

      // Observe different entry types
      const entryTypes = ['paint', 'largest-contentful-paint', 'first-input', 'layout-shift'];
      entryTypes.forEach(type => {
        try {
          this.observer?.observe({ entryTypes: [type] });
        } catch {
          // Some browsers might not support all entry types
          console.debug(`Performance observer type '${type}' not supported`);
        }
      });
    } catch (error) {
      console.debug('Performance observer initialization failed:', error);
    }
  }

  private trackNavigationTiming() {
    if (typeof window === 'undefined' || !window.performance?.timing) {
      return;
    }

    // Calculate TTFB when navigation is complete
    window.addEventListener('load', () => {
      const timing = window.performance.timing;
      this.metrics.ttfb = timing.responseStart - timing.navigationStart;
      this.reportMetrics();
    });
  }

  private reportMetrics() {
    if (process.env.NODE_ENV === 'development') {
      console.group('🚀 Performance Metrics');
      if (this.metrics.fcp) console.log(`First Contentful Paint: ${this.metrics.fcp.toFixed(2)}ms`);
      if (this.metrics.lcp) console.log(`Largest Contentful Paint: ${this.metrics.lcp.toFixed(2)}ms`);
      if (this.metrics.fid) console.log(`First Input Delay: ${this.metrics.fid.toFixed(2)}ms`);
      if (this.metrics.cls) console.log(`Cumulative Layout Shift: ${this.metrics.cls.toFixed(4)}`);
      if (this.metrics.ttfb) console.log(`Time to First Byte: ${this.metrics.ttfb.toFixed(2)}ms`);
      console.groupEnd();
    }

    // In production, you would send these metrics to your analytics service
    if (process.env.NODE_ENV === 'production') {
      this.sendToAnalytics(this.metrics);
    }
  }

  private sendToAnalytics(metrics: PerformanceMetrics) {
    // Example: Send to Google Analytics, DataDog, or custom analytics
    // gtag('event', 'web_vitals', {
    //   event_category: 'performance',
    //   event_label: 'core_web_vitals',
    //   value: Math.round(metrics.lcp || 0)
    // });
    
    console.debug('Performance metrics ready for analytics:', metrics);
  }

  public disconnect() {
    this.observer?.disconnect();
  }

  public getMetrics(): PerformanceMetrics {
    return { ...this.metrics };
  }
}

const PerformanceMonitor: React.FC = () => {
  const trackerRef = useRef<PerformanceTracker | null>(null);

  useEffect(() => {
    // Initialize performance tracking
    trackerRef.current = new PerformanceTracker();

    // Track memory usage if available
    const trackMemory = () => {
      if ('memory' in performance) {
        const memory = (performance as Performance & { memory?: { usedJSHeapSize: number; totalJSHeapSize: number; jsHeapSizeLimit: number } }).memory;
        if (memory && process.env.NODE_ENV === 'development') {
          console.log('Memory Usage:', {
            used: `${(memory.usedJSHeapSize / 1048576).toFixed(2)} MB`,
            total: `${(memory.totalJSHeapSize / 1048576).toFixed(2)} MB`,
            limit: `${(memory.jsHeapSizeLimit / 1048576).toFixed(2)} MB`
          });
        }
      }
    };

    // Track memory every 30 seconds in development
    let memoryInterval: NodeJS.Timeout;
    if (process.env.NODE_ENV === 'development') {
      memoryInterval = setInterval(trackMemory, 30000);
    }

    // Track long tasks that block the main thread
    if ('PerformanceObserver' in window) {
      try {
        const longTaskObserver = new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            if (entry.duration > 50) { // Tasks longer than 50ms
              console.warn(`Long task detected: ${entry.duration.toFixed(2)}ms`, entry);
            }
          }
        });
        longTaskObserver.observe({ entryTypes: ['longtask'] });

        return () => {
          longTaskObserver.disconnect();
          if (memoryInterval) clearInterval(memoryInterval);
        };
      } catch {
        console.debug('Long task observer not supported');
      }
    }

    return () => {
      trackerRef.current?.disconnect();
      if (memoryInterval) clearInterval(memoryInterval);
    };
  }, []);

  // This component doesn't render anything
  return null;
};

export default PerformanceMonitor;
export { PerformanceTracker };
export type { PerformanceMetrics };