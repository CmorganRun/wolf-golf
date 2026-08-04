export default async function handler(req, res) {
  // Only allow POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { query } = req.body;
  if (!query) return res.status(400).json({ error: 'Missing query' });

  const prompt = `Search the web for the golf course: "${query}"

Find its published scorecard. Return ONLY raw JSON (no markdown, no explanation) in exactly this format:
{"found":true,"name":"Full Course Name","location":"City, State","rating":71.2,"slope":128,"holes":[{"hole":1,"par":4,"si":7,"yardage":412},{"hole":2,...},...18 total holes...]}

Rules:
- Use men's/white tees if multiple tee options exist
- "si" is the stroke index / handicap index (1-18 difficulty ranking where 1 = hardest)
- All 18 holes must be present
- If you cannot find reliable data for this exact course, return exactly: {"found":false}`;

  try {
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

    const data = await response.json();
    const textBlocks = (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n');
    const match = textBlocks.match(/\{[\s\S]*\}/);
    const parsed = match ? JSON.parse(match[0]) : { found: false };
    res.status(200).json(parsed);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
