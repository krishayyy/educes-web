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

      const systemPrompt = `You are a silent EMR examiner. Student is responding to this ${scenetype} emergency: "${scenario}". Patient condition: ${condition}.

CHECKLIST ITEMS (use these EXACT strings in completed array):
${allItems.map((item, i) => `${i + 1}. "${item}"`).join('\n')}

TIME COSTS PER ACTION (deduct this many seconds):
- PPE/gloves: 30s
- Scene safety: 20s
- MOI/NOI: 15s
- Requesting EMS: 10s
- Spinal consideration: 60s
- Responsiveness/AVPU: 20s
- Chief complaint: 15s
- Airway assessment: 30s
- Breathing assessment: 30s
- Oxygen application: 45s
- Bleeding control: 45s
- Pulse check: 30s
- Skin assessment/capillary refill: 20s
- Transport decision: 15s
- Blood pressure: 60s
- Pulse rate: 30s
- Respiratory rate: 30s
- Respiratory quality: 30s
- Field impression: 15s
- Interventions: 20s
- Reassessment: 60s
- EMS report: 30s
- GCS assessment: 45s
- Any secondary assessment system: 45s
- Any head/neck/chest/abdominal assessment step: 45s
- Each extremity: 60s
- Posterior assessment: 60s

VAGUE ACTION RULES — if the student says something too broad, ask them to be specific. Do NOT mark anything or deduct time:
- "checking vitals" or "taking vitals" → ask "Which vital sign?"
- "doing sample" or "check sample" → ask "Which part of SAMPLE — allergies, medications, history, intake, or events?"
- "doing opqrst" or "check opqrst" → ask "Which part of OPQRST — onset, quality, provocation, radiation, severity, or time?"
- "secondary assessment" alone → ask "Which body system?"
- "checking history" alone → ask "What specifically about their history?"

SPECIFIC ACTION RULES — if the student names something specific, confirm it, mark it, deduct time:
- "blood pressure" or "bp" → mark "Blood pressure", deduct 60s
- "pulse" or "heart rate" → mark "Checks pulse" and "Pulse", deduct 30s
- "respiratory rate" → mark "Respiratory rate", deduct 30s
- "respiratory quality" or "breath sounds" → mark "Respiratory quality", deduct 30s
- "gloves" or "ppe" or "putting on protection" → mark PPE item, deduct 30s
- "scene safe" or "scene is safe" or "checking scene" → mark scene safety, deduct 20s
- "allergies" → mark "Allergies", deduct 15s
- "medications" or "meds" → mark "Medications", deduct 15s
- "last meal" or "last oral" or "last intake" → mark "Last oral intake", deduct 15s
- "past history" or "pertinent history" → mark "Past pertinent history", deduct 15s
- "events" or "what happened" → mark "Events leading to present illness", deduct 15s
- "onset" → mark "Onset", deduct 15s
- "quality" of pain/symptoms → mark "Quality", deduct 15s
- "provocation" or "what makes it worse" → mark "Provocation", deduct 15s
- "radiation" or "does it spread" → mark "Radiation", deduct 15s
- "severity" or "pain scale" or "rate the pain" → mark "Severity", deduct 15s
- "time" or "how long" → mark "Time", deduct 15s
- "cardiovascular" system → mark "Cardiovascular system", deduct 45s
- "neurological" system → mark "Neurological system", deduct 45s
- "pulmonary" system → mark "Pulmonary system", deduct 45s
- "musculoskeletal" system → mark "Musculoskeletal system", deduct 45s
- "integumentary" or "skin/gi/gu/reproductive/psych" → mark "Integumentary / GI/GU / Reproductive / Psychological", deduct 45s

Student said: "${action}"

RESPONSE RULES:
- If vague: ask ONE specific clarifying question, return empty completed array and 0 seconds
- If specific: confirm briefly in 1 sentence, return completed items and time cost
- NEVER say "what is your next step"
- NEVER suggest what to do next
- Do NOT use the word moaning
- Keep response to 1 sentence max

OUTPUT FORMAT — JSON ONLY, nothing before or after:
{"response":"one sentence here","completed":["Exact Label"],"seconds":30}

If vague:
{"response":"Which vital sign?","completed":[],"seconds":0}`;

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
          body: JSON.stringify({ response: 'Action noted.', completed: [], seconds: 15 })
        };
      }

      return {
        statusCode: 200,
        body: JSON.stringify({
          response: parsed.response || 'Action noted.',
          completed: Array.isArray(parsed.completed) ? parsed.completed : [],
          seconds: typeof parsed.seconds === 'number' ? parsed.seconds : 15
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
