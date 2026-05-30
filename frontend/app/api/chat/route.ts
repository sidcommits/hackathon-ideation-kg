import { anthropic } from '@ai-sdk/anthropic';
import { streamText, tool } from 'ai';
import { z } from 'zod';

export const maxDuration = 60;

export async function POST(req: Request) {
  const { messages } = await req.json();

  const result = streamText({
    abortSignal: req.signal,
    model: anthropic('claude-sonnet-4-6'),
    system: `You are MastikQ, an agentic AI assistant with access to the company's knowledge base across Confluence, Slack, Google Drive, SharePoint, Notion, GitHub, and Jira. When answering questions, proactively search relevant sources to give grounded, accurate answers. Use multiple tools when needed. Cite which systems your information came from.`,
    messages,
    tools: {
      search_confluence: tool({
        description: 'Search Confluence for internal documentation, wiki pages, meeting notes, and project specs',
        parameters: z.object({
          query: z.string().describe('Search query'),
          space: z.string().optional().describe('Confluence space key to scope the search'),
        }),
        execute: async ({ query, space }) => {
          // Wire to Confluence REST API: GET /wiki/rest/api/content/search
          return {
            results: [
              { title: 'Q4 Product Roadmap', space: space ?? 'PROD', excerpt: `Found relevant content for: ${query}`, updated: '2025-05-12' },
              { title: 'Engineering Handbook', space: 'ENG', excerpt: 'Architecture decisions and standards', updated: '2025-04-30' },
            ],
            total: 2,
          };
        },
      }),

      search_slack: tool({
        description: 'Search Slack message history across channels for discussions, decisions, and announcements',
        parameters: z.object({
          query: z.string().describe('Search query'),
          channel: z.string().optional().describe('Slack channel to scope the search'),
        }),
        execute: async ({ query, channel }) => {
          // Wire to Slack Web API: conversations.history / search.messages
          return {
            messages: [
              { channel: channel ?? '#engineering', user: 'sarah.k', text: `Discussion about ${query}`, ts: '1747000000' },
              { channel: '#product', user: 'alex.m', text: 'Related thread with 12 replies', ts: '1746900000' },
            ],
            total: 2,
          };
        },
      }),

      search_google_drive: tool({
        description: 'Search Google Drive for documents, spreadsheets, and presentations',
        parameters: z.object({
          query: z.string().describe('Search query'),
          type: z.enum(['doc', 'sheet', 'slide', 'any']).optional().describe('File type filter'),
        }),
        execute: async ({ query, type }) => {
          // Wire to Google Drive API: files.list with q parameter
          return {
            files: [
              { name: `${query} — Analysis`, mimeType: 'application/vnd.google-apps.document', modifiedTime: '2025-05-20', owner: 'priya@company.com' },
              { name: 'Data Export Q1 2025', mimeType: 'application/vnd.google-apps.spreadsheet', modifiedTime: '2025-04-01', owner: 'data-team@company.com' },
            ],
            type: type ?? 'any',
          };
        },
      }),

      search_sharepoint: tool({
        description: 'Search Microsoft SharePoint for internal files, policies, and team sites',
        parameters: z.object({
          query: z.string().describe('Search query'),
          site: z.string().optional().describe('SharePoint site to scope the search'),
        }),
        execute: async ({ query, site }) => {
          // Wire to Microsoft Graph API: /search/query
          return {
            results: [
              { title: `${query} Policy v2.3`, path: '/sites/HR/Policies', author: 'hr-team', lastModified: '2025-03-15' },
              { title: 'Compliance Framework 2025', path: '/sites/Legal', author: 'legal@company.com', lastModified: '2025-01-10' },
            ],
            site: site ?? 'root',
          };
        },
      }),

      search_notion: tool({
        description: 'Search Notion workspace for pages, databases, and notes',
        parameters: z.object({
          query: z.string().describe('Search query'),
        }),
        execute: async ({ query }) => {
          // Wire to Notion API: POST /v1/search
          return {
            results: [
              { title: `${query} — Team Notes`, type: 'page', lastEdited: '2025-05-25', editedBy: 'jamie' },
              { title: 'Sprint Planning Board', type: 'database', lastEdited: '2025-05-28', editedBy: 'team' },
            ],
          };
        },
      }),

      search_jira: tool({
        description: 'Search Jira for issues, epics, bugs, and project tickets',
        parameters: z.object({
          query: z.string().describe('JQL query or natural language search'),
          project: z.string().optional().describe('Jira project key'),
        }),
        execute: async ({ query, project }) => {
          // Wire to Jira REST API: GET /rest/api/3/issue/search
          return {
            issues: [
              { key: `${project ?? 'ENG'}-412`, summary: `Fix: ${query}`, status: 'In Progress', assignee: 'dev@company.com', priority: 'High' },
              { key: `${project ?? 'ENG'}-398`, summary: `Feature: related to ${query}`, status: 'Done', assignee: 'dev2@company.com', priority: 'Medium' },
            ],
            total: 2,
          };
        },
      }),

      search_github: tool({
        description: 'Search GitHub for code, pull requests, issues, and repositories',
        parameters: z.object({
          query: z.string().describe('GitHub search query'),
          type: z.enum(['code', 'pr', 'issue', 'repo']).optional().describe('What to search for'),
        }),
        execute: async ({ query, type }) => {
          // Wire to GitHub REST API: GET /search/{type}
          return {
            items: [
              { title: `Relevant ${type ?? 'code'} for: ${query}`, repo: 'org/main-app', url: 'https://github.com/org/main-app', updatedAt: '2025-05-28' },
            ],
            type: type ?? 'code',
          };
        },
      }),

      synthesize: tool({
        description: 'Synthesize and cross-reference findings from multiple sources into a coherent answer',
        parameters: z.object({
          sources: z.array(z.string()).describe('Source systems or document names to synthesize'),
          focus: z.string().optional().describe('The specific question or angle to focus on'),
        }),
        execute: async ({ sources, focus }) => {
          return { sources, focus, status: 'synthesis complete' };
        },
      }),
    },
    maxSteps: 15,
  });

  return result.toDataStreamResponse();
}
