# Changelog

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
