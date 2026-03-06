import http from 'node:http';

const port = Number.parseInt(process.env.SCOUT_PROXY_PORT || '8787', 10);
const tavilyKey = process.env.TAVILY_API_KEY;

if (!tavilyKey) {
  console.error('Missing TAVILY_API_KEY in environment.');
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    });
    res.end();
    return;
  }

  if (req.method !== 'POST' || req.url !== '/scout/search') {
    res.writeHead(404, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify({ error: 'Not found' }));
    return;
  }

  let body = '';
  req.on('data', (chunk) => {
    body += chunk.toString();
  });

  req.on('end', async () => {
    try {
      const payload = body ? JSON.parse(body) : {};
      const query = typeof payload.query === 'string' ? payload.query : '';
      const maxResults = typeof payload.maxResults === 'number' ? Math.max(1, Math.min(10, payload.maxResults)) : 5;

      if (!query.trim()) {
        res.writeHead(400, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
        res.end(JSON.stringify({ error: 'Missing query' }));
        return;
      }

      if (!tavilyKey) {
        res.writeHead(500, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
        res.end(JSON.stringify({ error: 'Missing Tavily key' }));
        return;
      }

      const response = await fetch('https://api.tavily.com/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          api_key: tavilyKey,
          query,
          max_results: maxResults,
          include_answer: true,
          include_raw_content: false
        })
      });

      if (!response.ok) {
        const text = await response.text();
        res.writeHead(500, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
        res.end(JSON.stringify({ error: text || 'Search failed' }));
        return;
      }

      const data = await response.json();
      res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      res.end(JSON.stringify({
        query,
        results: Array.isArray(data?.results) ? data.results : [],
        answer: data?.answer
      }));
    } catch (error) {
      res.writeHead(500, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      res.end(JSON.stringify({ error: 'Search failed' }));
    }
  });
});

server.listen(port, () => {
  console.log(`Scout proxy running at http://localhost:${port}`);
});
