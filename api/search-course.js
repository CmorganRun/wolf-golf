const API_KEY = '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';

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { query } = req.body;
  if (!query) return res.status(400).json({ error: 'Missing query' });

  const prompt = `Search the web for the golf course scorecard: "${query}"

Look for the official course website, GHIN, GolfAdvisor, or any golf course database that lists the full scorecard. Find the hole-by-hole data including par, stroke index (handicap index), and yardage for all 18 holes.

Return ONLY raw JSON, no markdown, no explanation:
{"found":true,"name":"Full Course Name","location":"City, State","rating":71.2,"slope":128,"holes":[{"hole":1,"par":4,"si":7,"yardage":412},{"hole":2,"par":4,"si":11,"yardage":385},{"hole":3,"par":3,"si":15,"yardage":178},{"hole":4,"par":5,"si":3,"yardage":521},{"hole":5,"par":4,"si":1,"yardage":445},{"hole":6,"par":4,"si":9,"yardage":398},{"hole":7,"par":3,"si":17,"yardage":156},{"hole":8,"par":5,"si":5,"yardage":498},{"hole":9,"par":4,"si":13,"yardage":372},{"hole":10,"par":4,"si":8,"yardage":410},{"hole":11,"par":4,"si":2,"yardage":432},{"hole":12,"par":3,"si":16,"yardage":165},{"hole":13,"par":5,"si":6,"yardage":512},{"hole":14,"par":4,"si":4,"yardage":418},{"hole":15,"par":4,"si":12,"yardage":385},{"hole":16,"par":3,"si":18,"yardage":142},{"hole":17,"par":5,"si":10,"yardage":478},{"hole":18,"par":4,"si":14,"yardage":395}]}

Rules:
- Use men's/white tees if multiple options exist
- "si" = stroke index / handicap index (1-18, where 1 = hardest hole)
- Must include all 18 holes
- Use real data from the web search, not guesses
- If you cannot find reliable data after searching, return: {"found":false}`;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': API_KEY,
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
    console.log('Status:', response.status);
    console.log('Response:', JSON.stringify(data).slice(0, 300));

    if (!response.ok) {
      // Fall back to training data only if web search fails
      const fallback = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': API_KEY,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-6',
          max_tokens: 2000,
          messages: [{ role: 'user', content: prompt }]
        })
      });
      const fallbackData = await fallback.json();
      return res.status(200).json(extractResult(fallbackData));
    }

    const result = extractResult(data);
    return res.status(200).json(result);

  } catch(e) {
    console.error('Exception:', e.message);
    return res.status(200).json({ found: false });
  }
};

function extractResult(data) {
  try {
    const textBlocks = (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n');
    const match = textBlocks.match(/\{[\s\S]*\}/);
    if (!match) return { found: false };
    const parsed = JSON.parse(match[0]);
    if (!parsed.found || !parsed.holes || parsed.holes.length < 18) return { found: false };
    return parsed;
  } catch(e) {
    return { found: false };
  }
}
