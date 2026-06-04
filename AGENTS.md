# Agents

## Project

Obsidian plugin for publishing notes to [Pagecord](https://pagecord.com). Zero runtime dependencies, three source files, TypeScript + esbuild.

## Structure

```
src/
  main.ts      — Plugin class, per-blog commands, settings tab/modal UI
  api.ts       — PagecordAPI client, error handling, multipart upload
  publish.ts   — Publish orchestration, frontmatter reading, image processing
```

## Build

```
npm install
npm run build    # outputs main.js via esbuild
```

To test locally, copy `main.js` and `manifest.json` into an Obsidian vault's `.obsidian/plugins/obsidian-pagecord/` directory.

## API

The plugin talks to `https://api.pagecord.com` (override via `baseUrl` in `data.json` for development). Two endpoints:

- `POST /posts` / `PATCH /posts/:token` — create/update posts (JSON, `content_format=markdown`)
- `POST /attachments` — upload images (multipart/form-data), returns `attachable_sgid`

Auth is `Authorization: Bearer <api_key>`. All requests go through a single `request<T>()` method in `api.ts`.

## Key Patterns

- **Settings** — supports multiple blog connections in `settings.blogs` (`name`, `apiKey`) and migrates legacy `settings.apiKey` to one connection named `Pagecord`. Settings UI uses Obsidian `SettingGroup` plus add/edit modals. Saved connections generate command palette entries: `Publish to <blog>` and `Publish to <blog> (draft)`.
- **Frontmatter** — read via `app.metadataCache.getFileCache(file)?.frontmatter`. Supports: `title` (set to `false` for no title), `slug`, `tags`, `status`, `published_at`, `canonical_url`, `content_format`, `hidden`, `locale`. After first publish, `pagecord_token` is written back via `app.fileManager.processFrontMatter()` to link the note to the remote post, and `pagecord_blog_fingerprint` links it to the configured blog connection without storing the API key. Legacy notes with `pagecord_token` but no fingerprint should keep working and gain the fingerprint after a successful update.
- **Images** — both `![[file.png]]` and `![alt](file.png)` syntaxes are parsed. Each image is uploaded to `/attachments`, then the reference is replaced with `<action-text-attachment sgid="...">` in the markdown content.
- **Error handling** — `requestUrl` is called with `throw: false`. Status codes are checked manually so we can read the response body. API errors are surfaced via Obsidian `Notice`. If any image upload fails, the entire publish is aborted.
- **Multipart uploads** — built manually (Obsidian's `requestUrl` doesn't support `FormData`). See `buildMultipartBody()` in `api.ts`.

## Style

- Minimal code, no abstractions beyond what exists
- No runtime dependencies
- Match existing patterns — don't restructure
