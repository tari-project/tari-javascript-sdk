/**
 * Creating a sidebar enables you to:
 - create an ordered group of docs
 - render a sidebar for each doc of that group
 - provide next/previous navigation

 The sidebars can be generated from the filesystem, or explicitly defined here.

 Create as many sidebars as you want.
 */

// @ts-check

/** @type {import('@docusaurus/plugin-content-docs').SidebarsConfig} */
const sidebars = {
  // By default, Docusaurus generates a sidebar from the docs folder structure
  tutorialSidebar: [
    'introduction',
    {
      type: 'category',
      label: 'Getting Started',
      items: [
        'getting-started/installation',
        'getting-started/quick-start',
        'getting-started/first-wallet',
        'getting-started/configuration',
      ],
    },
    {
      type: 'category',
      label: 'Core Concepts',
      items: [
        'concepts/overview',
        'concepts/networks',
        'concepts/addresses',
        'concepts/transactions',
        'concepts/balances',
        'concepts/events',
      ],
    },
    {
      type: 'category',
      label: 'API Guide',
      items: [
        'api/wallet-creation',
        'api/transactions',
        'api/balance-management',
        'api/fee-estimation',
        'api/error-handling',
        'api/event-system',
      ],
    },
    {
      type: 'category',
      label: 'Platform Integration',
      items: [
        'platforms/nodejs',
        'platforms/electron',
        'platforms/tauri',
        'platforms/browser',
      ],
    },
    {
      type: 'category',
      label: 'Advanced Topics',
      items: [
        'advanced/performance',
        'advanced/security',
        'advanced/storage',
        'advanced/testing',
        'advanced/debugging',
      ],
    },
    {
      type: 'category',
      label: 'Migration & Upgrading',
      items: [
        'migration/upgrading',
        'migration/breaking-changes',
        'migration/v1-to-v2',
      ],
    },
    {
      type: 'category',
      label: 'Troubleshooting',
      items: [
        'troubleshooting/common-errors',
        'troubleshooting/debugging',
        'troubleshooting/faq',
        'troubleshooting/support',
      ],
    },
  ],
};

export default sidebars;
