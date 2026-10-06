import { expect, test, type Page } from '@playwright/test';

import { mockApi, mockSeqout } from './fixtures';

async function open(page: Page, path: string) {
  await page.goto(path);
  await page.locator('html[data-hydrated]').waitFor({ state: 'attached' });
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => { if (!sessionStorage.getItem('e2e-init')) { localStorage.clear(); sessionStorage.setItem('e2e-init', '1'); } });
});

test('keyword search lists seqout projects; runs come from NCBI with AI annotations', async ({ page }) => {
  await mockApi(page);
  await mockSeqout(page);
  await open(page, '/discover');
  await page.getByLabel('Search datasets').fill('liver tumour');
  await page.getByLabel('Library strategy filter').selectOption('RNA-Seq');
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await expect(page).toHaveURL(/\/discover\?q=liver\+tumour&strategy=RNA-Seq$/);
  const card = page.locator('article').filter({ hasText: 'GSE100000' });
  await expect(page.locator('article')).toHaveCount(2);
  await expect(page.locator('article').filter({ hasText: 'SRP999999' })).toContainText('Mouse J · 2020');
  await expect(card.getByText('Liver tumour transcriptomes.')).toBeVisible();
  await card.getByRole('button', { name: /Show runs/ }).click();
  await expect(card.getByText('SRA SRP300000 · 6 runs')).toBeVisible();
  await expect(card.locator('thead')).toContainText('TissueAI');
  await card.getByLabel('Filter by Disease').selectOption({ label: 'Hepatocellular carcinoma (3)' });
  await expect(card.locator('tbody tr')).toHaveCount(3);
  await card.getByRole('button', { name: 'Add all 3 shown' }).click();
  await page.getByRole('button', { name: /3\s*saved/ }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Metadata' }).click();
  await expect(page.getByRole('dialog').locator('pre')).toContainText('seqout_disease');
  await expect(page.getByRole('dialog').locator('pre')).toContainText('Hepatocellular carcinoma');
});

test('a PubMed ID finds the paper and its datasets', async ({ page }) => {
  await mockApi(page);
  await mockSeqout(page);
  await open(page, '/discover?q=PMID%2030000001');
  await expect(page.getByText('PubMed 30000001')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Liver tumour transcriptomes.' }).first()).toBeVisible();
  await expect(page.locator('article')).toHaveCount(1);
  await expect(page.locator('article')).toContainText('GSE100000');
});

test('when seqout is down, accession lookups still load runs from NCBI', async ({ page }) => {
  await mockApi(page);
  await mockSeqout(page, { down: true });
  await open(page, '/discover?q=SRP300000');
  const card = page.locator('article');
  await expect(card).toHaveCount(1);
  await expect(card.getByText('SRA SRP300000 · 6 runs')).toBeVisible();
  await expect(card.getByText('seqout annotations could not be loaded for some studies.')).toBeVisible();
  await expect(card.locator('tbody tr')).toHaveCount(6);
});

test('the Discover page shares the collection with the Explorer', async ({ page }) => {
  await mockApi(page);
  await mockSeqout(page);
  await open(page, '/discover?q=GSE100000');
  const card = page.locator('article');
  await expect(card.getByText('SRA SRP300000 · 6 runs')).toBeVisible();
  await card.locator('tbody tr').nth(0).click();
  await card.locator('tbody tr').nth(1).click({ modifiers: ['Shift'] });
  await card.getByRole('button', { name: 'Add 2 selected' }).click();
  await open(page, '/?q=liver');
  await expect(page.getByRole('button', { name: /2\s*saved/ })).toBeVisible();
  await expect(page.locator('[role=row]').filter({ hasText: 'Saved' })).toHaveCount(2);
});

test('no horizontal page overflow on a phone', async ({ page }) => {
  await mockApi(page);
  await mockSeqout(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await open(page, '/discover?q=GSE100000');
  await expect(page.locator('article').getByText('SRA SRP300000 · 6 runs')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});
