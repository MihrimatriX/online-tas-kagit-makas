const DEFAULT_TITLE = "RPS Arena — Online Taş Kağıt Makas Turnuvası";
const DEFAULT_DESCRIPTION =
  "Gerçek zamanlı, eleme usulü taş kağıt makas turnuvası. Lobi kur, koda katıl, rakibini yen, şampiyon ol.";

export function applyClientSeo(input: {
  title?: string;
  description?: string;
  url?: string;
  robots?: string;
}) {
  const title = input.title ?? DEFAULT_TITLE;
  const description = input.description ?? DEFAULT_DESCRIPTION;
  const url = input.url ?? window.location.href;
  const robots = input.robots ?? "index, follow";

  setSeo("title", title);
  setSeo("description", description);
  setSeo("robots", robots);
  setSeo("canonical", url);
  setSeo("og:title", title);
  setSeo("og:description", description);
  setSeo("og:url", url);
  setSeo("twitter:title", title);
  setSeo("twitter:description", description);
}

function setSeo(key: string, value: string) {
  const el = document.querySelector(`[data-seo="${key}"]`);
  if (!el) return;
  if (el.tagName === "TITLE") {
    document.title = value;
    el.textContent = value;
    return;
  }
  if (el.hasAttribute("href")) el.setAttribute("href", value);
  else el.setAttribute("content", value);
}
