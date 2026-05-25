import { locationService } from '@grafana/runtime';

// Documented Grafana deep link: setting `editview=variables` on the
// dashboard URL surfaces the variables tab of the settings overlay
// without a full reload. One canonical caller for this so the few places
// that need it (validation banners, variable-picker onboarding hint)
// stay in lockstep with each other and with Grafana's URL convention.
export const openDashboardVariables = (): void => {
  locationService.partial({ editview: 'variables' }, false);
};
