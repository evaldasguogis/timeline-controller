import { getTemplateSrv } from '@grafana/runtime';

// Minimal shape needed for variable validation. Both VariableConfig
// and EventReplayModeOptions match — the validator only cares about the
// three variable-name fields.
export interface VariableConfig {
  variableFrom: string;
  variableTo: string;
  variableStep: string;
}

export interface VariableValidation {
  // Errors block writes — the panel can't do anything useful in this state.
  errors: string[];
  // Warnings are advisory — the panel writes anyway, but the user should know
  // their config probably isn't doing what they intended.
  warnings: string[];
}

// Each variable role has a single Grafana variable type that fits it
// semantically. from/to hold free-form timestamps → textbox. step holds a
// duration string with a predefined option list → interval. Other types are
// flagged: query/datasource/etc. have meaningful preset values that
// overwriting via URL would silently corrupt; constant is set-once;
// custom would need a predefined list that never matches our running value.
const EXPECTED_TYPE_BY_ROLE: Record<string, string> = {
  from: 'textbox',
  to: 'textbox',
  step: 'interval',
};

interface ConfiguredVariable {
  // 'from' | 'to' | 'step' — used in error messages so the user knows which
  // slot the offending name came from.
  role: keyof typeof EXPECTED_TYPE_BY_ROLE;
  name: string;
}

const collectConfigured = (config: VariableConfig): ConfiguredVariable[] => {
  const out: ConfiguredVariable[] = [
    { role: 'from', name: config.variableFrom },
    { role: 'to', name: config.variableTo },
  ];
  // Step is opt-in; only include when the user has set a name.
  if (config.variableStep.trim() !== '') {
    out.push({ role: 'step', name: config.variableStep });
  }
  return out;
};

export const validateVariableConfig = (config: VariableConfig): VariableValidation => {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (config.variableFrom.trim() === '') {
    errors.push('Variable name "from" is required.');
  }
  if (config.variableTo.trim() === '') {
    errors.push('Variable name "to" is required.');
  }

  // Uniqueness among our three slots. Duplicates would cause one tick to
  // overwrite another's value within the same URL update, leaving the user
  // wondering why one variable never seems to change.
  const configured = collectConfigured(config).filter((c) => c.name.trim() !== '');
  const firstSeenRole = new Map<string, string>();
  for (const c of configured) {
    const seen = firstSeenRole.get(c.name);
    if (seen) {
      errors.push(`"${c.name}" is used for both ${seen} and ${c.role}. Variable names must be unique.`);
    } else {
      firstSeenRole.set(c.name, c.role);
    }
  }

  // Cross-dashboard sanity checks only run when our own config is internally
  // consistent — there's no point listing dashboard-side issues until the
  // names themselves are valid.
  if (errors.length === 0) {
    let dashboardVars: DashboardVariable[] = [];
    try {
      dashboardVars = getTemplateSrv().getVariables() as DashboardVariable[];
    } catch {
      // getTemplateSrv isn't available outside a Grafana runtime (e.g. in
      // some test environments). Skip the cross-check rather than fail.
      return { errors, warnings };
    }
    for (const c of configured) {
      const expectedType = EXPECTED_TYPE_BY_ROLE[c.role];
      const match = dashboardVars.find((v) => v.name === c.name);
      if (!match) {
        warnings.push(
          `Variable "${c.name}" is not defined on this dashboard. Add a ${expectedType} variable with that name so the writes have a destination.`
        );
      } else if (match.type !== expectedType) {
        warnings.push(
          `Variable "${c.name}" is a "${match.type}" variable, but ${c.role} expects a "${expectedType}" variable.`
        );
      }
    }
  }

  return { errors, warnings };
};

interface DashboardVariable {
  name: string;
  type: string;
}
