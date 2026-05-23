import { encodeTimeValue, setVariables } from './variables';

const partial = jest.fn();

jest.mock('@grafana/runtime', () => ({
  locationService: {
    partial: (params: Record<string, string>, replace?: boolean) => partial(params, replace),
  },
}));

beforeEach(() => {
  partial.mockClear();
});

describe('setVariables', () => {
  it('prefixes each name with var- and writes via locationService.partial', () => {
    setVariables({ timeFrom: '1000', timeTo: '2000' });
    expect(partial).toHaveBeenCalledTimes(1);
    expect(partial).toHaveBeenCalledWith(
      { 'var-timeFrom': '1000', 'var-timeTo': '2000' },
      true
    );
  });

  it('uses replace (not push) so ticks do not create back-button breadcrumbs', () => {
    setVariables({ timeFrom: '1000' });
    expect(partial.mock.calls[0][1]).toBe(true);
  });

  it('handles an empty record as a no-op write', () => {
    setVariables({});
    expect(partial).toHaveBeenCalledWith({}, true);
  });
});

describe('encodeTimeValue', () => {
  const refMs = Date.UTC(2026, 4, 16, 0, 0, 0); // 2026-05-16T00:00:00Z

  it('encodes milliseconds as the raw ms integer string', () => {
    expect(encodeTimeValue(refMs, 'ms')).toBe(String(refMs));
  });

  it('encodes seconds as a floored Unix-second string', () => {
    expect(encodeTimeValue(refMs + 250, 's')).toBe(String(Math.floor((refMs + 250) / 1000)));
  });

  it('encodes ISO without millisecond suffix', () => {
    expect(encodeTimeValue(refMs, 'iso')).toBe('2026-05-16T00:00:00Z');
  });

  it('floors seconds (does not round half-up)', () => {
    expect(encodeTimeValue(1500, 's')).toBe('1');
    expect(encodeTimeValue(1999, 's')).toBe('1');
    expect(encodeTimeValue(2000, 's')).toBe('2');
  });

  it('handles epoch 0', () => {
    expect(encodeTimeValue(0, 'ms')).toBe('0');
    expect(encodeTimeValue(0, 's')).toBe('0');
    expect(encodeTimeValue(0, 'iso')).toBe('1970-01-01T00:00:00Z');
  });
});
