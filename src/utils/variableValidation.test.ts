import { defaultSlidingWindowModeOptions, SlidingWindowModeOptions } from '../types';
import { validateVariableConfig } from './variableValidation';

const getVariables = jest.fn<Array<{ name: string; type: string }>, []>();

jest.mock('@grafana/runtime', () => ({
  getTemplateSrv: () => ({ getVariables: () => getVariables() }),
}));

const cfg = (overrides: Partial<SlidingWindowModeOptions> = {}): SlidingWindowModeOptions => ({
  ...defaultSlidingWindowModeOptions,
  ...overrides,
});

beforeEach(() => {
  // Default fixtures match the expected types per role: textbox for the
  // timestamps, interval for the (opt-in) step.
  getVariables.mockReturnValue([
    { name: 'timeFrom', type: 'textbox' },
    { name: 'timeTo', type: 'textbox' },
    { name: 'step', type: 'interval' },
  ]);
});

describe('validateVariableConfig — required', () => {
  it('errors when variableFrom is empty', () => {
    const { errors } = validateVariableConfig(cfg({ variableFrom: '' }));
    expect(errors).toContain('Variable name "from" is required.');
  });

  it('errors when variableTo is empty', () => {
    const { errors } = validateVariableConfig(cfg({ variableTo: '' }));
    expect(errors).toContain('Variable name "to" is required.');
  });

  it('errors on whitespace-only names', () => {
    const { errors } = validateVariableConfig(cfg({ variableFrom: '   ', variableTo: '\t' }));
    expect(errors).toHaveLength(2);
  });

  it('does not require variableStep (blank means opt-out)', () => {
    const { errors } = validateVariableConfig(cfg({ variableStep: '' }));
    expect(errors).toEqual([]);
  });
});

describe('validateVariableConfig — uniqueness', () => {
  it('errors when from and to are the same', () => {
    getVariables.mockReturnValue([{ name: 'x', type: 'textbox' }]);
    const { errors } = validateVariableConfig(cfg({ variableFrom: 'x', variableTo: 'x' }));
    expect(errors.some((e) => e.includes('must be unique'))).toBe(true);
  });

  it('errors when step duplicates from', () => {
    const { errors } = validateVariableConfig(cfg({ variableStep: 'timeFrom' }));
    expect(errors.some((e) => e.includes('must be unique'))).toBe(true);
  });

  it('errors when step duplicates to', () => {
    const { errors } = validateVariableConfig(cfg({ variableStep: 'timeTo' }));
    expect(errors.some((e) => e.includes('must be unique'))).toBe(true);
  });
});

describe('validateVariableConfig — dashboard cross-check', () => {
  it('warns when a configured timestamp variable is missing', () => {
    getVariables.mockReturnValue([{ name: 'timeFrom', type: 'textbox' }]);
    const { warnings } = validateVariableConfig(cfg());
    expect(warnings.some((w) => w.includes('"timeTo"') && w.includes('not defined'))).toBe(true);
  });

  it('warns when step variable is missing (mentions interval type)', () => {
    getVariables.mockReturnValue([
      { name: 'timeFrom', type: 'textbox' },
      { name: 'timeTo', type: 'textbox' },
    ]);
    const { warnings } = validateVariableConfig(cfg({ variableStep: 'step' }));
    expect(warnings.some((w) => w.includes('"step"') && w.includes('interval'))).toBe(true);
  });

  it('warns when from/to is something other than textbox', () => {
    getVariables.mockReturnValue([
      { name: 'timeFrom', type: 'query' },
      { name: 'timeTo', type: 'textbox' },
    ]);
    const { warnings } = validateVariableConfig(cfg());
    expect(
      warnings.some((w) => w.includes('"timeFrom"') && w.includes('"query"') && w.includes('"textbox"'))
    ).toBe(true);
  });

  it('warns when step is something other than interval', () => {
    getVariables.mockReturnValue([
      { name: 'timeFrom', type: 'textbox' },
      { name: 'timeTo', type: 'textbox' },
      { name: 'step', type: 'textbox' },
    ]);
    const { warnings } = validateVariableConfig(cfg({ variableStep: 'step' }));
    expect(
      warnings.some((w) => w.includes('"step"') && w.includes('"textbox"') && w.includes('"interval"'))
    ).toBe(true);
  });

  it('does not warn when types match per role', () => {
    getVariables.mockReturnValue([
      { name: 'timeFrom', type: 'textbox' },
      { name: 'timeTo', type: 'textbox' },
      { name: 'step', type: 'interval' },
    ]);
    const { warnings } = validateVariableConfig(cfg({ variableStep: 'step' }));
    expect(warnings).toEqual([]);
  });

  it('skips dashboard cross-check when there are already errors', () => {
    getVariables.mockReturnValue([]);
    const { errors, warnings } = validateVariableConfig(cfg({ variableFrom: '' }));
    expect(errors).toHaveLength(1);
    expect(warnings).toEqual([]);
  });
});
