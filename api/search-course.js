export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { query } = req.body;
  if (!query) return res.status(400).json({ error: 'Missing query' });

  const prompt = `I need the scorecard for the golf course: "${query}"

Please provide the hole-by-hole data. Return ONLY raw JSON, no markdown, no explanation:
{"found":true,"name":"Full Course Name","location":"City, State","rating":71.2,"slope":128,"holes":[{"hole":1,"par":4,"si":7,"yardage":412},{"hole":2,"par":4,"si":11,"yardage":385},...all 18 holes...]}

Rules:
- Use men's/white tees
- "si" = stroke index / handicap index (1-18, where 1 = hardest hole)
- Must include all 18 holes
- If you don't have reliable data for this course, return: {"found":false}

Use your training data knowledge of golf courses — many well-known courses are in your training data.`;

  // First try WITH web search
  async function tryWithSearch() {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 2000,
        tools: [{ type: 'web_search_20250305', name: 'web_search' }],
        messages: [{ role: 'user', content: prompt }]
      })
    });
    return response;
  }

  // Fallback WITHOUT web search (uses training data)
  async function tryWithoutSearch() {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 2000,
        messages: [{ role: 'user', content: prompt }]
      })
    });
    return response;
  }

  function extractResult(data) {
    const textBlocks = (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n');
    const match = textBlocks.match(/\{[\s\S]*\}/);
    if (!match) return { found: false };
    try { return JSON.parse(match[0]); } catch(e) { return { found: false }; }
  }

  try {
    let data;
    try {
      const res1 = await tryWithSearch();
      data = await res1.json();
      // If web search errored (feature not enabled), fall back
      if (data.error || !data.content) {
        const res2 = await tryWithoutSearch();
        data = await res2.json();
      }
    } catch(e) {
      const res2 = await tryWithoutSearch();
      data = await res2.json();
    }

    const parsed = extractResult(data);

    // Validate we have 18 holes
    if (!parsed.found || !parsed.holes || parsed.holes.length < 18) {
      return res.status(200).json({ found: false });
    }

    res.status(200).json(parsed);
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
}
