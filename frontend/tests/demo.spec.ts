import { test, expect, type Page } from '@playwright/test';

const FIXTURES = '../data/fixtures';

const noHorizontalScroll = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth <= innerWidth);

/** No text may escape its card: checks horizontal overflow on every matching element. */
const noCardOverflow = async (page: Page) => {
  const escaped = await page.evaluate(() => {
    const selectors =
      '.run-card, .hypothesis-card, .experiment-card, .evidence-card, .challenge, .decision-card, ' +
      '.gap-callout, .why-decision, .acceleration-grid > div, .fact, .quote-card, ' +
      '.next-test, .transcript .line, .status-pill, .run-title';
    return Array.from(document.querySelectorAll<HTMLElement>(selectors))
      .filter((el) => el.scrollWidth > el.clientWidth + 1)
      .map((el) => el.className);
  });
  expect(escaped).toEqual([]);
};

test('debate: upload papers → arena playback → approval → critic → decision → replay', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /tries to prove itself wrong/ })).toBeVisible();
  await expect(page.getByText('Reference science')).toHaveCount(0);

  // Every entry point starts from two uploaded papers.
  await page.locator('.hero-actions').getByRole('button', { name: 'Compare two papers' }).click();
  await page.getByLabel('Paper A PDF').setInputFiles(`${FIXTURES}/caffeine-rct-young.pdf`);
  await page.getByLabel('Paper B PDF').setInputFiles(`${FIXTURES}/caffeine-null-older.pdf`);
  await page.getByRole('button', { name: /Analyze papers/ }).click();
  await page.getByRole('button', { name: 'Start the investigation' }).click();

  // A fresh run plays the specialists' handoffs back in the arena, then pauses for the human.
  await expect(page.locator('.run-title h1')).toHaveText(/^Investigation /);
  const arena = page.getByRole('region', { name: 'Agent arena' });
  await expect(arena.getByText('Paused for you')).toBeVisible({ timeout: 30000 });
  await expect(page.getByRole('tab', { name: /Experiment/ })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByText('Nothing runs without you.')).toBeVisible();
  await expect(page.locator('.status-pill', { hasText: 'Needs approval' })).toBeVisible();
  await page.screenshot({ path: '../artifacts/browser-tests/redesign-approval.png', animations: 'disabled' });

  await page.getByRole('button', { name: 'Approve & run experiment', exact: true }).click();
  const confirm = page.getByRole('dialog', { name: /^Run “Claim-alignment robustness audit”/ });
  await expect(confirm).toContainText('claims extracted from 2 uploaded PDFs');
  await confirm.getByRole('button', { name: 'Approve & run', exact: true }).click();

  // The critic attacks the result; each challenge is settled by a computed number.
  const challenges = page.getByLabel('Critic challenges');
  await expect(challenges).toBeVisible({ timeout: 60000 });
  await page.screenshot({ path: '../artifacts/browser-tests/redesign-arena.png', animations: 'disabled' });
  await page.getByRole('button', { name: 'Skip to end' }).click();
  await expect(challenges.locator('.challenge.rebutted').first()).toBeVisible();
  await expect(challenges.locator('.challenge.open')).toHaveCount(1);

  // The unresolved challenge is called out on the result and routes to the next experiment.
  const gap = page.locator('.gap-callout');
  await expect(gap).toContainText('CRITIC FOUND A GAP');
  await expect(gap).toContainText('unresolved');
  await noCardOverflow(page);

  // Stress: an absurdly long unbroken agent output must stay inside its rectangle and stay readable.
  const LONG = 'Confounderhypothesiswithoutanyspaces'.repeat(9) + '-sha256:' + 'f'.repeat(64);
  await page.evaluate((text) => {
    for (const sel of [
      '.challenge p',
      '.gap-body h3 em',
      '.transcript .line p',
      '.seat-name',
      '.board-statement',
    ])
      for (const el of Array.from(document.querySelectorAll<HTMLElement>(sel)).slice(0, 1))
        el.textContent = text;
  }, LONG);
  expect(await noHorizontalScroll(page)).toBeTruthy();
  await noCardOverflow(page);
  // Seat names and board statements clip with a real ellipsis inside their SVG rects.
  expect(
    await page.evaluate(() =>
      ['.seat-name', '.board-statement'].every((sel) => {
        const el = document.querySelector<HTMLElement>(sel);
        if (!el) return false;
        const style = getComputedStyle(el);
        return style.overflow === 'hidden' && style.textOverflow === 'ellipsis';
      }),
    ),
  ).toBeTruthy();
  await gap.getByRole('button', { name: /Next experiment required/ }).click();
  await expect(page.getByRole('img', { name: /open critique branches back/ })).toBeVisible();
  await expect(page.locator('.why-decision')).toContainText('Critic challenge X5');
  await expect(page.locator('.why-decision')).toContainText('Required again');
  const acceleration = page.locator('.acceleration');
  await expect(acceleration).toContainText('Workflow compression');
  await expect(acceleration).toContainText('Rebutted by data');
  await noCardOverflow(page);
  await page.screenshot({ path: '../artifacts/browser-tests/redesign-followup.png', animations: 'disabled' });

  // Result: the disagreement's robustness, all computed.
  await page.getByRole('tab', { name: /Result/ }).click();
  await expect(page.getByRole('heading', { name: 'The disagreement holds.', exact: true })).toBeVisible();
  await page.screenshot({ path: '../artifacts/browser-tests/redesign-result.png', animations: 'disabled' });

  // Stage tabs step through the record.
  await page.getByRole('tab', { name: /Evidence/ }).click();
  await expect(page.getByRole('heading', { name: 'What each paper actually says' })).toBeVisible();
  await expect(page.locator('.evidence-card').first()).toContainText('p. 2');
  await page
    .locator('.stage-footer')
    .getByRole('button', { name: /Contradiction/ })
    .click();
  await expect(page.getByRole('heading', { name: 'Same question. Different answers.' })).toBeVisible();

  // Parsed papers, provenance graph and the raw record.
  await page.getByRole('tab', { name: 'Data', exact: true }).click();
  await expect(page.getByText('Extracted claims', { exact: true })).toBeVisible();
  await page.getByRole('tab', { name: 'Research graph' }).click();
  await page.getByRole('button', { name: /^Inspect result / }).click();
  await expect(page.getByRole('dialog')).toContainText('dataset_sha256');
  await page.getByRole('button', { name: 'Close provenance' }).click();
  await page.screenshot({
    path: '../artifacts/browser-tests/redesign-research-graph.png',
    animations: 'disabled',
  });
  await page.getByRole('tab', { name: 'Record', exact: true }).click();
  await expect(page.locator('.activity').first()).toBeVisible();
  await expect(page.getByRole('link', { name: 'Export JSON' })).toBeVisible();

  // A verified replay plays the whole debate back from the sealed record.
  await page.getByRole('tab', { name: 'Arena', exact: true }).click();
  await page.getByRole('button', { name: /Replay verified run/ }).click();
  await expect(page.getByText('VERIFIED REPLAY · SEALED RECORD')).toBeVisible();
  await expect(page.getByText('Checksum verified')).toBeVisible();
  await expect(arena.getByText('Playing back')).toBeVisible();
  await page.getByRole('button', { name: 'Skip to end' }).click();

  // The dashboard features the debate and lists the run with its numbers and verdicts.
  await page.getByRole('button', { name: 'Investigations' }).click();
  await expect(page.locator('.run-card').first()).toContainText('disagreement rate');
  await expect(page.locator('.run-card').first()).toContainText('rebutted');
  await expect(page.locator('.hero-facts')).toContainText('LATEST COMPARISON');
  await expect(page.locator('.hero-floor svg.floor')).toBeVisible();
  await page.screenshot({ path: '../artifacts/browser-tests/redesign-home.png', animations: 'disabled' });

  for (const width of [1024, 768, 390]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await noHorizontalScroll(page)).toBeTruthy();
    await page.locator('.run-card-main').first().click();
    await expect(page.getByRole('tablist', { name: 'Investigation stages' })).toBeVisible();
    expect(await noHorizontalScroll(page)).toBeTruthy();
    await noCardOverflow(page);
    if (width === 390)
      await page.screenshot({
        path: '../artifacts/browser-tests/redesign-mobile.png',
        animations: 'disabled',
      });
    await page.goBack();
  }
  expect(errors).toEqual([]);
});
