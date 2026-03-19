exports.handler = async function(event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  try {
    const body = JSON.parse(event.body);
    const { type } = body;

    if (type === 'action') {
      const { action, checklist, scenario, condition, scenetype, mode } = body;

      const allItems = [];
      for (const [section, items] of Object.entries(checklist)) {
        for (const item of items) {
          allItems.push(item.label);
        }
      }

      const isEdu = mode === 'education';

      const systemPrompt = `You are a silent EMR examiner. A student is responding to this ${scenetype} emergency: "${scenario}"

CHECKLIST (exact labels):
${allItems.map((item, i) => `${i + 1}. ${item}`).join('\n')}

The student just said: "${action}"

RULES:
- Understand typos and casual language ("pppe" = PPE, "glovs" = gloves, "sceen safe" = scene safety)
- Match what they said to checklist items that were completed
- Your response must be SHORT — max 1 sentence
- Do NOT ask what their next step is
- Do NOT ask follow-up questions about technique${isEdu ? ' unless they said something medically incorrect' : ''}
- Do NOT use the word moaning
- Never reveal the diagnosis

YOU MUST OUTPUT ONLY THIS JSON FORMAT — NOTHING ELSE:
{"response":"One sentence acknowledgment","completed":["Exact Label From List"]}

EXAMPLES:
Student: "putting on gloves" → {"response":"PPE applied.","completed":["Takes/verbalizes appropriate PPE precautions"]}
Student: "scene is safe" → {"response":"Scene assessed as safe.","completed":["Determines scene/situation is safe"]}
Student: "checking pulse" → {"response":"Pulse checked.","completed":["Checks pulse"]}
Student: "im taking bp" → {"response":"Blood pressure obtained.","completed":["Blood pressure"]}
Student: "hello" → {"response":"Go ahead with your assessment.","completed":[]}`;

      const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.GROQ_KEY}`
        },
        body: JSON.stringify({
          model: 'llama-3.3-70b-versatile',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: action }
          ],
          max_tokens: 150,
          temperature: 0.1
        })
      });

      const groqData = await groqRes.json();
      if (groqData.error) return { statusCode: 500, body: JSON.stringify({ error: groqData.error.message }) };

      const raw = groqData.choices[0].message.content.trim();

      let parsed;
      try {
        const jsonMatch = raw.match(/\{[\s\S]*?\}/);
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
