import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { expect, waitFor, within } from 'storybook/test';
import { feedIconQueryOptions } from '@daily-signal/client/query';
import { Button } from '@daily-signal/ui/button';
import { CachedFeedIcon, FeedIcon } from './FeedIcon';

const websiteIcon = `data:image/svg+xml,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32"><rect width="32" height="32" rx="6" fill="#2563eb"/><path d="m8 16 6 6 10-12" fill="none" stroke="white" stroke-width="3"/></svg>',
)}`;

const meta = {
  title: 'Components/Feed Icon',
  component: FeedIcon,
  decorators: [
    (Story) => (
      <div className="inline-flex min-h-10.75 min-w-10.75 items-center justify-center gap-3 rounded-[9px] bg-[#f4ecdf] p-2 text-[#b07848]">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof FeedIcon>;

export default meta;
type Story = StoryObj<typeof meta>;

export const WebsiteIcon: Story = {
  args: { src: websiteIcon },
  play: async ({ canvasElement }) => {
    await waitFor(() => expect(canvasElement.querySelector('img')?.naturalWidth).toBe(32));
  },
};
export const UnavailableIcon: Story = {
  args: { src: 'data:image/png;base64,invalid' },
  play: async ({ canvasElement }) => {
    await waitFor(() => expect(canvasElement.querySelector('img')).toBeNull());
    await expect(canvasElement.querySelector('svg')).toBeVisible();
  },
};
export const MissingWebsite: Story = {};

export const CachedWebsite: Story = {
  render: function CachedWebsiteFixture() {
    const feed = {
      id: 'cached-feed',
      siteUrl: 'https://example.com',
      url: 'https://example.com/rss',
    };
    const [client] = useState(() => {
      const queryClient = new QueryClient();
      queryClient.setQueryData(feedIconQueryOptions(feed).queryKey, websiteIcon);
      return queryClient;
    });
    const [visible, setVisible] = useState(true);
    return (
      <QueryClientProvider client={client}>
        <Button type="button" onClick={() => setVisible(!visible)}>
          切换图标
        </Button>
        {visible && <CachedFeedIcon feed={feed} />}
      </QueryClientProvider>
    );
  },
  play: async ({ canvasElement, userEvent }) => {
    const canvas = within(canvasElement);
    await waitFor(() => expect(canvasElement.querySelector('img')?.naturalWidth).toBe(32));
    await userEvent.click(canvas.getByRole('button', { name: '切换图标' }));
    await expect(canvasElement.querySelector('img')).toBeNull();
    await userEvent.click(canvas.getByRole('button', { name: '切换图标' }));
    await waitFor(() => expect(canvasElement.querySelector('img')?.naturalWidth).toBe(32));
    await expect(canvasElement.querySelector('img')).toHaveAttribute('src', websiteIcon);
  },
};
