import { Client } from '@notionhq/client'

const apiKey = typeof import.meta !== 'undefined' && import.meta.env
  ? import.meta.env.VITE_NOTION_API_KEY
  : process.env.NOTION_API_KEY

export const notion = new Client({ auth: apiKey })
