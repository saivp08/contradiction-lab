import { test, expect, type Page } from '@playwright/test';

const FIXTURES = '../data/fixtures';

const noCardOverflow = async (page: Page) => {
  const escaped = await page.evaluate(() => {
    const selectors =
      '.paper-slot, .quote-card, .versus-row, .relationship-banner, .differs-grid > div, ' +
      '.hypothesis-card, .experiment-card, .challenge, .gap-callout, .result-metrics > div, .fact';
    return Array.from(document.querySelectorAll<HTMLElement>(selectors))
      .filter((el) => el.scrollWidth > el.clientWidth + 1)
      .map((el) => el.className);
  });
  expect(escaped).toEqual([]);
};

test('two uploaded papers → parsed evidence → contradiction → existing workflow', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  await page.getByRole('button', { name: 'Compare two papers', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Do these two papers disagree?' })).toBeVisible();

  // Upload and parse both PDFs; metadata is extracted from the documents themselves.
  await page.getByLabel('Paper A PDF').setInputFiles(`${FIXTURES}/caffeine-rct-young.pdf`);
  await expect(page.getByText('Caffeine improves sustained attention in young adults')).toBeVisible();
  await expect(page.getByText('DOI 10.9999/jcp.2021.0042')).toBeVisible();
  await expect(page.getByText('Maria Keller, Daniel Osei, Priya Raman · 2021')).toBeVisible();
  await page.getByLabel('Paper B PDF').setInputFiles(`${FIXTURES}/caffeine-null-older.pdf`);
  await expect(page.getByText('No significant effect of caffeine on sustained attention')).toBeVisible();

  // Analyze actual contents: aligned claims, relationship, provenance, what differs.
  await page.getByRole('button', { name: /Analyze papers/ }).click();
  await expect(page.getByRole('heading', { name: 'context-dependent disagreement' })).toBeVisible();
  await expect(page.getByText(/Caffeine significantly increased sustained attention/).first()).toBeVisible();
  await page.getByRole('button', { name: 'View evidence' }).first().click();
  await expect(page.getByText('p. 2 · results section')).toBeVisible();
  await expect(page.getByText(/p = 0\.003/).first()).toBeVisible();
  await expect(page.getByText('WHAT DIFFERS?')).toBeVisible();
  await expect(page.locator('.differs-grid')).toContainText('ages 18-30');
  await page.screenshot({ path: '../artifacts/browser-tests/redesign-papers.png', animations: 'disabled' });
  await noCardOverflow(page);

  // The defensible disagreement feeds the SAME workflow: arena, approval gate, critic, decision.
  await page.getByRole('button', { name: 'Start the investigation' }).click();
  await expect(page.locator('.run-title h1')).toBeVisible();
  await expect(page.getByText(/disagree about/).first()).toBeVisible();
  const arena = page.getByRole('region', { name: 'Agent arena' });
  await expect(arena.getByText('Paused for you')).toBeVisible({ timeout: 30000 });
  await page.getByRole('button', { name: 'Approve & run experiment', exact: true }).click();
  const confirm = page.getByRole('dialog', { name: /^Run “Claim-alignment robustness audit”/ });
  await expect(confirm).toContainText('claims extracted from 2 uploaded PDFs');
  await confirm.getByRole('button', { name: 'Approve & run', exact: true }).click();

  await expect(page.getByLabel('Critic challenges')).toBeVisible({ timeout: 60000 });
  await page.getByRole('button', { name: 'Skip to end' }).click();
  await expect(page.getByRole('heading', { name: 'The disagreement holds.', exact: true })).toBeVisible();
  await expect(page.getByText(/Disagreement rate/i).first()).toBeVisible();
  await expect(page.getByLabel('Critic challenges').locator('.challenge.open')).toHaveCount(1);
  const gap = page.locator('.gap-callout');
  await expect(gap).toContainText('CRITIC FOUND A GAP');
  await noCardOverflow(page);

  await page.getByRole('tab', { name: /Next move/ }).click();
  await expect(page.getByText(/Design a comparison holding/).first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Approve & run follow-up' })).toHaveCount(0);
  await expect(page.locator('.acceleration')).toContainText('Still open');

  // Data panel shows the parsed papers.
  await page.getByRole('tab', { name: 'Data', exact: true }).click();
  await expect(page.getByText('Extracted claims', { exact: true })).toBeVisible();
  await expect(page.getByText('PAPER A')).toBeVisible();
  expect(errors).toEqual([]);
});

test('unrelated papers produce an honest no-contradiction result', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/#/compare');
  await page.getByLabel('Paper A PDF').setInputFiles(`${FIXTURES}/caffeine-rct-young.pdf`);
  await page.getByLabel('Paper B PDF').setInputFiles(`${FIXTURES}/soil-nitrogen.pdf`);
  await expect(page.getByText('Nitrogen fixation rates in temperate forest')).toBeVisible();
  await page.getByRole('button', { name: /Analyze papers/ }).click();
  await expect(page.getByRole('heading', { name: 'insufficiently comparable' })).toBeVisible();
  await expect(page.getByText('An investigation will not be fabricated.')).toBeVisible();
  await expect(page.getByText('Paper A found')).toBeVisible();
  await expect(page.getByText('Why not contradictory')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Start the investigation' })).toHaveCount(0);

  // Agreeing papers are complementary, not a manufactured contradiction.
  await page.getByRole('button', { name: 'Remove' }).last().click();
  await page.getByLabel('Paper B PDF').setInputFiles(`${FIXTURES}/caffeine-agree-shift.pdf`);
  await page.getByRole('button', { name: /Analyze papers/ }).click();
  await expect(page.getByRole('heading', { name: 'complementary findings' })).toBeVisible();
  await expect(page.getByText('complement rather than contradict')).toBeVisible();

  // A malformed PDF fails loudly, not silently.
  await page.getByRole('button', { name: 'Remove' }).last().click();
  await page.getByLabel('Paper B PDF').setInputFiles(`${FIXTURES}/malformed.pdf`);
  await expect(page.getByText(/Could not parse this file as a PDF/)).toBeVisible();
  await page.getByLabel('Paper B PDF').setInputFiles(`${FIXTURES}/image-only.pdf`);
  await expect(page.getByText(/no extractable text layer/)).toBeVisible();
});
