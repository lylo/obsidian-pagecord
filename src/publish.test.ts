import type { App } from "obsidian";
import { afterEach, describe, it, expect, vi } from "vitest";
import { ApiError, PagecordAPI, PagecordBlogSettings } from "./api";
import {
	IMAGE_EXTENSIONS,
	WIKILINK_IMAGE,
	MARKDOWN_IMAGE,
	blogFingerprint,
	hashArrayBuffer,
	publishPost,
	resolveTitle,
} from "./publish";

function createApp(frontmatter: Record<string, unknown>, content = "# Hello"): App {
	const file = { basename: "Hello", path: "Hello.md" };

	return {
		workspace: {
			getActiveFile: () => file,
		},
		metadataCache: {
			getFileCache: () => ({ frontmatter }),
			getFirstLinkpathDest: () => null,
		},
		vault: {
			read: async () => content,
		},
		fileManager: {
			processFrontMatter: async (_file: unknown, callback: (fm: Record<string, unknown>) => void) => {
				callback(frontmatter);
			},
		},
	} as unknown as App;
}

const BLOG: PagecordBlogSettings = { name: "Personal", apiKey: "key-1" };

afterEach(() => {
	vi.restoreAllMocks();
});

describe("IMAGE_EXTENSIONS", () => {
	it.each(["photo.jpg", "photo.jpeg", "photo.JPG", "image.png", "anim.gif", "pic.webp"])(
		"matches %s",
		(name) => expect(IMAGE_EXTENSIONS.test(name)).toBe(true),
	);

	it.each(["file.pdf", "doc.txt", "image.svg", "photo.jpg.bak", "noext"])(
		"rejects %s",
		(name) => expect(IMAGE_EXTENSIONS.test(name)).toBe(false),
	);
});

describe("WIKILINK_IMAGE", () => {
	it("matches ![[filename.jpg]]", () => {
		const matches = [...'Check this ![[photo.jpg]] out'.matchAll(new RegExp(WIKILINK_IMAGE))];
		expect(matches).toHaveLength(1);
		expect(matches[0][1]).toBe("photo.jpg");
	});

	it("matches multiple images", () => {
		const content = "![[a.png]] text ![[b.gif]]";
		const matches = [...content.matchAll(new RegExp(WIKILINK_IMAGE))];
		expect(matches).toHaveLength(2);
		expect(matches[0][1]).toBe("a.png");
		expect(matches[1][1]).toBe("b.gif");
	});

	it("does not match non-image wikilinks", () => {
		const content = "![[document.pdf]]";
		const matches = [...content.matchAll(new RegExp(WIKILINK_IMAGE))].filter(m =>
			IMAGE_EXTENSIONS.test(m[1]),
		);
		expect(matches).toHaveLength(0);
	});
});

describe("MARKDOWN_IMAGE", () => {
	it("matches ![alt](path.jpg)", () => {
		const matches = [...'![alt text](images/photo.jpg)'.matchAll(new RegExp(MARKDOWN_IMAGE))];
		expect(matches).toHaveLength(1);
		expect(matches[0][1]).toBe("alt text");
		expect(matches[0][2]).toBe("images/photo.jpg");
	});

	it("matches images with empty alt text", () => {
		const matches = [...'![](photo.png)'.matchAll(new RegExp(MARKDOWN_IMAGE))];
		expect(matches).toHaveLength(1);
		expect(matches[0][1]).toBe("");
		expect(matches[0][2]).toBe("photo.png");
	});

	it("matches URL-encoded paths", () => {
		const matches = [...'![](my%20photo.jpg)'.matchAll(new RegExp(MARKDOWN_IMAGE))];
		expect(matches).toHaveLength(1);
		expect(decodeURIComponent(matches[0][2])).toBe("my photo.jpg");
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

	it("falls back to basename when title is omitted", () => {
		expect(resolveTitle(undefined, "filename")).toBe("filename");
	});

	it("sends empty string when title is an empty string", () => {
		expect(resolveTitle("", "filename")).toBe("");
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
	});

	it("updates legacy notes without a fingerprint and writes one after success", async () => {
		const frontmatter: Record<string, unknown> = { pagecord_token: "old-token" };
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
