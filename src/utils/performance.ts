/**
 * Performance utility functions for optimizing React components
 */
import React from 'react';

/**
 * Creates a debounced version of a function that delays invoking func until after wait milliseconds
 * have elapsed since the last time the debounced function was invoked.
 */
export function debounce<T extends (...args: unknown[]) => unknown>(
  func: T,
  wait: number,
  immediate = false
): (...args: Parameters<T>) => void {
  let timeout: NodeJS.Timeout | null = null;
  
  return function executedFunction(...args: Parameters<T>) {
    const later = () => {
      timeout = null;
      if (!immediate) func(...args);
    };
    
    const callNow = immediate && !timeout;
    
    if (timeout) clearTimeout(timeout);
    timeout = setTimeout(later, wait);
    
    if (callNow) func(...args);
  };
}

/**
 * Creates a throttled version of a function that only invokes func at most once per every wait milliseconds.
 */
export function throttle<T extends (...args: unknown[]) => unknown>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let inThrottle = false;
  
  return function executedFunction(...args: Parameters<T>) {
    if (!inThrottle) {
      func(...args);
      inThrottle = true;
      setTimeout(() => {
        inThrottle = false;
      }, wait);
    }
  };
}

/**
 * Optimized requestAnimationFrame wrapper for smooth animations
 */
export function rafThrottle<T extends (...args: unknown[]) => unknown>(
  func: T
): (...args: Parameters<T>) => void {
  let rafId: number | null = null;
  
  return function executedFunction(...args: Parameters<T>) {
    if (rafId) return;
    
    rafId = requestAnimationFrame(() => {
      func(...args);
      rafId = null;
    });
  };
}

/**
 * Memory-efficient event listener manager
 */
export class EventListenerManager {
  private listeners: Map<string, { element: EventTarget; listener: EventListener; options?: AddEventListenerOptions }> = new Map();
  
  add(
    id: string,
    element: EventTarget,
    event: string,
    listener: EventListener,
    options?: AddEventListenerOptions
  ) {
    // Remove existing listener if it exists
    this.remove(id);
    
    element.addEventListener(event, listener, options);
    this.listeners.set(id, { element, listener, options });
  }
  
  remove(id: string) {
    const existing = this.listeners.get(id);
    if (existing) {
      existing.element.removeEventListener(existing.listener.name, existing.listener, existing.options);
      this.listeners.delete(id);
    }
  }
  
  removeAll() {
    for (const [id] of this.listeners) {
      this.remove(id);
    }
  }
}

/**
 * Intersection Observer hook for lazy loading and visibility tracking
 */
export function createIntersectionObserver(
  callback: IntersectionObserverCallback,
  options?: IntersectionObserverInit
): IntersectionObserver | null {
  if (typeof window === 'undefined' || !('IntersectionObserver' in window)) {
    return null;
  }
  
  return new IntersectionObserver(callback, {
    threshold: 0.1,
    rootMargin: '50px',
    ...options
  });
}

/**
 * Optimized image loading with WebP support detection
 */
export function getOptimizedImageSrc(src: string, width?: number, height?: number): string {
  // Check WebP support
  const supportsWebP = (() => {
    if (typeof window === 'undefined') return false;
    
    const canvas = document.createElement('canvas');
    canvas.width = 1;
    canvas.height = 1;
    return canvas.toDataURL('image/webp').indexOf('data:image/webp') === 0;
  })();
  
  // In a real application, you would integrate with your image optimization service
  // For example: Cloudinary, ImageKit, or Next.js Image Optimization
  let optimizedSrc = src;
  
  if (supportsWebP && !src.includes('.webp')) {
    // Convert to WebP if supported and not already WebP
    optimizedSrc = src.replace(/\.(jpg|jpeg|png)$/i, '.webp');
  }
  
  // Add size parameters if provided
  if (width || height) {
    const separator = optimizedSrc.includes('?') ? '&' : '?';
    const params = [];
    if (width) params.push(`w=${width}`);
    if (height) params.push(`h=${height}`);
    optimizedSrc += `${separator}${params.join('&')}`;
  }
  
  return optimizedSrc;
}

/**
 * Bundle size analyzer - logs component render costs in development
 */
export function withPerformanceLogging<P extends object>(
  Component: React.ComponentType<P>,
  componentName?: string
): React.ComponentType<P> {
  if (process.env.NODE_ENV !== 'development') {
    return Component;
  }
  
  return function PerformanceLoggedComponent(props: P) {
    const name = componentName || Component.displayName || Component.name || 'Unknown';
    
    React.useEffect(() => {
      const startTime = performance.now();
      
      return () => {
        const endTime = performance.now();
        console.log(`🔍 Component ${name} render time: ${(endTime - startTime).toFixed(2)}ms`);
      };
    });
    
    return React.createElement(Component, props);
  };
}