import type { Preview } from '@storybook/react-vite';
import { Provider } from 'jotai';
import '../src/styles.css';

const preview: Preview = {
  tags: ['autodocs'],
  parameters: {
    layout: 'fullscreen',
    a11y: { test: 'error' },
    controls: { matchers: { color: /(background|color)$/i, date: /Date$/i } },
  },
  decorators: [
    (Story) => (
      <Provider>
        <main style={{ maxWidth: 1200, margin: '0 auto', padding: 24 }}>
          <Story />
        </main>
      </Provider>
    ),
  ],
};

export default preview;
