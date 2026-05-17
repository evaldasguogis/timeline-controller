import { dateTime } from '@grafana/data';
import { getGlobalRange, setGlobalRange } from './globalRange';

const partial = jest.fn();
let currentSearch = '';

jest.mock('@grafana/runtime', () => ({
  locationService: {
    partial: (params: Record<string, string>) => {
      partial(params);
      const usp = new URLSearchParams(currentSearch);
      Object.entries(params).forEach(([k, v]) => usp.set(k, v));
      currentSearch = '?' + usp.toString();
    },
    getSearch: () => currentSearch,
  },
}));

beforeEach(() => {
  partial.mockClear();
  currentSearch = '';
});

describe('setGlobalRange', () => {
  it('passes relative-string from/to through as-is', () => {
    setGlobalRange({ from: 'now-6h', to: 'now' });
    expect(partial).toHaveBeenCalledWith({ from: 'now-6h', to: 'now' });
  });

  it('serializes DateTime values to ms strings', () => {
    const from = dateTime('2026-05-16T00:00:00Z');
    const to = dateTime('2026-05-16T01:00:00Z');
    setGlobalRange({ from, to });
    expect(partial).toHaveBeenCalledWith({
      from: String(from.valueOf()),
      to: String(to.valueOf()),
    });
  });

});

describe('getGlobalRange', () => {
  it('falls back to now-6h / now when the URL has no from/to', () => {
    currentSearch = '';
    const range = getGlobalRange();
    expect(range.raw).toEqual({ from: 'now-6h', to: 'now' });
    // Resolved values should be ~6h apart.
    const sixHoursInMs = 6 * 60 * 60 * 1000;
    const span = range.to.valueOf() - range.from.valueOf();
    expect(span).toBeGreaterThan(sixHoursInMs - 100);
    expect(span).toBeLessThan(sixHoursInMs + 100);
  });

  it('reads relative expressions from the URL', () => {
    currentSearch = '?from=now-30m&to=now';
    const range = getGlobalRange();
    expect(range.raw).toEqual({ from: 'now-30m', to: 'now' });
    const thirtyMinInMs = 30 * 60 * 1000;
    const span = range.to.valueOf() - range.from.valueOf();
    expect(span).toBeGreaterThan(thirtyMinInMs - 100);
    expect(span).toBeLessThan(thirtyMinInMs + 100);
  });

  it('reads numeric timestamps from the URL as absolute ms', () => {
    // Grafana's convertRawToRange replaces non-relative raw values with the
    // parsed DateTime, so we don't assert on the raw shape — only that the
    // resolved from/to are exactly the timestamps from the URL.
    const fromMs = dateTime('2026-05-16T00:00:00Z').valueOf();
    const toMs = dateTime('2026-05-16T01:00:00Z').valueOf();
    currentSearch = `?from=${fromMs}&to=${toMs}`;
    const range = getGlobalRange();
    expect(range.from.valueOf()).toBe(fromMs);
    expect(range.to.valueOf()).toBe(toMs);
  });
});
