import type { Meta, StoryObj } from '@storybook/react-vite';
import { FeedIcon } from './FeedIcon';

const websiteIcon = `data:image/svg+xml,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32"><rect width="32" height="32" rx="6" fill="#2563eb"/><path d="m8 16 6 6 10-12" fill="none" stroke="white" stroke-width="3"/></svg>',
)}`;

const meta = {
  title: 'Components/Feed Icon',
  component: FeedIcon,
  decorators: [
    (Story) => (
      <div className="grid size-10.75 place-items-center rounded-[9px] bg-[#f4ecdf] text-[#b07848]">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof FeedIcon>;

export default meta;
type Story = StoryObj<typeof meta>;

export const WebsiteIcon: Story = { args: { src: websiteIcon } };
export const UnavailableIcon: Story = { args: { src: 'data:image/png;base64,invalid' } };
export const MissingWebsite: Story = {};
