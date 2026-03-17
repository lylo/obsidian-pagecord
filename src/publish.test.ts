import { describe, it, expect } from "vitest";
import { IMAGE_EXTENSIONS, WIKILINK_IMAGE, MARKDOWN_IMAGE, hashArrayBuffer } from "./publish";

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

describe("frontmatter title logic", () => {
	// Testing the logic: title === false → "", title present → use it, else → basename
	function resolveTitle(fmTitle: string | false | undefined, basename: string): string | undefined {
		return fmTitle === false ? "" : (fmTitle || basename);
	}

	it("uses frontmatter title when present", () => {
		expect(resolveTitle("My Title", "filename")).toBe("My Title");
	});

	it("falls back to basename when title is omitted", () => {
		expect(resolveTitle(undefined, "filename")).toBe("filename");
	});

	it("sends empty string when title is false", () => {
		expect(resolveTitle(false, "filename")).toBe("");
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

describe("status override logic", () => {
	function resolveStatus(fmStatus: string | undefined, commandStatus: "published" | "draft"): "published" | "draft" {
		return fmStatus === "published" || fmStatus === "draft" ? fmStatus : commandStatus;
	}

	it("uses frontmatter status when valid", () => {
		expect(resolveStatus("draft", "published")).toBe("draft");
		expect(resolveStatus("published", "draft")).toBe("published");
	});

	it("falls back to command status when frontmatter status is missing", () => {
		expect(resolveStatus(undefined, "published")).toBe("published");
	});

	it("ignores invalid frontmatter status values", () => {
		expect(resolveStatus("invalid", "draft")).toBe("draft");
	});
});
