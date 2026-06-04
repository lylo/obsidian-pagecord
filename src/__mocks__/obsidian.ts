export class Notice {
	static messages: string[] = [];

	constructor(public message: string) {
		Notice.messages.push(message);
	}
}

export function requestUrl(): never {
	throw new Error("requestUrl should not be called in tests");
}
