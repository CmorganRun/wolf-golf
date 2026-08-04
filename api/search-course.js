const API_KEY = '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';

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { query } = req.body;
  if (!query) return res.status(400).json({ error: 'Missing query' });

  const prompt = `Search the web for the golf course scorecard: "${query}"

Find the hole-by-hole data. After searching, return ONLY raw JSON with no markdown, no explanation, nothing else before or after the JSON:
{"found":true,"name":"Full Course Name","location":"City, State","rating":71.2,"slope":128,"holes":[{"hole":1,"par":4,"si":7,"yardage":412},{"hole":2,"par":4,"si":11,"yardage":385},{"hole":3,"par":3,"si":15,"yardage":178},{"hole":4,"par":5,"si":3,"yardage":521},{"hole":5,"par":4,"si":1,"yardage":445},{"hole":6,"par":4,"si":9,"yardage":398},{"hole":7,"par":3,"si":17,"yardage":156},{"hole":8,"par":5,"si":5,"yardage":498},{"hole":9,"par":4,"si":13,"yardage":372},{"hole":10,"par":4,"si":8,"yardage":410},{"hole":11,"par":4,"si":2,"yardage":432},{"hole":12,"par":3,"si":16,"yardage":165},{"hole":13,"par":5,"si":6,"yardage":512},{"hole":14,"par":4,"si":4,"yardage":418},{"hole":15,"par":4,"si":12,"yardage":385},{"hole":16,"par":3,"si":18,"yardage":142},{"hole":17,"par":5,"si":10,"yardage":478},{"hole":18,"par":4,"si":14,"yardage":395}]}

Rules:
- Use men's/white tees if multiple options
- "si" = stroke index / handicap index (1-18, 1=hardest)
- All 18 holes required
- If not found: {"found":false}`;

  try {
    // Step 1: Send initial request with web search tool
    const res1 = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 4000,
        tools: [{ type: 'web_search_20250305', name: 'web_search' }],
        messages: [{ role: 'user', content: prompt }]
      })
    });

    const data1 = await res1.json();
    console.log('Step 1 stop_reason:', data1.stop_reason);

    // If it stopped to use the tool, send the tool result back
    if (data1.stop_reason === 'tool_use') {
      // Build messages array with full conversation so far
      const messages = [
        { role: 'user', content: prompt },
        { role: 'assistant', content: data1.content }
      ];

      // Find tool use blocks and build tool results
      const toolResults = (data1.content || [])
        .filter(b => b.type === 'server_tool_use' || b.type === 'tool_use')
        .map(b => ({
          type: 'tool_result',
          tool_use_id: b.id,
          content: 'Search completed. Please now return the JSON scorecard based on what you found.'
        }));

      if (toolResults.length > 0) {
        messages.push({ role: 'user', content: toolResults });
      }

      const res2 = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': API_KEY,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-6',
          max_tokens: 4000,
          tools: [{ type: 'web_search_20250305', name: 'web_search' }],
          messages
        })
      });

      const data2 = await res2.json();
      console.log('Step 2 content types:', (data2.content||[]).map(b=>b.type).join(','));
      const result = extractResult(data2);
      console.log('Extracted found:', result.found, 'holes:', result.holes ? result.holes.length : 0);
      return res.status(200).json(result);
    }

    // stop_reason was end_turn — extract directly
    const result = extractResult(data1);
    console.log('Direct extracted found:', result.found, 'holes:', result.holes ? result.holes.length : 0);
    return res.status(200).json(result);

  } catch(e) {
    console.error('Exception:', e.message);
    return res.status(200).json({ found: false });
  }
};

function extractResult(data) {
  try {
    const textBlocks = (data.content || [])
      .filter(b => b.type === 'text')
      .map(b => b.text)
      .join('\n');
    console.log('Text to parse (first 300):', textBlocks.slice(0, 300));
    const match = textBlocks.match(/\{[\s\S]*\}/);
    if (!match) return { found: false };
    const parsed = JSON.parse(match[0]);
    if (!parsed.found || !parsed.holes || parsed.holes.length < 18) return { found: false };
    return parsed;
  } catch(e) {
    console.error('Extract error:', e.message);
    return { found: false };
  }
}
