import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, waitFor, within } from 'storybook/test';
import { Button } from './button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from './dialog';

const meta = {
  title: 'UI/Dialog',
  component: Dialog,
  render: () => (
    <Dialog>
      <DialogTrigger asChild>
        <Button>删除订阅源</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>删除这个订阅源？</DialogTitle>
          <DialogDescription>已缓存文章将被删除，归档日报仍会保留。</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">保留订阅</Button>
          </DialogClose>
          <DialogClose asChild>
            <Button variant="destructive">确认删除</Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  ),
} satisfies Meta<typeof Dialog>;

export default meta;
type Story = StoryObj<typeof meta>;

export const KeyboardDismissal: Story = {
  play: async ({ canvasElement, userEvent }) => {
    const canvas = within(canvasElement);
    const page = within(canvasElement.ownerDocument.body);
    const trigger = canvas.getByRole('button', { name: '删除订阅源' });
    await userEvent.click(trigger);
    const dialog = await page.findByRole('dialog', { name: '删除这个订阅源？' });
    const cancel = within(dialog).getByRole('button', { name: '保留订阅' });
    await expect(cancel).toHaveFocus();
    await userEvent.tab({ shift: true });
    await expect(within(dialog).getByRole('button', { name: 'Close' })).toHaveFocus();
    await userEvent.tab();
    await expect(cancel).toHaveFocus();
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(dialog).not.toBeInTheDocument());
    await waitFor(() => expect(trigger).toHaveFocus());
  },
};

export const Open: Story = {
  play: async ({ canvasElement, userEvent }) => {
    await userEvent.click(within(canvasElement).getByRole('button', { name: '删除订阅源' }));
    await waitFor(() =>
      expect(within(canvasElement.ownerDocument.body).getByRole('dialog')).toBeVisible(),
    );
  },
};
