export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { query } = req.body;
  if (!query) return res.status(400).json({ error: 'Missing query' });

  const prompt = `I need the scorecard for the golf course: "${query}"

Return ONLY raw JSON, no markdown, no explanation, in exactly this format:
{"found":true,"name":"Full Course Name","location":"City, State","rating":71.2,"slope":128,"holes":[{"hole":1,"par":4,"si":7,"yardage":412},{"hole":2,"par":4,"si":11,"yardage":385},{"hole":3,"par":3,"si":15,"yardage":178},{"hole":4,"par":5,"si":3,"yardage":521},{"hole":5,"par":4,"si":1,"yardage":445},{"hole":6,"par":4,"si":9,"yardage":398},{"hole":7,"par":3,"si":17,"yardage":156},{"hole":8,"par":5,"si":5,"yardage":498},{"hole":9,"par":4,"si":13,"yardage":372},{"hole":10,"par":4,"si":8,"yardage":410},{"hole":11,"par":4,"si":2,"yardage":432},{"hole":12,"par":3,"si":16,"yardage":165},{"hole":13,"par":5,"si":6,"yardage":512},{"hole":14,"par":4,"si":4,"yardage":418},{"hole":15,"par":4,"si":12,"yardage":385},{"hole":16,"par":3,"si":18,"yardage":142},{"hole":17,"par":5,"si":10,"yardage":478},{"hole":18,"par":4,"si":14,"yardage":395}]}

Use your training knowledge. "si" = stroke index 1-18 (1=hardest). If you truly don't know this course return {"found":false}.`;

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
        messages: [{ role: 'user', content: prompt }]
      })
    });

    const data = await response.json();
    console.log('Anthropic response status:', response.status);
    console.log('Anthropic response:', JSON.stringify(data).slice(0, 500));

    if (!response.ok) {
      return res.status(200).json({ found: false, debug: data });
    }

    const textBlocks = (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n');
    console.log('Text content:', textBlocks.slice(0, 300));

    const match = textBlocks.match(/\{[\s\S]*\}/);
    if (!match) return res.status(200).json({ found: false, debug: 'no json found in: ' + textBlocks.slice(0,200) });

    let parsed;
    try { parsed = JSON.parse(match[0]); }
    catch(e) { return res.status(200).json({ found: false, debug: 'json parse error: ' + e.message }); }

    if (!parsed.found || !parsed.holes || parsed.holes.length < 18) {
      return res.status(200).json({ found: false, debug: 'incomplete: holes=' + (parsed.holes ? parsed.holes.length : 0) });
    }

    return res.status(200).json(parsed);
  } catch(e) {
    console.error('Handler error:', e);
    return res.status(200).json({ found: false, debug: 'exception: ' + e.message });
  }
}
