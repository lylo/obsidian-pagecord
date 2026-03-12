export class Notice {
	constructor(public message: string) {}
}

export function requestUrl(): never {
	throw new Error("requestUrl should not be called in tests");
}
