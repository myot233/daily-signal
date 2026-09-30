import { useState } from 'react';
import type { ComponentProps } from 'react';
import { Link, MemoryRouter, Route, Routes } from 'react-router';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, within } from 'storybook/test';
import { settingsSchema } from '@daily-signal/domain';
import { providerConnectionSchema } from '@daily-signal/domain/providers/schemas';
import type { Notice, Perform } from '@daily-signal/client';
import { createAppState } from '../stories/fixtures';
import { GeneralSettingsView } from './GeneralSettingsView';

type Props = ComponentProps<typeof GeneralSettingsView>;
const createdAt = '2026-09-27T08:00:00.000Z';
const providerId = '11111111-1111-4111-8111-111111111111';
const modelId = '22222222-2222-4222-8222-222222222222';
const readyState = createAppState({
  defaultProviderModelId: modelId,
  hasApiKey: true,
  providers: [
    providerConnectionSchema.parse({
      id: providerId,
      presetId: 'openai',
      name: '默认连接',
      protocol: 'openai-responses',
      baseUrl: 'https://api.example.com/v1',
      enabled: true,
      options: {},
      revision: 1,
      createdAt,
      updatedAt: createdAt,
      hasCredential: true,
      checks: [],
      models: [
        {
          id: modelId,
          providerId,
          modelId: 'example-model',
          displayName: null,
          enabled: true,
          capabilities: {},
          options: {},
          source: 'manual',
          createdAt,
          updatedAt: createdAt,
        },
      ],
    }),
  ],
});

function SettingsHarness(props: Props) {
  const [settings, setSettings] = useState(props.state.settings);
  const [notice, setNotice] = useState<Notice | null>(null);
  const perform: Perform = async (label, action, success) => {
    setNotice(null);
    try {
      const completed = await props.perform(label, action, success);
      if (completed && success) setNotice({ kind: 'success', message: success });
      return completed;
    } catch (error) {
      setNotice({ kind: 'error', message: error instanceof Error ? error.message : '保存失败。' });
      return false;
    }
  };
  return (
    <MemoryRouter initialEntries={['/settings']}>
      <Routes>
        <Route
          path="/settings"
          element={
            <GeneralSettingsView
              {...props}
              state={{ ...props.state, settings }}
              perform={perform}
              saveAutomation={async (value) => {
                const saved = await props.saveAutomation(value);
                setSettings(saved);
                return saved;
              }}
            />
          }
        />
        <Route
          path="/settings/providers"
          element={
            <>
              <h1>模型配置</h1>
              <Link to="/settings">返回设置</Link>
            </>
          }
        />
      </Routes>
      {notice && <p role={notice.kind === 'error' ? 'alert' : 'status'}>{notice.message}</p>}
    </MemoryRouter>
  );
}

const meta = {
  title: 'Views/GeneralSettingsView',
  component: GeneralSettingsView,
  args: {
    state: readyState,
    busy: null,
    notify: fn<Props['notify']>(),
    perform: fn<Perform>(async (_label, action) => {
      await action();
      return true;
    }),
    saveAutomation: fn<Props['saveAutomation']>(async (value) =>
      settingsSchema.parse({ ...readyState.settings, ...value }),
    ),
  },
  render: (args) => <SettingsHarness {...args} />,
} satisfies Meta<typeof GeneralSettingsView>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('combobox', { name: '刷新频率' })).toHaveValue('0');
    await expect(canvas.getByRole('checkbox', { name: '每天自动生成日报' })).not.toBeChecked();
    await expect(canvas.getByLabelText('自动生成时间')).toBeDisabled();
    await expect(canvas.getByRole('button', { name: '保存设置' })).toBeDisabled();
  },
};

export const SaveAndDiscard: Story = {
  play: async ({ canvasElement, args, userEvent }) => {
    const canvas = within(canvasElement);
    const interval = canvas.getByRole('combobox', { name: '刷新频率' });
    await userEvent.selectOptions(interval, '30');
    await userEvent.click(canvas.getByRole('checkbox', { name: '每天自动生成日报' }));
    const time = canvas.getByLabelText('自动生成时间');
    await userEvent.clear(time);
    await userEvent.type(time, '21:30');
    await userEvent.click(canvas.getByRole('button', { name: '保存设置' }));
    await expect(await canvas.findByRole('status')).toHaveTextContent('设置已保存');
    await expect(args.saveAutomation).toHaveBeenCalledWith({
      autoDigest: { enabled: true, time: '21:30' },
      feedRefresh: { intervalMinutes: 30 },
    });
    await expect(canvas.getByRole('button', { name: '保存设置' })).toBeDisabled();
    await userEvent.selectOptions(interval, '60');
    await userEvent.click(canvas.getByRole('button', { name: '放弃修改' }));
    await expect(interval).toHaveValue('30');
    await expect(time).toHaveValue('21:30');
  },
};

export const MissingModel: Story = {
  args: { state: createAppState() },
  play: async ({ canvasElement, userEvent }) => {
    const canvas = within(canvasElement);
    await userEvent.selectOptions(canvas.getByRole('combobox', { name: '刷新频率' }), '60');
    await expect(canvas.getByRole('button', { name: '保存设置' })).toBeEnabled();
    await userEvent.click(canvas.getByRole('checkbox', { name: '每天自动生成日报' }));
    await expect(canvas.getByRole('alert')).toHaveTextContent('保存了 API Key');
    await expect(canvas.getByRole('button', { name: '保存设置' })).toBeDisabled();
    await userEvent.click(canvas.getByRole('link', { name: /管理模型与服务商/ }));
    await expect(canvas.getByRole('heading', { name: '模型配置' })).toBeVisible();
    await userEvent.click(canvas.getByRole('link', { name: '返回设置' }));
    await expect(canvas.getByRole('combobox', { name: '刷新频率' })).toHaveValue('60');
    await expect(canvas.getByRole('checkbox', { name: '每天自动生成日报' })).toBeChecked();
  },
};

export const RejectedSaveKeepsDraft: Story = {
  args: {
    saveAutomation: fn<Props['saveAutomation']>(async () => {
      throw new Error('设置保存失败，请重试。');
    }),
  },
  play: async ({ canvasElement, userEvent }) => {
    const canvas = within(canvasElement);
    await userEvent.selectOptions(canvas.getByRole('combobox', { name: '刷新频率' }), '15');
    await userEvent.click(canvas.getByRole('button', { name: '保存设置' }));
    await expect(await canvas.findByRole('alert')).toHaveTextContent('设置保存失败');
    await expect(canvas.getByRole('combobox', { name: '刷新频率' })).toHaveValue('15');
    await expect(canvas.getByRole('button', { name: '保存设置' })).toBeEnabled();
  },
};

export const InvalidTimeCanBeDiscardedOrDisabled: Story = {
  play: async ({ canvasElement, userEvent }) => {
    const canvas = within(canvasElement);
    await userEvent.selectOptions(canvas.getByRole('combobox', { name: '刷新频率' }), '30');
    const enabled = canvas.getByRole('checkbox', { name: '每天自动生成日报' });
    await userEvent.click(enabled);
    await userEvent.clear(canvas.getByLabelText('自动生成时间'));
    await expect(canvas.getByRole('alert')).toHaveTextContent('有效的自动生成时间');
    await expect(canvas.getByRole('button', { name: '保存设置' })).toBeDisabled();
    await userEvent.click(enabled);
    await expect(canvas.getByLabelText('自动生成时间')).toHaveValue('20:00');
    await expect(canvas.getByRole('button', { name: '保存设置' })).toBeEnabled();
  },
};

export const Busy: Story = {
  args: { busy: '保存设置' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('combobox', { name: '刷新频率' })).toBeDisabled();
    await expect(canvas.getByRole('checkbox', { name: '每天自动生成日报' })).toBeDisabled();
    await expect(canvas.getByRole('button', { name: '保存设置' })).toBeDisabled();
  },
};
