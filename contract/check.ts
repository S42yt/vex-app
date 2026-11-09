// Fails on any exchange the contract would refuse or only half read. Takes a JSON
// array on stdin; internal/backend/contracttest feeds it what the Go client sends.
import { z } from "zod";
import { ApiContract } from "./contract";

type Exchange = { method: string; path: string; body?: unknown; response?: unknown };
type Route = { method: string; path: string; body?: unknown; responses: Record<number, unknown> };

const isRecord = (v: unknown): v is Record<string, unknown> =>
	typeof v === "object" && v !== null && Object.getPrototypeOf(v) === Object.prototype;

// zod drops the keys a schema doesn't name instead of rejecting them.
const dropped = (sent: unknown, parsed: unknown, at: string): string[] => {
	if (Array.isArray(sent) && Array.isArray(parsed)) {
		return sent.flatMap((v, i) => dropped(v, parsed[i], `${at}[${i}]`));
	}
	if (!isRecord(sent) || !isRecord(parsed)) return [];
	return Object.keys(sent).flatMap((k) =>
		k in parsed ? dropped(sent[k], parsed[k], `${at}.${k}`) : [`${at}.${k}: not in the contract`],
	);
};

const routes = Object.values(ApiContract) as Route[];
const errors: string[] = [];

for (const x of (await Bun.stdin.json()) as Exchange[]) {
	const where = `${x.method} ${x.path}`;
	const route = routes.find((r) => r.method === x.method && r.path === x.path);
	if (!route) {
		errors.push(`${where}: not a route in the contract`);
		continue;
	}
	const check = (kind: string, value: unknown, schema: unknown) => {
		if (!(schema instanceof z.ZodType)) {
			errors.push(`${where}: the contract has no JSON ${kind} here`);
			return;
		}
		const result = schema.safeParse(value);
		if (result.success) errors.push(...dropped(value, result.data, `${where} ${kind}`));
		else errors.push(`${where} ${kind}:\n${z.prettifyError(result.error)}`);
	};
	if (route.body !== undefined || x.body !== undefined) check("body", x.body, route.body);
	if (x.response !== undefined) check("response", x.response, route.responses[200]);
}

if (errors.length > 0) {
	console.error(errors.join("\n"));
	process.exit(1);
}
