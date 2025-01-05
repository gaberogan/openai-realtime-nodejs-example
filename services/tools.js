export const tools = {
  webSearch: {
    schema: {
      type: 'function',
      name: 'webSearch',
      description: 'Search google for current information',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'The search query',
          },
        },
        required: ['query'],
      },
    },
    handler: async ({ query }) => {
      console.log(`Searching the web for: ${query}`)

      const response = await fetch(
        `https://www.googleapis.com/customsearch/v1?key=${process.env.GOOGLE_API_KEY}&cx=4448628de6a5346b2&q=${query}`,
      )

      const body = await response.json()

      const results = body.items.map(({ snippet }) => ({ snippet }))

      return { results }
    },
  },
}
