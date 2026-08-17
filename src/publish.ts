import { App, TFile, Notice } from "obsidian";
import { PagecordAPI, PagecordBlogSettings, ApiError, handleApiError } from "./api";

class UploadError extends Error {}

export const ATTACHMENT_EXTENSIONS = /\.(jpe?g|png|gif|webp|pdf)$/i;
export const WIKILINK_EMBED = /!\[\[([^\]]+?)\]\]/g;
// ![alt](photo.jpg "A caption") — the alt describes the image, the optional
// title captions it. A path containing parens is not matched; use a wikilink,
// which has no such limit.
export const MARKDOWN_EMBED = /!\[([^\]]*)\]\(([^)"]+?)(?:\s+"([^"]*)")?\)/g;
const REMOTE_URL = /^(?:https?:)?\/\//i;
// An embed inside a fenced code block or inline code span is prose about the
// syntax, not an attachment. Splitting on this (capturing, so the code
// survives the join) confines embed scanning to the segments between code.
const CODE = /(```[\s\S]*?```|`[^`\n]*`)/;

const CONTENT_TYPES: Record<string, string> = {
	jpg: "image/jpeg",
	jpeg: "image/jpeg",
	png: "image/png",
	gif: "image/gif",
	webp: "image/webp",
	pdf: "application/pdf",
};

interface AttachmentCache {
	[filename: string]: { hash: string; sgid: string };
}

interface PagecordFrontmatter {
	title?: unknown;
	slug?: unknown;
	canonical_url?: unknown;
	pagecord_token?: unknown;
	pagecord_blog_fingerprint?: unknown;
	published_at?: unknown;
	hidden?: unknown;
	locale?: unknown;
	content_format?: unknown;
	status?: unknown;
	tags?: unknown;
	pagecord_attachments?: AttachmentCache;
}

async function sha256Hex(data: BufferSource): Promise<string> {
	const digest = await crypto.subtle.digest("SHA-256", data);
	return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, "0")).join("");
}

export async function hashArrayBuffer(data: ArrayBuffer): Promise<string> {
	return (await sha256Hex(data)).slice(0, 16);
}

export async function blogFingerprint(apiKey: string): Promise<string> {
	return (await sha256Hex(new TextEncoder().encode(apiKey))).slice(0, 12);
}

function unquoteFrontmatterString(value: string): string {
	const quoted = value.match(/^(['"])(.*)\1$/);
	return quoted ? quoted[2] : value;
}

function frontmatterString(value: unknown): string | undefined {
	if (value == null) return undefined;
	if (typeof value === "string") return unquoteFrontmatterString(value);
	if (typeof value === "number" || typeof value === "boolean") return String(value);
	// An unquoted YAML timestamp arrives as a Date, and ISO is the format the
	// API wants. Anything else would stringify to "[object Object]", so
	// serialise it and let the API reject it on its merits.
	if (value instanceof Date) return value.toISOString();
	return JSON.stringify(value) ?? "";
}

function frontmatterBoolean(value: unknown): boolean | undefined {
	if (value == null) return undefined;
	if (typeof value === "boolean") return value;
	if (typeof value === "string") {
		const normalized = unquoteFrontmatterString(value).trim().toLowerCase();
		if (normalized === "true") return true;
		if (normalized === "false") return false;
	}
	return Boolean(value);
}

export function resolveTitle(frontmatterTitle: unknown, basename: string): string {
	if (frontmatterTitle === undefined) return basename;
	if (frontmatterTitle === null) return "";
	if (typeof frontmatterTitle === "string") return unquoteFrontmatterString(frontmatterTitle);
	return JSON.stringify(frontmatterTitle) ?? "";
}

export async function publishPost(app: App, blog: PagecordBlogSettings, status: "published" | "draft"): Promise<void> {
	const blogName = blog.name.trim() || "Pagecord";
	const file = app.workspace.getActiveFile();
	if (!file) {
		new Notice("No active file.");
		return;
	}

	if (!blog.apiKey) {
		new Notice("Configure your blog API key in settings.");
		return;
	}

	const frontmatter = (app.metadataCache.getFileCache(file)?.frontmatter ?? {}) as PagecordFrontmatter;
	const fingerprint = await blogFingerprint(blog.apiKey);

	const title = resolveTitle(frontmatter.title, file.basename);
	const slug = frontmatterString(frontmatter.slug);
	const canonicalUrl = frontmatterString(frontmatter.canonical_url);
	const pagecordToken = frontmatterString(frontmatter.pagecord_token);
	const pagecordBlogFingerprint = frontmatterString(frontmatter.pagecord_blog_fingerprint);
	const publishedAt = frontmatterString(frontmatter.published_at);
	const hidden = frontmatterBoolean(frontmatter.hidden);
	const locale = frontmatterString(frontmatter.locale);
	const contentFormat = frontmatterString(frontmatter.content_format) === "html" ? "html" as const : "markdown" as const;
	const frontmatterStatus = frontmatterString(frontmatter.status);
	const previousStatus = frontmatterStatus === "published" || frontmatterStatus === "draft"
		? frontmatterStatus
		: undefined;
	const cachedAttachments: AttachmentCache = frontmatter.pagecord_attachments ?? {};

	if (pagecordToken && pagecordBlogFingerprint && pagecordBlogFingerprint !== fingerprint) {
		new Notice("This note is linked to another configured blog. Use that blog's publish command.");
		return;
	}

	let tags: string | undefined;
	if (frontmatter.tags) {
		tags = Array.isArray(frontmatter.tags)
			? frontmatter.tags.map(tag => frontmatterString(tag) ?? "").join(", ")
			: frontmatterString(frontmatter.tags);
	}

	let content = await app.vault.read(file);
	content = content.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, "");

	const api = new PagecordAPI(blog);
	let updatedAttachments: AttachmentCache;
	try {
		const result = await processEmbeds(app, api, file, content, cachedAttachments);
		content = result.content;
		updatedAttachments = result.attachments;
	} catch (error: unknown) {
		if (error instanceof UploadError) {
			new Notice(error.message);
		} else {
			handleApiError(error);
		}
		return;
	}

	const params = {
		title,
		content,
		status,
		content_format: contentFormat,
		...(slug && { slug }),
		...(tags && { tags }),
		...(canonicalUrl && { canonical_url: canonicalUrl }),
		...(publishedAt && { published_at: publishedAt }),
		...(hidden != null && { hidden }),
		...(locale && { locale }),
	};

	try {
		let token = pagecordToken;
		const isUpdate = Boolean(pagecordToken);

		if (pagecordToken) {
			await api.updatePost(pagecordToken, params);
		} else {
			const post = await api.createPost(params);
			token = post.token;
		}
		new Notice(publishNoticeMessage(blogName, status, isUpdate, previousStatus));
		await app.fileManager.processFrontMatter(file, (fm: Record<string, unknown>) => {
			fm.pagecord_token = token;
			fm.pagecord_blog_fingerprint = fingerprint;
			fm.status = status;

			if (Object.keys(updatedAttachments).length > 0) {
				fm.pagecord_attachments = updatedAttachments;
			} else {
				delete fm.pagecord_attachments;
			}
		});
	} catch (error: unknown) {
		if (error instanceof ApiError && error.status === 404 && pagecordToken && pagecordBlogFingerprint) {
			await app.fileManager.processFrontMatter(file, (fm: Record<string, unknown>) => {
				delete fm.pagecord_token;
			});
		}
		handleApiError(error);
	}
}

function publishNoticeMessage(
	blogName: string,
	status: "published" | "draft",
	isUpdate: boolean,
	previousStatus?: "published" | "draft",
): string {
	if (!isUpdate) return status === "draft" ? `Draft created on ${blogName}` : `Published to ${blogName}`;

	if (status === "draft") {
		return previousStatus === "published" ? `Unpublished from ${blogName}` : `Draft updated on ${blogName}`;
	}

	return previousStatus === "draft" ? `Published to ${blogName}` : `Updated post on ${blogName}`;
}

function escapeAttribute(value: string): string {
	return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
}

async function processEmbeds(
	app: App, api: PagecordAPI, file: TFile, content: string, cache: AttachmentCache,
): Promise<{ content: string; attachments: AttachmentCache }> {
	const attachments: AttachmentCache = {};
	const segments = content.split(CODE);

	// Even-indexed segments are the text between code; odd-indexed segments are
	// the code itself, passed through untouched.
	for (let i = 0; i < segments.length; i += 2) {
		segments[i] = await processSegment(app, api, file, segments[i], cache, attachments);
	}

	return { content: segments.join(""), attachments };
}

async function processSegment(
	app: App, api: PagecordAPI, file: TFile, content: string, cache: AttachmentCache, attachments: AttachmentCache,
): Promise<string> {
	const embeds: { match: string; filename: string; path: string; alt: string; title: string }[] = [];

	for (const m of content.matchAll(WIKILINK_EMBED)) {
		// Obsidian appends display modifiers to the link: ![[report.pdf#page=2]],
		// ![[photo.png|300]]. Pagecord honours neither, so upload the file itself.
		const filename = m[1].split(/[#|]/)[0];
		if (ATTACHMENT_EXTENSIONS.test(filename)) {
			embeds.push({ match: m[0], filename, path: filename, alt: "", title: "" });
		}
	}

	for (const m of content.matchAll(MARKDOWN_EMBED)) {
		if (REMOTE_URL.test(m[2])) continue;

		const path = decodeURIComponent(m[2]);
		if (ATTACHMENT_EXTENSIONS.test(path)) {
			const filename = path.split("/").pop() || path;
			embeds.push({ match: m[0], filename, path, alt: m[1], title: m[3] || "" });
		}
	}

	for (const embed of embeds) {
		const linked = app.metadataCache.getFirstLinkpathDest(embed.path, file.path);
		if (!linked) {
			throw new UploadError(`File not found: ${embed.filename}`);
		}

		const data = await app.vault.readBinary(linked);
		const hash = await hashArrayBuffer(data);
		// Keyed by vault path, so two files sharing a name don't share an sgid.
		// `cache[embed.filename]` is the key notes published before that change
		// carry; reading it keeps them from re-uploading once.
		const cached = attachments[linked.path] ?? cache[linked.path] ?? cache[embed.filename];

		let sgid: string;
		if (cached && cached.hash === hash) {
			sgid = cached.sgid;
		} else {
			const ext = linked.extension.toLowerCase();
			const contentType = CONTENT_TYPES[ext] || "application/octet-stream";
			const attachment = await api.uploadAttachment(linked.name, contentType, data);
			sgid = attachment.attachable_sgid;
		}

		const alt = embed.alt ? ` alt="${escapeAttribute(embed.alt)}"` : "";
		const caption = embed.title ? ` caption="${escapeAttribute(embed.title)}"` : "";
		const tag = `<action-text-attachment sgid="${sgid}"${alt}${caption}></action-text-attachment>`;

		attachments[linked.path] = { hash, sgid };
		// Replacing with a function, so a "$" in a caption is not read as a
		// substitution pattern.
		content = content.replace(embed.match, () => tag);
	}

	return content;
}
