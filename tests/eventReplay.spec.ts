import { test, expect, Page } from '@grafana/plugin-e2e';

// The Event Replay demo dashboard pins `boundaryFrom`/`boundaryTo` and uses
// `timeFrom`/`timeTo` as the variable names. Values are Unix milliseconds
// (the plugin's fixed encoding). Step is 5 minutes = 300_000 ms.

const readWindowVars = (url: string) => {
  const u = new URL(url);
  return {
    from: u.searchParams.get('var-timeFrom'),
    to: u.searchParams.get('var-timeTo'),
  };
};

// The dashboard's textbox-variable defaults are empty strings, so the
// `var-*` params may already be in the URL with empty values immediately
// after navigation — before the panel mounts and seeds them. Wait for
// actual numeric (ms) values rather than just for the params to exist.
const waitForWindowWrite = (page: Page, timeoutMs = 5000) =>
  page.waitForFunction(
    () => {
      const params = new URL(window.location.href).searchParams;
      const from = params.get('var-timeFrom');
      const to = params.get('var-timeTo');
      return !!from && /^\d+$/.test(from) && !!to && /^\d+$/.test(to);
    },
    undefined,
    { timeout: timeoutMs }
  );

test('Event Replay dashboard renders transport controls and the progress track', async ({
  gotoDashboardPage,
  readProvisionedDashboard,
  page,
}) => {
  const dashboard = await readProvisionedDashboard({ fileName: 'event-replay-demo.json' });
  await gotoDashboardPage({ uid: dashboard.uid });

  await expect(page.getByLabel('Play forward')).toBeVisible();
  await expect(page.getByLabel('Pause')).toBeVisible();
  await expect(page.getByLabel('Step forward')).toBeVisible();
  await expect(page.getByLabel('Jump to start')).toBeVisible();
  // Exact match — the readout below also has an aria-label starting with
  // "Current window".
  await expect(page.getByLabel('Current window', { exact: true })).toBeVisible();
});

test('Jump to start is initially disabled at the left edge of the saved range', async ({
  gotoDashboardPage,
  readProvisionedDashboard,
  page,
}) => {
  const dashboard = await readProvisionedDashboard({ fileName: 'event-replay-demo.json' });
  await gotoDashboardPage({ uid: dashboard.uid });

  await expect(page.getByLabel('Jump to start')).toBeDisabled();
});

test('Step forward writes var-timeFrom and var-timeTo across the saved range', async ({
  gotoDashboardPage,
  readProvisionedDashboard,
  page,
}) => {
  const dashboard = await readProvisionedDashboard({ fileName: 'event-replay-demo.json' });
  await gotoDashboardPage({ uid: dashboard.uid });

  // Event Replay seeds the variables on mount, so wait for the initial write
  // before stepping forward.
  await waitForWindowWrite(page);
  const initial = readWindowVars(page.url());
  expect(initial.from).toMatch(/^\d+$/);
  expect(initial.to).toMatch(/^\d+$/);

  await page.getByLabel('Step forward').click();
  await page.waitForFunction(
    (prev) => new URL(window.location.href).searchParams.get('var-timeTo') !== prev,
    initial.to,
    { timeout: 5000 }
  );

  const after = readWindowVars(page.url());
  // 5-minute step in milliseconds.
  expect(Number(after.to) - Number(after.from)).toBe(5 * 60 * 1000);
  expect(Number(after.from) - Number(initial.from)).toBe(5 * 60 * 1000);
});
