// Proxy del arnés: emula las rutas de Supabase que usa la Edge Function.
//   /rest/v1/*     → PostgREST (puerto POSTGREST_PORT)
//   /auth/v1/user  → valida el JWT de pruebas y devuelve el usuario
//   /storage/v1/object/* → almacén en memoria (solo rol de servicio), para los
//                          archivos de las conversaciones de Rafa
import { createServer, request } from "node:http";
import { verificar } from "./jwt.mjs";

const PUERTO = Number(process.env.PROXY_PORT || 54321);
const POSTGREST = Number(process.env.POSTGREST_PORT || 54330);

// Almacén en memoria: "bucket/ruta" → { bytes, tipo }.
const objetos = new Map();
const esServicio = (req) => verificar((req.headers.authorization || "").replace(/^Bearer /, ""))?.role === "service_role";
const leerCuerpo = (req) =>
  new Promise((ok) => {
    const partes = [];
    req.on("data", (c) => partes.push(c));
    req.on("end", () => ok(Buffer.concat(partes)));
  });

async function almacen(req, res) {
  const ruta = decodeURIComponent(req.url.split("?")[0].replace(/^\/storage\/v1\/object\//, ""));
  const responder = (status, cuerpo, tipo = "application/json") => {
    res.writeHead(status, { "Content-Type": tipo });
    res.end(typeof cuerpo === "string" || Buffer.isBuffer(cuerpo) ? cuerpo : JSON.stringify(cuerpo));
  };
  if (!esServicio(req)) return responder(403, { statusCode: "403", error: "Unauthorized", message: "solo servicio en pruebas" });
  const cuerpo = await leerCuerpo(req);
  if (req.method === "POST" || req.method === "PUT") {
    if (objetos.has(ruta) && req.headers["x-upsert"] !== "true") return responder(409, { statusCode: "409", error: "Duplicate", message: "The resource already exists" });
    objetos.set(ruta, { bytes: cuerpo, tipo: req.headers["content-type"] || "application/octet-stream" });
    return responder(200, { Key: ruta, Id: ruta });
  }
  if (req.method === "GET") {
    const o = objetos.get(ruta);
    return o ? responder(200, o.bytes, o.tipo) : responder(404, { statusCode: "404", error: "not_found", message: "Object not found" });
  }
  if (req.method === "DELETE") {
    const { prefixes = [] } = JSON.parse(cuerpo.toString() || "{}");
    prefixes.forEach((p) => objetos.delete(`${ruta}/${p}`));
    return responder(200, prefixes.map((name) => ({ name })));
  }
  return responder(405, { message: "método no soportado" });
}

createServer((req, res) => {
  if (req.url.startsWith("/storage/v1/object/")) return void almacen(req, res);
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
