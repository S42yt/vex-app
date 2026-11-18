import { z } from "zod";
import * as C from "./contract";

type Schema = {
	type?: string;
	$ref?: string;
	items?: Schema;
	anyOf?: Schema[];
	minimum?: number;
	maximum?: number;
	maxLength?: number;
	maxItems?: number;
	properties?: Record<string, Schema>;
	required?: string[];
};
type Route = { method: string; path: string; body?: unknown; headers?: object; responses: Record<number, unknown>; metadata?: C.RoutePolicy };

const requests = z.registry<{ id: string }>();
const responses = z.registry<{ id: string }>();
type Registry = typeof requests;

const initialisms: Record<string, string> = { id: "ID", ids: "IDs", url: "URL" };
const goName = (s: string) =>
	s
		.split(/(?=[A-Z])/)
		.map((w) => initialisms[w.toLowerCase()] ?? w[0]!.toUpperCase() + w.slice(1))
		.join("");

const named = new Map<z.ZodType, string>();
const register = (schema: z.ZodObject, name: string, reg: Registry) => {
	named.set(schema, name);
	reg.add(schema, { id: name });
};

for (const [key, value] of Object.entries(C)) {
	if (!(value instanceof z.ZodObject)) continue;
	const role = key.match(/(Request|Response)$/)?.[1];
	if (!role) throw new Error(`${key}: an exported schema must end in Request or Response`);
	register(value, goName(key.slice(0, -role.length)), role === "Request" ? requests : responses);
}

const typeName = (schema: unknown, role: "Body" | "Response", key: string) => {
	if (schema === undefined && role === "Body") return "NoBody";
	if (schema instanceof z.ZodString && role === "Response") return "NoBody";
	if (!(schema instanceof z.ZodObject)) throw new Error(`${key}: unsupported ${role.toLowerCase()} schema`);
	if (!named.has(schema)) register(schema, goName(key) + role, role === "Body" ? requests : responses);
	return named.get(schema)!;
};

const routes = (Object.entries(C.ApiContract) as [string, Route][]).flatMap(([key, r]) => {
	const ok = r.responses[200];
	if (typeof ok === "object" && ok !== null && "contentType" in ok) return [];
	if ("pathParams" in r || "query" in r || r.path.includes(":")) throw new Error(`${key}: path and query parameters are not supported`);
	const headers = Object.keys(r.headers ?? {}).filter((h) => h !== "authorization");
	if (headers.length > 0) throw new Error(`${key}: headers ${headers.join(", ")} are not supported`);
	const res = typeName(ok, "Response", key);
	const body = typeName(r.body, "Body", key);
	const payload = r.metadata?.body ? { image: "Image", audio: "Audio" }[r.metadata.body] : "NoPayload";
	return [`route${goName(key)} = route[${body}, ${res}]{${JSON.stringify(r.method)}, ${JSON.stringify(r.path)}, ${payload}}`];
});

const jsonSchemas = (reg: Registry, io: "input" | "output") =>
	(z.toJSONSchema(reg, { io, unrepresentable: "any", uri: (id) => id }) as { schemas: Record<string, Schema> }).schemas;
const requestSchemas = jsonSchemas(requests, "input");
const responseSchemas = jsonSchemas(responses, "output");

const INT32 = 2 ** 31;
const goType = (s: Schema, at: string): string => {
	if (s.$ref) return s.$ref;
	switch (s.type) {
		case "string":
			return "string";
		case "integer":
			if (s.minimum !== undefined && s.maximum !== undefined && s.minimum >= -INT32 && s.maximum < INT32) return "int32";
			throw new Error(`${at}: an integer without int32 bounds`);
		case "array":
			return `[]${goType(s.items!, `${at}[]`)}`;
	}
	throw new Error(`${at}: unsupported schema ${JSON.stringify(s)}`);
};

const field = (struct: string, key: string, s: Schema, required: boolean) => {
	const at = `${struct}.${key}`;
	const [a, b] = s.anyOf ?? [];
	const nullable = s.anyOf?.length === 2 ? (b?.type === "null" ? a : a?.type === "null" ? b : undefined) : undefined;
	if (s.anyOf && !nullable) throw new Error(`${at}: only a union with null is supported`);
	if (nullable && required) throw new Error(`${at}: a required nullable field is not supported`);
	const type = nullable ? `Nullable[${goType(nullable, at)}]` : goType(s, at);
	return `${goName(key)} ${type} \`json:"${key}${required ? "" : ",omitzero"}"\``;
};

const struct = (name: string, s: Schema) => {
	const fields = Object.entries(s.properties ?? {}).map(([key, p]) => field(name, key, p, s.required?.includes(key) ?? false));
	return `type ${name} struct {\n${fields.join("\n")}\n}\n`;
};

const bound = (struct: string, key: string, kind: "maxLength" | "maximum" | "maxItems") => {
	const value = requestSchemas[struct]?.properties?.[key]?.[kind];
	if (!Number.isInteger(value)) throw new Error(`${struct}.${key}: no ${kind} in the contract`);
	return value!;
};

const limits: [string, number][] = [
	["MaxAudioBase64", C.MAX_AUDIO_BASE64],
	["MaxImageBase64", C.MAX_IMAGE_BASE64],
	["MaxNameLength", bound("CreateTrack", "title", "maxLength")],
	["MaxDurationMs", bound("CreateTrack", "duration", "maximum")],
	["MaxArtistsPerTrack", bound("CreateTrack", "artistIds", "maxItems")],
	["MaxUsernameLength", bound("Login", "username", "maxLength")],
	["MaxPasswordLength", bound("Login", "password", "maxLength")],
	["MaxTracksPerPlaylist", bound("CreatePlaylist", "trackIds", "maxItems")],
];

const header = "// Code generated by contract/gen.ts. DO NOT EDIT.\n";
const root = `${import.meta.dir}/..`;

const goFile = `${root}/internal/backend/contract_gen.go`;
await Bun.write(
	goFile,
	[
		`${header}\npackage backend\n`,
		`const (\n${limits.map(([n, v]) => `${n} = ${v}`).join("\n")}\n)\n`,
		...Object.entries(requestSchemas).map(([n, s]) => struct(n, s)),
		...Object.entries(responseSchemas).map(([n, s]) => struct(n, s)),
		`var (\n${routes.join("\n")}\n)\n`,
	].join("\n"),
);
const fmt = Bun.spawnSync(["gofmt", "-w", goFile]);
if (fmt.exitCode !== 0) throw new Error(fmt.stderr.toString());

const screaming = (name: string) => name.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toUpperCase();
await Bun.write(
	`${root}/frontend/src/lib/limits.gen.ts`,
	`${header}\n${limits.map(([n, v]) => `export const ${screaming(n)} = ${v};\n`).join("")}`,
);
