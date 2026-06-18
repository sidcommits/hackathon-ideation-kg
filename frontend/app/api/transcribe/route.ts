export const runtime = 'nodejs';

export async function POST(req: Request) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    console.error('[transcribe] GROQ_API_KEY is not set in .env.local');
    return Response.json({ text: '' }); // soft fail — recording continues, just no text
  }

  const data = await req.formData();
  const audio = data.get('audio') as File | null;
  const prompt = (data.get('prompt') as string | null) ?? '';

  if (!audio || audio.size < 500) {
    return Response.json({ text: '' });
  }

  const form = new FormData();
  form.append('file', audio, 'audio.webm');
  form.append('model', 'whisper-large-v3-turbo');
  form.append('response_format', 'json');
  form.append('temperature', '0');
  if (prompt) form.append('prompt', prompt);

  const res = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  });

  if (!res.ok) {
    const err = await res.text();
    console.error(`[transcribe] Groq error ${res.status}:`, err);
    return Response.json({ text: '' });
  }

  const result = await res.json();
  return Response.json({ text: result.text ?? '' });
}
