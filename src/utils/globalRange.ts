import { dateTime, DateTime, RawTimeRange, rangeUtil, TimeRange } from '@grafana/data';
import { locationService } from '@grafana/runtime';

// The dashboard's time picker is a URL state: `?from=…&to=…`. We read/write
// via Grafana's locationService because it's the canonical entry point —
// it propagates the change to every consumer on the dashboard (panels,
// variables, repeat). Updating `window.location` directly would not.

export const setGlobalRange = (raw: RawTimeRange) => {
  // partial(params, true) merges into the current URL and replaces the
  // history entry instead of pushing a new one — we don't want each tick
  // creating a back-button breadcrumb.
  const fromValue = typeof raw.from === 'string' ? raw.from : raw.from.valueOf().toString();
  const toValue = typeof raw.to === 'string' ? raw.to : raw.to.valueOf().toString();
  locationService.partial({ from: fromValue, to: toValue }, true);
};

// URL params are always strings, but a digit-only string from a previous
// write is an absolute millisecond timestamp. Pre-wrap it in a DateTime so
// rangeUtil.convertRawToRange short-circuits to the isDateTime branch
// instead of trying to parse it as an ISO-formatted date string.
const parseUrlBound = (value: string): string | DateTime =>
  /^-?\d+$/.test(value) ? dateTime(parseInt(value, 10)) : value;

export const getGlobalRange = (): TimeRange => {
  // Fall back to the same default Grafana itself uses when a fresh dashboard
  // is loaded without explicit `from`/`to`.
  const params = new URLSearchParams(locationService.getSearch());
  const raw: RawTimeRange = {
    from: parseUrlBound(params.get('from') || 'now-6h'),
    to: parseUrlBound(params.get('to') || 'now'),
  };
  return rangeUtil.convertRawToRange(raw);
};
