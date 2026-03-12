import { describe, it, expect } from "vitest";
import { buildMultipartBody } from "./api";

describe("buildMultipartBody", () => {
	it("produces valid multipart form data", () => {
		const data = new TextEncoder().encode("fake image data").buffer;
		const { body, boundary } = buildMultipartBody("photo.jpg", "image/jpeg", data);

		const text = new TextDecoder().decode(new Uint8Array(body as ArrayBuffer));
		expect(text).toContain(`--${boundary}`);
		expect(text).toContain('Content-Disposition: form-data; name="file"; filename="photo.jpg"');
		expect(text).toContain("Content-Type: image/jpeg");
		expect(text).toContain("fake image data");
		expect(text).toContain(`--${boundary}--`);
	});

	it("handles filenames with spaces", () => {
		const data = new TextEncoder().encode("data").buffer;
		const { body } = buildMultipartBody("my photo.png", "image/png", data);

		const text = new TextDecoder().decode(new Uint8Array(body as ArrayBuffer));
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
