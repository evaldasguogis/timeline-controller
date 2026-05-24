// Jest setup provided by Grafana scaffolding
import './.config/jest-setup';

// @grafana/ui's Combobox uses canvas measureText to size itself. jsdom doesn't
// implement canvas, and the scaffold mock returns `{}` from getContext(). Provide
// a richer stub so components that auto-size by measured text width render.
HTMLCanvasElement.prototype.getContext = function () {
  return {
    measureText: (text) => ({ width: (text?.length ?? 0) * 8 }),
  };
};

// @grafana/ui's ScrollContainer (rendered inside Combobox when its dropdown
// opens) constructs an IntersectionObserver. jsdom doesn't implement it. A
// no-op stub is enough — tests don't assert on scroll-indicator visibility.
if (typeof window.IntersectionObserver === 'undefined') {
  window.IntersectionObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
    takeRecords() {
      return [];
    }
  };
}

// jsdom (through v22+) doesn't implement PointerEvent, so
// @testing-library's fireEvent.pointerDown/Move/Up falls back in a way
// React's synthetic event system can't pick up — meaning onPointerDown
// handlers never fire in tests. WindowProgressTrack uses pointer events
// to make the segment draggable; this polyfill lets its tests exercise
// that path. See https://github.com/jsdom/jsdom/issues/2527.
if (typeof window.PointerEvent === 'undefined') {
  window.PointerEvent = class PointerEvent extends MouseEvent {
    constructor(type, params = {}) {
      super(type, params);
      this.pointerId = params.pointerId ?? 0;
      this.pointerType = params.pointerType ?? '';
      this.isPrimary = params.isPrimary ?? true;
      this.width = params.width ?? 1;
      this.height = params.height ?? 1;
      this.pressure = params.pressure ?? 0;
      this.tangentialPressure = params.tangentialPressure ?? 0;
      this.tiltX = params.tiltX ?? 0;
      this.tiltY = params.tiltY ?? 0;
      this.twist = params.twist ?? 0;
    }
  };
}
// jsdom Elements lack setPointerCapture / releasePointerCapture. The drag
// handler tolerates absence via optional chaining, but no-op stubs match
// real-DOM behavior and avoid surprising any other consumer.
if (typeof Element.prototype.setPointerCapture === 'undefined') {
  Element.prototype.setPointerCapture = function () {};
  Element.prototype.releasePointerCapture = function () {};
  Element.prototype.hasPointerCapture = function () {
    return false;
  };
}
