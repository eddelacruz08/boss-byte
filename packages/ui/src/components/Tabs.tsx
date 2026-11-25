import { Tab, TabGroup, TabList, TabPanel, TabPanels } from '@headlessui/react';
import type { ReactNode } from 'react';
import { cn } from '../lib/cn';

export interface TabItem {
  label: string;
  content: ReactNode;
  disabled?: boolean;
}

export interface TabsProps {
  tabs: TabItem[];
  defaultIndex?: number;
  onChange?: (index: number) => void;
  className?: string;
}

export function Tabs({ tabs, defaultIndex = 0, onChange, className }: TabsProps) {
  return (
    <TabGroup defaultIndex={defaultIndex} onChange={onChange} className={className}>
      <TabList className="flex gap-1 overflow-x-auto border-b border-slate-200">
        {tabs.map((tab) => (
          <Tab
            key={tab.label}
            disabled={tab.disabled}
            className={cn(
              '-mb-px border-b-2 border-transparent px-3 py-2 text-sm font-medium whitespace-nowrap text-slate-600',
              'transition-colors hover:text-slate-900',
              'data-selected:border-brand-600 data-selected:text-brand-700',
              'data-disabled:cursor-not-allowed data-disabled:text-slate-400',
              'focus:outline-none data-focus:outline-2 data-focus:-outline-offset-2 data-focus:outline-brand-600',
            )}
          >
            {tab.label}
          </Tab>
        ))}
      </TabList>
      <TabPanels className="pt-4">
        {tabs.map((tab) => (
          <TabPanel
            key={tab.label}
            className="focus:outline-none data-focus:outline-2 data-focus:outline-offset-2 data-focus:outline-brand-600"
          >
            {tab.content}
          </TabPanel>
        ))}
      </TabPanels>
    </TabGroup>
  );
}
