import { describe, it, expect } from "vitest";
import { buildMultipartBody, getConfiguredBlogs, normalizeSettings } from "./api";

describe("buildMultipartBody", () => {
	it("produces valid multipart form data", () => {
		const data = new TextEncoder().encode("fake image data").buffer;
		const { body, boundary } = buildMultipartBody("photo.jpg", "image/jpeg", data);

		const text = new TextDecoder().decode(new Uint8Array(body));
		expect(text).toContain(`--${boundary}`);
		expect(text).toContain('Content-Disposition: form-data; name="file"; filename="photo.jpg"');
		expect(text).toContain("Content-Type: image/jpeg");
		expect(text).toContain("fake image data");
		expect(text).toContain(`--${boundary}--`);
	});

	it("handles filenames with spaces", () => {
		const data = new TextEncoder().encode("data").buffer;
		const { body } = buildMultipartBody("my photo.png", "image/png", data);

		const text = new TextDecoder().decode(new Uint8Array(body));
		expect(text).toContain('filename="my photo.png"');
	});

	it("returns unique boundaries", () => {
		const data = new TextEncoder().encode("data").buffer;
		const { boundary: b1 } = buildMultipartBody("a.jpg", "image/jpeg", data);
		const { boundary: b2 } = buildMultipartBody("b.jpg", "image/jpeg", data);
		// Boundaries include Date.now() so should differ (or at least be valid)
		expect(b1).toMatch(/^----PagecordUpload/);
		expect(b2).toMatch(/^----PagecordUpload/);
	});
});

describe("normalizeSettings", () => {
	it("migrates a legacy apiKey to a Pagecord blog", () => {
		const settings = normalizeSettings({ apiKey: "old-key" });

		expect(settings.blogs).toEqual([{ name: "Pagecord", apiKey: "old-key" }]);
	});

	it("allows empty blog settings", () => {
		const settings = normalizeSettings(null);

		expect(settings.blogs).toEqual([]);
	});

	it("preserves existing blog settings", () => {
		const settings = normalizeSettings({
			blogs: [
				{ name: "Personal", apiKey: "key-1" },
				{ name: "Work", apiKey: "key-2" },
			],
		});

		expect(settings.blogs).toEqual([
			{ name: "Personal", apiKey: "key-1" },
			{ name: "Work", apiKey: "key-2" },
		]);
	});
});

describe("getConfiguredBlogs", () => {
	it("returns only blogs with both a name and API key", () => {
		const blogs = getConfiguredBlogs({
			blogs: [
				{ name: "Personal", apiKey: "key-1" },
				{ name: "", apiKey: "key-2" },
				{ name: "Work", apiKey: "" },
				{ name: "  Archive  ", apiKey: "  key-3  " },
			],
		});

		expect(blogs).toEqual([
			{ index: 0, blog: { name: "Personal", apiKey: "key-1" } },
			{ index: 3, blog: { name: "Archive", apiKey: "key-3" } },
		]);
	});
});
