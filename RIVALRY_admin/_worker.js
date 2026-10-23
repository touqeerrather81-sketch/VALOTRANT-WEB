/*
  RIVALRY admin backend (Cloudflare Pages "advanced mode").
  Needs, in Cloudflare Pages -> Settings:
    - KV namespace binding named  SETTINGS
    - Secret variable named       ADMIN_PASSWORD
  Everything except /api/* is served as normal static files.
*/

const KEY = "settings";

function json(data, status = 200, extra = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", ...extra },
  });
}

async function sha256(text) {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)));
}

async function checkPassword(request, env) {
  if (!env.ADMIN_PASSWORD) {
    return { ok: false, status: 500, error: "ADMIN_PASSWORD is not set in Cloudflare." };
  }
  const header = request.headers.get("authorization") || "";
  const given = header.startsWith("Bearer ") ? header.slice(7) : "";
  const a = await sha256(given);
  const b = await sha256(env.ADMIN_PASSWORD);
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  if (diff !== 0) {
    await new Promise((r) => setTimeout(r, 600)); // slow down guessing
    return { ok: false, status: 401, error: "Wrong password." };
  }
  return { ok: true };
}

function cleanUrl(value, label) {
  const v = String(value ?? "").trim();
  if (!v) return "";
  if (v.length > 600) throw new Error(label + " link is too long.");
  let u;
  try { u = new URL(v); } catch { throw new Error(label + " link is not a valid URL."); }
  if (u.protocol !== "https:" && u.protocol !== "http:") {
    throw new Error(label + " link must start with https://");
  }
  return u.toString();
}

function sanitize(input) {
  if (!input || typeof input !== "object") throw new Error("Invalid data.");

  let tournamentDate = String(input.tournamentDate ?? "").trim();
  if (tournamentDate) {
    const ok = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?(Z|[+-]\d{2}:\d{2})$/.test(tournamentDate);
    if (!ok || isNaN(new Date(tournamentDate).getTime())) throw new Error("Tournament date is not valid.");
  }

  const prizePool = String(input.prizePool ?? "").trim();
  if (prizePool.length > 60) throw new Error("Prize pool text is too long (max 60 characters).");

  const entryFee = Number(input.entryFee);
  if (!Number.isInteger(entryFee) || entryFee < 0 || entryFee > 100000) {
    throw new Error("Entry fee must be a whole number between 0 and 100000.");
  }

  const announcement = String(input.announcement ?? "").trim();
  if (announcement.length > 200) throw new Error("Announcement is too long (max 200 characters).");

  return {
    tournamentDate,
    prizePool,
    entryFee,
    registrationOpen: input.registrationOpen !== false,
    announcement,
    formUrl: cleanUrl(input.formUrl, "Registration form"),
    discordUrl: cleanUrl(input.discordUrl, "Discord"),
    whatsappUrl: cleanUrl(input.whatsappUrl, "WhatsApp"),
    updatedAt: new Date().toISOString(),
  };
}

async function readSettings(env) {
  if (!env.SETTINGS) return {};
  try {
    return (await env.SETTINGS.get(KEY, "json")) || {};
  } catch {
    return {};
  }
}

async function handleApi(request, env, url) {
  const path = url.pathname.replace(/\/+$/, "");

  if (path === "/api/settings" && request.method === "GET") {
    return json(await readSettings(env), 200, { "cache-control": "public, max-age=20" });
  }

  if (path === "/api/login" && request.method === "POST") {
    const auth = await checkPassword(request, env);
    if (!auth.ok) return json({ error: auth.error }, auth.status);
    return json({ ok: true, kvReady: Boolean(env.SETTINGS) }, 200, { "cache-control": "no-store" });
  }

  if (path === "/api/settings" && request.method === "PUT") {
    const auth = await checkPassword(request, env);
    if (!auth.ok) return json({ error: auth.error }, auth.status);
    if (!env.SETTINGS) {
      return json({ error: "Storage is not connected. Add a KV binding named SETTINGS in Cloudflare." }, 503);
    }
    const raw = await request.text();
    if (raw.length > 8000) return json({ error: "Data is too large." }, 413);
    let clean;
    try {
      clean = sanitize(JSON.parse(raw));
    } catch (e) {
      return json({ error: e.message || "Invalid data." }, 400);
    }
    await env.SETTINGS.put(KEY, JSON.stringify(clean));
    return json(clean, 200, { "cache-control": "no-store" });
  }

  if (path === "/api/settings" || path === "/api/login") {
    return json({ error: "Method not allowed." }, 405, { allow: "GET, PUT, POST" });
  }
  return json({ error: "Not found." }, 404);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/")) return handleApi(request, env, url);
    return env.ASSETS.fetch(request);
  },
};
