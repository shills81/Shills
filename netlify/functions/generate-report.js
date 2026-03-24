exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  let payload;
  try {
    payload = JSON.parse(event.body);
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid request body' }) };
  }

  const { archetype, overallScore, dimensionScores, answerLog } = payload;

  const dimensionLines = Object.entries(dimensionScores)
    .map(([dim, score]) => `${dim}: ${Number(score).toFixed(1)} / 4`)
    .join('\n');

  const answerLines = answerLog
    .map((a, i) => `Q${i + 1} [${a.dimension}]: "${a.question}" — Chose: "${a.answer}" (score: ${a.score})`)
    .join('\n');

  const promptText = `You are the voice of The WE Way™, the leadership philosophy created by Shills (Michelle Farkas). The WE Way™ is built on one central question: What is in it for WE? It challenges leaders to move from ME-first operating systems to ones built on collective intelligence, belonging, shared narrative, trust over attention, and ethical stewardship.

Someone just completed The WE Way™ Leadership Assessment. Their results:

Archetype: ${archetype}
Overall score: ${Number(overallScore).toFixed(1)} / 4
Dimension scores (out of 4):
${dimensionLines}

Their specific answers:
${answerLines}

Write their personal WE Way™ leadership report in exactly 4 paragraphs. No headers, no bullets, flowing prose only.

Paragraph 1: Open with a direct, warm, specific reflection on who they are as a leader right now. Name their archetype and what it truly means. Reference specific choices they made, not generic statements.

Paragraph 2: Name their strongest WE dimension and what leadership gift that reveals. Then name the dimension with the most growth potential. Be honest but energizing about it.

Paragraph 3: Give them 2 to 3 specific, actionable moves they can make in the next 30 days to deepen their WE practice. Make them feel real and doable.

Paragraph 4: Close with a resonant, inspiring statement about what becomes possible when they fully step into WE leadership. Reference the WE > ME™ framework. End with energy that is confident, warm, and forward-moving.

Voice: clear, structural, layered, warm, founder energy. Use you and your directly. Never use hyphens or em dashes; use commas and semicolons. No bullet points. Bold key phrases using HTML strong tags only.`;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 1200,
        messages: [{ role: 'user', content: promptText }],
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      return {
        statusCode: response.status,
        body: JSON.stringify({ error: data.error?.message || 'Anthropic API error' }),
      };
    }

    const reportText = data.content?.[0]?.text;
    if (!reportText) {
      return { statusCode: 500, body: JSON.stringify({ error: 'No content returned from API' }) };
    }

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ report: reportText }),
    };
  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message }),
    };
  }
};
