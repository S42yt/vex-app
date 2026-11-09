// Serve the probe app's built frontend as a plain web page (no Wails host).
const root = new URL("../app/frontend/dist/", import.meta.url);
Bun.serve({ port: 9444, fetch(req) { const p = new URL(req.url).pathname; return new Response(Bun.file(new URL("." + (p === "/" ? "/index.html" : p), root))); } });
