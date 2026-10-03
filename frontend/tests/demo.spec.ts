import { test, expect, type Page } from '@playwright/test';

const noHorizontalScroll = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth <= innerWidth);

test('dashboard → live investigation → approval → result → follow-up → replay', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  await expect(
    page.getByRole('heading', { name: 'Turn scientific disagreement into the next experiment.' }),
  ).toBeVisible();
  await page.screenshot({ path: '../docs/redesign-home.png', animations: 'disabled' });

  // Start from the dashboard; the data panel shows real measurements before any experiment.
  await page.getByRole('button', { name: 'Run investigation' }).click();
  await expect(page.locator('.run-title h1')).toHaveText(/^Investigation /);
  await expect(
    page.getByRole('img', { name: 'Actual bill measurements with pooled fitted trend' }),
  ).toBeVisible();

  // The run pauses for approval and opens the Experiment tab.
  const approve = page.getByRole('button', { name: 'Approve & run experiment', exact: true });
  await expect(approve).toBeVisible({ timeout: 30000 });
  await expect(page.getByRole('tab', { name: /Experiment/ })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByText('Nothing runs without you.')).toBeVisible();
  await expect(page.locator('.status-pill', { hasText: 'Needs approval' })).toBeVisible();
  await page.screenshot({ path: '../docs/redesign-approval.png', animations: 'disabled' });
  await approve.click();
  const confirm = page.getByRole('dialog', { name: /^Run “Species-adjusted regression”/ });
  await expect(confirm).toContainText('342 of 344');
  await confirm.getByRole('button', { name: 'Approve & run', exact: true }).click();

  // Result: reversal, model comparison and the exact slope decomposition.
  await expect(page.getByRole('heading', { name: 'The relationship reverses.', exact: true })).toBeVisible({
    timeout: 60000,
  });
  await expect(page.getByText('Actual result · n = 342')).toBeVisible();
  await expect(page.getByText(/ΔBIC \+\d/)).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Why the sign flips' })).toBeVisible();
  await expect(
    page.getByRole('img', { name: 'Pooled slope split into within-group and between-group contributions' }),
  ).toBeVisible();
  await page.screenshot({ path: '../docs/redesign-result.png', animations: 'disabled' });

  // Stage tabs: each stage is its own tab; footer buttons step through them.
  await page.getByRole('tab', { name: /Evidence/ }).click();
  await expect(page.getByRole('heading', { name: 'A contradiction hiding in plain sight' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'The relationship reverses.' })).toHaveCount(0);
  await page
    .locator('.stage-footer')
    .getByRole('button', { name: /Contradiction/ })
    .click();
  await expect(page.getByRole('heading', { name: 'Perspective changes everything.' })).toBeVisible();
  await page.getByRole('tab', { name: /Next move/ }).click();
  await expect(
    page.getByRole('heading', { name: 'Test sex and year effects within species', exact: true }),
  ).toBeVisible();

  // Follow-up under a separate approval.
  await page.getByRole('button', { name: 'Approve & run follow-up', exact: true }).click();
  await page
    .getByRole('dialog', { name: /^Run “Species \+ sex \+ year regression”/ })
    .getByRole('button', { name: 'Approve & run', exact: true })
    .click();
  await expect(page.getByText('UPDATED NEXT STEP')).toBeVisible({ timeout: 30000 });
  await expect(page.getByText(/Follow-up adding sex \+ year/)).toBeVisible();
  await page.screenshot({ path: '../docs/redesign-followup.png', animations: 'disabled' });

  // Data panel tabs: colour by species, provenance graph, activity.
  await page.getByRole('button', { name: 'Color by species', exact: true }).click();
  await expect(
    page.getByRole('img', { name: 'Actual bill measurements with species-specific fitted trends' }),
  ).toBeVisible();
  await page.getByRole('tab', { name: 'Research graph' }).click();
  await page.getByRole('button', { name: /^Inspect result / }).click();
  await expect(page.getByRole('dialog')).toContainText('dataset_sha256');
  await page.getByRole('button', { name: 'Close provenance' }).click();
  await page.screenshot({ path: '../docs/redesign-research-graph.png', animations: 'disabled' });
  await page.getByRole('tab', { name: /^Activity/ }).click();
  await expect(page.locator('.activity').first()).toBeVisible();
  await expect(page.getByRole('link', { name: 'Export JSON' })).toBeVisible();

  // Verified replay, then back to the dashboard, which lists the run with its numbers.
  await page.getByRole('button', { name: /Replay verified run/ }).click();
  await expect(page.getByText('VERIFIED REPLAY', { exact: true })).toBeVisible();
  await expect(page.getByText('Checksum verified')).toBeVisible();
  await page.getByRole('button', { name: 'Investigations' }).click();
  await expect(page.locator('.run-card').first()).toContainText('+0.200');

  for (const width of [1024, 768, 390]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await noHorizontalScroll(page)).toBeTruthy();
    await page.locator('.run-card-main').first().click();
    await expect(page.getByRole('tablist', { name: 'Investigation stages' })).toBeVisible();
    expect(await noHorizontalScroll(page)).toBeTruthy();
    if (width === 390) await page.screenshot({ path: '../docs/redesign-mobile.png', animations: 'disabled' });
    await page.goBack();
  }
  expect(errors).toEqual([]);
});
