// ==UserScript==
// @name         Hide YouTube Watched Videos
// @namespace    local.hide-youtube-watched-videos
// @version      1.1.11
// @description  Hides videos with any positive watch progress on YouTube Home and channel pages.
// @match        https://www.youtube.com/*
// @exclude      https://www.youtube.com/embed/*
// @noframes
// @run-at       document-start
// @grant        GM_addStyle
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_addValueChangeListener
// @updateURL    https://raw.githubusercontent.com/sashokey/hide-youtube-watched-videos/master/hide-youtube-watched-videos.user.js
// @downloadURL  https://raw.githubusercontent.com/sashokey/hide-youtube-watched-videos/master/hide-youtube-watched-videos.user.js
// ==/UserScript==

(() => {
  "use strict";

  const cards = "ytd-rich-item-renderer,ytd-grid-video-renderer,ytd-video-renderer,ytd-compact-video-renderer,ytd-reel-item-renderer,yt-lockup-view-model";
  const resumeOverlay = "ytd-thumbnail-overlay-resume-playback-renderer";
  const progressBar = ".ytThumbnailOverlayProgressBarHostWatchedProgressBarSegment";
  const watchedMarker = `${resumeOverlay},${progressBar}`;
  const progressHosts = `${resumeOverlay},yt-thumbnail-overlay-progress-bar-view-model`;
  const progressOptions = { attributes: true, subtree: true, attributeFilter: ["style", "class"] };
  const silentOptions = { attributes: true, attributeFilter: [] };
  const childrenOptions = { childList: true, subtree: true };
  const menus = "ytd-popup-container ytd-multi-page-menu-renderer";
  const active = "data-hywv-active";
  const zero = "data-hywv-zero";
  const controlClass = "hide-youtube-watched-toggle";
  const stateKey = "showWatched";
  let showWatched = Boolean(GM_getValue(stateKey, false));
  let page = null;
  let openMenu = null;
  const filterStyle = GM_addStyle(`ytd-browse[${active}]:not([hidden]) :is(${cards}):not(ytd-playlist-video-list-renderer *,ytd-playlist-panel-renderer *):has(:is(${watchedMarker}):not([${zero}])){display:none!important}`);
  filterStyle.disabled = true;

  GM_addStyle(`
    .${controlClass}{display:flex;align-items:center;height:40px;padding:0 16px;box-sizing:border-box;cursor:pointer;color:var(--yt-spec-text-primary,#f1f1f1);font:400 14px/20px Roboto,Arial,sans-serif}
    .${controlClass}:hover,.${controlClass}:focus-visible{background:var(--yt-spec-badge-chip-background,rgba(255,255,255,.1));outline:0}
    .${controlClass} .hywv-icon{display:block;width:24px;height:24px;margin-right:16px;flex:none;fill:currentColor}
    .${controlClass} .hywv-label{min-width:0;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .${controlClass} .hywv-switch{position:relative;width:36px;height:20px;margin-left:12px;flex:none}
    .${controlClass} .hywv-switch:before{content:"";position:absolute;top:3px;left:4px;width:28px;height:14px;border-radius:7px;background:#717171;opacity:.5;transition:background-color .15s}
    .${controlClass} .hywv-switch:after{content:"";position:absolute;top:0;left:0;width:20px;height:20px;border-radius:50%;background:var(--yt-spec-text-primary,#f1f1f1);box-shadow:0 1px 3px rgba(0,0,0,.4);transition:transform .15s,background-color .15s}
    .${controlClass}[data-checked] .hywv-switch:before,.${controlClass}[data-checked] .hywv-switch:after{background:var(--yt-spec-call-to-action,#3ea6ff)}
    .${controlClass}[data-checked] .hywv-switch:after{transform:translateX(16px)}
  `);

  const updateProgress = (host) => {
    for (const marker of host.matches(resumeOverlay) ? [host] : host.querySelectorAll(progressBar)) {
      const bar = marker.matches(resumeOverlay) ? marker.querySelector("#progress") : marker;
      marker.toggleAttribute(zero, parseFloat(bar?.style.width) <= 0);
    }
  };

  const syncControls = () => {
    document.querySelectorAll(`.${controlClass}`).forEach((control) => {
      control.toggleAttribute("data-checked", showWatched);
      control.setAttribute("aria-checked", String(showWatched));
    });
  };

  const setShowWatched = (value, persist = true) => {
    value = Boolean(value);
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

  const mountControl = (menu) => {
    if (!menu.isConnected || menu.querySelector(`.${controlClass}`)) return;
    const shortcut = [...menu.querySelectorAll("ytd-compact-link-renderer")].find(
      (row) => row.data?.icon?.iconType === "KEYBOARD" || row.data?.compactLinkRenderer?.icon?.iconType === "KEYBOARD",
    );
    const settingsSection = menu.querySelector('ytd-compact-link-renderer a[href="/account"]')?.closest("yt-multi-page-menu-section-renderer");
    const anchor = shortcut || settingsSection?.previousElementSibling?.querySelector("#items > ytd-compact-link-renderer:last-of-type");
    if (!anchor) return;

    const row = document.createElement("div");
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    const label = document.createElement("span");
    const toggle = document.createElement("span");
    row.className = controlClass;
    row.setAttribute("role", "menuitemcheckbox");
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
    anchor.after(row);
    syncControls();
  };

  const watchMenu = (menu) => {
    if (openMenu && openMenu !== menu) observer.observe(openMenu, silentOptions);
    openMenu = menu;
    observer.observe(menu, childrenOptions);
    mountControl(menu);
  };

  const scan = (root) => {
    if (root.nodeType !== 1) return;
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
    const subtype = location.pathname === "/" ? "home" : /^\/(?:@[^/]+|(?:channel|c|user)\/[^/]+)(?:\/|$)/.test(location.pathname) ? "channels" : "";
    const nextPage = !showWatched && subtype ? document.querySelector(`ytd-browse[page-subtype="${subtype}"]:not([hidden])`) : null;
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

  const toggleFromEvent = (event) => {
    const row = event.target.nodeType === 1 && event.target.closest(`.${controlClass}`);
    if (!row) return;
    if (event.type === "keydown" && (event.repeat || !["Enter", " "].includes(event.key))) return;
    event.preventDefault();
    event.stopPropagation();
    setShowWatched(!showWatched);
  };

  document.addEventListener("click", toggleFromEvent, true);
  document.addEventListener("keydown", toggleFromEvent, true);
  GM_addValueChangeListener(stateKey, (_key, _oldValue, value, remote) => {
    if (remote && Boolean(value) !== showWatched) setShowWatched(value, false);
  });

  const observer = new MutationObserver((records) => {
    const changed = new Set();
    let menuChanged = false;
    for (const record of records) {
      const target = record.target;
      if (openMenu?.contains(target)) {
        menuChanged = true;
        continue;
      }
      if (!page?.contains(target)) continue;
      const host = target.nodeType === 1 && target.closest(progressHosts);
      if (host && page.contains(host)) changed.add(host);
      if (record.type === "childList") {
        for (const node of record.removedNodes) scan(node);
        for (const node of record.addedNodes) scan(node);
      }
    }
    changed.forEach(updateProgress);
    if (menuChanged) mountControl(openMenu);
  });
  document.addEventListener("yt-navigate-start", stopFiltering, true);
  document.addEventListener("yt-navigate-finish", schedulePage, true);
  document.addEventListener("yt-page-type-changed", schedulePage, true);
  document.addEventListener("iron-overlay-opened", (event) => {
    const menu = event.target.nodeType === 1 && event.target.querySelector(menus);
    if (menu) watchMenu(menu);
  }, true);
  document.addEventListener("iron-overlay-closed", (event) => {
    if (openMenu && event.target.contains(openMenu)) {
      observer.observe(openMenu, silentOptions);
      openMenu = null;
    }
  }, true);
  const init = () => {
    schedulePage();
    const menu = document.querySelector('ytd-popup-container tp-yt-iron-dropdown:not([aria-hidden="true"]) ytd-multi-page-menu-renderer');
    if (menu) watchMenu(menu);
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true });
  else init();
})();
