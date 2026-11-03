import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import type { Browser, Page } from 'playwright-core';
import { launchBrowser, setupPage, initializeNativeFixture, settle, expectVisible, finish } from './browser.ts';
import { card, lifecycleFixture, menu } from './fixtures.ts';

let browser: Browser;
before(async () => { browser = await launchBrowser(); });
after(async () => { await browser.close(); });

async function assertResources(page: Page, mobile: boolean, early: boolean): Promise<void> {
  const actual = await page.evaluate(() => {
    const resources = window.testResources;
    return { listeners: [...resources.listeners].sort(), observers: resources.observers, styles: resources.styles, valueListeners: resources.valueListeners };
  });
  const listeners = mobile
    ? ['document:click', 'document:keydown', 'window:state-navigatestart', 'window:state-navigateend', 'window:updateui']
    : ['document:click', 'document:keydown', 'document:yt-navigate-start', 'document:yt-navigate-finish', 'document:yt-page-type-changed', 'document:iron-overlay-opened', 'document:iron-overlay-closed'];
  if (early) listeners.push('document:DOMContentLoaded');
  assert.deepEqual(actual, { listeners: listeners.sort(), observers: 1, styles: 2, valueListeners: 1 }, 'repeated execution must retain one set of native resources');
  assert.equal(await page.locator('style').count(), 3, 'only the fixture stylesheet and two userscript styles are mounted');
}

async function navigate(page: Page, mobile: boolean, path: string): Promise<void> {
  await page.evaluate(({ mobile, path }) => {
    const target = mobile ? window : document;
    target.dispatchEvent(new Event(mobile ? 'state-navigatestart' : 'yt-navigate-start'));
    history.pushState({}, '', path);
    target.dispatchEvent(new Event(mobile ? 'state-navigateend' : 'yt-navigate-finish'));
  }, { mobile, path });
  await settle(page);
}

async function assertToggle(page: Page, mobile: boolean, watchedId: string): Promise<void> {
  if (mobile) await navigate(page, true, '/select_site');
  const toggle = page.getByRole(mobile ? 'switch' : 'menuitemcheckbox');
  assert.equal(await toggle.count(), 1, 'one working control survives repeated execution');
  await toggle.click();
  await page.mouse.move(1200, 700);
  await settle(page);
  assert.equal(await toggle.getAttribute('aria-checked'), 'true');
  assert.deepEqual(await page.evaluate(() => window.testChanges), [{ key: 'showWatched', value: true }], 'a click persists the preference once');
  if (mobile) await navigate(page, true, '/');
  await expectVisible(page, '#' + watchedId);
  await page.evaluate(() => window.testRemoteValue('showWatched', false));
  await settle(page);
  await expectVisible(page, '#' + watchedId, false);
  assert.equal(await toggle.getAttribute('aria-checked'), 'false');
  assert.equal(await page.evaluate(() => window.testChanges.length), 1, 'remote synchronization does not write back');
}

for (const filename of ['.build/hide-youtube-watched-videos.js', 'hide-youtube-watched-videos.user.js']) {
  for (const mobile of [false, true]) {
    const platform = mobile ? 'mobile' : 'desktop';
    const url = mobile ? 'https://m.youtube.com/' : 'https://www.youtube.com/';

    void test(`${filename}: ${platform} repeated document-start execution initializes once before the document element exists`, async () => {
      const state = await setupPage(browser, url, lifecycleFixture(mobile), filename, {}, true);
      const { page } = state;
      try {
        await settle(page);
        assert.deepEqual(await page.evaluate(() => window.testEarlyState), { readyState: 'loading', hasDocumentElement: false });
        await expectVisible(page, '#watched', false);
        await expectVisible(page, '#unwatched');
        await assertResources(page, mobile, true);
        await page.evaluate(() => { window.testExecute(); window.testExecute(); });
        await settle(page);
        await assertResources(page, mobile, true);
        await assertToggle(page, mobile, 'watched');
        await assertResources(page, mobile, true);
      } finally { await finish(state.context, state.errors); }
    });

    void test(`${filename}: ${platform} repeated execution after SPA navigation and target replacement keeps one working lifecycle`, async () => {
      const state = await setupPage(browser, url, lifecycleFixture(mobile), filename);
      const { page } = state;
      try {
        await settle(page);
        await assertResources(page, mobile, false);
        await expectVisible(page, '#watched', false);
        await navigate(page, mobile, '/results?search_query=fixture');
        await expectVisible(page, '#watched');
        await page.evaluate(() => { window.testExecute(); window.testExecute(); });
        await assertResources(page, mobile, false);
        await page.evaluate(({ mobile, html, menu }) => {
          const browse = document.querySelector(mobile ? 'ytm-browse' : 'ytd-browse');
          const container = document.querySelector(mobile ? 'ytm-settings' : 'ytd-popup-container');
          if (!browse || !container) throw new Error('Missing native fixture');
          browse.innerHTML = html;
          container.outerHTML = menu;
        }, { mobile, html: card('watched-replacement', '60%', false, mobile) + card('unwatched-replacement', null, false, mobile), menu: menu(mobile) });
        await initializeNativeFixture(page);
        await navigate(page, mobile, '/');
        if (!mobile) await page.evaluate(() => document.querySelector('ytd-popup-container')?.dispatchEvent(new Event('iron-overlay-opened', { bubbles: true })));
        await settle(page);
        await page.evaluate(() => { window.testExecute(); window.testExecute(); });
        await settle(page);
        await expectVisible(page, '#watched-replacement', false);
        await expectVisible(page, '#unwatched-replacement');
        await assertResources(page, mobile, false);
        await assertToggle(page, mobile, 'watched-replacement');
        await navigate(page, mobile, '/results?search_query=fixture');
        await expectVisible(page, '#watched-replacement');
        const callbacks = await page.evaluate(() => window.testResources.observerCallbacks);
        await page.locator('#watched-replacement').evaluate(node => {
          const progress = node.querySelector('[style]');
          if (!(progress instanceof HTMLElement)) throw new Error('Missing progress bar');
          progress.style.width = '80%';
        });
        await settle(page);
        assert.equal(await page.evaluate(() => window.testResources.observerCallbacks), callbacks, 'inactive cards do not keep background observers running');
        assert.equal(await page.locator('[data-hywv-frozen]').count(), 0);
        await assertResources(page, mobile, false);
      } finally { await finish(state.context, state.errors); }
    });
  }
}
