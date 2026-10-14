import { SITE, TIERS } from '../config/site';

const abs = (path: string) => new URL(path, SITE.url).toString();

export const ORG_ID = `${SITE.url}/#org`;
export const SITE_ID = `${SITE.url}/#site`;
export const APP_ID = `${SITE.url}/#software`;

export function orgNode() {
  return {
    '@type': 'Organization',
    '@id': ORG_ID,
    name: SITE.name,
    url: SITE.url,
    logo: abs('/brand/floorlogic-lockup-stacked.svg'),
    telephone: '+1-775-237-8898',
    email: SITE.email,
    address: { '@type': 'PostalAddress', addressLocality: SITE.locality, addressRegion: SITE.region, addressCountry: SITE.country },
    parentOrganization: { '@type': 'Organization', name: SITE.maker.name, url: SITE.maker.url },
  };
}

export function websiteNode() {
  return { '@type': 'WebSite', '@id': SITE_ID, url: SITE.url, name: SITE.name, publisher: { '@id': ORG_ID }, inLanguage: 'en-US' };
}

export function softwareNode() {
  return {
    '@type': 'SoftwareApplication',
    '@id': APP_ID,
    name: SITE.name,
    applicationCategory: 'BusinessApplication',
    applicationSubCategory: 'Flooring business management software',
    operatingSystem: 'Web browser',
    url: SITE.url,
    publisher: { '@id': ORG_ID },
    isAccessibleForFree: false,
    offers: TIERS.map((t) => ({
      '@type': 'Offer',
      name: `${t.name} — monthly`,
      price: String(t.monthly),
      priceCurrency: 'USD',
      url: abs('/pricing'),
      category: 'subscription',
      priceSpecification: { '@type': 'UnitPriceSpecification', price: String(t.monthly), priceCurrency: 'USD', unitCode: 'MON', referenceQuantity: { '@type': 'QuantitativeValue', value: 1, unitCode: 'MON' } },
    })),
  };
}

export function webPageNode(opts: { path: string; title: string; description: string; type?: string }) {
  return {
    '@type': opts.type ?? 'WebPage',
    '@id': `${abs(opts.path)}#page`,
    url: abs(opts.path),
    name: opts.title,
    description: opts.description,
    isPartOf: { '@id': SITE_ID },
    about: { '@id': APP_ID },
    inLanguage: 'en-US',
  };
}

export function breadcrumbNode(path: string, items: { name: string; path: string }[]) {
  return {
    '@type': 'BreadcrumbList',
    '@id': `${abs(path)}#breadcrumb`,
    itemListElement: items.map((it, i) => ({ '@type': 'ListItem', position: i + 1, name: it.name, item: abs(it.path) })),
  };
}

export function faqNode(path: string, faqs: { q: string; a: string }[]) {
  return {
    '@type': 'FAQPage',
    '@id': `${abs(path)}#faq`,
    mainEntity: faqs.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })),
  };
}

export function videoNode(path: string) {
  return {
    '@type': 'VideoObject',
    '@id': `${abs(path)}#demo-video`,
    name: 'FloorLogic in 45 seconds',
    description: 'A lead, a quote, a customer approval, a work order and a payment — done in the real FloorLogic app with sample data.',
    thumbnailUrl: abs('/video/floorlogic-demo-poster.jpg'),
    contentUrl: abs('/video/floorlogic-demo.mp4'),
    uploadDate: '2026-10-14',
    duration: 'PT45S',
    publisher: { '@id': ORG_ID },
  };
}

export function graph(nodes: unknown[]) {
  return JSON.stringify({ '@context': 'https://schema.org', '@graph': nodes });
}
