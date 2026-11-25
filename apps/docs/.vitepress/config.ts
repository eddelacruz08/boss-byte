import { defineConfig } from 'vitepress';

export default defineConfig({
  title: 'BossByte',
  description:
    'A full-stack TypeScript monorepo boilerplate: Express 5 API, React 19 dashboard, shared UI and schema packages.',
  lang: 'en-US',
  cleanUrls: true,
  // Links to the locally running apps are examples, not pages of this site.
  ignoreDeadLinks: [/^https?:\/\/localhost/],

  themeConfig: {
    search: { provider: 'local' },
    outline: { level: [2, 3] },

    nav: [
      { text: 'Guide', link: '/guide/introduction', activeMatch: '^/guide/' },
      { text: 'API', link: '/api/overview', activeMatch: '^/api/' },
      { text: 'Frontend', link: '/frontend/overview', activeMatch: '^/frontend/' },
      { text: 'Packages', link: '/packages/ui', activeMatch: '^/packages/' },
      { text: 'Testing', link: '/testing' },
      { text: 'Deployment', link: '/deployment/docker', activeMatch: '^/deployment/' },
    ],

    sidebar: [
      {
        text: 'Guide',
        items: [
          { text: 'Introduction', link: '/guide/introduction' },
          { text: 'Installation', link: '/guide/installation' },
          { text: 'Project structure', link: '/guide/project-structure' },
          { text: 'Environment variables', link: '/guide/environment' },
          { text: 'Scripts', link: '/guide/scripts' },
          { text: 'Conventions', link: '/guide/conventions' },
        ],
      },
      {
        text: 'API',
        items: [
          { text: 'Overview', link: '/api/overview' },
          { text: 'Authentication', link: '/api/authentication' },
          { text: 'Authorization', link: '/api/authorization' },
          { text: 'Database', link: '/api/database' },
          { text: 'Encryption', link: '/api/encryption' },
          { text: 'Background jobs', link: '/api/jobs' },
          { text: 'File storage', link: '/api/storage' },
          { text: 'Documents and exports', link: '/api/documents' },
          { text: 'Valuation', link: '/api/valuation' },
          { text: 'Security', link: '/api/security' },
        ],
      },
      {
        text: 'Frontend',
        items: [
          { text: 'Overview', link: '/frontend/overview' },
          { text: 'Routing', link: '/frontend/routing' },
          { text: 'Sessions and permissions', link: '/frontend/auth' },
          { text: 'API client and data', link: '/frontend/api-client' },
          { text: 'Forms', link: '/frontend/forms' },
          { text: 'Charts and maps', link: '/frontend/charts-and-maps' },
          { text: 'Exports and downloads', link: '/frontend/exports' },
        ],
      },
      {
        text: 'Packages',
        items: [
          { text: '@bossbyte/ui', link: '/packages/ui' },
          { text: '@bossbyte/shared', link: '/packages/shared' },
        ],
      },
      {
        text: 'Quality',
        items: [{ text: 'Testing', link: '/testing' }],
      },
      {
        text: 'Deployment',
        items: [
          { text: 'Docker', link: '/deployment/docker' },
          { text: 'PM2', link: '/deployment/pm2' },
          { text: 'Google Cloud Run', link: '/deployment/cloud-run' },
          { text: 'CI and releases', link: '/deployment/ci' },
        ],
      },
    ],

    footer: {
      message: 'BossByte boilerplate documentation',
    },
  },
});
