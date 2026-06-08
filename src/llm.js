export async function generateWithOpenAI({ apiKey, model, messages, responseSchema }) {
  if (!apiKey) {
    return null;
  }

  const body = {
    model: model || 'gpt-4.1-mini',
    input: messages,
    text: responseSchema
      ? {
          format: {
            type: 'json_schema',
            name: 'counseling_turn',
            schema: responseSchema,
            strict: true,
          },
        }
      : undefined,
  };

  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenAI request failed: ${response.status} ${errorText}`);
  }

  const data = await response.json();
  const text = data.output_text ?? data.output?.[0]?.content?.[0]?.text ?? '';
  return JSON.parse(text);
}
