// ==UserScript==
// @name         Hide YouTube Watched Videos
// @namespace    local.hide-youtube-watched-videos
// @version      1.1.17
// @description  Violentmonkey: hides videos with any positive watch progress on YouTube Home and channel pages.
// @match        https://www.youtube.com/*
// @match        https://m.youtube.com/*
// @exclude      https://www.youtube.com/embed/*
// @exclude      https://m.youtube.com/embed/*
// @noframes
// @run-at       document-start
// @inject-into  page
// @grant        GM_addStyle
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_addValueChangeListener
// @updateURL    https://raw.githubusercontent.com/sashokey/hide-youtube-watched-videos/master/hide-youtube-watched-videos.user.js
// @downloadURL  https://raw.githubusercontent.com/sashokey/hide-youtube-watched-videos/master/hide-youtube-watched-videos.user.js
// ==/UserScript==

(() => {
  "use strict";

  if ("__hywvInitialized" in document && document.__hywvInitialized) return;
  Object.defineProperty(document, "__hywvInitialized", { value: true });

  const mobile = location.hostname === "m.youtube.com";
  const browse = mobile ? "ytm-browse" : "ytd-browse";
  const cards = mobile ? "ytm-rich-item-renderer,ytm-compact-video-renderer,ytm-video-card-renderer,yt-lockup-view-model" : "ytd-rich-item-renderer,ytd-grid-video-renderer,ytd-video-renderer,ytd-compact-video-renderer,ytd-reel-item-renderer,yt-lockup-view-model";
  const resumeOverlay = mobile ? "ytw-thumbnail-overlay-resume-playback-renderer" : "ytd-thumbnail-overlay-resume-playback-renderer";
  const resumeProgress = mobile ? ".ytwThumbnailOverlayResumePlaybackRendererThumbnailOverlayResumePlaybackProgress" : "#progress";
  const progressBar = ".ytThumbnailOverlayProgressBarHostWatchedProgressBarSegment";
  const watchedMarker = `${resumeOverlay},${progressBar}`;
  const progressHosts = `${resumeOverlay},yt-thumbnail-overlay-progress-bar-view-model`;
  const progressOptions = { attributes: true, subtree: true, attributeFilter: ["style", "class"] };
  const silentOptions = { attributes: true, attributeFilter: [] };
  const childrenOptions = { childList: true, subtree: true };
  const menus = "ytd-popup-container ytd-multi-page-menu-renderer";
  const active = "data-hywv-active";
  const zero = "data-hywv-zero";
  const frozen = "data-hywv-frozen";
  const hiddenCards = `:is(${cards}):not(${mobile ? "" : ":hover,"}:focus-within,:active):not(ytd-playlist-video-list-renderer *,ytd-playlist-panel-renderer *):has(:is(${watchedMarker}):not([${zero}]))`;
  const controlClass = "hide-youtube-watched-toggle";
  const stateKey = "showWatched";
  const saved = GM_getValue<unknown>(stateKey, false);
  let showWatched = typeof saved === "boolean" ? saved : false;
  let page: Element | null = null;
  let openMenu: Element | null = null;
  let frozenCards: Element[] | null = null;
  const filterStyle = GM_addStyle(`${browse}[${active}]:not([hidden]) ${hiddenCards}{display:none!important}`);
  filterStyle.disabled = true;

  GM_addStyle(`
    [${frozen}]{display:none!important}
    .${controlClass}{display:flex;align-items:center;height:40px;padding:0 16px;box-sizing:border-box;cursor:pointer;color:var(--yt-spec-text-primary,#f1f1f1);font:400 14px/20px Roboto,Arial,sans-serif}
    .${controlClass}:hover,.${controlClass}:focus-visible{background:var(--yt-spec-badge-chip-background,rgba(255,255,255,.1));outline:0}
    .${controlClass} .hywv-icon{display:block;width:24px;height:24px;margin-right:16px;flex:none;fill:currentColor}
    .${controlClass} .hywv-label{min-width:0;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .${controlClass} .hywv-switch{position:relative;width:36px;height:20px;margin-left:12px;flex:none}
    .${controlClass} .hywv-switch:before{content:"";position:absolute;top:3px;left:4px;width:28px;height:14px;border-radius:7px;background:#717171;opacity:.5;transition:background-color .15s}
    .${controlClass} .hywv-switch:after{content:"";position:absolute;top:0;left:0;width:20px;height:20px;border-radius:50%;background:var(--yt-spec-text-primary,#f1f1f1);box-shadow:0 1px 3px rgba(0,0,0,.4);transition:transform .15s,background-color .15s}
    .${controlClass}[data-checked] .hywv-switch:before,.${controlClass}[data-checked] .hywv-switch:after{background:var(--yt-spec-call-to-action,#3ea6ff)}
    .${controlClass}[data-checked] .hywv-switch:after{transform:translateX(16px)}
    ytm-settings .${controlClass}{height:48px}
  `);

  const updateProgress = (host: Element) => {
    for (const marker of host.matches(resumeOverlay) ? [host] : host.querySelectorAll(progressBar)) {
      const bar = marker.matches(resumeOverlay) ? marker.querySelector(resumeProgress) : marker;
      marker.toggleAttribute(zero, !(bar instanceof HTMLElement && parseFloat(bar.style.width) > 0));
    }
  };

  const syncControls = () => {
    document.querySelectorAll(`.${controlClass}`).forEach((control) => {
      control.toggleAttribute("data-checked", showWatched);
      control.setAttribute("aria-checked", String(showWatched));
    });
  };

  const setShowWatched = (value: boolean, persist = true) => {
    try {
      if (persist) GM_setValue(stateKey, value);
    } catch (error) {
      console.warn("Hide YouTube Watched Videos: could not save setting", error);
      return;
    }
    showWatched = value;
    syncPage();
    syncControls();
  };

  const mountControl = (menu: Element) => {
    if (!menu.isConnected || menu.querySelector(`.${controlClass}`)) return;
    let anchor: Element | undefined;
    if (!mobile) {
      const shortcuts = [...menu.querySelectorAll("ytd-compact-link-renderer")].filter((row) => {
        const data: unknown = "data" in row ? row.data : null;
        if (typeof data !== "object" || data === null || !("icon" in data)) return false;
        const icon = data.icon;
        return typeof icon === "object" && icon !== null && "iconType" in icon && icon.iconType === "KEYBOARD";
      });
      anchor = shortcuts.length === 1 ? shortcuts[0] : undefined;
      if (!anchor) return;
    }

    const row = document.createElement("div");
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    const label = document.createElement("span");
    const toggle = document.createElement("span");
    row.className = controlClass;
    row.setAttribute("role", mobile ? "switch" : "menuitemcheckbox");
    row.setAttribute("tabindex", "0");
    row.setAttribute("aria-label", "Показывать просмотренные видео");
    svg.setAttribute("class", "hywv-icon");
    svg.setAttribute("aria-hidden", "true");
    svg.setAttribute("viewBox", "0 0 24 24");
    path.setAttribute("d", "M12 4.5C6.5 4.5 2 8 2 12s4.5 7.5 10 7.5S22 16 22 12 17.5 4.5 12 4.5Zm0 12a4.5 4.5 0 1 1 0-9 4.5 4.5 0 0 1 0 9Zm0-2a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z");
    label.className = "hywv-label";
    label.textContent = "Просмотренные видео";
    toggle.className = "hywv-switch";
    toggle.setAttribute("aria-hidden", "true");
    svg.append(path);
    row.append(svg, label, toggle);
    if (mobile) menu.append(row);
    else anchor?.after(row);
    syncControls();
  };

  const watchMenu = (menu: Element) => {
    if (openMenu && openMenu !== menu) observer.observe(openMenu, silentOptions);
    openMenu = menu;
    observer.observe(menu, childrenOptions);
    mountControl(menu);
  };

  const scan = (root: Node) => {
    if (!(root instanceof Element) || !page) return;
    for (const host of [root, ...root.querySelectorAll(progressHosts)]) {
      if (host.matches(progressHosts)) {
        const connected = page.contains(host);
        observer.observe(host, connected ? progressOptions : silentOptions);
        if (connected) updateProgress(host);
      }
    }
  };

  const stopFiltering = () => {
    observer.disconnect();
    if (openMenu) observer.observe(openMenu, childrenOptions);
    filterStyle.disabled = true;
    page?.removeAttribute(active);
    page = null;
  };

  const syncPage = () => {
    if (frozenCards) return;
    if (mobile) {
      const menu = location.pathname === "/select_site" ? document.querySelector("ytm-settings") : null;
      if (menu !== openMenu) {
        if (openMenu) observer.observe(openMenu, silentOptions);
        openMenu = null;
        if (menu) watchMenu(menu);
      }
    }
    const subtype = location.pathname === "/" ? "home" : /^\/(?:@[^/]+|(?:channel|c|user)\/[^/]+)(?:\/|$)/.test(location.pathname) ? "channels" : "";
    const nextPage = !showWatched && subtype ? document.querySelector(mobile ? browse : `${browse}[page-subtype="${subtype}"]:not([hidden])`) : null;
    if (nextPage === page) return;
    stopFiltering();
    page = nextPage;
    if (!page) return;
    observer.observe(page, childrenOptions);
    scan(page);
    page.setAttribute(active, "");
    filterStyle.disabled = false;
  };

  const schedulePage = () => queueMicrotask(syncPage);

  const toggleFromEvent = (event: Event) => {
    const row = event.target instanceof Element && event.target.closest(`.${controlClass}`);
    if (!row) return;
    if (event.type === "keydown" && (!(event instanceof KeyboardEvent) || event.repeat || !["Enter", " "].includes(event.key))) return;
    event.preventDefault();
    event.stopPropagation();
    setShowWatched(!showWatched);
  };

  document.addEventListener("click", toggleFromEvent, true);
  document.addEventListener("keydown", toggleFromEvent, true);
  GM_addValueChangeListener<unknown>(stateKey, (_key, _oldValue, value, remote) => {
    if (remote && typeof value === "boolean" && value !== showWatched) setShowWatched(value, false);
  });

  const observer = new MutationObserver((records) => {
    const changed = new Set<Element>();
    let menuChanged = false;
    for (const record of records) {
      const target = record.target;
      if (openMenu?.contains(target)) {
        menuChanged = true;
        continue;
      }
      if (!page?.contains(target)) continue;
      const host = target instanceof Element && target.closest(progressHosts);
      if (host && page.contains(host)) changed.add(host);
      if (record.type === "childList") {
        for (const node of record.removedNodes) scan(node);
        for (const node of record.addedNodes) scan(node);
      }
    }
    changed.forEach(updateProgress);
    if (menuChanged && openMenu) mountControl(openMenu);
  });
  const navigationTarget = mobile ? window : document;
  navigationTarget.addEventListener(mobile ? "state-navigatestart" : "yt-navigate-start", () => {
    if (frozenCards) return;
    frozenCards = page ? [...page.querySelectorAll(hiddenCards)] : [];
    for (const card of frozenCards) card.setAttribute(frozen, "");
    stopFiltering();
  }, true);
  navigationTarget.addEventListener(mobile ? "state-navigateend" : "yt-navigate-finish", () => {
    for (const card of frozenCards || []) card.removeAttribute(frozen);
    frozenCards = null;
    schedulePage();
  }, true);
  if (mobile) window.addEventListener("updateui", schedulePage);
  else {
    document.addEventListener("yt-page-type-changed", schedulePage, true);
    document.addEventListener("iron-overlay-opened", (event) => {
      const menu = event.target instanceof Element && event.target.querySelector(menus);
      if (menu) watchMenu(menu);
    }, true);
    document.addEventListener("iron-overlay-closed", (event) => {
      if (openMenu && event.target instanceof Node && event.target.contains(openMenu)) {
        observer.observe(openMenu, silentOptions);
        openMenu = null;
      }
    }, true);
  }
  const init = () => {
    schedulePage();
    const menu = !mobile && document.querySelector('ytd-popup-container tp-yt-iron-dropdown:not([aria-hidden="true"]) ytd-multi-page-menu-renderer');
    if (menu) watchMenu(menu);
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true });
  else init();
})();


