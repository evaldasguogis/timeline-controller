import { setVariables } from './variables';

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
