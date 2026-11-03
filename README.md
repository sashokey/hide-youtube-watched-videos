Violentmonkey userscript that hides videos with any positive watch progress on YouTube Home and channel pages, including partially watched videos. Videos inside playlists are excluded.

Install [Violentmonkey](https://violentmonkey.github.io/get-it/), open the [userscript](https://raw.githubusercontent.com/sashokey/hide-youtube-watched-videos/master/hide-youtube-watched-videos.user.js), and confirm installation. Reload YouTube. The script uses Violentmonkey's page injection mode to identify the native account-menu keyboard row.

Watched videos are hidden by default. Use the eye-icon toggle in YouTube's account menu on desktop or Settings on mobile to show them again. The preference is saved and synchronized across tabs.

Only boolean preferences are accepted. Unsupported stored data keeps the default filtering behavior without being overwritten; malformed remote changes are ignored. A desktop menu without exactly one native keyboard row receives no toggle.

Zero or missing progress remains visible. Filtering is active on Home and channel pages and stops on search, watch history, and other routes. On desktop, hovered or focused cards remain visible until the interaction ends.

The authoritative source is `hide-youtube-watched-videos.src.ts`. All authored executable files, including tests and build helpers, use strict TypeScript. Node.js 24 and the locked development dependencies build an ES2022 classic script with esbuild and Terser; the generated `.user.js` retains the source metadata and version.

```sh
npm ci --ignore-scripts
npx playwright-core install chromium
npm run build
npm run check
```

`npm run check` runs type-aware linting, strict type checking, JavaScript syntax and metadata-preserving build checks, and the complete browser fixture suite against the readable compiled artifact and the minified distribution. GitHub Actions runs the same checks on pushes and pull requests.

The 36 local browser tests cover partial and complete progress, missing and zero progress, playlists, new cards, the desktop toggle and mobile Settings switch, keyboard activation, persisted and remote preferences, missing or ambiguous menu anchors, repeated document-start execution, SPA navigation, target replacement, and idle observer cleanup. The fixtures use the inspected YouTube DOM and a local GM boundary double.

All authored TypeScript, including tests and helpers, uses `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, and type-aware unsafe-operation lint rules. `allowJs` is disabled. `skipLibCheck` applies only to overlapping third-party browser declarations; authored files remain checked. Dependencies and tool versions are pinned in `package-lock.json`.
