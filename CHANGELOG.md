# Changelog

## 1.1.0

- Added support for multiple configured Pagecord blogs.
- Added per-blog publish commands, including draft commands.
- Added `pagecord_blog_fingerprint` frontmatter to keep notes linked to the correct configured blog without storing the API key.
- Preserved compatibility with existing notes that already have `pagecord_token`.
- Updated settings to use a grouped connection list with add/edit modals.
- Raised the minimum Obsidian version to 1.11.0 to use native grouped settings UI.
