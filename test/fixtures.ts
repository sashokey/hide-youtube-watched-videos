export function card(id: string, width: string | null | undefined, modern = false, mobile = false): string {
  const tag = mobile ? 'ytm-rich-item-renderer' : 'ytd-rich-item-renderer';
  const style = width === undefined ? '' : `style="width:${width ?? ''}"`;
  const marker = modern
    ? `<yt-thumbnail-overlay-progress-bar-view-model class="ytThumbnailOverlayProgressBarHost"><div class="ytThumbnailOverlayProgressBarHostWatchedProgressBar"><div class="ytThumbnailOverlayProgressBarHostWatchedProgressBarSegment" ${style}></div></div></yt-thumbnail-overlay-progress-bar-view-model>`
    : `<${mobile ? 'ytw' : 'ytd'}-thumbnail-overlay-resume-playback-renderer><div ${mobile ? 'class="ytwThumbnailOverlayResumePlaybackRendererThumbnailOverlayResumePlaybackProgress"' : 'id="progress"'} ${style}></div></${mobile ? 'ytw' : 'ytd'}-thumbnail-overlay-resume-playback-renderer>`;
  return `<${tag} id="${id}"><div id="content"><yt-lockup-view-model><a class="ytLockupViewModelContentImage" href="/watch?v=${id}">${id}</a>${width === null ? '' : marker}</yt-lockup-view-model></div></${tag}>`;
}

export function menu(mobile: boolean, keyboard = true): string {
  return mobile
    ? '<ytm-settings></ytm-settings>'
    : `<ytd-popup-container><tp-yt-iron-dropdown aria-hidden="false"><ytd-multi-page-menu-renderer><yt-multi-page-menu-section-renderer><div id="items"><ytd-compact-link-renderer id="keyboard" ${keyboard ? 'data-native-icon="KEYBOARD"' : ''}>Keyboard shortcuts</ytd-compact-link-renderer></div></yt-multi-page-menu-section-renderer><yt-multi-page-menu-section-renderer><ytd-compact-link-renderer><a href="/account">Settings</a></ytd-compact-link-renderer></yt-multi-page-menu-section-renderer></ytd-multi-page-menu-renderer></tp-yt-iron-dropdown></ytd-popup-container>`;
}

export function fixture(items: string, mobile = false, subtype = 'home', keyboard = true): string {
  const browse = mobile ? 'ytm-browse' : 'ytd-browse';
  return `<!doctype html><html lang="en"><head><style>ytd-browse,ytm-browse,ytd-rich-item-renderer,ytm-rich-item-renderer,ytd-playlist-video-list-renderer,ytd-popup-container,ytd-multi-page-menu-renderer,ytd-compact-link-renderer,tp-yt-iron-dropdown,yt-lockup-view-model{display:block}ytd-rich-item-renderer,ytm-rich-item-renderer{height:50px;width:600px}ytd-popup-container{margin-top:20px}ytd-compact-link-renderer{height:30px}</style></head><body><${browse} page-subtype="${subtype}">${items}</${browse}>${menu(mobile, keyboard)}</body></html>`;
}

export function mobileSettingsFixture(): string {
  const items = (card('partial', '10%', false, true) + card('complete', '100%', false, true) + card('unwatched', null, false, true)).replaceAll('ytm-rich-item-renderer', 'ytm-compact-video-renderer');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><style>ytm-browse,ytm-settings,ytm-compact-video-renderer,yt-lockup-view-model{display:block}ytm-compact-video-renderer{height:50px;width:300px}[hidden]{display:none!important}</style></head><body><button id="settings">Settings</button><button id="channel">Back to channel</button><ytm-browse>${items}</ytm-browse><ytm-settings hidden></ytm-settings></body></html>`;
}

export function lifecycleFixture(mobile: boolean): string {
  return fixture(card('watched', '60%', false, mobile) + card('unwatched', null, false, mobile), mobile);
}
