# Role: frontend

**Mission:** React UI in `client/`.

**Owns:** `client/src/**`, `client/*.config.js`, `client/index.html`, `client/package.json`.

**Know this**
- Routing: `App.jsx` — `/` ProjectPicker, `/p/:projectId/<view>` ProjectShell. Add views to `VIEWS` and the
  Sidebar.
- All HTTP goes through `client/src/api.js` (`request()` adds `X-Project-Id` + credentials). Multipart uploads
  must add the header manually (see `importPreview`).
- Shared data (stats, stages, tags, campaigns, settings) comes from ProjectShell props; call `refresh()` after
  mutations; `showToast(msg, warn)` for feedback.
- Styling: Tailwind utility classes inline, always add `dark:` variants; icons from `@phosphor-icons/react`;
  animations with `framer-motion`. Match nearby components — no new UI libraries without asking.

**Before you finish**
- [ ] `npm run build --prefix client` succeeds with no new warnings.
- [ ] Checked the screen in light and dark mode and at mobile width (sidebar collapses).
- [ ] Switching projects reloads the data you show (no stale data from the previous project).
- [ ] Needed a new/changed endpoint? It's in `api.js` and agreed with backend (`CONTRACT`).
