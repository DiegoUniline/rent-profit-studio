// Firma de JWT HS256 para el arnés AISLADO (secreto de pruebas, no de producción).
import { createHmac } from "node:crypto";

export const SECRETO = "secreto-de-pruebas-rafa-0123456789-abcdefghij";
const b64 = (o) => Buffer.from(typeof o === "string" ? o : JSON.stringify(o)).toString("base64url");

export function firmar(claims) {
  const cabecera = b64({ alg: "HS256", typ: "JWT" });
  const cuerpo = b64({ exp: Math.floor(Date.now() / 1000) + 3600, iat: Math.floor(Date.now() / 1000), ...claims });
  const firma = createHmac("sha256", SECRETO).update(`${cabecera}.${cuerpo}`).digest("base64url");
  return `${cabecera}.${cuerpo}.${firma}`;
}

export function verificar(token) {
  const [c, b, f] = token.split(".");
  const esperado = createHmac("sha256", SECRETO).update(`${c}.${b}`).digest("base64url");
  if (esperado !== f) return null;
  return JSON.parse(Buffer.from(b, "base64url").toString());
}

export const USUARIOS = {
  admin: { id: "00000000-0000-0000-0000-0000000000a1", email: "admin@demo.test" },
  contador: { id: "00000000-0000-0000-0000-0000000000c1", email: "contador@demo.test" },
  usuario: { id: "00000000-0000-0000-0000-0000000000b1", email: "usuario@demo.test" },
  arquitecto: { id: "00000000-0000-0000-0000-0000000000d1", email: "arquitecto@demo.test" },
  usuario2: { id: "00000000-0000-0000-0000-0000000000b2", email: "usuario2@demo.test" },
};

export const tokenDe = (u) => firmar({ sub: u.id, email: u.email, role: "authenticated", aud: "authenticated" });
export const ANON = firmar({ role: "anon" });
export const SERVICIO = firmar({ role: "service_role" });
