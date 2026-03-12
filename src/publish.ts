import { App, TFile, Notice } from "obsidian";
import { PagecordAPI, PagecordSettings, handleApiError } from "./api";

class UploadError extends Error {}

const IMAGE_EXTENSIONS = /\.(jpe?g|png|gif|webp)$/i;
const WIKILINK_IMAGE = /!\[\[([^\]]+?)\]\]/g;
const MARKDOWN_IMAGE = /!\[([^\]]*)\]\(([^)]+?)\)/g;

const CONTENT_TYPES: Record<string, string> = {
	jpg: "image/jpeg",
	jpeg: "image/jpeg",
	png: "image/png",
	gif: "image/gif",
	webp: "image/webp",
};

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

	const title = frontmatter?.title === false ? undefined : (frontmatter?.title || file.basename);
	const slug = frontmatter?.slug;
	const canonicalUrl = frontmatter?.canonical_url;
	const pagecordToken = frontmatter?.pagecord_token;
	const publishedAt = frontmatter?.published_at;
	const hidden = frontmatter?.hidden;
	const locale = frontmatter?.locale;
	const contentFormat = frontmatter?.content_format === "html" ? "html" as const : "markdown" as const;
	const fmStatus = frontmatter?.status;

	let tags: string | undefined;
	if (frontmatter?.tags) {
		tags = Array.isArray(frontmatter.tags)
			? frontmatter.tags.join(", ")
			: String(frontmatter.tags);
	}

	let content = await app.vault.read(file);
	content = content.replace(/^---\n[\s\S]*?\n---\n/, "");

	try {
		content = await processImages(app, api, file, content);
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
	} catch (error: any) {
		if (error?.status === 404 && pagecordToken) {
			await app.fileManager.processFrontMatter(file, (fm) => {
				delete fm.pagecord_token;
			});
		}
		handleApiError(error);
	}
}

async function processImages(app: App, api: PagecordAPI, file: TFile, content: string): Promise<string> {
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

	for (const img of images) {
		const linked = app.metadataCache.getFirstLinkpathDest(img.path, file.path);
		if (!linked) {
			throw new UploadError(`Image not found: ${img.filename}`);
		}

		const data = await app.vault.readBinary(linked);
		const ext = linked.extension.toLowerCase();
		const contentType = CONTENT_TYPES[ext] || "application/octet-stream";

		const attachment = await api.uploadAttachment(img.filename, contentType, data);
		content = content.replace(
			img.match,
			`<action-text-attachment sgid="${attachment.attachable_sgid}"></action-text-attachment>`
		);
	}

	return content;
}
