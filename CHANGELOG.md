# Changelog

## 1.1.2

- Normalized quoted frontmatter values before publishing, including `title: ""` as a no-title opt-out.

## 1.1.1

- Improved publish notices so they include the selected blog name and distinguish created, updated, published, draft, and unpublished states.
- Added a confirmation dialog before deleting a blog connection.
- Documented local development `baseUrl` configuration for testing against `api.localhost`.

## 1.1.0

- Added support for multiple configured Pagecord blogs.
- Added per-blog publish commands, including draft commands.
- Added `pagecord_blog_fingerprint` frontmatter to keep notes linked to the correct configured blog without storing the API key.
- Preserved compatibility with existing notes that already have `pagecord_token`.
- Updated settings to use a grouped connection list with add/edit modals.
- Raised the minimum Obsidian version to 1.11.0 to use native grouped settings UI.
