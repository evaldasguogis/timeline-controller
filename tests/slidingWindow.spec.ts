import { test, expect, Page } from '@grafana/plugin-e2e';

// Grafana writes template variables as `var-<name>` query params. The Sliding
// Window mode dashboard is provisioned with `timeFrom`/`timeTo` so all
// assertions read those two specifically.
const readWindowVars = (url: string) => {
  const u = new URL(url);
  return {
    from: u.searchParams.get('var-timeFrom'),
    to: u.searchParams.get('var-timeTo'),
  };
};

// The dashboard's textbox-variable defaults are empty strings, so
// `var-timeFrom=` / `var-timeTo=` may be present in the URL with empty
// values immediately after navigation — before the panel mounts and seeds
// them. Wait for actual numeric (ms) values, not just for the params to
// exist.
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

test('Sliding Window dashboard renders transport controls and the progress track', async ({
  gotoDashboardPage,
  readProvisionedDashboard,
  page,
}) => {
  const dashboard = await readProvisionedDashboard({ fileName: 'sliding-window-demo.json' });
  await gotoDashboardPage({ uid: dashboard.uid });

  await expect(page.getByLabel('Play forward')).toBeVisible();
  await expect(page.getByLabel('Pause')).toBeVisible();
  await expect(page.getByLabel('Step forward')).toBeVisible();
  await expect(page.getByLabel('Jump to start')).toBeVisible();
  // Exact match — there's also a "Current window values" readout below the
  // bar that would otherwise match this substring locator.
  await expect(page.getByLabel('Current window', { exact: true })).toBeVisible();
});

test('Jump to start is initially disabled (window already at left edge)', async ({
  gotoDashboardPage,
  readProvisionedDashboard,
  page,
}) => {
  const dashboard = await readProvisionedDashboard({ fileName: 'sliding-window-demo.json' });
  await gotoDashboardPage({ uid: dashboard.uid });

  await expect(page.getByLabel('Jump to start')).toBeDisabled();
});

test('Step backward is disabled at the left edge of the initial window', async ({
  gotoDashboardPage,
  readProvisionedDashboard,
  page,
}) => {
  const dashboard = await readProvisionedDashboard({ fileName: 'sliding-window-demo.json' });
  await gotoDashboardPage({ uid: dashboard.uid });

  await expect(page.getByLabel('Step back')).toBeDisabled();
  await expect(page.getByLabel('Play backward')).toBeDisabled();
  await expect(page.getByLabel('Step forward')).toBeEnabled();
  await expect(page.getByLabel('Play forward')).toBeEnabled();
});

test('Step forward writes var-timeFrom and var-timeTo to the URL', async ({
  gotoDashboardPage,
  readProvisionedDashboard,
  page,
}) => {
  const dashboard = await readProvisionedDashboard({ fileName: 'sliding-window-demo.json' });
  await gotoDashboardPage({ uid: dashboard.uid });

  // The sliding-window panel seeds the variables on mount, so wait for the
  // initial write and capture the seeded position before stepping forward.
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
  // Values are Unix milliseconds; the window is one step (5 minutes) wide.
  expect(Number(after.to) - Number(after.from)).toBe(5 * 60 * 1000);
  // Step forward shifted the window by one step.
  expect(Number(after.from) - Number(initial.from)).toBe(5 * 60 * 1000);
});

test('Play forward keeps advancing the window until Pause', async ({
  gotoDashboardPage,
  readProvisionedDashboard,
  page,
}) => {
  const dashboard = await readProvisionedDashboard({ fileName: 'sliding-window-demo.json' });
  await gotoDashboardPage({ uid: dashboard.uid });

  await page.getByLabel('Play forward').click();
  await waitForWindowWrite(page);
  const first = readWindowVars(page.url());

  await page.waitForFunction((prev) => {
    const params = new URL(window.location.href).searchParams;
    return params.get('var-timeTo') !== prev;
  }, first.to, { timeout: 5000 });

  await page.getByLabel('Pause').click();
  const snapshot = readWindowVars(page.url());

  await page.waitForTimeout(2500);
  const later = readWindowVars(page.url());
  expect(later.from).toBe(snapshot.from);
  expect(later.to).toBe(snapshot.to);
});

test('Jump to start writes the initial window and disables itself', async ({
  gotoDashboardPage,
  readProvisionedDashboard,
  page,
}) => {
  const dashboard = await readProvisionedDashboard({ fileName: 'sliding-window-demo.json' });
  await gotoDashboardPage({ uid: dashboard.uid });

  await page.getByLabel('Step forward').click();
  await page.getByLabel('Step forward').click();
  await waitForWindowWrite(page);
  const stepped = readWindowVars(page.url());

  await page.getByLabel('Jump to start').click();
  await page.waitForFunction(
    (prevTo) => new URL(window.location.href).searchParams.get('var-timeTo') !== prevTo,
    stepped.to,
    { timeout: 5000 }
  );

  const after = readWindowVars(page.url());
  expect(after.from).not.toBe(stepped.from);
  // After Jump to start the window is one step (5 minutes in ms) wide again,
  // anchored to the global range's left edge.
  expect(Number(after.to) - Number(after.from)).toBe(5 * 60 * 1000);
  await expect(page.getByLabel('Jump to start')).toBeDisabled();
});
