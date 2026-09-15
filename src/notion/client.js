import { Client } from '@notionhq/client'

// Nunca ler um VITE_NOTION_API_KEY: qualquer variável com prefixo VITE_ vai
// parar ao bundle JS público (Vite embebe-as em build time). Este client só
// pode correr em código servidor (Node), onde process.env não é exposto ao
// browser — daí ler sempre NOTION_API_KEY, mesmo dentro do Vite dev server.
const apiKey = process.env.NOTION_API_KEY

export const notion = new Client({ auth: apiKey })
