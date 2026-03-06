# Agents

## Project

Obsidian plugin for publishing notes to [Pagecord](https://pagecord.com). Zero runtime dependencies, three source files, TypeScript + esbuild.

## Structure

```
src/
  main.ts      — Plugin class, two commands, settings tab
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

- **Frontmatter** — read via `app.metadataCache.getFileCache(file)?.frontmatter`. After first publish, `pagecord_token` is written back via `app.fileManager.processFrontMatter()` to link the note to the remote post.
- **Images** — both `![[file.png]]` and `![alt](file.png)` syntaxes are parsed. Each image is uploaded to `/attachments`, then the reference is replaced with `<action-text-attachment sgid="...">` in the markdown content.
- **Error handling** — `requestUrl` is called with `throw: false`. Status codes are checked manually so we can read the response body. API errors are surfaced via Obsidian `Notice`. If any image upload fails, the entire publish is aborted.
- **Multipart uploads** — built manually (Obsidian's `requestUrl` doesn't support `FormData`). See `buildMultipartBody()` in `api.ts`.

## Style

- Minimal code, no abstractions beyond what exists
- No runtime dependencies
- Match existing patterns — don't restructure
