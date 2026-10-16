// Proxy del arnés: emula las rutas de Supabase que usa la Edge Function.
//   /rest/v1/*     → PostgREST (puerto POSTGREST_PORT)
//   /auth/v1/user  → valida el JWT de pruebas y devuelve el usuario
import { createServer, request } from "node:http";
import { verificar } from "./jwt.mjs";

const PUERTO = Number(process.env.PROXY_PORT || 54321);
const POSTGREST = Number(process.env.POSTGREST_PORT || 54330);

createServer((req, res) => {
  if (req.url.startsWith("/auth/v1/user")) {
    const token = (req.headers.authorization || "").replace(/^Bearer /, "");
    const claims = token ? verificar(token) : null;
    if (!claims?.sub) {
      res.writeHead(401, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ message: "invalid JWT" }));
    }
    res.writeHead(200, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({ id: claims.sub, email: claims.email, aud: "authenticated", role: "authenticated", app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() }));
  }
  if (!req.url.startsWith("/rest/v1")) {
    res.writeHead(404);
    return res.end();
  }
  const destino = request(
    { host: "127.0.0.1", port: POSTGREST, method: req.method, path: req.url.replace(/^\/rest\/v1/, "") || "/", headers: { ...req.headers, host: `127.0.0.1:${POSTGREST}` } },
    (r) => {
      res.writeHead(r.statusCode, r.headers);
      r.pipe(res);
    }
  );
  destino.on("error", (e) => {
    res.writeHead(502);
    res.end(String(e));
  });
  req.pipe(destino);
}).listen(PUERTO, "127.0.0.1", () => console.log(`proxy en ${PUERTO}`));
