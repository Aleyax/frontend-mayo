import { DOCUMENT } from '@angular/common';
import { Injectable, REQUEST, inject } from '@angular/core';
import { Meta, Title } from '@angular/platform-browser';

export interface SeoPageConfig {
  title: string;
  description: string;
  path?: string;
  image?: string | null;
  robots?: string;
  type?: string;
  keywords?: string;
}

@Injectable({ providedIn: 'root' })
export class SeoService {
  private readonly title = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);
  private readonly request = inject(REQUEST, { optional: true });
  private readonly jsonLdScriptId = 'app-seo-jsonld';

  setPage(config: SeoPageConfig): void {
    const title = this.normalizeText(config.title);
    const description = this.normalizeText(config.description);
    const canonicalUrl = this.buildAbsoluteUrl(config.path);
    const imageUrl = this.buildAbsoluteUrl(config.image);
    const currentUrl = canonicalUrl ?? this.buildAbsoluteUrl();
    const robots = config.robots ?? 'index,follow';
    const type = config.type ?? 'website';

    this.title.setTitle(title);
    this.upsertMetaByName('description', description);
    this.upsertMetaByName('robots', robots);

    if (config.keywords?.trim()) {
      this.upsertMetaByName('keywords', config.keywords.trim());
    } else {
      this.removeMetaByName('keywords');
    }

    this.upsertMetaByProperty('og:title', title);
    this.upsertMetaByProperty('og:description', description);
    this.upsertMetaByProperty('og:type', type);
    this.upsertMetaByProperty('og:site_name', 'Marketplace mayorista');
    if (currentUrl) {
      this.upsertMetaByProperty('og:url', currentUrl);
    } else {
      this.removeMetaByProperty('og:url');
    }

    this.upsertMetaByName('twitter:card', imageUrl ? 'summary_large_image' : 'summary');
    this.upsertMetaByName('twitter:title', title);
    this.upsertMetaByName('twitter:description', description);

    if (imageUrl) {
      this.upsertMetaByProperty('og:image', imageUrl);
      this.upsertMetaByName('twitter:image', imageUrl);
    } else {
      this.removeMetaByProperty('og:image');
      this.removeMetaByName('twitter:image');
    }

    if (canonicalUrl) {
      this.setCanonical(canonicalUrl);
    }
  }

  setNoIndexPage(config: Omit<SeoPageConfig, 'robots'>): void {
    this.setPage({
      ...config,
      robots: 'noindex,nofollow',
    });
  }

  setJsonLd(payload: unknown): void {
    this.clearJsonLd();
    const head = this.document.head;
    if (!head) {
      return;
    }

    const script = this.document.createElement('script');
    script.type = 'application/ld+json';
    script.id = this.jsonLdScriptId;
    script.text = JSON.stringify(payload);
    head.appendChild(script);
  }

  clearJsonLd(): void {
    const existing = this.document.getElementById(this.jsonLdScriptId);
    existing?.remove();
  }

  buildAbsoluteUrl(pathOrUrl?: string | null): string | null {
    const value = String(pathOrUrl ?? '').trim();
    if (value) {
      if (/^https?:\/\//i.test(value)) {
        return value;
      }

      const origin = this.resolveOrigin();
      if (!origin) {
        return null;
      }

      const normalizedPath = value.startsWith('/') ? value : `/${value}`;
      return `${origin}${normalizedPath}`;
    }

    const origin = this.resolveOrigin();
    if (!origin) {
      return null;
    }

    const currentPath = this.resolveCurrentPath();
    return `${origin}${currentPath}`;
  }

  private setCanonical(url: string): void {
    const head = this.document.head;
    if (!head) {
      return;
    }

    let canonical = this.document.querySelector<HTMLLinkElement>("link[rel='canonical']");
    if (!canonical) {
      canonical = this.document.createElement('link');
      canonical.setAttribute('rel', 'canonical');
      head.appendChild(canonical);
    }

    canonical.setAttribute('href', url);
  }

  private resolveOrigin(): string | null {
    const requestHost =
      this.request?.headers.get('x-forwarded-host') ??
      this.request?.headers.get('host');
    const requestProto =
      this.request?.headers.get('x-forwarded-proto') ??
      (requestHost?.startsWith('localhost') ? 'http' : 'https');

    if (requestHost) {
      return `${requestProto}://${requestHost}`;
    }

    const locationOrigin = this.document.location?.origin;
    if (locationOrigin && locationOrigin !== 'null') {
      return locationOrigin;
    }

    return null;
  }

  private resolveCurrentPath(): string {
    const requestUrl = this.request?.url;
    if (requestUrl?.startsWith('/')) {
      return requestUrl;
    }

    if (requestUrl) {
      try {
        const parsedUrl = new URL(requestUrl);
        return `${parsedUrl.pathname}${parsedUrl.search}`;
      } catch {
        // Ignore parsing failures and fallback to DOM location.
      }
    }

    const path = this.document.location?.pathname ?? '/';
    const query = this.document.location?.search ?? '';
    return `${path}${query}`;
  }

  private upsertMetaByName(name: string, content: string): void {
    this.meta.updateTag({ name, content });
  }

  private upsertMetaByProperty(property: string, content: string): void {
    this.meta.updateTag({ property, content });
  }

  private removeMetaByName(name: string): void {
    this.meta.removeTag(`name='${name}'`);
  }

  private removeMetaByProperty(property: string): void {
    this.meta.removeTag(`property='${property}'`);
  }

  private normalizeText(value: string): string {
    return value.replace(/\s+/g, ' ').trim();
  }
}
