import '@testing-library/jest-dom/vitest';
import 'fake-indexeddb/auto';

if (typeof HTMLCanvasElement !== 'undefined') {
  HTMLCanvasElement.prototype.getContext = () => null;
}
