import { App, TFile, Notice } from "obsidian";
import { PagecordAPI, PagecordBlogSettings, ApiError, handleApiError } from "./api";

class UploadError extends Error {}

export const IMAGE_EXTENSIONS = /\.(jpe?g|png|gif|webp)$/i;
export const WIKILINK_IMAGE = /!\[\[([^\]]+?)\]\]/g;
export const MARKDOWN_IMAGE = /!\[([^\]]*)\]\(([^)]+?)\)/g;

const CONTENT_TYPES: Record<string, string> = {
	jpg: "image/jpeg",
	jpeg: "image/jpeg",
	png: "image/png",
	gif: "image/gif",
	webp: "image/webp",
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

export async function hashArrayBuffer(data: ArrayBuffer): Promise<string> {
	const hashBuffer = await crypto.subtle.digest("SHA-256", data);
	const hashArray = Array.from(new Uint8Array(hashBuffer));
	return hashArray.map(b => b.toString(16).padStart(2, "0")).join("").slice(0, 16);
}

export async function blogFingerprint(apiKey: string): Promise<string> {
	const hashBuffer = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(apiKey));
	const hashArray = Array.from(new Uint8Array(hashBuffer));
	return hashArray.map(b => b.toString(16).padStart(2, "0")).join("").slice(0, 12);
}

function unquoteFrontmatterString(value: string): string {
	const quoted = value.match(/^(['"])(.*)\1$/);
	return quoted ? quoted[2] : value;
}

function frontmatterString(value: unknown): string | undefined {
	if (value == null) return undefined;
	if (typeof value === "string") return unquoteFrontmatterString(value);
	return String(value);
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
	content = content.replace(/^---\n[\s\S]*?\n---\n/, "");

	const api = new PagecordAPI(blog);
	let updatedAttachments: AttachmentCache;
	try {
		const result = await processImages(app, api, file, content, cachedAttachments);
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
		...(publishedAt && { published_at: String(publishedAt) }),
		...(hidden != null && { hidden: Boolean(hidden) }),
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
		});
		if (Object.keys(updatedAttachments).length > 0) {
			await app.fileManager.processFrontMatter(file, (fm: Record<string, unknown>) => {
				fm.pagecord_attachments = updatedAttachments;
			});
		}
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

async function processImages(
	app: App, api: PagecordAPI, file: TFile, content: string, cache: AttachmentCache,
): Promise<{ content: string; attachments: AttachmentCache }> {
	const images: { match: string; filename: string; path: string }[] = [];

	for (const m of content.matchAll(WIKILINK_IMAGE)) {
		const filename = m[1];
		if (IMAGE_EXTENSIONS.test(filename)) {
			images.push({ match: m[0], filename, path: filename });
		}
	}

	for (const m of content.matchAll(MARKDOWN_IMAGE)) {
		const path = decodeURIComponent(m[2]);
		if (IMAGE_EXTENSIONS.test(path)) {
			const filename = path.split("/").pop() || path;
			images.push({ match: m[0], filename, path });
		}
	}

	const attachments: AttachmentCache = {};

	for (const img of images) {
		const linked = app.metadataCache.getFirstLinkpathDest(img.path, file.path);
		if (!linked) {
			throw new UploadError(`Image not found: ${img.filename}`);
		}

		const data = await app.vault.readBinary(linked);
		const hash = await hashArrayBuffer(data);
		const cached = cache[img.filename];

		let sgid: string;
		if (cached && cached.hash === hash) {
			sgid = cached.sgid;
		} else {
			const ext = linked.extension.toLowerCase();
			const contentType = CONTENT_TYPES[ext] || "application/octet-stream";
			const attachment = await api.uploadAttachment(img.filename, contentType, data);
			sgid = attachment.attachable_sgid;
		}

		attachments[img.filename] = { hash, sgid };
		content = content.replace(
			img.match,
			`<action-text-attachment sgid="${sgid}"></action-text-attachment>`
		);
	}

	return { content, attachments };
}
