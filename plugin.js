// Kino plugin: HentaiJK v1.4.0
// Miniaturas: data-animepic / animes/image/ (NUNCA jkvideo_ como póster de serie)
// Home: series únicas; más secciones; Magi por defecto (rápido)

const BASE = "https://hentaijk.com";
const CDN = "https://cdn.hentaijk.com";

// Géneros verificados en hentaijk.com (200). Sin filas 404.
// "episodios-nuevos" se arma aparte (primera fila).
// home() deduplica series entre filas (cada serie solo en la primera donde aparece).
const SECTIONS = [
  { id: "top", title: "Más votados", path: "/top" },
  { id: "sin-censura", title: "Sin censura", path: "/genero/sin-censura" },
  { id: "ahegao", title: "Ahegao", path: "/genero/ahegao" },
  { id: "incesto", title: "Incesto", path: "/genero/incesto" },
  { id: "vanilla", title: "Vanilla", path: "/genero/vanilla" },
  { id: "yuri", title: "Yuri", path: "/genero/yuri" },
  { id: "yaoi", title: "Yaoi", path: "/genero/yaoi" },
  { id: "netorare", title: "Netorare", path: "/genero/netorare" },
  { id: "shota", title: "Shota", path: "/genero/shota" },
  { id: "maids", title: "Maids", path: "/genero/maids" },
  { id: "bondage", title: "Bondage", path: "/genero/bondage" },
];

function log(...a) {
  try { kino.log(...a); } catch (_) {}
}

function preferredServer() {
  try {
    const s = kino.config.get("server");
    if (s && typeof s === "string") return s.toLowerCase();
  } catch (_) {}
  return "magi";
}

async function fetchHtml(url) {
  const r = await kino.fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36",
      Accept: "text/html,application/xhtml+xml",
      "Accept-Language": "es-ES,es;q=0.9,en;q=0.8",
      Referer: BASE + "/",
    },
    cookies: true,
    timeoutMs: 18000,
  });
  if (!r.ok) throw new Error("HTTP " + r.status);
  return r.text();
}

function csrfFrom(html) {
  const m =
    html.match(/name="csrf-token"\s+content="([^"]+)"/i) ||
    html.match(/csrf-token"\s+content="([^"]+)"/i);
  return m ? m[1] : null;
}

async function postText(url, body, referer, token) {
  const headers = {
    "User-Agent":
      "Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36",
    Accept: "application/json, text/javascript, */*; q=0.01",
    "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
    "X-Requested-With": "XMLHttpRequest",
    Referer: referer || BASE + "/",
    Origin: BASE,
  };
  if (token) headers["X-CSRF-TOKEN"] = token;
  const r = await kino.fetch(url, {
    method: "POST",
    headers: headers,
    body: body,
    cookies: true,
    timeoutMs: 18000,
  });
  if (!r.ok) throw new Error("POST " + r.status);
  return r.text();
}

function abs(u) {
  if (!u) return null;
  if (u.startsWith("//")) return "https:" + u;
  if (u.startsWith("http")) return u;
  if (u.startsWith("/")) return BASE + u;
  return BASE + "/" + u;
}

function seriesPoster(slug) {
  if (!slug) return null;
  return CDN + "/assets/images/animes/image/" + slug + ".jpg";
}

function videoThumb(filename) {
  if (!filename) return null;
  if (String(filename).startsWith("http")) return filename;
  const f = String(filename).replace(/^.*\//, "");
  return CDN + "/assets/images/animes/video/image/" + f;
}

function cleanTitle(t) {
  return String(t || "")
    .replace(/&amp;/g, "&")
    .replace(/&#039;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/<[^>]+>/g, "")
    .replace(/\s+-\s+\d+\s*$/, "")
    .trim()
    .slice(0, 200);
}

/** ¿URL es póster de serie (no still de episodio)? */
function isSeriesPosterUrl(u) {
  if (!u) return false;
  if (/\/animes\/video\//i.test(u)) return false;
  if (/jkvideo_/i.test(u)) return false;
  return /\/animes\/image\//i.test(u) || /\/animes\/thumbnail\//i.test(u);
}

/**
 * Episodios recién agregados en el home.
 * kind=series + ref=series:slug → al abrir, episodes() lista TODOS los capítulos.
 * Póster = still del episodio (16:9); una entrada por serie (el más reciente).
 */
function parseNewEpisodes(html) {
  const bySlug = new Map();
  const re =
    /href="(?:https:\/\/hentaijk\.com)?\/([a-z0-9-]+)(?:\/(\d+))?\/?"[^>]*>\s*<div class="d-thumb"><img([^>]+)>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    const slug = m[1];
    const epNum = m[2] ? parseInt(m[2], 10) : 0;
    if (!isValidSlug(slug)) continue;
    const attrs = m[3];
    const animepic = (attrs.match(/data-animepic=["']([^"']+)["']/) || [])[1];
    const src = (attrs.match(/(?:^|\s)src=["']([^"']+)["']/) || [])[1];
    const alt = (attrs.match(/alt=["']([^"']*)["']/) || [])[1];
    // Still horizontal del capítulo (jkvideo) para esta fila
    let still = null;
    if (src && (/jkvideo_/i.test(src) || /\/animes\/video\//i.test(src))) still = src;
    // Póster de serie de respaldo
    let seriesPic = null;
    if (animepic && isSeriesPosterUrl(animepic)) seriesPic = animepic;
    else if (src && isSeriesPosterUrl(src)) seriesPic = src;
    else seriesPic = seriesPoster(slug);

    const titleBase = cleanTitle(alt || slug.replace(/-/g, " "));
    // Si ya hay la serie, conservar la de mayor número de episodio (más reciente en la rejilla)
    const prev = bySlug.get(slug);
    if (prev && (prev._ep || 0) >= epNum) continue;

    bySlug.set(slug, {
      id: slug,
      ref: "series:" + slug,
      title: epNum ? titleBase + " — Ep. " + epNum : titleBase,
      kind: "series",
      poster: still || seriesPic,
      backdrop: seriesPic || undefined,
      adult: true,
      _ep: epNum || 0,
    });
  }

  // Hero carousel: otro bloque de episodios recientes
  const parts = html.split(/class="hero__items set-bg"/i);
  for (let i = 1; i < parts.length; i++) {
    const chunk = parts[i].slice(0, 2500);
    const bg = chunk.match(/data-setbg="([^"]+)"/);
    const href = chunk.match(
      /href="https:\/\/hentaijk\.com\/([a-z0-9-]+)(?:\/(\d+))?\/?"/i
    );
    const h2 = chunk.match(/<h2[^>]*>([^<]+)/i);
    if (!href || !isValidSlug(href[1])) continue;
    const slug = href[1];
    const epNum = href[2] ? parseInt(href[2], 10) : 0;
    const prev = bySlug.get(slug);
    if (prev && (prev._ep || 0) >= epNum && prev.poster) continue;
    const titleBase = cleanTitle(h2 ? h2[1] : slug.replace(/-/g, " "));
    const still = bg ? bg[1] : null;
    bySlug.set(slug, {
      id: slug,
      ref: "series:" + slug,
      title: epNum ? titleBase + " — Ep. " + epNum : titleBase,
      kind: "series",
      poster: still || seriesPoster(slug),
      backdrop: seriesPoster(slug),
      adult: true,
      _ep: epNum || 0,
    });
  }

  const items = Array.from(bySlug.values());
  // Quitar campo interno
  for (const it of items) delete it._ep;
  return items;
}

/**
 * Extrae series con póster correcto.
 * Prioridad: data-animepic > src animes/image/ > poster construido por slug.
 * Nunca usa jkvideo_ como póster de serie.
 */
function parseSeriesCards(html) {
  const items = [];
  const seen = new Set();

  // 1) Cards d-thumb (home recientes, géneros): href + img con data-animepic
  const reThumb =
    /href="(?:https:\/\/hentaijk\.com)?\/([a-z0-9-]+)(?:\/(\d+))?\/?"[^>]*>\s*<div class="d-thumb"><img([^>]+)>/gi;
  let m;
  while ((m = reThumb.exec(html)) !== null) {
    const slug = m[1];
    if (seen.has(slug) || !isValidSlug(slug)) continue;
    const attrs = m[3];
    const animepic = (attrs.match(/data-animepic=["']([^"']+)["']/) || [])[1];
    const src = (attrs.match(/(?:^|\s)src=["']([^"']+)["']/) || [])[1];
    const alt = (attrs.match(/alt=["']([^"']*)["']/) || [])[1];
    let poster = null;
    if (animepic && isSeriesPosterUrl(animepic)) poster = animepic;
    else if (src && isSeriesPosterUrl(src)) poster = src;
    else poster = seriesPoster(slug);
    seen.add(slug);
    items.push({
      id: slug,
      ref: "series:" + slug,
      title: cleanTitle(alt || slug.replace(/-/g, " ")),
      kind: "series",
      poster: poster,
      adult: true,
    });
  }

  // 2) Top / cards con card-img (solo animes/image)
  const reCard =
    /href="(?:https:\/\/hentaijk\.com)?\/([a-z0-9-]+)\/?"[^>]*>\s*<div class="card-img"[^>]*>\s*<img[^>]+src=["']([^"']+)["'][^>]*alt=["']([^"']*)["']/gi;
  while ((m = reCard.exec(html)) !== null) {
    const slug = m[1];
    if (seen.has(slug) || !isValidSlug(slug)) continue;
    const src = m[2];
    if (!isSeriesPosterUrl(src)) continue;
    seen.add(slug);
    items.push({
      id: slug,
      ref: "series:" + slug,
      title: cleanTitle(m[3] || slug.replace(/-/g, " ")),
      kind: "series",
      poster: src,
      adult: true,
    });
  }

  // 3) Genérico: enlace serie + img animes/image (no video)
  if (items.length < 5) {
    const reGen =
      /href="(?:https:\/\/hentaijk\.com)?\/([a-z0-9-]+)\/?"[^>]*>[\s\S]{0,400}?src=["'](https:\/\/cdn\.hentaijk\.com\/assets\/images\/animes\/image\/[^"']+)["'][^>]*(?:alt=["']([^"']*)["'])?/gi;
    while ((m = reGen.exec(html)) !== null) {
      const slug = m[1];
      if (seen.has(slug) || !isValidSlug(slug)) continue;
      // Preferir si el archivo contiene el slug
      const src = m[2];
      if (src.indexOf(slug) < 0 && items.length > 8) continue;
      seen.add(slug);
      items.push({
        id: slug,
        ref: "series:" + slug,
        title: cleanTitle(m[3] || slug.replace(/-/g, " ")),
        kind: "series",
        poster: src,
        adult: true,
      });
    }
  }

  return items;
}

function isValidSlug(slug) {
  if (!slug || slug.length < 2) return false;
  return !/^(dash|usuario|directorio|buscar|genero|studio|login|ajax|guardado|historial|salir|top|ovas|animes)$/i.test(
    slug
  );
}

/** Recientes del home: series únicas con data-animepic correcto */
function parseHomeRecent(html) {
  return parseSeriesCards(html);
}

export async function home() {
  const rows = [];
  // Una serie solo en la primera fila donde aparezca (sin repetir entre secciones)
  const seenGlobal = new Set();

  function dedupe(items) {
    const out = [];
    for (const it of items) {
      if (!it || !it.id) continue;
      if (seenGlobal.has(it.id)) continue;
      seenGlobal.add(it.id);
      out.push(it);
    }
    return out;
  }

  // 1) Episodios recién agregados → abren la SERIE (todos los caps)
  try {
    const homeHtml = await fetchHtml(BASE + "/");
    const nuevos = dedupe(parseNewEpisodes(homeHtml));
    log("home episodios-nuevos", nuevos.length);
    if (nuevos.length) {
      rows.push({
        id: "episodios-nuevos",
        title: "Episodios nuevos",
        items: nuevos.slice(0, 40),
        ref: "path:/",
        genre: "anime",
      });
    }
  } catch (e) {
    log("home episodios-nuevos ERROR", e && e.message);
  }

  // 2) Rankings y géneros (páginas distintas; sin solapar con la fila anterior)
  for (const sec of SECTIONS) {
    try {
      const html = await fetchHtml(BASE + sec.path);
      const items = dedupe(parseSeriesCards(html));
      log("home", sec.id, items.length);
      if (items.length) {
        rows.push({
          id: sec.id,
          title: sec.title,
          items: items.slice(0, 40),
          ref: "path:" + sec.path,
          genre: "anime",
        });
      }
    } catch (e) {
      log("home", sec.id, "ERROR", e && e.message);
    }
  }
  return rows;
}

export async function browse(ref, cursor) {
  let path = "/directorio/";
  if (typeof ref === "string" && ref.startsWith("path:")) path = ref.slice(5);
  const page = cursor ? parseInt(String(cursor), 10) || 1 : 1;
  let url = BASE + path;
  if (page > 1) {
    url += (url.indexOf("?") >= 0 ? "&" : "?") + "page=" + page;
  }
  const html = await fetchHtml(url);
  const items = parseSeriesCards(html);
  const next = items.length >= 20 ? String(page + 1) : undefined;
  return { items: items.slice(0, 60), next: next };
}

export async function search(query) {
  const q = (query.q || "").trim();
  if (!q) return [];
  try {
    const html = await fetchHtml(BASE + "/buscar?q=" + encodeURIComponent(q));
    const items = parseSeriesCards(html);
    if (items.length) {
      log("search html", items.length);
      return items.slice(0, 50);
    }
  } catch (e) {
    log("search html", e && e.message);
  }
  try {
    const homeHtml = await fetchHtml(BASE + "/");
    const token = csrfFrom(homeHtml);
    const body =
      "_token=" +
      encodeURIComponent(token || "") +
      "&q=" +
      encodeURIComponent(q);
    const text = await postText(BASE + "/ajax_search", body, BASE + "/", token);
    const data = JSON.parse(text);
    const list = Array.isArray(data) ? data : data.results || data.data || [];
    const items = [];
    const seen = new Set();
    for (const it of list) {
      if (!it || !it.slug || seen.has(it.slug)) continue;
      seen.add(it.slug);
      // thumbnail o image del JSON suelen ser póster de serie
      let poster = it.thumbnail || null;
      if (it.image && !poster) {
        poster = isSeriesPosterUrl(it.image)
          ? it.image
          : seriesPoster(it.image.replace(/\.jpg$/i, "").replace(/^.*\//, "") === it.slug
              ? it.slug
              : it.slug);
        if (!isSeriesPosterUrl(String(it.image))) poster = seriesPoster(it.slug);
        else poster = it.image.startsWith("http") ? it.image : seriesPoster(it.image);
      }
      if (!poster) poster = seriesPoster(it.slug);
      items.push({
        id: it.slug,
        ref: "series:" + it.slug,
        title: cleanTitle(it.title || it.slug),
        kind: "series",
        poster: poster,
        adult: true,
      });
    }
    log("search ajax", items.length);
    return items.slice(0, 50);
  } catch (e) {
    log("search ajax", e && e.message);
    return [];
  }
}

function seriesSlug(ref) {
  let slug = String(ref || "");
  if (slug.startsWith("series:")) slug = slug.slice(7);
  if (slug.startsWith("ep:")) {
    const parts = slug.split(":");
    slug = parts[1] || "";
  }
  return slug.replace(/^\/+|\/+$/g, "").split("/")[0];
}

async function loadEpisodeList(animeId, slug, token, referer) {
  const out = [];
  const seenNum = new Set();
  let page = 1;
  let lastPage = 1;
  while (page <= lastPage && page <= 40) {
    const url =
      BASE + "/ajax/episodes/" + animeId + "/" + (page > 1 ? "?p=" + page : "");
    const body = "_token=" + encodeURIComponent(token || "");
    let text;
    try {
      text = await postText(url, body, referer, token);
    } catch (e) {
      log("ajax episodes", page, e && e.message);
      break;
    }
    let data;
    try {
      data = JSON.parse(text);
    } catch (_) {
      break;
    }
    const list = data.data || [];
    lastPage = data.last_page || 1;
    for (const ep of list) {
      const num = ep.number != null ? parseInt(String(ep.number), 10) : NaN;
      if (!num || seenNum.has(num)) continue;
      seenNum.add(num);
      out.push({
        season: 1,
        number: num,
        ref: "ep:" + slug + ":" + num,
        title: cleanTitle(ep.title || "Episodio " + num),
        still: ep.image ? videoThumb(ep.image) : undefined,
      });
    }
    if (!list.length || page >= lastPage) break;
    page++;
  }
  out.sort((a, b) => a.number - b.number);
  return out;
}

export async function episodes(ref) {
  const slug = seriesSlug(ref);
  if (!slug) throw new Error("serie inválida");

  const seriesUrl = BASE + "/" + slug + "/";
  const html = await fetchHtml(seriesUrl);

  const titleM =
    html.match(/<h3[^>]*>([^<]+)/i) ||
    html.match(/property="og:title"\s+content="([^"]+)"/i);
  const ogImg = html.match(/property="og:image"\s+content="([^"]+)"/i);
  const overviewM = html.match(/<p class="scroll">([\s\S]*?)<\/p>/i);

  const seriesInfo = {
    title: cleanTitle(titleM ? titleM[1] : slug.replace(/-/g, " ")),
    poster: ogImg && isSeriesPosterUrl(ogImg[1]) ? ogImg[1] : seriesPoster(slug),
    overview: overviewM ? cleanTitle(overviewM[1]).slice(0, 500) : undefined,
  };

  const animeId =
    (html.match(/data-anime=["'](\d+)["']/) || [])[1] ||
    (html.match(/ajax\/episodes\/(\d+)/) || [])[1];

  let list = [];
  if (animeId) {
    list = await loadEpisodeList(animeId, slug, csrfFrom(html), seriesUrl);
  }

  if (!list.length) {
    const seen = new Set();
    const re = new RegExp(
      "href=[\"'](?:https://hentaijk\\.com)?/" +
        slug.replace(/[.*+?^${}()|[\\]\\]/g, "\\$&") +
        "/(\\d+)/?[\"']",
      "gi"
    );
    let m;
    while ((m = re.exec(html)) !== null) {
      const num = parseInt(m[1], 10);
      if (!num || seen.has(num)) continue;
      seen.add(num);
      list.push({
        season: 1,
        number: num,
        ref: "ep:" + slug + ":" + num,
        title: "Episodio " + num,
      });
    }
    list.sort((a, b) => a.number - b.number);
  }

  if (!list.length) {
    list = [
      {
        season: 1,
        number: 1,
        ref: "ep:" + slug + ":1",
        title: "Episodio 1",
      },
    ];
  }

  log("episodes", slug, list.length);
  return { series: seriesInfo, episodes: list };
}

function parseServers(html) {
  const servers = [];
  const re =
    /<a[^>]+class="[^"]*\bservers\b[^"]*"[^>]*href=["']#option\d+["'][^>]*>([^<]+)<\/a>/gi;
  const names = [];
  let m;
  while ((m = re.exec(html)) !== null) {
    const name = m[1].trim();
    if (!name || name.indexOf("+") >= 0 || /val\./i.test(name)) continue;
    names.push(name);
  }
  const iframes = [];
  const reI =
    /src=["'](https:\/\/hentaijk\.com\/jkplayer\/[a-z0-9]+[^"']*)["']/gi;
  while ((m = reI.exec(html)) !== null) {
    const u = m[1].replace(/&amp;/g, "&");
    if (/jkplayer\/c1\?u=['"]?$/i.test(u) || /jkplayer\/c1\?u=$/i.test(u))
      continue;
    if (iframes.indexOf(u) < 0) iframes.push(u);
  }
  for (let i = 0; i < iframes.length; i++) {
    const url = iframes[i];
    const pathM = url.match(/jkplayer\/([a-z0-9]+)/i);
    let label =
      names[i] || (pathM ? pathM[1].toUpperCase() : "Servidor " + (i + 1));
    if (label.indexOf("+") >= 0)
      label = pathM ? pathM[1].toUpperCase() : "Servidor " + (i + 1);
    servers.push({ label: label, playerUrl: url });
  }
  return servers;
}

/** Orden: preferido → Magi → Sabrosio → resto (Magi suele ser el más rápido) */
function orderServers(servers, pref) {
  const score = (label) => {
    const l = label.toLowerCase();
    if (pref && pref !== "auto" && l.indexOf(pref) >= 0) return 0;
    if (/magi/i.test(l)) return 1;
    if (/sabrosio/i.test(l)) return 2;
    if (/^um$/i.test(l) || /\bum\b/i.test(l)) return 3;
    if (/umv/i.test(l)) return 4;
    return 5;
  };
  return servers.slice().sort((a, b) => score(a.label) - score(b.label));
}

async function streamFromPlayer(playerUrl) {
  const html = await fetchHtml(playerUrl);
  const urls = [];
  const re = /(https?:\/\/[^"'\s<>\\]+\.(?:m3u8|mp4)[^"'\s<>\\]*)/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    let u = m[1]
      .replace(/\\u0026/g, "&")
      .replace(/\\\//g, "/")
      .replace(/\\/g, "");
    if (/^https?:\/\//i.test(u) && urls.indexOf(u) < 0) urls.push(u);
  }
  const re2 = /["']file["']\s*:\s*["']([^"']+)["']/gi;
  while ((m = re2.exec(html)) !== null) {
    let u = m[1].replace(/\\u0026/g, "&");
    if (/^https?:\/\//i.test(u) && urls.indexOf(u) < 0) urls.push(u);
  }
  const re3 = /<(?:source|video)[^>]+src=["'](https?:\/\/[^"']+)["']/gi;
  while ((m = re3.exec(html)) !== null) {
    if (urls.indexOf(m[1]) < 0) urls.push(m[1]);
  }
  return urls;
}

export async function resolve(ref) {
  let slug = "";
  let num = "";
  const s = String(ref || "");
  if (s.startsWith("ep:")) {
    const parts = s.split(":");
    slug = parts[1] || "";
    num = parts[2] || "";
  } else if (s.indexOf("/") >= 0) {
    const p = s.replace(/^\/+/, "").split("/");
    slug = p[0];
    num = p[1] || "1";
  } else if (s.startsWith("series:")) {
    throw new Error("elige un episodio de la lista");
  } else {
    slug = s;
    num = "1";
  }
  if (!slug || !num) throw new Error("ref de episodio inválido");

  const pageUrl = BASE + "/" + slug + "/" + num;
  const html = await fetchHtml(pageUrl);
  let servers = parseServers(html);
  servers = orderServers(servers, preferredServer());
  log("resolve servers", servers.map((x) => x.label).join(", ") || "(ninguno)");

  if (!servers.length) throw new Error("sin servidores en el episodio");

  const streams = [];
  const tried = new Set();
  for (const srv of servers) {
    if (tried.has(srv.playerUrl)) continue;
    tried.add(srv.playerUrl);
    try {
      const urls = await streamFromPlayer(srv.playerUrl);
      for (const u of urls) {
        streams.push({
          url: u,
          mime: /\.m3u8/i.test(u) ? "application/x-mpegURL" : "video/mp4",
          label: srv.label,
        });
      }
      if (urls.length) break;
    } catch (e) {
      log("player", srv.label, e && e.message);
    }
  }

  if (!streams.length) {
    for (const srv of servers) {
      try {
        const urls = await streamFromPlayer(srv.playerUrl);
        for (const u of urls) {
          streams.push({
            url: u,
            mime: /\.m3u8/i.test(u) ? "application/x-mpegURL" : "video/mp4",
            label: srv.label,
          });
        }
        if (streams.length) break;
      } catch (_) {}
    }
  }

  if (!streams.length) throw new Error("sin fuentes de vídeo");

  const headers = {
    Referer: BASE + "/",
    "User-Agent":
      "Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36",
  };

  const primary = streams[0];
  const result = {
    url: primary.url,
    mime: primary.mime,
    headers: headers,
    label: primary.label,
  };

  const alts = [];
  for (let i = 1; i < streams.length && alts.length < 4; i++) {
    alts.push({
      url: streams[i].url,
      mime: streams[i].mime,
      label: streams[i].label,
      headers: headers,
    });
  }
  for (const srv of servers) {
    if (alts.length >= 6) break;
    if (srv.label === primary.label) continue;
    try {
      const urls = await streamFromPlayer(srv.playerUrl);
      if (urls[0]) {
        alts.push({
          url: urls[0],
          mime: /\.m3u8/i.test(urls[0])
            ? "application/x-mpegURL"
            : "video/mp4",
          label: srv.label,
          headers: headers,
        });
      }
    } catch (_) {}
  }
  if (alts.length) result.alternatives = alts;
  return result;
}
