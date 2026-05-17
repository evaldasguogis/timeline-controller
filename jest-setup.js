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
