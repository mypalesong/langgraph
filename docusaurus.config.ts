import {themes as prismThemes} from 'prism-react-renderer';
import type {Config} from '@docusaurus/types';
import type * as Preset from '@docusaurus/preset-classic';

const config: Config = {
  title: 'LangGraph Guide',
  tagline: 'LangGraph 완벽 가이드 - AI 에이전트 워크플로우 구축',
  favicon: 'img/favicon.ico',

  future: {
    v4: true,
  },

  url: 'https://mypalesong.github.io',
  baseUrl: '/langgraph/',

  organizationName: 'mypalesong',
  projectName: 'langgraph',

  onBrokenLinks: 'throw',

  i18n: {
    defaultLocale: 'ko',
    locales: ['ko'],
  },

  markdown: {
    mermaid: true,
  },

  themes: ['@docusaurus/theme-mermaid'],

  presets: [
    [
      'classic',
      {
        docs: {
          sidebarPath: './sidebars.ts',
          editUrl: 'https://github.com/mypalesong/langgraph/tree/manual/docs/',
        },
        blog: false,
        theme: {
          customCss: './src/css/custom.css',
        },
      } satisfies Preset.Options,
    ],
  ],

  themeConfig: {
    image: 'img/langgraph-social-card.jpg',
    colorMode: {
      respectPrefersColorScheme: true,
    },
    mermaid: {
      theme: { light: 'default', dark: 'dark' },
    },
    navbar: {
      title: 'LangGraph Guide',
      logo: {
        alt: 'LangGraph Logo',
        src: 'img/logo.svg',
      },
      items: [
        {
          type: 'docSidebar',
          sidebarId: 'tutorialSidebar',
          position: 'left',
          label: 'Guide',
        },
        {
          href: 'https://github.com/langchain-ai/langgraph',
          label: 'GitHub',
          position: 'right',
        },
      ],
    },
    footer: {
      style: 'dark',
      links: [
        {
          title: 'Docs',
          items: [
            {
              label: 'Guide',
              to: '/docs/intro',
            },
          ],
        },
        {
          title: 'Resources',
          items: [
            {
              label: 'LangGraph GitHub',
              href: 'https://github.com/langchain-ai/langgraph',
            },
            {
              label: 'LangChain',
              href: 'https://www.langchain.com/',
            },
          ],
        },
      ],
      copyright: `Copyright © ${new Date().getFullYear()} LangGraph Guide. Built with Docusaurus.`,
    },
    prism: {
      theme: prismThemes.github,
      darkTheme: prismThemes.dracula,
      additionalLanguages: ['python', 'bash'],
    },
  } satisfies Preset.ThemeConfig,
};

export default config;
