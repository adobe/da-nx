import { test, expect } from '@playwright/test';

const FIXTURE = '/nx2/test/e2e/fixtures/plan-card.html';

// Pierce shadow DOM: Playwright auto-pierces with >> css= syntax
const shadow = (host, selector) => host.locator(`css=${selector}`);

test.describe('nx-campaign-plan-card', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(FIXTURE);
    // Wait for Lit to render — element is in DOM immediately but shadow root
    // and styles are async, so wait until .plan-title exists in the shadow DOM
    await page.waitForFunction(() => {
      const el = document.getElementById('card');
      return el?.shadowRoot?.querySelector('.plan-title') != null;
    }, { timeout: 10000 });
  });

  test('renders title and description', async ({ page }) => {
    const card = page.locator('nx-campaign-plan-card');
    await expect(shadow(card, '.plan-title')).toHaveText('Test Plan');
    await expect(shadow(card, '.plan-description')).toHaveText('A test description');
  });

  test('renders task list with correct count', async ({ page }) => {
    const card = page.locator('nx-campaign-plan-card');
    await expect(shadow(card, 'nx-task-item')).toHaveCount(2);
  });

  test('collapses and expands on chevron click', async ({ page }) => {
    const card = page.locator('nx-campaign-plan-card');
    const tasks = shadow(card, '.plan-tasks');

    // Starts expanded
    await expect(tasks).toBeVisible();

    // Collapse
    await shadow(card, '.plan-icon-btn').click();
    await expect(tasks).not.toBeVisible();

    // Expand again
    await shadow(card, '.plan-icon-btn').click();
    await expect(tasks).toBeVisible();
  });

  test('run button is enabled initially and dispatches nx-plan-run', async ({ page }) => {
    const card = page.locator('nx-campaign-plan-card');
    const runBtn = shadow(card, '.plan-btn-run');

    await expect(runBtn).toBeEnabled();
    await expect(runBtn).toHaveText('Run');

    const eventFired = page.evaluate(() => new Promise((resolve) => {
      document.getElementById('card').addEventListener('nx-plan-run', () => resolve(true), { once: true });
    }));
    await shadow(card, '.plan-btn-run').click();
    await expect(await eventFired).toBe(true);
  });

  test('shows Running... and disables run button when a task is running', async ({ page }) => {
    await page.evaluate(() => {
      const card = document.getElementById('card');
      card.plan = {
        title: 'Test Plan',
        description: 'A test description',
        tasks: [
          { id: '1', label: 'Read content', status: 'running' },
          { id: '2', label: 'Write draft', status: 'pending' },
        ],
      };
    });

    const card = page.locator('nx-campaign-plan-card');
    const runBtn = shadow(card, '.plan-btn-run');
    await expect(runBtn).toHaveText('Running...');
    await expect(runBtn).toBeDisabled();
  });

  test('reflects task status on nx-task-item elements', async ({ page }) => {
    await page.evaluate(() => {
      const card = document.getElementById('card');
      card.plan = {
        title: 'Test Plan',
        description: 'A test description',
        tasks: [
          { id: '1', label: 'Read content', status: 'done' },
          { id: '2', label: 'Write draft', status: 'running' },
        ],
      };
    });

    const card = page.locator('nx-campaign-plan-card');
    const items = shadow(card, 'nx-task-item');
    await expect(items.nth(0)).toHaveAttribute('status', 'done');
    await expect(items.nth(1)).toHaveAttribute('status', 'running');
  });

  test('shows Done and disables run button when all tasks complete', async ({ page }) => {
    await page.evaluate(() => {
      const card = document.getElementById('card');
      card.plan = {
        title: 'Test Plan',
        description: 'A test description',
        tasks: [
          { id: '1', label: 'Read content', status: 'done' },
          { id: '2', label: 'Write draft', status: 'done' },
        ],
      };
    });

    const card = page.locator('nx-campaign-plan-card');
    const runBtn = shadow(card, '.plan-btn-run');
    await expect(runBtn).toHaveText('Done');
    await expect(runBtn).toBeDisabled();
  });
});
