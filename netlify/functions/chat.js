exports.handler = async function(event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  try {
    const body = JSON.parse(event.body);
    const { type } = body;

    if (type === 'action') {
      const { action, checklist, scenario, condition, scenetype, mode, history } = body;

      const allItems = [];
      for (const [section, items] of Object.entries(checklist)) {
        for (const item of items) {
          allItems.push(item.label);
        }
      }

      const isEdu = mode === 'education';

      const systemPrompt = `You are an experienced EMR examiner watching a student respond to a ${scenetype} emergency.
Scenario: ${scenario}
Patient condition: ${condition}

Your job:
1. Understand what the student just did, even with typos or odd phrasing
2. Respond briefly as an examiner would (1-2 sentences max)
3. ${isEdu ? 'If vague (e.g. "airway clear" without saying how), ask ONE follow-up about technique. If they describe correctly, confirm. If wrong, correct briefly.' : 'Just acknowledge what they did in 1 sentence. No corrections.'}
4. Return which checklist items from the list below were just completed

CHECKLIST ITEMS (use exact text):
${allItems.map((item, i) => `${i + 1}. ${item}`).join('\n')}

RULES:
- Understand typos and abbreviations. "pppe" = PPE, "glovs" = gloves, "sceen sfaety" = scene safety
- Only mark items actually done in this action
- Do NOT use the word moaning, use groaning
- Never reveal the diagnosis
- You MUST respond with ONLY valid JSON, no other text before or after

REQUIRED OUTPUT FORMAT (JSON only, nothing else):
{"response":"your examiner response here","completed":["exact item label 1","exact item label 2"]}`;

      const messages = [
        ...(history || []).slice(-6),
        { role: 'user', content: action }
      ];

      const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.GROQ_KEY}`
        },
        body: JSON.stringify({
          model: 'llama-3.3-70b-versatile',
          messages: [{ role: 'system', content: systemPrompt }, ...messages],
          max_tokens: 400,
          temperature: 0.2
        })
      });

      const groqData = await groqRes.json();
      if (groqData.error) return { statusCode: 500, body: JSON.stringify({ error: groqData.error.message }) };

      const raw = groqData.choices[0].message.content.trim();

      let parsed;
      try {
        const jsonMatch = raw.match(/\{[\s\S]*\}/);
        if (!jsonMatch) throw new Error('no json found');
        parsed = JSON.parse(jsonMatch[0]);
      } catch (e) {
        return {
          statusCode: 200,
          body: JSON.stringify({ response: raw.replace(/\{[\s\S]*\}/g, '').trim() || 'Action noted.', completed: [] })
        };
      }

      return {
        statusCode: 200,
        body: JSON.stringify({
          response: parsed.response || 'Action noted.',
          completed: Array.isArray(parsed.completed) ? parsed.completed : []
        })
      };

    } else {
      const { messages, system } = body;

      const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.GROQ_KEY}`
        },
        body: JSON.stringify({
          model: 'llama-3.3-70b-versatile',
          messages: [{ role: 'system', content: system }, ...messages],
          max_tokens: 200,
          temperature: 0.85
        })
      });

      const groqData = await groqRes.json();
      if (groqData.error) return { statusCode: 500, body: JSON.stringify({ error: groqData.error.message }) };

      return {
        statusCode: 200,
        body: JSON.stringify({ content: groqData.choices[0].message.content.trim() })
      };
    }

  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
