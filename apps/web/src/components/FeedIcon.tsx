import { useState } from 'react';
import { Rss } from 'lucide-react';
import { safeUrl } from '@daily-signal/client';
import type { Feed } from '@daily-signal/domain';

export function feedIconUrl(feed: Pick<Feed, 'siteUrl' | 'url'>) {
  const website = safeUrl(feed.siteUrl) ?? safeUrl(feed.url);
  return website ? new URL('/favicon.ico', website).href : undefined;
}

export function FeedIcon({ src }: { src?: string }) {
  const [failedSrc, setFailedSrc] = useState<string>();
  if (!src || failedSrc === src) return <Rss size={20} aria-hidden="true" />;

  return (
    <img
      key={src}
      src={src}
      alt=""
      width={20}
      height={20}
      className="size-5 object-contain"
      loading="lazy"
      decoding="async"
      referrerPolicy="no-referrer"
      onError={() => setFailedSrc(src)}
    />
  );
}
