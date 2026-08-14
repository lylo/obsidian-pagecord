# Changelog

## 1.3.0

- Settings now use Obsidian's declarative settings API, so blog connections are found by Obsidian's settings search.
- Edit a connection by clicking its row. Delete moved to the list's own delete control, which also responds to the Delete key.
- Requires Obsidian 1.13.0 or later. Earlier versions continue to be offered 1.2.2.
- Replaced the committed copy of Obsidian's type definitions with a minimal API stub covering only what the plugin uses. Development still type-checks against the real definitions; the stub stands in only where dependencies are not installed, such as Obsidian's plugin review scan, which now reports no findings against the plugin's code.

## 1.2.2

- No functional change. The Obsidian type definitions are now committed to the repository and mapped in `tsconfig.json`, so plugin review can resolve them without installing the plugin's dependencies. Without that, every value imported from Obsidian read as an untyped error and review reported 208 spurious warnings.
- Pinned the Obsidian dependency to an exact version, so the committed copy always matches what is installed.

## 1.2.1

- Fixed an unquoted `published_at` timestamp in frontmatter being sent in a format the API rejects. It is now sent as ISO 8601.
- Fixed an object-valued frontmatter field being sent as `[object Object]`.
- Switched the settings description to Obsidian's `createFragment` helper, and aligned the lint setup with Obsidian's recommended ruleset so plugin review findings reproduce locally.

## 1.2.0

- Added PDF support. Embedded PDFs are now uploaded to Pagecord and published as attachments with a page preview and a download link, instead of being left as unrendered Markdown.
- Added alt text and captions for embedded images, taken from the Markdown alt text and quoted title.
- Wiki-style embeds now ignore Obsidian display modifiers such as `![[report.pdf#page=2]]` and `![[photo.png|300]]`, uploading the file itself rather than skipping the embed.
- Fixed settings descriptions so they render in pop-out windows.
- Fixed a `$` in alt text or a caption corrupting the published attachment.
- Fixed frontmatter not being stripped from notes saved with Windows line endings, which published the whole frontmatter block as body text.
- Fixed a file embedded twice in the same note being uploaded twice.
- Uploads are now remembered against a file's vault path rather than its name, so two files that share a name no longer share an upload.
- The upload cache is cleared from frontmatter once a note has no embeds left.

## 1.1.3

- Fixed publishing notes that include remote Markdown images, leaving external image URLs unchanged instead of treating them as missing vault files.

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
