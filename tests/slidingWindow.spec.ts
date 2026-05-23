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

const waitForWindowWrite = (page: Page, timeoutMs = 5000) =>
  page.waitForFunction(
    () => {
      const params = new URL(window.location.href).searchParams;
      return params.get('var-timeFrom') !== null && params.get('var-timeTo') !== null;
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
  await expect(page.getByLabel('Current window')).toBeVisible();
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

  expect(readWindowVars(page.url())).toEqual({ from: null, to: null });

  await page.getByLabel('Step forward').click();
  await waitForWindowWrite(page);

  const after = readWindowVars(page.url());
  expect(after.from).not.toBeNull();
  expect(after.to).not.toBeNull();
  // Format is 's' in this dashboard — Unix seconds, integer string.
  expect(after.from).toMatch(/^\d+$/);
  expect(after.to).toMatch(/^\d+$/);
  // The window is one step (5 minutes = 300 seconds) wide.
  expect(Number(after.to) - Number(after.from)).toBe(300);
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
  // After Jump to start the window is one step (300s) wide again, anchored to the
  // global range's left edge.
  expect(Number(after.to) - Number(after.from)).toBe(300);
  await expect(page.getByLabel('Jump to start')).toBeDisabled();
});
