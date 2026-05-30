'use client';

import { useRef, useState, useCallback, useEffect } from 'react';

const CHUNK_MS = 2500; // record → send cycle duration

function getSupportedMimeType(): string {
  const candidates = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/ogg;codecs=opus',
    'audio/mp4',
  ];
  return candidates.find(t => MediaRecorder.isTypeSupported(t)) ?? '';
}

async function transcribeChunk(blob: Blob, contextHint: string): Promise<string> {
  if (blob.size < 500) return ''; // skip near-silent chunks
  const form = new FormData();
  form.append('audio', blob, 'audio.webm');
  // Pass the last ~20 words so Whisper keeps linguistic context across chunks
  const hint = contextHint.split(' ').slice(-20).join(' ');
  if (hint) form.append('prompt', hint);

  try {
    const res = await fetch('/api/transcribe', { method: 'POST', body: form });
    if (!res.ok) return '';
    const { text } = await res.json();
    return (text as string)?.trim() ?? '';
  } catch {
    return '';
  }
}

interface UseVoiceRecordingOptions {
  /** Called with each new transcript chunk. Append to your input field. */
  onChunk: (text: string) => void;
}

export function useVoiceRecording({ onChunk }: UseVoiceRecordingOptions) {
  const [isRecording, setIsRecording] = useState(false);

  const streamRef    = useRef<MediaStream | null>(null);
  const recorderRef  = useRef<MediaRecorder | null>(null);
  const timerRef     = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeRef    = useRef(false);
  const cumulativeRef = useRef(''); // full transcript so far, for context hints
  const onChunkRef   = useRef(onChunk);

  useEffect(() => { onChunkRef.current = onChunk; }, [onChunk]);

  const runCycle = useCallback((stream: MediaStream) => {
    if (!activeRef.current) return;

    const mimeType = getSupportedMimeType();
    const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : {});
    recorderRef.current = recorder;
    const chunks: Blob[] = [];

    recorder.ondataavailable = e => {
      if (e.data.size > 0) chunks.push(e.data);
    };

    recorder.onstop = async () => {
      // Always transcribe the chunk, whether we stopped or the timer fired
      const blob = new Blob(chunks, { type: recorder.mimeType || 'audio/webm' });
      const text = await transcribeChunk(blob, cumulativeRef.current);
      if (text) {
        cumulativeRef.current = cumulativeRef.current
          ? `${cumulativeRef.current} ${text}`
          : text;
        onChunkRef.current(text);
      }
      // Keep cycling only if still active
      if (activeRef.current) runCycle(stream);
    };

    recorder.start();

    timerRef.current = setTimeout(() => {
      if (recorder.state === 'recording') recorder.stop();
    }, CHUNK_MS);
  }, []);

  const start = useCallback(async () => {
    if (activeRef.current) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      cumulativeRef.current = '';
      activeRef.current = true;
      setIsRecording(true);
      runCycle(stream);
    } catch {
      // Microphone permission denied — fail silently
    }
  }, [runCycle]);

  const stop = useCallback(() => {
    if (!activeRef.current) return;
    activeRef.current = false;
    if (timerRef.current) clearTimeout(timerRef.current);
    // Stop current recorder — triggers onstop → final chunk gets transcribed
    if (recorderRef.current?.state === 'recording') {
      recorderRef.current.stop();
    }
    // Kill the mic stream after a short delay so onstop can finish
    setTimeout(() => {
      streamRef.current?.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }, 400);
    setIsRecording(false);
  }, []);

  const toggle = useCallback(() => {
    if (activeRef.current) stop(); else start();
  }, [start, stop]);

  // Cleanup on unmount
  useEffect(() => () => {
    activeRef.current = false;
    if (timerRef.current) clearTimeout(timerRef.current);
    streamRef.current?.getTracks().forEach(t => t.stop());
  }, []);

  return { isRecording, toggle, start, stop };
}
