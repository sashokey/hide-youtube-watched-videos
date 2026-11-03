import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright-core';
import type { Browser, BrowserContext, Page } from 'playwright-core';

export interface Resources {
  listeners: string[];
  observers: number;
  styles: number;
  valueListeners: number;
  observerCallbacks: number;
}

declare global {
  interface Window {
    testStorage: Record<string, unknown>;
    testChanges: { key: string; value: unknown }[];
    testRemoteValue: (key: string, value: unknown) => void;
    testResources: Resources;
    testExecute: () => void;
    testEarlyState: { readyState: DocumentReadyState; hasDocumentElement: boolean };
  }
}

export interface State {
  page: Page;
  context: BrowserContext;
  errors: string[];
}

export async function launchBrowser(): Promise<Browser> {
  return chromium.launch({ headless: true, args: ['--mute-audio'] });
}

export async function initializeNativeFixture(page: Page): Promise<void> {
  await page.evaluate(() => {
    for (const row of document.querySelectorAll('ytd-compact-link-renderer[data-native-icon]')) {
      Object.defineProperty(row, 'data', {
        configurable: true,
        value: { icon: { iconType: row.getAttribute('data-native-icon') }, title: { runs: [{ text: row.textContent }] }, trackingParams: 'fixture', serviceEndpoint: { clickTrackingParams: 'fixture', signalServiceEndpoint: { signal: 'CLIENT_SIGNAL' } } }
      });
    }
    const settings = document.querySelector('ytm-settings');
    const browse = document.querySelector('ytm-browse');
    const navigate = (path: string): void => {
      window.dispatchEvent(new Event('state-navigatestart'));
      history.pushState({}, '', path);
      if (settings instanceof HTMLElement) settings.hidden = path !== '/select_site';
      if (browse instanceof HTMLElement) browse.hidden = path === '/select_site';
      window.dispatchEvent(new Event('state-navigateend'));
    };
    document.querySelector('#settings')?.addEventListener('click', () => navigate('/select_site'));
    document.querySelector('#channel')?.addEventListener('click', () => navigate('/@fixture/videos'));
  });
}

export async function setupPage(browser: Browser, url: string, html: string, filename: string, saved: Record<string, unknown> = {}, early = false): Promise<State> {
  const source = await readFile(new URL('../' + filename, import.meta.url), 'utf8');
  const context = await browser.newContext({ timezoneId: 'UTC', viewport: { width: 1280, height: 720 } });
  const page = await context.newPage();
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/*', route => route.fulfill({ contentType: 'text/html; charset=utf-8', body: html }));
  await page.addInitScript(({ saved, source, early }) => {
    const resources: Resources = { listeners: [], observers: 0, styles: 0, valueListeners: 0, observerCallbacks: 0 };
    window.testResources = resources;
    let recording = false;
    const addEventListener = document.addEventListener.bind(document);
    const addWindowEventListener = window.addEventListener.bind(window);
    document.addEventListener = function (type: string, listener: EventListenerOrEventListenerObject, options?: boolean | AddEventListenerOptions): void {
      if (recording) resources.listeners.push('document:' + type);
      addEventListener(type, listener, options);
    };
    window.addEventListener = function (type: string, listener: EventListenerOrEventListenerObject, options?: boolean | AddEventListenerOptions): void {
      if (recording) resources.listeners.push('window:' + type);
      addWindowEventListener(type, listener, options);
    };
    const NativeObserver = MutationObserver;
    window.MutationObserver = class extends NativeObserver {
      constructor(callback: MutationCallback) {
        const tracked = recording;
        super((records, observer) => {
          if (tracked) resources.observerCallbacks++;
          callback(records, observer);
        });
        if (tracked) resources.observers++;
      }
    };
    window.testStorage = { ...saved };
    window.testChanges = [];
    Object.defineProperty(window, 'GM_getValue', { value: (key: string, fallback?: unknown): unknown => Object.hasOwn(window.testStorage, key) ? window.testStorage[key] : fallback });
    Object.defineProperty(window, 'GM_setValue', { value: (key: string, value: unknown): void => {
      window.testStorage[key] = structuredClone(value);
      window.testChanges.push({ key, value: structuredClone(value) });
    } });
    const listeners: { key: string; callback: VMScriptGMValueChangeCallback<unknown> }[] = [];
    Object.defineProperty(window, 'GM_addValueChangeListener', { value: (key: string, callback: VMScriptGMValueChangeCallback<unknown>): string => {
      resources.valueListeners++;
      listeners.push({ key, callback });
      return String(listeners.length);
    } });
    window.testRemoteValue = (key, value) => {
      const old = window.testStorage[key];
      window.testStorage[key] = value;
      for (const listener of listeners) if (listener.key === key) listener.callback(key, old, value, true);
    };
    const styles: HTMLStyleElement[] = [];
    Object.defineProperty(window, 'GM_addStyle', { value: (css: string): HTMLStyleElement => {
      resources.styles++;
      const style = document.createElement('style');
      style.textContent = css;
      styles.push(style);
      if (document.documentElement) (document.head || document.documentElement).append(style);
      return style;
    } });
    document.addEventListener('DOMContentLoaded', () => {
      for (const style of styles) if (!style.isConnected) document.head.append(style);
    }, { once: true });
    window.testExecute = () => {
      recording = true;
      try { (0, eval)(source); }
      finally { recording = false; }
    };
    if (early) {
      window.testEarlyState = { readyState: document.readyState, hasDocumentElement: Boolean(document.documentElement) };
      document.addEventListener('DOMContentLoaded', () => {
        for (const row of document.querySelectorAll('ytd-compact-link-renderer[data-native-icon]')) {
          Object.defineProperty(row, 'data', { configurable: true, value: { icon: { iconType: row.getAttribute('data-native-icon') }, title: { runs: [{ text: row.textContent }] }, trackingParams: 'fixture', serviceEndpoint: { clickTrackingParams: 'fixture', signalServiceEndpoint: { signal: 'CLIENT_SIGNAL' } } } });
        }
      }, { once: true });
      window.testExecute();
      window.testExecute();
    }
  }, { saved, source, early });
  await page.clock.install({ time: new Date('2026-03-31T12:00:00Z') });
  await page.goto(url);
  await page.mouse.move(1200, 700);
  await initializeNativeFixture(page);
  if (!early) await page.evaluate(() => window.testExecute());
  return { page, context, errors };
}

export async function settle(page: Page, ms = 100): Promise<void> {
  await page.clock.runFor(ms);
}

export async function expectVisible(page: Page, selector: string, expected = true): Promise<void> {
  assert.equal(await page.locator(selector).isVisible(), expected, selector + ' visibility');
}

export async function finish(context: BrowserContext, errors: string[]): Promise<void> {
  await context.close();
  assert.deepEqual(errors, []);
}
