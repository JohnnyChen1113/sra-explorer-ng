import { expect, test } from '@playwright/test';

import { mockApi, runs } from './fixtures';

type Page = import('@playwright/test').Page;
const rows = (page: Page) => page.locator('[role=row][aria-selected]');

async function open(page: Page, path: string) {
  await page.goto(path);
  await page.locator('html[data-hydrated]').waitFor({ state: 'attached' });
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => { if (!sessionStorage.getItem('e2e-init')) { localStorage.clear(); sessionStorage.setItem('e2e-init', '1'); } });
});

test('example search puts the query in the URL and back navigation restores the home page', async ({ page }) => {
  await mockApi(page);
  await open(page, '/');
  await page.getByRole('button', { name: 'PRJNA517295' }).click();
  await expect(page).toHaveURL(/\?q=PRJNA517295$/);
  await expect(rows(page)).toHaveCount(runs.length);
  await expect(page.getByText(`All ${runs.length} records loaded`)).toBeVisible();
  await page.goBack();
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await page.goForward();
  await expect(rows(page)).toHaveCount(runs.length);
});

test('facets, text filter and sorting narrow and order the loaded runs', async ({ page }) => {
  await mockApi(page);
  await open(page, '/?q=liver');
  await expect(rows(page)).toHaveCount(6);
  await page.getByLabel('Filter by Organism').selectOption('Mus musculus');
  await expect(rows(page)).toHaveCount(1);
  await page.getByRole('button', { name: 'Reset filters' }).click();
  await page.getByPlaceholder('Filter loaded runs').fill('tumour');
  await expect(rows(page)).toHaveCount(3);
  await page.getByRole('button', { name: 'Reset filters' }).click();
  await page.getByRole('button', { name: /^Bases/ }).click();
  await expect(rows(page).first()).toContainText('SRR100005');
});

test('shift-click selects a range and added runs are marked as saved', async ({ page }) => {
  await mockApi(page);
  await open(page, '/?q=liver');
  await rows(page).nth(0).click();
  await rows(page).nth(3).click({ modifiers: ['Shift'] });
  await expect(page.locator('[role=row][aria-selected=true]')).toHaveCount(4);
  await page.getByRole('button', { name: 'Add 4 to collection' }).click();
  await expect(page.getByText('Added 4 runs to the collection')).toBeVisible();
  await expect(page.locator('[role=row]').filter({ hasText: 'Saved' })).toHaveCount(4);
  await page.reload();
  await expect(page.locator('[role=row]').filter({ hasText: 'Saved' })).toHaveCount(4);
});

test('collection looks up ENA first and NCBI Original files only on demand', async ({ page }) => {
  const api = await mockApi(page);
  await open(page, '/?q=liver');
  await page.getByRole('checkbox', { name: 'Select all visible results' }).click();
  await page.getByRole('button', { name: 'Add 6 to collection' }).click();
  await page.getByRole('button', { name: /6\s*saved/ }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByText('6 FASTQ').first()).toBeHidden();
  await expect(dialog.getByText('Original: not checked')).toHaveCount(6);
  expect(api.fileRequests).toHaveLength(0);

  await dialog.getByRole('button', { name: /^FASTQ/ }).click();
  await expect(dialog.getByText('10 FASTQ files', { exact: true })).toBeVisible();
  expect(new Set(api.enaRequests).size).toBe(6);
  expect(api.fileRequests).toHaveLength(0);
  await expect(dialog.locator('pre').first()).not.toContainText('md5_check');
  await dialog.getByLabel(/Verify MD5 checksums/).check();
  await expect(dialog.locator('pre').first()).toContainText("md5_check 'md50_1'");
  await dialog.getByRole('button', { name: 'aspera' }).click();
  await expect(dialog.locator('pre').first()).toContainText('era-fasp@fasp.sra.ebi.ac.uk:/vol1/fastq/SRR100/SRR100000/SRR100000_1.fastq.gz');

  await dialog.getByRole('button', { name: /^Original/ }).click();
  await expect(dialog.getByText('2 Original submitted files', { exact: true })).toBeVisible();
  expect(api.fileRequests.some((request) => request.include.join() === 'original')).toBe(true);
  await expect(dialog.locator('pre').first()).toContainText('reads.pod5');
});

test('failed Original lookups are reported and can be retried', async ({ page }) => {
  const api = await mockApi(page, { failOriginalFor: ['SRR100004'] });
  await open(page, '/?q=liver');
  await page.getByRole('checkbox', { name: 'Select all visible results' }).click();
  await page.getByRole('button', { name: 'Add 6 to collection' }).click();
  await page.getByRole('button', { name: /6\s*saved/ }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: /^Original/ }).click();
  await expect(dialog.getByText('1 runs could not be checked')).toBeVisible();
  await expect(dialog.getByText('1 Original submitted file', { exact: true })).toBeVisible();
  api.healOriginal();
  await dialog.getByRole('button', { name: 'Retry' }).click();
  await expect(dialog.getByText('2 Original submitted files', { exact: true })).toBeVisible();
  await expect(dialog.getByText(/could not be checked/)).toBeHidden();
});

test('runs can be removed with undo, and accession lists can be pasted', async ({ page }) => {
  await mockApi(page);
  await open(page, '/');
  await page.getByRole('button', { name: /Paste them into a collection/ }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('textbox').fill('Runs: SRR100001, SRR100002 and SRR999999');
  await dialog.getByRole('button', { name: 'Add 3 accessions' }).click();
  await expect(dialog.getByText('Added 2 runs. Not found: SRR999999.')).toBeVisible();
  await expect(page.getByRole('button', { name: /2\s*saved/ })).toBeVisible();
  await dialog.getByRole('button', { name: 'Remove SRR100001' }).click();
  await expect(page.getByRole('button', { name: /1\s*saved/ })).toBeVisible();
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(page.getByRole('button', { name: /2\s*saved/ })).toBeVisible();
});

test('download tools offer nf-core/fetchngs ids.csv', async ({ page }) => {
  await mockApi(page);
  await open(page, '/?q=liver');
  await rows(page).nth(0).click();
  await page.getByRole('button', { name: 'Add 1 to collection' }).click();
  await page.getByRole('button', { name: /1\s*saved/ }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Tools', exact: true }).click();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: /ids\.csv/ }).click();
  expect((await download).suggestedFilename()).toBe('ids.csv');
});

test('no horizontal page overflow on a phone', async ({ page }) => {
  await mockApi(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await open(page, '/?q=liver');
  await expect(rows(page)).toHaveCount(6);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});

test('runs without FASTQ are listed and can be re-checked', async ({ page }) => {
  const api = await mockApi(page, { emptyEnaFor: ['SRR100002'] });
  await open(page, '/?q=liver');
  await page.getByRole('checkbox', { name: 'Select all visible results' }).click();
  await page.getByRole('button', { name: 'Add 6 to collection' }).click();
  await page.getByRole('button', { name: /6\s*saved/ }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: /^FASTQ/ }).click();
  await expect(dialog.getByText('1 runs have no FASTQ in ENA')).toBeVisible();
  await expect(dialog.getByText('8 FASTQ files', { exact: true })).toBeVisible();
  api.healEna();
  await dialog.getByRole('button', { name: 'Re-check' }).click();
  await expect(dialog.getByText('10 FASTQ files', { exact: true })).toBeVisible();
  await expect(dialog.getByText(/runs have no FASTQ/)).toBeHidden();
});

test('an ENA outage is reported as a failed lookup, not as missing FASTQ', async ({ page }) => {
  const api = await mockApi(page, { failEnaFor: ['SRR100001'] });
  await open(page, '/?q=liver');
  await page.getByRole('checkbox', { name: 'Select all visible results' }).click();
  await page.getByRole('button', { name: 'Add 6 to collection' }).click();
  await page.getByRole('button', { name: /6\s*saved/ }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: /^FASTQ/ }).click();
  // A bulk ENA request covers the whole batch, so one outage affects every run in it.
  await expect(dialog.getByText('6 runs could not be checked')).toBeVisible();
  await expect(dialog.getByText(/runs have no FASTQ/)).toBeHidden();
  api.healEna();
  await dialog.getByRole('button', { name: 'Retry' }).first().click();
  await expect(dialog.getByText('10 FASTQ files', { exact: true })).toBeVisible();
  await expect(dialog.getByText(/could not be checked/)).toBeHidden();
});

test('the MD5 tab lists every checksum and exports an md5sum file', async ({ page }) => {
  await mockApi(page);
  await open(page, '/?q=liver');
  await rows(page).nth(0).click();
  await rows(page).nth(4).click({ modifiers: ['Shift'] });
  await page.getByRole('button', { name: 'Add 5 to collection' }).click();
  await page.getByRole('button', { name: /5\s*saved/ }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: 'MD5', exact: true }).click();
  await expect(dialog.getByText('md50_1', { exact: true })).toBeVisible();
  await expect(dialog.getByText('md54', { exact: true })).toBeVisible();
  await dialog.getByLabel('Filter checksums').fill('SRR100002');
  await expect(dialog.getByRole('button', { name: /^Copy MD5 of/ })).toHaveCount(2);
  const download = page.waitForEvent('download');
  await dialog.getByRole('button', { name: 'fastq-files.md5' }).click();
  const file = await download;
  expect(file.suggestedFilename()).toBe('fastq-files.md5');
  const { readFile } = await import('node:fs/promises');
  const text = await readFile((await file.path())!, 'utf8');
  expect(text.split('\n').filter(Boolean)).toHaveLength(9);
  expect(text).toContain('md50_1  SRR100000_1.fastq.gz');
});

test('the header Clear button empties the saved runs, with undo', async ({ page }) => {
  await mockApi(page);
  await open(page, '/?q=liver');
  const clear = page.getByRole('button', { name: 'Clear saved runs' });
  await expect(clear).toBeDisabled();
  await rows(page).nth(0).click();
  await rows(page).nth(2).click({ modifiers: ['Shift'] });
  await page.getByRole('button', { name: 'Add 3 to collection' }).click();
  await clear.click();
  await expect(page.getByRole('button', { name: /^0\s*saved/ })).toBeVisible();
  await expect(page.locator('[role=row]').filter({ hasText: 'Saved' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(page.getByRole('button', { name: /^3\s*saved/ })).toBeVisible();
  await clear.click();
  await page.reload();
  await expect(page.getByRole('button', { name: /^0\s*saved/ })).toBeVisible();
  await expect(clear).toBeDisabled();
});
