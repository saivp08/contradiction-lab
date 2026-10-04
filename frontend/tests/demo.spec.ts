import { test, expect, type Page } from '@playwright/test';

const noHorizontalScroll = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth <= innerWidth);

/** No text may escape its card: checks horizontal overflow on every matching element. */
const noCardOverflow = async (page: Page) => {
  const escaped = await page.evaluate(() => {
    const selectors =
      '.run-card, .hypothesis-card, .experiment-card, .evidence-card, .challenge, .decision-card, ' +
      '.model-evidence, .gap-callout, .why-decision, .acceleration-grid > div, .fact, .key-numbers > div, ' +
      '.next-test, .transcript .line, .status-pill, .run-title';
    return Array.from(document.querySelectorAll<HTMLElement>(selectors))
      .filter((el) => el.scrollWidth > el.clientWidth + 1)
      .map((el) => el.className);
  });
  expect(escaped).toEqual([]);
};

test('debate: dashboard → arena playback → approval → critic → follow-up → replay', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /tries to prove itself wrong/ })).toBeVisible();

  // A fresh run plays the specialists' handoffs back in the arena, then pauses for the human.
  await page.getByRole('button', { name: 'Start a debate' }).click();
  await expect(page.locator('.run-title h1')).toHaveText(/^Investigation /);
  const arena = page.getByRole('region', { name: 'Agent arena' });
  await expect(arena.getByText('Playing back')).toBeVisible();
  await expect(arena.getByText('Paused for you')).toBeVisible({ timeout: 30000 });
  await expect(page.getByRole('tab', { name: /Experiment/ })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByText('Nothing runs without you.')).toBeVisible();
  await expect(page.locator('.status-pill', { hasText: 'Needs approval' })).toBeVisible();
  await page.screenshot({ path: '../docs/redesign-approval.png', animations: 'disabled' });

  // The data panel shows the real measurements before any experiment.
  await page.getByRole('tab', { name: 'Data', exact: true }).click();
  await expect(
    page.getByRole('img', { name: 'Actual bill measurements with pooled fitted trend' }),
  ).toBeVisible();
  await page.getByRole('tab', { name: 'Arena', exact: true }).click();

  await page.getByRole('button', { name: 'Approve & run experiment', exact: true }).click();
  const confirm = page.getByRole('dialog', { name: /^Run “Species-adjusted regression”/ });
  await expect(confirm).toContainText('342 of 344');
  await confirm.getByRole('button', { name: 'Approve & run', exact: true }).click();

  // The critic attacks the result; each challenge is settled by a computed number.
  const challenges = page.getByLabel('Critic challenges');
  await expect(challenges).toBeVisible({ timeout: 60000 });
  await expect(challenges).toContainText('under fire');
  await page.screenshot({ path: '../docs/redesign-arena.png', animations: 'disabled' });
  await page.getByRole('button', { name: 'Skip to end' }).click();
  await expect(challenges.locator('.challenge.rebutted')).toHaveCount(4);
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
  await expect(page.locator('.why-decision')).toContainText('Awaiting your approval');
  await page.getByRole('tab', { name: /Result/ }).click();

  // Result: reversal, model comparison and the exact slope decomposition.
  await expect(page.getByRole('heading', { name: 'The relationship reverses.', exact: true })).toBeVisible();
  await expect(page.getByText('Actual result · n = 342')).toBeVisible();
  await expect(page.locator('.model-evidence')).toContainText(/ΔBIC \+\d/);
  await page.getByRole('tab', { name: 'Data', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Why the sign flips' })).toBeVisible();
  await expect(
    page.getByRole('img', { name: 'Pooled slope split into within-group and between-group contributions' }),
  ).toBeVisible();
  await page.screenshot({ path: '../docs/redesign-result.png', animations: 'disabled' });

  // Stage tabs step through the record.
  await page.getByRole('tab', { name: /Evidence/ }).click();
  await expect(page.getByRole('heading', { name: 'A contradiction hiding in plain sight' })).toBeVisible();
  await page
    .locator('.stage-footer')
    .getByRole('button', { name: /Contradiction/ })
    .click();
  await expect(page.getByRole('heading', { name: 'Perspective changes everything.' })).toBeVisible();
  await page.getByRole('tab', { name: /Next move/ }).click();
  await expect(
    page.getByRole('heading', { name: 'Test sex and year effects within species', exact: true }),
  ).toBeVisible();

  // The open challenge drives the follow-up, run under a separate approval.
  await page.getByRole('button', { name: 'Approve & run follow-up', exact: true }).click();
  await page
    .getByRole('dialog', { name: /^Run “Species \+ sex \+ year regression”/ })
    .getByRole('button', { name: 'Approve & run', exact: true })
    .click();
  await page.getByRole('tab', { name: 'Arena', exact: true }).click();
  await page.getByRole('button', { name: 'Skip to end' }).click();
  await expect(challenges.locator('.challenge.partly-conceded')).toHaveCount(1);
  await page.getByRole('tab', { name: /Next move/ }).click();
  await expect(page.getByText('UPDATED NEXT STEP')).toBeVisible();
  await expect(page.getByRole('img', { name: /now resolved/ })).toBeVisible();
  await expect(page.locator('.why-decision')).toContainText('Approved ·');
  await expect(page.locator('.why-decision')).toContainText('Slope +0.070');
  const acceleration = page.locator('.acceleration');
  await expect(acceleration).toContainText('Workflow compression');
  await expect(acceleration).toContainText('Follow-ups triggered');
  await expect(acceleration).toContainText('Rebutted by data');
  await noCardOverflow(page);
  await page.screenshot({ path: '../docs/redesign-followup.png', animations: 'disabled' });
  await page.getByRole('tab', { name: 'Data', exact: true }).click();
  await expect(page.getByText(/Follow-up adding sex \+ year/)).toBeVisible();
  await page.getByRole('button', { name: 'Color by species', exact: true }).click();
  await expect(
    page.getByRole('img', { name: 'Actual bill measurements with species-specific fitted trends' }),
  ).toBeVisible();

  // Provenance graph and the raw record.
  await page.getByRole('tab', { name: 'Research graph' }).click();
  await page.getByRole('button', { name: /^Inspect result / }).click();
  await expect(page.getByRole('dialog')).toContainText('dataset_sha256');
  await page.getByRole('button', { name: 'Close provenance' }).click();
  await page.screenshot({ path: '../docs/redesign-research-graph.png', animations: 'disabled' });
  await page.getByRole('tab', { name: 'Record', exact: true }).click();
  await expect(page.locator('.activity').first()).toBeVisible();
  await expect(page.getByRole('link', { name: 'Export JSON' })).toBeVisible();

  // A verified replay plays the whole debate back from the sealed record.
  await page.getByRole('button', { name: /Replay verified run/ }).click();
  await expect(page.getByText('VERIFIED REPLAY · SEALED RECORD')).toBeVisible();
  await expect(page.getByText('Checksum verified')).toBeVisible();
  await expect(arena.getByText('Playing back')).toBeVisible();
  await page.getByRole('button', { name: 'Skip to end' }).click();

  // The dashboard features the debate and lists the run with its numbers and verdicts.
  await page.getByRole('button', { name: 'Investigations' }).click();
  await expect(page.locator('.run-card').first()).toContainText('+0.200');
  await expect(page.locator('.run-card').first()).toContainText('4 rebutted');
  await expect(page.locator('.hero-floor svg.floor')).toBeVisible();
  await page.screenshot({ path: '../docs/redesign-home.png', animations: 'disabled' });

  for (const width of [1024, 768, 390]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await noHorizontalScroll(page)).toBeTruthy();
    await page.locator('.run-card-main').first().click();
    await expect(page.getByRole('tablist', { name: 'Investigation stages' })).toBeVisible();
    expect(await noHorizontalScroll(page)).toBeTruthy();
    await noCardOverflow(page);
    if (width === 390) await page.screenshot({ path: '../docs/redesign-mobile.png', animations: 'disabled' });
    await page.goBack();
  }
  expect(errors).toEqual([]);
});
