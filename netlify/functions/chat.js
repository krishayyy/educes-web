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

      const systemPrompt = `You are an EMR examiner watching a student respond to a ${scenetype} emergency.
Scenario: ${scenario}
Patient condition: ${condition}

CHECKLIST ITEMS (numbered for reference):
${allItems.map((item, i) => `${i + 1}. ${item}`).join('\n')}

YOUR TASK:
1. Read the student's action carefully — understand it even with typos or casual language
2. Determine which checklist items above were just completed by this action
3. Write a brief examiner response (1 sentence max)${isEdu ? ' — if the student was vague about HOW they did something, ask one specific follow-up question about technique' : ''}
4. NEVER say "what is your next step" or suggest what to do next
5. NEVER mark items the student has not actually done yet
6. Do NOT use the word moaning, use groaning instead

CRITICAL: You MUST respond with ONLY this exact JSON. No text before it, no text after it, no markdown:
{"response":"examiner response here","completed":["exact checklist label","exact checklist label"]}

If nothing was completed, use an empty array:
{"response":"examiner response here","completed":[]}

The completed array values MUST exactly match the checklist item labels listed above.`;

      const messages = [
        ...(history || []).slice(-4).map(m => ({ role: m.role === 'user' ? 'user' : 'assistant', content: m.text })),
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
          max_tokens: 300,
          temperature: 0.1
        })
      });

      const groqData = await groqRes.json();
      if (groqData.error) return { statusCode: 500, body: JSON.stringify({ error: groqData.error.message }) };

      const raw = groqData.choices[0].message.content.trim();

      let parsed;
      try {
        const jsonMatch = raw.match(/\{[\s\S]*\}/);
        if (!jsonMatch) throw new Error('no json');
        parsed = JSON.parse(jsonMatch[0]);
      } catch (e) {
        return {
          statusCode: 200,
          body: JSON.stringify({ response: 'Action noted.', completed: [] })
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
