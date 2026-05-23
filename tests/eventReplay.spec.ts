import { test, expect, Page } from '@grafana/plugin-e2e';

// The Event Replay demo dashboard pins `boundaryFrom`/`boundaryTo` and uses
// `timeFrom`/`timeTo` as the variable names — both with format 's' (Unix
// seconds, integer string). Step is 5 minutes = 300 seconds.

const readWindowVars = (url: string) => {
  const u = new URL(url);
  return {
    from: u.searchParams.get('var-timeFrom'),
    to: u.searchParams.get('var-timeTo'),
  };
};

const waitForWindowWrite = (page: Page, timeoutMs = 5000) =>
  page.waitForFunction(
    () => {
      const params = new URL(window.location.href).searchParams;
      return params.get('var-timeFrom') !== null && params.get('var-timeTo') !== null;
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

  expect(readWindowVars(page.url())).toEqual({ from: null, to: null });

  await page.getByLabel('Step forward').click();
  await waitForWindowWrite(page);

  const after = readWindowVars(page.url());
  expect(after.from).toMatch(/^\d+$/);
  expect(after.to).toMatch(/^\d+$/);
  // 5-minute step in seconds format.
  expect(Number(after.to) - Number(after.from)).toBe(300);
});
