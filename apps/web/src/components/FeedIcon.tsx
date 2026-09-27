import { useState } from 'react';
import { Rss } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { feedIconQueryOptions } from '@daily-signal/client/query';
import type { Feed } from '@daily-signal/domain';

export function CachedFeedIcon({ feed }: { feed: Pick<Feed, 'id' | 'siteUrl' | 'url'> }) {
  const { data } = useQuery(feedIconQueryOptions(feed));
  return <FeedIcon src={data ?? undefined} />;
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
