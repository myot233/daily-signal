import { Waypoints } from 'lucide-react';

const icons: Record<string, string> = {
  openai: new URL('../../docs/assets/providers/openai.svg', import.meta.url).href,
  deepseek: new URL('../../docs/assets/providers/deepseek-color.svg', import.meta.url).href,
  anthropic: new URL('../../docs/assets/providers/anthropic.svg', import.meta.url).href,
  gemini: new URL('../../docs/assets/providers/gemini-color.svg', import.meta.url).href,
  bailian: new URL('../../docs/assets/providers/bailian-color.svg', import.meta.url).href,
  moonshot: new URL('../../docs/assets/providers/moonshot.svg', import.meta.url).href,
  zhipu: new URL('../../docs/assets/providers/zhipu-color.svg', import.meta.url).href,
  siliconflow: new URL('../../docs/assets/providers/siliconcloud-color.svg', import.meta.url).href,
  openrouter: new URL('../../docs/assets/providers/openrouter.svg', import.meta.url).href,
};

export function ProviderIcon({ presetId, size = 24 }: { presetId: string; size?: number }) {
  const source = icons[presetId];
  if (!source)
    return <Waypoints aria-hidden="true" style={{ width: size, height: size }} strokeWidth={1.6} />;
  return <img src={source} alt="" width={size} height={size} className="object-contain" />;
}
