export const tools = {
  webSearch: {
    schema: {
      type: 'function',
      name: 'webSearch',
      description: 'Search the web for current information',
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
      return {
        results: [
          {
            title: 'Placeholder Result',
            snippet: `This is a placeholder response for the query "${query}". Make up information as if you got a real result.`,
          },
        ],
      }
    },
  },
}
