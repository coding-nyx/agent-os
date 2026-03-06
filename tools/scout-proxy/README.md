# scout-proxy

Local proxy for Tavily search to avoid cloud functions and keep the API key off the client bundle.

## Run

```
cd tools/scout-proxy
TAVILY_API_KEY=your_key_here npm run start
```

Default endpoint: `http://localhost:8787/scout/search`

Environment variables:
- `TAVILY_API_KEY` (required)
- `SCOUT_PROXY_PORT` (optional, default `8787`)
