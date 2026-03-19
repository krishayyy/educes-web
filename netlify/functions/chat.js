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
};3. ${isEdu ? 'If the student is vague (e.g. says "airway clear" without explaining how they know), ask ONE follow-up question about technique. If they describe a procedure correctly, confirm it. If wrong, briefly correct.' : 'Simply acknowledge what they did in 1 sentence. Do not correct or lecture.'}
4. Return which checklist items were just completed by this action

FULL CHECKLIST (these are the exact item labels):
${allItems.map((item, i) => `${i + 1}. ${item}`).join('\n')}

IMPORTANT RULES:
- Understand natural language, typos, abbreviations. "pppe", "glovs", "put on my protection" all mean PPE.
- Only mark items the student actually did in this specific action. Do not mark things they haven't done yet.
- Do not use the word moaning, use groaning.
- Never reveal the diagnosis.
- Keep your examiner response SHORT — 1-2 sentences max.
- Do not say what the next step should be unless asked.

Respond ONLY with this exact JSON format, nothing else:
{
  "response": "your examiner response here",
  "completed": ["exact label of completed item 1", "exact label of completed item 2"]
}

The "completed" array must contain exact label strings from the checklist above, or be empty [] if nothing was completed.`;

      const messages = [
        ...(history || []).slice(-6),
        { role: 'user', content: action }
      ];

      const groqResponse = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.GROQ_KEY}`
        },
        body: JSON.stringify({
          model: 'llama-3.3-70b-versatile',
          messages: [{ role: 'system', content: systemPrompt }, ...messages],
          max_tokens: 400,
          temperature: 0.3
        })
      });

      const groqData = await groqResponse.json();
      if (groqData.error) return { statusCode: 500, body: JSON.stringify({ error: groqData.error.message }) };

      const raw = groqData.choices[0].message.content.trim();

      // Parse JSON response
      let parsed;
      try {
        // Strip markdown code blocks if present
        const clean = raw.replace(/```json|```/g, '').trim();
        parsed = JSON.parse(clean);
      } catch (e) {
        // If JSON parse fails, return the raw text as response with no completions
        return {
          statusCode: 200,
          body: JSON.stringify({ response: raw, completed: [] })
        };
      }

      return {
        statusCode: 200,
        body: JSON.stringify({
          response: parsed.response || '',
          completed: parsed.completed || []
        })
      };

    } else {
      // Regular chat — patient or bystander conversation
      const { messages, system } = body;

      const groqResponse = await fetch('https://api.groq.com/openai/v1/chat/completions', {
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

      const groqData = await groqResponse.json();
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
