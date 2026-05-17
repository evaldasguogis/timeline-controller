import { test, expect } from '@grafana/plugin-e2e';

const parseUrlRange = (url: string) => {
  const u = new URL(url);
  return { from: u.searchParams.get('from'), to: u.searchParams.get('to') };
};

test('Basic mode renders transport controls including Reset', async ({
  gotoDashboardPage,
  readProvisionedDashboard,
  page,
}) => {
  const dashboard = await readProvisionedDashboard({ fileName: 'dashboard.json' });
  await gotoDashboardPage({ uid: dashboard.uid });

  await expect(page.getByLabel('Play forward')).toBeVisible();
  await expect(page.getByLabel('Pause')).toBeVisible();
  await expect(page.getByLabel('Step forward')).toBeVisible();
  await expect(page.getByLabel('Reset')).toBeVisible();
  await expect(page.getByLabel('Jump to start')).toHaveCount(0);
  await expect(page.getByLabel('Jump to end')).toHaveCount(0);
});

test('Reset is initially disabled (current == cached baseline)', async ({
  gotoDashboardPage,
  readProvisionedDashboard,
  page,
}) => {
  const dashboard = await readProvisionedDashboard({ fileName: 'dashboard.json' });
  await gotoDashboardPage({ uid: dashboard.uid });

  await expect(page.getByLabel('Reset')).toBeDisabled();
});

test('Forward buttons are disabled at the right boundary (initial now-relative range)', async ({
  gotoDashboardPage,
  readProvisionedDashboard,
  page,
}) => {
  const dashboard = await readProvisionedDashboard({ fileName: 'dashboard.json' });
  await gotoDashboardPage({ uid: dashboard.uid });

  await expect(page.getByLabel('Step forward')).toBeDisabled();
  await expect(page.getByLabel('Play forward')).toBeDisabled();
  await expect(page.getByLabel('Step back')).toBeEnabled();
  await expect(page.getByLabel('Play backward')).toBeEnabled();
});

test('Step back writes a new from/to to the URL', async ({
  gotoDashboardPage,
  readProvisionedDashboard,
  page,
}) => {
  const dashboard = await readProvisionedDashboard({ fileName: 'dashboard.json' });
  await gotoDashboardPage({ uid: dashboard.uid });

  const before = parseUrlRange(page.url());

  await page.getByLabel('Step back').click();
  await page.waitForFunction(
    (expected) => new URL(window.location.href).searchParams.get('from') !== expected,
    before.from
  );

  const after = parseUrlRange(page.url());
  expect(after.from).not.toBe(before.from);
  expect(after.to).not.toBe(before.to);
});

test('Play backward advances the URL range over time, Pause stops it', async ({
  gotoDashboardPage,
  readProvisionedDashboard,
  page,
}) => {
  const dashboard = await readProvisionedDashboard({ fileName: 'dashboard.json' });
  await gotoDashboardPage({ uid: dashboard.uid });

  const before = parseUrlRange(page.url());
  await page.getByLabel('Play backward').click();
  await page.waitForFunction(
    (expected) => new URL(window.location.href).searchParams.get('from') !== expected,
    before.from,
    { timeout: 5000 }
  );

  await page.getByLabel('Pause').click();
  const snapshot = parseUrlRange(page.url());

  await page.waitForTimeout(2500);
  const later = parseUrlRange(page.url());
  expect(later.from).toBe(snapshot.from);
  expect(later.to).toBe(snapshot.to);
});

test('Reset restores the dashboard\'s initial relative time range', async ({
  gotoDashboardPage,
  readProvisionedDashboard,
  page,
}) => {
  const dashboard = await readProvisionedDashboard({ fileName: 'dashboard.json' });
  await gotoDashboardPage({ uid: dashboard.uid });

  // Step back twice to move off the initial range.
  await page.getByLabel('Step back').click();
  await page.getByLabel('Step back').click();
  const scrolled = parseUrlRange(page.url());
  expect(scrolled.from).not.toBe('now-6h');

  await page.getByLabel('Reset').click();
  await page.waitForFunction(() => new URL(window.location.href).searchParams.get('from') === 'now-6h');

  const after = parseUrlRange(page.url());
  expect(after.from).toBe('now-6h');
  expect(after.to).toBe('now');
});
