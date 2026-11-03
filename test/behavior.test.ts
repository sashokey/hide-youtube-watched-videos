import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import type { Browser } from 'playwright-core';
import { launchBrowser, setupPage, settle, expectVisible, finish } from './browser.ts';
import { card, fixture, mobileSettingsFixture } from './fixtures.ts';

let browser: Browser;
before(async () => { browser = await launchBrowser(); });
after(async () => { await browser.close(); });

for (const filename of ['.build/hide-youtube-watched-videos.js', 'hide-youtube-watched-videos.user.js']) {
  void test(`${filename}: hides partial progress while preserving unwatched videos and playlist entries`, async () => {
    const items = card('partial', '1%') + card('zero', '0%') + card('unwatched', null) + `<ytd-playlist-video-list-renderer>${card('playlist', '80%')}</ytd-playlist-video-list-renderer>`;
    const state = await setupPage(browser, 'https://www.youtube.com/', fixture(items), filename);
    try {
      await settle(state.page);
      await expectVisible(state.page, '#partial', false);
      for (const id of ['zero', 'unwatched', 'playlist']) await expectVisible(state.page, '#' + id);
    } finally { await finish(state.context, state.errors); }
  });

  void test(`${filename}: a progress host without a positive width does not hide the video`, async () => {
    const state = await setupPage(browser, 'https://www.youtube.com/', fixture(card('pending', undefined) + card('modern-pending', undefined, true)), filename);
    try {
      await settle(state.page);
      await expectVisible(state.page, '#pending');
      await expectVisible(state.page, '#modern-pending');
    } finally { await finish(state.context, state.errors); }
  });

  void test(`${filename}: modern progress updates hide and restore the same rendered card`, async () => {
    const state = await setupPage(browser, 'https://www.youtube.com/', fixture(card('progress', '0%', true)), filename);
    const { page } = state;
    try {
      await settle(page);
      await expectVisible(page, '#progress');
      await page.locator('#progress .ytThumbnailOverlayProgressBarHostWatchedProgressBarSegment').evaluate(node => {
        if (!(node instanceof HTMLElement)) throw new Error('Missing progress bar');
        node.style.width = '25%';
      });
      await settle(page);
      await expectVisible(page, '#progress', false);
      await page.locator('#progress .ytThumbnailOverlayProgressBarHostWatchedProgressBarSegment').evaluate(node => {
        if (!(node instanceof HTMLElement)) throw new Error('Missing progress bar');
        node.style.width = '0%';
      });
      await settle(page);
      await expectVisible(page, '#progress');
    } finally { await finish(state.context, state.errors); }
  });

  void test(`${filename}: filters new cards loaded after initialization`, async () => {
    const state = await setupPage(browser, 'https://www.youtube.com/', fixture(card('unwatched', null)), filename);
    const { page } = state;
    try {
      await settle(page);
      await page.locator('ytd-browse').evaluate((node, html) => node.insertAdjacentHTML('beforeend', html), card('new-card', '20%', true));
      await settle(page);
      await expectVisible(page, '#new-card', false);
      await expectVisible(page, '#unwatched');
    } finally { await finish(state.context, state.errors); }
  });

  void test(`${filename}: account toggle restores cards, saves the choice and is not duplicated`, async () => {
    const state = await setupPage(browser, 'https://www.youtube.com/', fixture(card('watched', '60%')), filename);
    const { page } = state;
    try {
      await settle(page);
      const toggle = page.getByRole('menuitemcheckbox');
      assert.equal(await toggle.count(), 1);
      await toggle.click();
      await settle(page);
      await expectVisible(page, '#watched');
      assert.equal(await toggle.getAttribute('aria-checked'), 'true');
      assert.equal(await page.evaluate(() => window.testStorage.showWatched), true);
      await page.evaluate(() => {
        for (let i = 0; i < 5; i++) document.querySelector('ytd-popup-container')?.dispatchEvent(new Event('iron-overlay-opened', { bubbles: true }));
      });
      await settle(page);
      assert.equal(await toggle.count(), 1);
      await toggle.focus();
      await page.keyboard.press('Enter');
      await page.mouse.move(1200, 700);
      await settle(page);
      await expectVisible(page, '#watched', false);
      assert.equal(await toggle.getAttribute('aria-checked'), 'false');
    } finally { await finish(state.context, state.errors); }
  });

  void test(`${filename}: a saved preference and remote tab changes control actual card visibility`, async () => {
    const state = await setupPage(browser, 'https://www.youtube.com/', fixture(card('watched', '60%')), filename, { showWatched: true });
    const { page } = state;
    try {
      await settle(page);
      await expectVisible(page, '#watched');
      await page.evaluate(() => window.testRemoteValue('showWatched', false));
      await settle(page);
      await expectVisible(page, '#watched', false);
      assert.equal(await page.getByRole('menuitemcheckbox').getAttribute('aria-checked'), 'false');
      assert.equal(await page.evaluate(() => window.testChanges.length), 0, 'remote synchronization must not write the preference back');
    } finally { await finish(state.context, state.errors); }
  });

  void test(`${filename}: SPA navigation freezes hidden cards then stops filtering unrelated pages`, async () => {
    const state = await setupPage(browser, 'https://www.youtube.com/', fixture(card('watched', '60%')), filename);
    const { page } = state;
    try {
      await settle(page);
      await page.evaluate(() => document.dispatchEvent(new Event('yt-navigate-start')));
      await expectVisible(page, '#watched', false);
      await page.evaluate(() => {
        history.pushState(null, '', '/results?search_query=fixture');
        document.dispatchEvent(new Event('yt-navigate-finish'));
      });
      await settle(page);
      await expectVisible(page, '#watched');
    } finally { await finish(state.context, state.errors); }
  });

  void test(`${filename}: current channel lockups hide partial and complete progress and restore them through the menu`, async () => {
    const state = await setupPage(browser, 'https://www.youtube.com/@fixture/videos', fixture(card('partial', '10%', true) + card('complete', '100%', true) + card('zero', '0%', true) + card('unwatched', null), false, 'channels'), filename);
    try {
      await settle(state.page);
      await expectVisible(state.page, '#partial', false);
      await expectVisible(state.page, '#complete', false);
      await expectVisible(state.page, '#zero');
      await expectVisible(state.page, '#unwatched');
      await state.page.getByRole('menuitemcheckbox').click();
      await settle(state.page);
      for (const id of ['partial', 'complete', 'zero', 'unwatched']) await expectVisible(state.page, '#' + id);
      assert.equal(await state.page.evaluate(() => window.testStorage.showWatched), true);
    } finally { await finish(state.context, state.errors); }
  });

  void test(`${filename}: mobile compact cards follow the native settings switch across navigation`, async () => {
    const state = await setupPage(browser, 'https://m.youtube.com/@fixture/videos', mobileSettingsFixture(), filename);
    const { page } = state;
    try {
      await settle(page);
      await expectVisible(page, '#partial', false);
      await expectVisible(page, '#complete', false);
      await expectVisible(page, '#unwatched');
      await page.getByRole('button', { name: 'Settings', exact: true }).click();
      await settle(page);
      const toggle = page.getByRole('switch', { name: 'Показывать просмотренные видео', exact: true });
      assert.equal(await toggle.count(), 1);
      assert.equal(await toggle.getAttribute('aria-checked'), 'false');
      await toggle.click();
      await page.getByRole('button', { name: 'Back to channel', exact: true }).click();
      await settle(page);
      await expectVisible(page, '#partial');
      await expectVisible(page, '#complete');
      assert.equal(await page.evaluate(() => window.testStorage.showWatched), true);
      await page.getByRole('button', { name: 'Settings', exact: true }).click();
      await settle(page);
      assert.equal(await toggle.count(), 1);
      assert.equal(await toggle.getAttribute('aria-checked'), 'true');
      await toggle.click();
      await page.getByRole('button', { name: 'Back to channel', exact: true }).click();
      await settle(page);
      await expectVisible(page, '#partial', false);
      await expectVisible(page, '#complete', false);
      await expectVisible(page, '#unwatched');
      assert.equal(await page.evaluate(() => window.testStorage.showWatched), false);
      assert.equal(await page.locator('[data-hywv-frozen]').count(), 0);
    } finally { await finish(state.context, state.errors); }
  });

  void test(`${filename}: mobile channel pages filter positive progress`, async () => {
    const state = await setupPage(browser, 'https://m.youtube.com/@fixture/videos', fixture(card('watched', '50%', false, true) + card('zero', '0%', false, true), true, 'channels'), filename);
    try {
      await settle(state.page);
      await expectVisible(state.page, '#watched', false);
      await expectVisible(state.page, '#zero');
    } finally { await finish(state.context, state.errors); }
  });
}
