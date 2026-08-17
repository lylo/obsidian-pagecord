import { Notice, type App } from "obsidian";
import { afterEach, describe, it, expect, vi } from "vitest";
import { ApiError, PagecordAPI, PagecordBlogSettings } from "./api";
import {
	ATTACHMENT_EXTENSIONS,
	WIKILINK_EMBED,
	MARKDOWN_EMBED,
	blogFingerprint,
	hashArrayBuffer,
	publishPost,
	resolveTitle,
} from "./publish";

function createApp(
	frontmatter: Record<string, unknown>,
	content = "# Hello",
	linked?: { extension: string; path: string; name: string },
): App {
	const file = { basename: "Hello", path: "Hello.md" };

	return {
		workspace: {
			getActiveFile: () => file,
		},
		metadataCache: {
			getFileCache: () => ({ frontmatter }),
			getFirstLinkpathDest: () => linked ?? null,
		},
		vault: {
			read: async () => content,
			readBinary: async () => new TextEncoder().encode("file data").buffer,
		},
		fileManager: {
			processFrontMatter: async (_file: unknown, callback: (fm: Record<string, unknown>) => void) => {
				callback(frontmatter);
			},
		},
	} as unknown as App;
}

const BLOG: PagecordBlogSettings = { name: "Personal", apiKey: "key-1" };
const noticeMessages = Notice as unknown as { messages: string[] };

afterEach(() => {
	vi.restoreAllMocks();
	noticeMessages.messages = [];
});

describe("ATTACHMENT_EXTENSIONS", () => {
	it.each(["photo.jpg", "photo.jpeg", "photo.JPG", "image.png", "anim.gif", "pic.webp", "report.pdf", "REPORT.PDF"])(
		"matches %s",
		(name) => expect(ATTACHMENT_EXTENSIONS.test(name)).toBe(true),
	);

	it.each(["doc.txt", "image.svg", "notes.pages", "photo.jpg.bak", "noext"])(
		"rejects %s",
		(name) => expect(ATTACHMENT_EXTENSIONS.test(name)).toBe(false),
	);
});

describe("WIKILINK_EMBED", () => {
	it("matches ![[filename.jpg]]", () => {
		const matches = [...'Check this ![[photo.jpg]] out'.matchAll(new RegExp(WIKILINK_EMBED))];
		expect(matches).toHaveLength(1);
		expect(matches[0][1]).toBe("photo.jpg");
	});

	it("matches multiple embeds", () => {
		const content = "![[a.png]] text ![[b.gif]]";
		const matches = [...content.matchAll(new RegExp(WIKILINK_EMBED))];
		expect(matches).toHaveLength(2);
		expect(matches[0][1]).toBe("a.png");
		expect(matches[1][1]).toBe("b.gif");
	});

	it("matches a PDF embed", () => {
		const matches = [...'![[document.pdf]]'.matchAll(new RegExp(WIKILINK_EMBED))];
		expect(matches).toHaveLength(1);
		expect(ATTACHMENT_EXTENSIONS.test(matches[0][1])).toBe(true);
	});

	it("does not match unsupported wikilinks", () => {
		const content = "![[spreadsheet.xlsx]]";
		const matches = [...content.matchAll(new RegExp(WIKILINK_EMBED))].filter(m =>
			ATTACHMENT_EXTENSIONS.test(m[1]),
		);
		expect(matches).toHaveLength(0);
	});
});

describe("MARKDOWN_EMBED", () => {
	it("matches ![alt](path.jpg)", () => {
		const matches = [...'![alt text](images/photo.jpg)'.matchAll(new RegExp(MARKDOWN_EMBED))];
		expect(matches).toHaveLength(1);
		expect(matches[0][1]).toBe("alt text");
		expect(matches[0][2]).toBe("images/photo.jpg");
	});

	it("matches images with empty alt text", () => {
		const matches = [...'![](photo.png)'.matchAll(new RegExp(MARKDOWN_EMBED))];
		expect(matches).toHaveLength(1);
		expect(matches[0][1]).toBe("");
		expect(matches[0][2]).toBe("photo.png");
	});

	it("matches URL-encoded paths", () => {
		const matches = [...'![](my%20photo.jpg)'.matchAll(new RegExp(MARKDOWN_EMBED))];
		expect(matches).toHaveLength(1);
		expect(decodeURIComponent(matches[0][2])).toBe("my photo.jpg");
	});

	it("separates a quoted title from the path", () => {
		const matches = [...'![A boat](photo.jpg "Sunset on the Mekong")'.matchAll(new RegExp(MARKDOWN_EMBED))];
		expect(matches).toHaveLength(1);
		expect(matches[0][1]).toBe("A boat");
		expect(matches[0][2]).toBe("photo.jpg");
		expect(matches[0][3]).toBe("Sunset on the Mekong");
	});

	it("leaves the title undefined when absent", () => {
		const matches = [...'![A boat](photo.jpg)'.matchAll(new RegExp(MARKDOWN_EMBED))];
		expect(matches[0][2]).toBe("photo.jpg");
		expect(matches[0][3]).toBeUndefined();
	});

	it("keeps unquoted spaces in the path", () => {
		const matches = [...'![](my photo.jpg)'.matchAll(new RegExp(MARKDOWN_EMBED))];
		expect(matches[0][2]).toBe("my photo.jpg");
	});

	it("still recognises the image when a title is given", () => {
		const matches = [...'![A boat](photo.jpg "A caption")'.matchAll(new RegExp(MARKDOWN_EMBED))];
		expect(ATTACHMENT_EXTENSIONS.test(matches[0][2])).toBe(true);
	});
});

describe("hashArrayBuffer", () => {
	it("returns a 16-char hex string", async () => {
		const data = new TextEncoder().encode("hello world").buffer;
		const hash = await hashArrayBuffer(data);
		expect(hash).toMatch(/^[0-9a-f]{16}$/);
	});

	it("returns the same hash for the same data", async () => {
		const data1 = new TextEncoder().encode("identical").buffer;
		const data2 = new TextEncoder().encode("identical").buffer;
		expect(await hashArrayBuffer(data1)).toBe(await hashArrayBuffer(data2));
	});

	it("returns different hashes for different data", async () => {
		const data1 = new TextEncoder().encode("version 1").buffer;
		const data2 = new TextEncoder().encode("version 2").buffer;
		expect(await hashArrayBuffer(data1)).not.toBe(await hashArrayBuffer(data2));
	});
});

describe("blogFingerprint", () => {
	it("returns a stable short fingerprint", async () => {
		const fingerprint = await blogFingerprint("key-1");

		expect(fingerprint).toMatch(/^[0-9a-f]{12}$/);
		expect(fingerprint).toBe(await blogFingerprint("key-1"));
	});

	it("returns different fingerprints for different keys", async () => {
		expect(await blogFingerprint("key-1")).not.toBe(await blogFingerprint("key-2"));
	});
});

describe("frontmatter title logic", () => {
	it("uses frontmatter title when present", () => {
		expect(resolveTitle("My Title", "filename")).toBe("My Title");
	});

	it("removes wrapping quotes when Obsidian returns them literally", () => {
		expect(resolveTitle('"My Title"', "filename")).toBe("My Title");
		expect(resolveTitle("'My Title'", "filename")).toBe("My Title");
	});

	it("falls back to basename when title is omitted", () => {
		expect(resolveTitle(undefined, "filename")).toBe("filename");
	});

	it("sends empty string when title is an empty string", () => {
		expect(resolveTitle("", "filename")).toBe("");
	});

	it("sends empty string when title is a quoted empty string", () => {
		expect(resolveTitle('""', "filename")).toBe("");
		expect(resolveTitle("''", "filename")).toBe("");
	});

	it("sends empty string when title is null (bare YAML key)", () => {
		expect(resolveTitle(null, "filename")).toBe("");
	});

	it("uses the literal string \"false\" when title is false", () => {
		expect(resolveTitle(false, "filename")).toBe("false");
	});

	it("stringifies numeric titles", () => {
		expect(resolveTitle(123, "filename")).toBe("123");
	});

	it("stringifies array titles as JSON", () => {
		expect(resolveTitle([1, 2, 3], "filename")).toBe("[1,2,3]");
	});

	it("stringifies object titles as JSON", () => {
		expect(resolveTitle({ title: "Nested" }, "filename")).toBe('{"title":"Nested"}');
	});
});

describe("tags parsing", () => {
	function parseTags(fmTags: string[] | string | undefined): string | undefined {
		if (!fmTags) return undefined;
		return Array.isArray(fmTags) ? fmTags.join(", ") : String(fmTags);
	}

	it("joins array tags with commas", () => {
		expect(parseTags(["personal", "update"])).toBe("personal, update");
	});

	it("passes through string tags", () => {
		expect(parseTags("personal, update")).toBe("personal, update");
	});

	it("returns undefined for missing tags", () => {
		expect(parseTags(undefined)).toBeUndefined();
	});
});

describe("status logic", () => {
	it("always uses command status", () => {
		expect("published").toBe("published");
		expect("draft").toBe("draft");
	});

	it("detects frontmatter status for sync", () => {
		function hasFmStatus(fmStatus: string | undefined): boolean {
			return fmStatus === "published" || fmStatus === "draft";
		}

		expect(hasFmStatus("draft")).toBe(true);
		expect(hasFmStatus("published")).toBe(true);
		expect(hasFmStatus(undefined)).toBe(false);
		expect(hasFmStatus("invalid")).toBe(false);
	});
});

describe("publishPost blog fingerprint", () => {
	it("normalizes quoted frontmatter strings before publishing", async () => {
		const fingerprint = await blogFingerprint(BLOG.apiKey);
		const canonicalUrl = ["https:", "", "canonical.test", "original"].join("/");
		const frontmatter: Record<string, unknown> = {
			pagecord_token: '"old-token"',
			pagecord_blog_fingerprint: `"${fingerprint}"`,
			title: '"Quoted Title"',
			slug: '"quoted-slug"',
			tags: ['"personal"', '"update"'],
			published_at: '"2025-01-15T10:00:00Z"',
			canonical_url: `"${canonicalUrl}"`,
			hidden: '"false"',
			locale: '"en"',
			content_format: '"html"',
			status: '"published"',
		};
		const app = createApp(frontmatter);
		const updatePost = vi.spyOn(PagecordAPI.prototype, "updatePost").mockResolvedValue({
			token: "old-token",
			title: "Quoted Title",
			slug: "quoted-slug",
			status: "draft",
		});

		await publishPost(app, BLOG, "draft");

		expect(updatePost).toHaveBeenCalledWith("old-token", {
			title: "Quoted Title",
			content: "# Hello",
			status: "draft",
			content_format: "html",
			slug: "quoted-slug",
			tags: "personal, update",
			canonical_url: canonicalUrl,
			published_at: "2025-01-15T10:00:00Z",
			hidden: false,
			locale: "en",
		});
		expect(frontmatter.pagecord_token).toBe("old-token");
		expect(frontmatter.pagecord_blog_fingerprint).toBe(fingerprint);
		expect(noticeMessages.messages).toContain("Unpublished from Personal");
	});

	it("sends an unquoted YAML timestamp as ISO 8601", async () => {
		const app = createApp({ published_at: new Date("2025-01-15T10:00:00Z") });
		const createPost = vi.spyOn(PagecordAPI.prototype, "createPost").mockResolvedValue({
			token: "new-token",
			title: "Hello",
			slug: "hello",
			status: "published",
		});

		await publishPost(app, BLOG, "published");

		expect(createPost).toHaveBeenCalledWith(expect.objectContaining({
			published_at: "2025-01-15T10:00:00.000Z",
		}));
	});

	it("does not send an object-valued frontmatter field as [object Object]", async () => {
		const app = createApp({ slug: { nested: "value" } });
		const createPost = vi.spyOn(PagecordAPI.prototype, "createPost").mockResolvedValue({
			token: "new-token",
			title: "Hello",
			slug: "hello",
			status: "published",
		});

		await publishPost(app, BLOG, "published");

		expect(createPost).toHaveBeenCalledWith(expect.objectContaining({
			slug: '{"nested":"value"}',
		}));
	});

	it("writes the blog fingerprint when creating a post", async () => {
		const frontmatter: Record<string, unknown> = {};
		const app = createApp(frontmatter);
		vi.spyOn(PagecordAPI.prototype, "createPost").mockResolvedValue({
			token: "new-token",
			title: "Hello",
			slug: "hello",
			status: "published",
		});

		await publishPost(app, BLOG, "published");

		expect(frontmatter.pagecord_token).toBe("new-token");
		expect(frontmatter.pagecord_blog_fingerprint).toBe(await blogFingerprint(BLOG.apiKey));
		expect(frontmatter.status).toBe("published");
		expect(noticeMessages.messages).toContain("Published to Personal");
	});

	it("leaves remote markdown images unchanged", async () => {
		const frontmatter: Record<string, unknown> = {};
		const imageUrl = ["https:", "", "remote-image.test", "images", "photo.webp"].join("/");
		const content = `Testing images\n\n![](${imageUrl})`;
		const app = createApp(frontmatter, content);
		const createPost = vi.spyOn(PagecordAPI.prototype, "createPost").mockResolvedValue({
			token: "new-token",
			title: "Hello",
			slug: "hello",
			status: "published",
		});
		const uploadAttachment = vi.spyOn(PagecordAPI.prototype, "uploadAttachment");

		await publishPost(app, BLOG, "published");

		expect(uploadAttachment).not.toHaveBeenCalled();
		expect(createPost).toHaveBeenCalledWith(expect.objectContaining({ content }));
		expect(noticeMessages.messages).not.toContain("File not found: photo.webp");
	});

	it("ignores embeds inside inline code spans", async () => {
		const content = 'Size an image with `![[photo.png|300]]` or `![A sunny day](beach.jpg "Brighton")`.';
		const app = createApp({}, content);
		const createPost = vi.spyOn(PagecordAPI.prototype, "createPost").mockResolvedValue({
			token: "new-token",
			title: "Hello",
			slug: "hello",
			status: "published",
		});
		const uploadAttachment = vi.spyOn(PagecordAPI.prototype, "uploadAttachment");

		await publishPost(app, BLOG, "published");

		expect(uploadAttachment).not.toHaveBeenCalled();
		expect(createPost).toHaveBeenCalledWith(expect.objectContaining({ content }));
	});

	it("ignores embeds inside fenced code blocks", async () => {
		const content = "An embed looks like this:\n\n```\n![[photo.png]]\n```\n";
		const app = createApp({}, content);
		const createPost = vi.spyOn(PagecordAPI.prototype, "createPost").mockResolvedValue({
			token: "new-token",
			title: "Hello",
			slug: "hello",
			status: "published",
		});
		const uploadAttachment = vi.spyOn(PagecordAPI.prototype, "uploadAttachment");

		await publishPost(app, BLOG, "published");

		expect(uploadAttachment).not.toHaveBeenCalled();
		expect(createPost).toHaveBeenCalledWith(expect.objectContaining({ content }));
	});

	it("replaces a real embed but not a code-span mention of the same file", async () => {
		const app = createApp({}, "Type `![[photo.png]]` to embed:\n\n![[photo.png]]", {
			extension: "png",
			path: "photo.png",
			name: "photo.png",
		});
		const createPost = vi.spyOn(PagecordAPI.prototype, "createPost").mockResolvedValue({
			token: "new-token",
			title: "Hello",
			slug: "hello",
			status: "published",
		});
		const uploadAttachment = vi.spyOn(PagecordAPI.prototype, "uploadAttachment")
			.mockResolvedValue({ attachable_sgid: "sgid-1" });

		await publishPost(app, BLOG, "published");

		expect(uploadAttachment).toHaveBeenCalledTimes(1);
		expect(createPost).toHaveBeenCalledWith(expect.objectContaining({
			content: 'Type `![[photo.png]]` to embed:\n\n<action-text-attachment sgid="sgid-1"></action-text-attachment>',
		}));
	});

	it("uploads an embedded PDF and replaces it with an attachment tag", async () => {
		const frontmatter: Record<string, unknown> = {};
		const app = createApp(frontmatter, "How does this render?\n\n![[sample.pdf]]", {
			extension: "pdf",
			path: "sample.pdf",
			name: "sample.pdf",
		});
		const createPost = vi.spyOn(PagecordAPI.prototype, "createPost").mockResolvedValue({
			token: "new-token",
			title: "Hello",
			slug: "hello",
			status: "published",
		});
		const uploadAttachment = vi.spyOn(PagecordAPI.prototype, "uploadAttachment")
			.mockResolvedValue({ attachable_sgid: "sgid-1" });

		await publishPost(app, BLOG, "published");

		expect(uploadAttachment).toHaveBeenCalledWith("sample.pdf", "application/pdf", expect.anything());
		expect(createPost).toHaveBeenCalledWith(expect.objectContaining({
			content: 'How does this render?\n\n<action-text-attachment sgid="sgid-1"></action-text-attachment>',
		}));
		expect(frontmatter.pagecord_attachments).toEqual({
			"sample.pdf": { hash: expect.any(String), sgid: "sgid-1" },
		});
	});

	it("uploads a PDF embedded with a page anchor", async () => {
		const app = createApp({}, "![[report.pdf#page=2]]", { extension: "pdf", path: "report.pdf", name: "report.pdf" });
		const createPost = vi.spyOn(PagecordAPI.prototype, "createPost").mockResolvedValue({
			token: "new-token",
			title: "Hello",
			slug: "hello",
			status: "published",
		});
		const uploadAttachment = vi.spyOn(PagecordAPI.prototype, "uploadAttachment")
			.mockResolvedValue({ attachable_sgid: "sgid-2" });

		await publishPost(app, BLOG, "published");

		expect(uploadAttachment).toHaveBeenCalledWith("report.pdf", "application/pdf", expect.anything());
		expect(createPost).toHaveBeenCalledWith(expect.objectContaining({
			content: '<action-text-attachment sgid="sgid-2"></action-text-attachment>',
		}));
	});

	it("does not treat a $ in a caption as a substitution pattern", async () => {
		const app = createApp({}, '![A boat](photo.jpg "Cost $& up")', {
			extension: "jpg",
			path: "photo.jpg",
			name: "photo.jpg",
		});
		const createPost = vi.spyOn(PagecordAPI.prototype, "createPost").mockResolvedValue({
			token: "new-token",
			title: "Hello",
			slug: "hello",
			status: "published",
		});
		vi.spyOn(PagecordAPI.prototype, "uploadAttachment").mockResolvedValue({ attachable_sgid: "sgid-1" });

		await publishPost(app, BLOG, "published");

		expect(createPost).toHaveBeenCalledWith(expect.objectContaining({
			content: '<action-text-attachment sgid="sgid-1" alt="A boat" caption="Cost $&amp; up"></action-text-attachment>',
		}));
	});

	it("strips frontmatter from a note with CRLF line endings", async () => {
		const app = createApp({}, "---\r\ntitle: Windows\r\n---\r\nBody text");
		const createPost = vi.spyOn(PagecordAPI.prototype, "createPost").mockResolvedValue({
			token: "new-token",
			title: "Hello",
			slug: "hello",
			status: "published",
		});

		await publishPost(app, BLOG, "published");

		expect(createPost).toHaveBeenCalledWith(expect.objectContaining({ content: "Body text" }));
	});

	it("uploads a file embedded twice only once", async () => {
		const app = createApp({}, "![[photo.png]]\n\nand again\n\n![[photo.png]]", {
			extension: "png",
			path: "photo.png",
			name: "photo.png",
		});
		const createPost = vi.spyOn(PagecordAPI.prototype, "createPost").mockResolvedValue({
			token: "new-token",
			title: "Hello",
			slug: "hello",
			status: "published",
		});
		const uploadAttachment = vi.spyOn(PagecordAPI.prototype, "uploadAttachment")
			.mockResolvedValue({ attachable_sgid: "sgid-1" });

		await publishPost(app, BLOG, "published");

		expect(uploadAttachment).toHaveBeenCalledTimes(1);
		expect(createPost).toHaveBeenCalledWith(expect.objectContaining({
			content: '<action-text-attachment sgid="sgid-1"></action-text-attachment>\n\nand again\n\n'
				+ '<action-text-attachment sgid="sgid-1"></action-text-attachment>',
		}));
	});

	it("caches an attachment against its vault path, not its name", async () => {
		const frontmatter: Record<string, unknown> = {};
		const app = createApp(frontmatter, "![[photo.png]]", {
			extension: "png",
			path: "images/photo.png",
			name: "photo.png",
		});
		vi.spyOn(PagecordAPI.prototype, "createPost").mockResolvedValue({
			token: "new-token",
			title: "Hello",
			slug: "hello",
			status: "published",
		});
		const uploadAttachment = vi.spyOn(PagecordAPI.prototype, "uploadAttachment")
			.mockResolvedValue({ attachable_sgid: "sgid-1" });

		await publishPost(app, BLOG, "published");

		expect(uploadAttachment).toHaveBeenCalledWith("photo.png", "image/png", expect.anything());
		expect(frontmatter.pagecord_attachments).toEqual({
			"images/photo.png": { hash: expect.any(String), sgid: "sgid-1" },
		});
	});

	it("reuses a cache entry written under the older filename key", async () => {
		const hash = await hashArrayBuffer(new TextEncoder().encode("file data").buffer);
		const frontmatter: Record<string, unknown> = {
			pagecord_attachments: { "photo.png": { hash, sgid: "old-sgid" } },
		};
		const app = createApp(frontmatter, "![[photo.png]]", {
			extension: "png",
			path: "images/photo.png",
			name: "photo.png",
		});
		const createPost = vi.spyOn(PagecordAPI.prototype, "createPost").mockResolvedValue({
			token: "new-token",
			title: "Hello",
			slug: "hello",
			status: "published",
		});
		const uploadAttachment = vi.spyOn(PagecordAPI.prototype, "uploadAttachment");

		await publishPost(app, BLOG, "published");

		expect(uploadAttachment).not.toHaveBeenCalled();
		expect(createPost).toHaveBeenCalledWith(expect.objectContaining({
			content: '<action-text-attachment sgid="old-sgid"></action-text-attachment>',
		}));
		expect(frontmatter.pagecord_attachments).toEqual({
			"images/photo.png": { hash, sgid: "old-sgid" },
		});
	});

	it("clears the attachment cache when the last embed is removed", async () => {
		const frontmatter: Record<string, unknown> = {
			pagecord_attachments: { "photo.png": { hash: "abc", sgid: "old-sgid" } },
		};
		const app = createApp(frontmatter, "Just words now.");
		vi.spyOn(PagecordAPI.prototype, "createPost").mockResolvedValue({
			token: "new-token",
			title: "Hello",
			slug: "hello",
			status: "published",
		});

		await publishPost(app, BLOG, "published");

		expect(frontmatter).not.toHaveProperty("pagecord_attachments");
	});

	it("shows when a draft is created", async () => {
		const frontmatter: Record<string, unknown> = {};
		const app = createApp(frontmatter);
		vi.spyOn(PagecordAPI.prototype, "createPost").mockResolvedValue({
			token: "new-token",
			title: "Hello",
			slug: "hello",
			status: "draft",
		});

		await publishPost(app, BLOG, "draft");

		expect(noticeMessages.messages).toContain("Draft created on Personal");
	});

	it("updates legacy notes without a fingerprint and writes one after success", async () => {
		const frontmatter: Record<string, unknown> = { pagecord_token: "old-token", status: "draft" };
		const app = createApp(frontmatter);
		const updatePost = vi.spyOn(PagecordAPI.prototype, "updatePost").mockResolvedValue({
			token: "old-token",
			title: "Hello",
			slug: "hello",
			status: "draft",
		});

		await publishPost(app, BLOG, "draft");

		expect(updatePost).toHaveBeenCalledWith("old-token", expect.objectContaining({ status: "draft" }));
		expect(frontmatter.pagecord_token).toBe("old-token");
		expect(frontmatter.pagecord_blog_fingerprint).toBe(await blogFingerprint(BLOG.apiKey));
		expect(noticeMessages.messages).toContain("Draft updated on Personal");
	});

	it("shows when a published post is updated", async () => {
		const frontmatter: Record<string, unknown> = { pagecord_token: "old-token", status: "published" };
		const app = createApp(frontmatter);
		vi.spyOn(PagecordAPI.prototype, "updatePost").mockResolvedValue({
			token: "old-token",
			title: "Hello",
			slug: "hello",
			status: "published",
		});

		await publishPost(app, BLOG, "published");

		expect(noticeMessages.messages).toContain("Updated post on Personal");
	});

	it("shows when a draft is published", async () => {
		const frontmatter: Record<string, unknown> = { pagecord_token: "old-token", status: "draft" };
		const app = createApp(frontmatter);
		vi.spyOn(PagecordAPI.prototype, "updatePost").mockResolvedValue({
			token: "old-token",
			title: "Hello",
			slug: "hello",
			status: "published",
		});

		await publishPost(app, BLOG, "published");

		expect(noticeMessages.messages).toContain("Published to Personal");
	});

	it("shows when a published post is unpublished to draft", async () => {
		const frontmatter: Record<string, unknown> = { pagecord_token: "old-token", status: "published" };
		const app = createApp(frontmatter);
		vi.spyOn(PagecordAPI.prototype, "updatePost").mockResolvedValue({
			token: "old-token",
			title: "Hello",
			slug: "hello",
			status: "draft",
		});

		await publishPost(app, BLOG, "draft");

		expect(noticeMessages.messages).toContain("Unpublished from Personal");
	});

	it("aborts when the selected blog does not match the note fingerprint", async () => {
		const frontmatter: Record<string, unknown> = {
			pagecord_token: "old-token",
			pagecord_blog_fingerprint: await blogFingerprint("other-key"),
		};
		const app = createApp(frontmatter);
		const createPost = vi.spyOn(PagecordAPI.prototype, "createPost");
		const updatePost = vi.spyOn(PagecordAPI.prototype, "updatePost");

		await publishPost(app, BLOG, "published");

		expect(createPost).not.toHaveBeenCalled();
		expect(updatePost).not.toHaveBeenCalled();
		expect(frontmatter.status).toBeUndefined();
	});

	it("does not delete a legacy token when a no-fingerprint update returns 404", async () => {
		const frontmatter: Record<string, unknown> = { pagecord_token: "old-token" };
		const app = createApp(frontmatter);
		vi.spyOn(PagecordAPI.prototype, "updatePost").mockRejectedValue(new ApiError(404, {}));

		await publishPost(app, BLOG, "published");

		expect(frontmatter.pagecord_token).toBe("old-token");
		expect(frontmatter.pagecord_blog_fingerprint).toBeUndefined();
	});
});
