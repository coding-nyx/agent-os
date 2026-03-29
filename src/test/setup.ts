import '@testing-library/jest-dom'
import { vi } from 'vitest'

// These mocks are only relevant in browser-like (jsdom) environments.
if (typeof window !== 'undefined') {
  // Mock any global objects that might not be in jsdom
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation(query => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(), // deprecated
      removeListener: vi.fn(), // deprecated
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  })

  // Mock ResizeObserver for Radix UI components
  class ResizeObserverMock {
    observe() {}
    unobserve() {}
    disconnect() {}
  }

  global.ResizeObserver = ResizeObserverMock as any
}
