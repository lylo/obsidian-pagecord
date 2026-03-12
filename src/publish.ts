import { App, TFile, Notice } from "obsidian";
import { PagecordAPI, PagecordSettings, handleApiError } from "./api";

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

export async function hashArrayBuffer(data: ArrayBuffer): Promise<string> {
	const hashBuffer = await crypto.subtle.digest("SHA-256", data);
	const hashArray = Array.from(new Uint8Array(hashBuffer));
	return hashArray.map(b => b.toString(16).padStart(2, "0")).join("").slice(0, 16);
}

export async function publishPost(app: App, settings: PagecordSettings, status: "published" | "draft"): Promise<void> {
	const file = app.workspace.getActiveFile();
	if (!file) {
		new Notice("No active file.");
		return;
	}

	if (!settings.apiKey) {
		new Notice("Configure your Pagecord API key in settings.");
		return;
	}

	const api = new PagecordAPI(settings);
	const frontmatter = app.metadataCache.getFileCache(file)?.frontmatter;

	const title = frontmatter?.title === false ? "" : (frontmatter?.title || file.basename);
	const slug = frontmatter?.slug;
	const canonicalUrl = frontmatter?.canonical_url;
	const pagecordToken = frontmatter?.pagecord_token;
	const publishedAt = frontmatter?.published_at;
	const hidden = frontmatter?.hidden;
	const locale = frontmatter?.locale;
	const contentFormat = frontmatter?.content_format === "html" ? "html" as const : "markdown" as const;
	const fmStatus = frontmatter?.status;
	const cachedAttachments: AttachmentCache = frontmatter?.pagecord_attachments || {};

	let tags: string | undefined;
	if (frontmatter?.tags) {
		tags = Array.isArray(frontmatter.tags)
			? frontmatter.tags.join(", ")
			: String(frontmatter.tags);
	}

	let content = await app.vault.read(file);
	content = content.replace(/^---\n[\s\S]*?\n---\n/, "");

	let updatedAttachments: AttachmentCache;
	try {
		const result = await processImages(app, api, file, content, cachedAttachments);
		content = result.content;
		updatedAttachments = result.attachments;
	} catch (error: any) {
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
		status: fmStatus === "published" || fmStatus === "draft" ? fmStatus : status,
		content_format: contentFormat,
		...(slug && { slug }),
		...(tags && { tags }),
		...(canonicalUrl && { canonical_url: canonicalUrl }),
		...(publishedAt && { published_at: String(publishedAt) }),
		...(hidden != null && { hidden: Boolean(hidden) }),
		...(locale && { locale }),
	};

	try {
		if (pagecordToken) {
			await api.updatePost(pagecordToken, params);
			new Notice(`Updated on Pagecord (${status}).`);
		} else {
			const post = await api.createPost(params);
			await app.fileManager.processFrontMatter(file, (fm) => {
				fm.pagecord_token = post.token;
			});
			new Notice(`Published to Pagecord (${status}).`);
		}
		if (Object.keys(updatedAttachments).length > 0) {
			await app.fileManager.processFrontMatter(file, (fm) => {
				fm.pagecord_attachments = updatedAttachments;
			});
		}
	} catch (error: any) {
		if (error?.status === 404 && pagecordToken) {
			await app.fileManager.processFrontMatter(file, (fm) => {
				delete fm.pagecord_token;
			});
		}
		handleApiError(error);
	}
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
