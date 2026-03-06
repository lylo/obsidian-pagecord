# Pagecord

Publish notes from [Obsidian](https://obsidian.md) to your [Pagecord](https://pagecord.com) blog.

Write in Obsidian, hit a command, done. Supports images, frontmatter, and drafts.

## Features

- Publish notes as blog posts or drafts
- Update existing posts (tracks via frontmatter)
- Upload embedded images automatically
- Read title, slug, tags, and canonical URL from frontmatter

## Installation

In Obsidian, go to **Settings → Community Plugins → Browse** and search for **Pagecord**.

## Setup

1. Enable the API in your Pagecord blog settings
2. Copy your API key
3. In Obsidian, go to **Settings → Pagecord** and paste your API key

## Commands

Open the command palette (`Cmd/Ctrl + P`) and run:

- **Publish to Pagecord** — creates or updates the post as published
- **Publish as draft to Pagecord** — creates or updates the post as a draft

Commands are only available when a markdown file is active.

## Frontmatter

Use YAML frontmatter to set post metadata:

```yaml
---
title: My Post Title
slug: my-post-title
tags: [personal, update]
canonical_url: https://example.com/original
---
```

| Field | Usage |
|-------|-------|
| `title` | Post title (falls back to filename if omitted) |
| `slug` | URL slug for the post |
| `tags` | Array or comma-separated string |
| `canonical_url` | Canonical URL for the post |

After publishing, a `pagecord_token` field is added to frontmatter automatically. This links the note to the Pagecord post so future publishes update it instead of creating a duplicate.

## Images

Both Obsidian image syntaxes are supported:

- `![[photo.jpg]]` (wiki-style)
- `![alt text](photo.jpg)` (markdown-style)

Images are uploaded to Pagecord and embedded in the post automatically. Supported formats: JPEG, PNG, GIF, WebP.

## Building from Source

```
git clone https://github.com/pagecord/obsidian-pagecord.git
cd obsidian-pagecord
npm install
npm run build
```

Copy `main.js` and `manifest.json` to your vault's `.obsidian/plugins/obsidian-pagecord/` directory.

## License

[MIT](LICENSE)
