import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import type { Browser } from 'playwright-core';
import { launchBrowser, setupPage, settle, expectVisible, finish } from './browser.ts';
import { card, fixture } from './fixtures.ts';

let browser: Browser | undefined;
before(async () => { browser = await launchBrowser(); });
after(async () => { await browser?.close(); });

for (const filename of ['.build/hide-youtube-watched-videos.js', 'hide-youtube-watched-videos.user.js']) {
  void test(`${filename}: malformed persisted preferences hide watched cards without overwriting their data`, async () => {
    assert.ok(browser);
    for (const value of ['false', 1, {}, [], null]) {
      const state = await setupPage(browser, 'https://www.youtube.com/', fixture(card('watched', '60%')), filename, { showWatched: value });
      try {
        await settle(state.page);
        await expectVisible(state.page, '#watched', false);
        assert.equal(await state.page.getByRole('menuitemcheckbox').getAttribute('aria-checked'), 'false');
        assert.deepEqual(await state.page.evaluate(() => window.testStorage.showWatched), value);
        assert.deepEqual(await state.page.evaluate(() => window.testChanges), []);
      } finally { await finish(state.context, state.errors); }
    }
  });

  void test(`${filename}: malformed remote preferences cannot change visibility or write back`, async () => {
    assert.ok(browser);
    for (const initial of [false, true]) {
      const state = await setupPage(browser, 'https://www.youtube.com/', fixture(card('watched', '60%')), filename, { showWatched: initial });
      try {
        for (const value of ['false', 1, {}, [], null, undefined]) {
          await state.page.evaluate(value => window.testRemoteValue('showWatched', value), value);
          await settle(state.page);
          await expectVisible(state.page, '#watched', initial);
          assert.equal(await state.page.getByRole('menuitemcheckbox').getAttribute('aria-checked'), String(initial));
        }
        assert.deepEqual(await state.page.evaluate(() => window.testChanges), []);
      } finally { await finish(state.context, state.errors); }
    }
  });

  void test(`${filename}: a menu without a native keyboard icon does not receive a misplaced toggle`, async () => {
    assert.ok(browser);
    const state = await setupPage(browser, 'https://www.youtube.com/', fixture(card('watched', '60%'), false, 'home', false), filename);
    try {
      await settle(state.page);
      await expectVisible(state.page, '#watched', false);
      assert.equal(await state.page.getByRole('menuitemcheckbox').count(), 0);
    } finally { await finish(state.context, state.errors); }
  });

  void test(`${filename}: ambiguous native keyboard rows do not receive a toggle`, async () => {
    assert.ok(browser);
    const html = fixture(card('watched', '60%')).replace('</div></yt-multi-page-menu-section-renderer>', '<ytd-compact-link-renderer data-native-icon="KEYBOARD">Another keyboard row</ytd-compact-link-renderer></div></yt-multi-page-menu-section-renderer>');
    const state = await setupPage(browser, 'https://www.youtube.com/', html, filename);
    try {
      await settle(state.page);
      assert.equal(await state.page.getByRole('menuitemcheckbox').count(), 0);
    } finally { await finish(state.context, state.errors); }
  });
}
