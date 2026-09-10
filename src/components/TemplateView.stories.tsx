import type { Meta, StoryObj } from '@storybook/react-vite';
import { useHydrateAtoms } from 'jotai/utils';
import { useState } from 'react';
import type { ComponentProps } from 'react';
import { expect, fn, within } from 'storybook/test';
import { settingsSchema } from '../../shared/types';
import type { Notice, Perform } from '../lib/client';
import { templateDraftAtom } from '../lib/state';
import { createAppState } from '../stories/fixtures';
import { TemplateView } from './TemplateView';

type TemplateProps = ComponentProps<typeof TemplateView>;

// The parent owns persisted settings and catches action failures, just as the app does.
// Keeping that boundary in memory also makes the default story safe to edit and save.
function TemplateHarness(props: TemplateProps) {
  const [settings, setSettings] = useState(props.state.settings);
  const [notice, setNotice] = useState<Notice | null>(null);

  const perform: Perform = async (label, action, success) => {
    setNotice(null);
    try {
      const completed = await props.perform(label, action, success);
      if (completed && success) setNotice({ kind: 'success', message: success });
      return completed;
    } catch (error) {
      const failure: Notice = {
        kind: 'error',
        message: error instanceof Error ? error.message : '模板保存失败。',
      };
      setNotice(failure);
      props.notify(failure);
      return false;
    }
  };

  return (
    <>
      <TemplateView
        {...props}
        state={{ ...props.state, settings }}
        perform={perform}
        saveSettings={async (update) => {
          const saved = await props.saveSettings(update);
          setSettings(saved);
          return saved;
        }}
      />
      {notice && <p role={notice.kind === 'error' ? 'alert' : 'status'}>{notice.message}</p>}
    </>
  );
}

const busyDraft = '# 尚未保存的草稿\n\n保留这段编辑。';

function BusyTemplate(props: TemplateProps) {
  useHydrateAtoms([[templateDraftAtom, busyDraft]]);
  return <TemplateHarness {...props} />;
}

const meta = {
  title: 'Views/TemplateView',
  component: TemplateView,
  args: {
    state: createAppState(),
    busy: null,
    notify: fn<TemplateProps['notify']>(),
    perform: fn<Perform>(async (_label, action) => {
      await action();
      return true;
    }),
    saveSettings: fn<TemplateProps['saveSettings']>(async (settings) =>
      settingsSchema.parse(settings),
    ),
  },
  render: (args) => <TemplateHarness {...args} />,
} satisfies Meta<typeof TemplateView>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('textbox', { name: '日报结构与写作要求' })).toHaveValue(
      args.state.settings.template,
    );
    await expect(canvas.getByText('已保存', { exact: true })).toBeVisible();
    await expect(canvas.getByRole('button', { name: '保存模板' })).toBeDisabled();
    await expect(canvas.getByRole('button', { name: '放弃修改' })).toBeDisabled();
  },
};

export const ConfigureAutomaticDigest: Story = {
  args: {
    state: createAppState({
      defaultProviderModelId: '00000000-0000-4000-8000-000000000002',
      hasApiKey: true,
    }),
    saveSettings: fn<TemplateProps['saveSettings']>(async (settings) =>
      settingsSchema.parse(settings),
    ),
  },
  play: async ({ canvasElement, args, userEvent }) => {
    const canvas = within(canvasElement);
    const enabled = canvas.getByRole('checkbox', { name: /每天自动生成/ });
    const time = canvas.getByLabelText('自动生成时间');
    await expect(enabled).not.toBeChecked();
    await expect(time).toHaveValue('20:00');

    await userEvent.click(enabled);
    await userEvent.clear(time);
    await userEvent.type(time, '21:30');
    await userEvent.click(canvas.getByRole('button', { name: '保存自动任务' }));

    await expect(await canvas.findByRole('status')).toHaveTextContent(
      '自动日报将在每天本地时间 21:30 生成。',
    );
    await expect(args.saveSettings).toHaveBeenCalledWith(
      expect.objectContaining({ autoDigest: { enabled: true, time: '21:30' } }),
    );
    await expect(enabled).toBeChecked();
  },
};

export const EditPreviewAndDiscard: Story = {
  play: async ({ canvasElement, args, userEvent }) => {
    const canvas = within(canvasElement);
    const editor = canvas.getByRole('textbox', { name: '日报结构与写作要求' });
    const draft = '# 工程观察\n\n## 今日重点\n\n- 保留原始来源\n- 区分事实与建议';
    await userEvent.clear(editor);
    await userEvent.type(editor, draft);
    await expect(canvas.getByText('有未保存的修改')).toBeVisible();
    await expect(canvas.getByRole('button', { name: '保存模板' })).toBeEnabled();

    await userEvent.click(canvas.getByRole('tab', { name: '排版预览' }));
    const preview = within(canvas.getByRole('tabpanel'));
    await expect(preview.getByRole('heading', { name: '工程观察', level: 1 })).toBeVisible();
    await expect(preview.getByRole('heading', { name: '今日重点', level: 2 })).toBeVisible();
    await expect(preview.getByRole('list')).toHaveTextContent('保留原始来源');
    await expect(preview.getByRole('list')).toHaveTextContent('区分事实与建议');
    await expect(args.saveSettings).not.toHaveBeenCalled();

    await userEvent.click(canvas.getByRole('tab', { name: '编辑模板' }));
    await expect(canvas.getByRole('textbox', { name: '日报结构与写作要求' })).toHaveValue(draft);
    await userEvent.click(canvas.getByRole('button', { name: '放弃修改' }));
    await expect(canvas.getByRole('textbox', { name: '日报结构与写作要求' })).toHaveValue(
      args.state.settings.template,
    );
    await expect(canvas.getByText('已保存', { exact: true })).toBeVisible();
    await expect(canvas.getByRole('button', { name: '保存模板' })).toBeDisabled();
  },
};

export const RestoreDefaultThenSave: Story = {
  play: async ({ canvasElement, args, userEvent }) => {
    const canvas = within(canvasElement);
    const editor = canvas.getByRole('textbox', { name: '日报结构与写作要求' });
    await userEvent.click(canvas.getByRole('button', { name: '恢复默认草稿' }));
    await expect(editor).toHaveValue(args.state.defaultTemplate);
    await expect(canvas.getByText('有未保存的修改')).toBeVisible();
    await expect(canvas.getByRole('button', { name: '恢复默认草稿' })).toBeDisabled();
    await expect(args.saveSettings).not.toHaveBeenCalled();

    // Discard must still return to the persisted custom template, not the default.
    await userEvent.click(canvas.getByRole('button', { name: '放弃修改' }));
    await expect(editor).toHaveValue(args.state.settings.template);
    await userEvent.click(canvas.getByRole('button', { name: '恢复默认草稿' }));
    await userEvent.click(canvas.getByRole('button', { name: '保存模板' }));
    await expect(await canvas.findByRole('status')).toHaveTextContent('模板已保存');
    await expect(editor).toHaveValue(args.state.defaultTemplate);
    await expect(canvas.getByText('已保存', { exact: true })).toBeVisible();

    await userEvent.type(editor, '\n\n临时修改');
    await userEvent.click(canvas.getByRole('button', { name: '放弃修改' }));
    await expect(editor).toHaveValue(args.state.defaultTemplate);
    await expect(canvas.getByRole('button', { name: '保存模板' })).toBeDisabled();
  },
};

export const SaveEditedTemplate: Story = {
  play: async ({ canvasElement, userEvent }) => {
    const canvas = within(canvasElement);
    const editor = canvas.getByRole('textbox', { name: '日报结构与写作要求' });
    const savedTemplate = '# 技术简报\n\n只总结有原始来源的变化。';
    await userEvent.clear(editor);
    await userEvent.type(editor, `${savedTemplate}\n\n`);
    await userEvent.click(canvas.getByRole('button', { name: '保存模板' }));
    await expect(await canvas.findByRole('status')).toHaveTextContent('模板已保存');
    await expect(editor).toHaveValue(savedTemplate);
    await expect(canvas.getByText('已保存', { exact: true })).toBeVisible();
    await expect(canvas.getByRole('button', { name: '保存模板' })).toBeDisabled();
    await expect(canvas.getByRole('button', { name: '放弃修改' })).toBeDisabled();

    await userEvent.type(editor, '\n\n尚未保存的新要求。');
    await userEvent.click(canvas.getByRole('button', { name: '放弃修改' }));
    await expect(editor).toHaveValue(savedTemplate);
    await userEvent.click(canvas.getByRole('tab', { name: '排版预览' }));
    await expect(canvas.getByRole('heading', { name: '技术简报', level: 1 })).toBeVisible();
    await expect(canvas.queryByText('尚未保存的新要求。', { exact: true })).not.toBeInTheDocument();
  },
};

export const RejectedSavePreservesDraft: Story = {
  args: {
    saveSettings: fn<TemplateProps['saveSettings']>(async () => {
      throw new Error('本地存储不可写，模板尚未保存。');
    }),
  },
  play: async ({ canvasElement, args, userEvent }) => {
    const canvas = within(canvasElement);
    const editor = canvas.getByRole('textbox', { name: '日报结构与写作要求' });
    const draft = '# 需要保留的草稿\n\n保存失败也不能丢失这段内容。';
    await userEvent.clear(editor);
    await userEvent.type(editor, draft);
    await userEvent.click(canvas.getByRole('button', { name: '保存模板' }));
    await expect(await canvas.findByRole('alert')).toHaveTextContent(
      '本地存储不可写，模板尚未保存。',
    );
    await expect(editor).toHaveValue(draft);
    await expect(canvas.getByText('有未保存的修改')).toBeVisible();
    await expect(canvas.getByRole('button', { name: '保存模板' })).toBeEnabled();
    await expect(canvas.queryByRole('status')).not.toBeInTheDocument();

    await userEvent.click(canvas.getByRole('tab', { name: '排版预览' }));
    await expect(canvas.getByRole('heading', { name: '需要保留的草稿', level: 1 })).toBeVisible();
    await userEvent.click(canvas.getByRole('tab', { name: '编辑模板' }));
    await userEvent.click(canvas.getByRole('button', { name: '放弃修改' }));
    await expect(canvas.getByRole('textbox', { name: '日报结构与写作要求' })).toHaveValue(
      args.state.settings.template,
    );
    await expect(canvas.getByText('已保存', { exact: true })).toBeVisible();
  },
};

export const BusyWithUnsavedDraft: Story = {
  args: { busy: '保存日报模板' },
  render: (args) => <BusyTemplate {...args} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const editor = canvas.getByRole('textbox', { name: '日报结构与写作要求' });
    await expect(editor).toHaveValue(busyDraft);
    await expect(editor).toBeDisabled();
    await expect(canvas.getByText('有未保存的修改')).toBeVisible();
    await expect(canvas.getByRole('button', { name: '恢复默认草稿' })).toBeDisabled();
    await expect(canvas.getByRole('button', { name: '放弃修改' })).toBeDisabled();
    await expect(canvas.getByRole('button', { name: '保存模板' })).toBeDisabled();
  },
};

export const BlankTemplateCannotSave: Story = {
  play: async ({ canvasElement, args, userEvent }) => {
    const canvas = within(canvasElement);
    const editor = canvas.getByRole('textbox', { name: '日报结构与写作要求' });
    await userEvent.clear(editor);
    await userEvent.type(editor, '   \n   ');
    await expect(canvas.getByText('有未保存的修改')).toBeVisible();
    await expect(canvas.getByRole('button', { name: '保存模板' })).toBeDisabled();
    await expect(canvas.getByRole('button', { name: '放弃修改' })).toBeEnabled();
    await expect(canvas.getByRole('button', { name: '恢复默认草稿' })).toBeEnabled();
    await userEvent.click(canvas.getByRole('tab', { name: '排版预览' }));
    await expect(canvas.getByText('输入 Markdown 模板后，在这里查看排版。')).toBeVisible();
    await expect(args.saveSettings).not.toHaveBeenCalled();
    await userEvent.click(canvas.getByRole('button', { name: '放弃修改' }));
    await userEvent.click(canvas.getByRole('tab', { name: '编辑模板' }));
    await expect(canvas.getByRole('textbox', { name: '日报结构与写作要求' })).toHaveValue(
      args.state.settings.template,
    );
  },
};
