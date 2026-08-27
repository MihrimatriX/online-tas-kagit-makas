export const DEFAULT_TITLE = "RPS Arena — Online Taş Kağıt Makas Turnuvası";
export const DEFAULT_DESCRIPTION =
  "Gerçek zamanlı, eleme usulü taş kağıt makas turnuvası. Lobi kur, koda katıl, rakibini yen, şampiyon ol.";

export interface SeoLobby {
  code: string;
  name: string;
  playerCount: number;
}

export interface SeoTags {
  title: string;
  description: string;
  url: string;
  image: string;
  robots: string;
  jsonLd: Record<string, unknown>;
}

export function resolvePublicOrigin(input: {
  publicOrigin?: string;
  forwardedProto?: string;
  forwardedHost?: string;
  protocol?: string;
  host?: string;
}): string {
  const configured = input.publicOrigin?.trim().replace(/\/+$/, "");
  if (configured) return configured;
  const proto = firstHeader(input.forwardedProto) || input.protocol || "http";
  const host = firstHeader(input.forwardedHost) || firstHeader(input.host) || "localhost";
  return `${proto}://${host}`;
}

export function seoForRequest(input: {
  path: string;
  code?: string;
  overlay?: boolean;
  origin: string;
  lobby?: SeoLobby | null;
}): SeoTags {
  const origin = input.origin.replace(/\/+$/, "");
  const code = input.code?.trim().toUpperCase() || "";
  const image = `${origin}/og.png`;
  const overlay = input.overlay ?? /^\/overlay\/[^/]+$/i.test(input.path);
  const lobby = input.lobby;

  let title = DEFAULT_TITLE;
  let description = DEFAULT_DESCRIPTION;
  let url = `${origin}/`;
  let robots = "index, follow";

  if (overlay && code) {
    title = `Yayın ${code} — RPS Arena`;
    description = `${lobby?.name ?? "RPS Arena"} yayın overlay. OBS veya tarayıcıda aç.`;
    url = `${origin}/overlay/${code}`;
    robots = "noindex, nofollow";
  } else if (code) {
    url = `${origin}/?code=${encodeURIComponent(code)}`;
    if (lobby) {
      title = `${lobby.name} · ${code} — RPS Arena`;
      description = `${lobby.playerCount} oyuncu · ${lobby.name} lobisine katıl. Kod: ${code}`;
    } else {
      title = `Lobi ${code} — RPS Arena`;
      description = `RPS Arena lobisine davetlisin. Kod: ${code}`;
    }
  }

  return {
    title,
    description,
    url,
    image,
    robots,
    jsonLd: {
      "@context": "https://schema.org",
      "@type": "WebApplication",
      name: "RPS Arena",
      alternateName: "Online Taş Kağıt Makas Turnuvası",
      url: origin + "/",
      description,
      applicationCategory: "GameApplication",
      operatingSystem: "Web browser",
      inLanguage: "tr",
      image,
      offers: { "@type": "Offer", price: "0", priceCurrency: "TRY" }
    }
  };
}

export function injectSeo(html: string, page: SeoTags): string {
  let next = html.replace(
    /<title data-seo="title">[\s\S]*?<\/title>/,
    `<title data-seo="title">${escapeHtml(page.title)}</title>`
  );

  const values: Record<string, string> = {
    description: page.description,
    robots: page.robots,
    canonical: page.url,
    "og:title": page.title,
    "og:description": page.description,
    "og:url": page.url,
    "og:image": page.image,
    "twitter:title": page.title,
    "twitter:description": page.description,
    "twitter:image": page.image
  };

  for (const [key, value] of Object.entries(values)) {
    const attr = key === "canonical" ? "href" : "content";
    const re = new RegExp(`(data-seo="${key}"[^>]*?\\s${attr}=")[^"]*(")`);
    next = next.replace(re, `$1${escapeAttr(value)}$2`);
  }

  next = next.replace(
    /(<script type="application\/ld\+json" data-seo="jsonld">)[\s\S]*?(<\/script>)/,
    `$1${JSON.stringify(page.jsonLd)}$2`
  );

  return next;
}

function firstHeader(value?: string) {
  return value?.split(",")[0]?.trim() || "";
}

function escapeHtml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function escapeAttr(value: string) {
  return escapeHtml(value).replace(/"/g, "&quot;");
}
