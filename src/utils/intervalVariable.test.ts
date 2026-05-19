import { readIntervalVariable } from './intervalVariable';

const getVariables = jest.fn<Array<unknown>, []>();
let urlSearch = '';

jest.mock('@grafana/runtime', () => ({
  getTemplateSrv: () => ({ getVariables: () => getVariables() }),
  locationService: { getSearch: () => urlSearch },
}));

beforeEach(() => {
  getVariables.mockReturnValue([]);
  urlSearch = '';
});

describe('readIntervalVariable', () => {
  it('returns null when name is blank', () => {
    expect(readIntervalVariable('')).toBeNull();
  });

  it('returns null when no variable matches the name', () => {
    getVariables.mockReturnValue([{ name: 'other', type: 'interval', options: [], current: { value: '5m' } }]);
    expect(readIntervalVariable('step')).toBeNull();
  });

  it('returns null when the named variable is the wrong type', () => {
    getVariables.mockReturnValue([{ name: 'step', type: 'textbox', current: { value: '5m' } }]);
    expect(readIntervalVariable('step')).toBeNull();
  });

  it('returns options and current value as Grafana duration strings', () => {
    getVariables.mockReturnValue([
      {
        name: 'step',
        type: 'interval',
        options: [{ value: '1m' }, { value: '5m' }, { value: '1h' }],
        current: { value: '5m' },
      },
    ]);
    expect(readIntervalVariable('step')).toEqual({
      options: ['1m', '5m', '1h'],
      current: '5m',
    });
  });

  it('skips options that are not valid Grafana duration strings', () => {
    getVariables.mockReturnValue([
      {
        name: 'step',
        type: 'interval',
        options: [{ value: 'auto' }, { value: '5m' }, { value: 'bogus' }],
        current: { value: '5m' },
      },
    ]);
    expect(readIntervalVariable('step')?.options).toEqual(['5m']);
  });

  it('returns null current when the active option is not a valid duration', () => {
    getVariables.mockReturnValue([
      {
        name: 'step',
        type: 'interval',
        options: [{ value: '5m' }],
        current: { value: '$__auto' },
      },
    ]);
    expect(readIntervalVariable('step')?.current).toBeNull();
  });

  it('reads current from the URL when present, overriding templating', () => {
    getVariables.mockReturnValue([
      {
        name: 'step',
        type: 'interval',
        options: [{ value: '5m' }, { value: '10m' }],
        current: { value: '5m' },
      },
    ]);
    urlSearch = '?var-step=10m';
    expect(readIntervalVariable('step')?.current).toBe('10m');
  });

  it('falls back to templating current when the URL has no value for the variable', () => {
    getVariables.mockReturnValue([
      {
        name: 'step',
        type: 'interval',
        options: [{ value: '5m' }],
        current: { value: '5m' },
      },
    ]);
    urlSearch = '?other=x';
    expect(readIntervalVariable('step')?.current).toBe('5m');
  });
});
