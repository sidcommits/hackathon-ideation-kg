"use client";
import { useEffect, useRef, useState } from "react";

/* Near-realtime dictation via OpenAI transcription (through our /api/transcribe
   proxy). Records the mic with MediaRecorder and, every `intervalMs`, re-transcribes
   the whole clip-so-far and hands back the FULL transcript (caller replaces the
   input with it). Re-transcribing the whole clip (rather than appending slices)
   avoids word-boundary cuts. */
const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

type Options = { onText: (fullTranscript: string) => void; intervalMs?: number };

export function useDictation({ onText, intervalMs = 2000 }: Options) {
  const [supported, setSupported] = useState(false);
  const [recording, setRecording] = useState(false);
  const [busy, setBusy] = useState(false); // a transcription request is in flight

  const onTextRef = useRef(onText);
  useEffect(() => {
    onTextRef.current = onText;
  });

  const recRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const inflightRef = useRef(false);

  useEffect(() => {
    setSupported(
      typeof window !== "undefined" &&
        !!navigator.mediaDevices?.getUserMedia &&
        typeof MediaRecorder !== "undefined",
    );
  }, []);

  const transcribe = async () => {
    if (inflightRef.current || chunksRef.current.length === 0) return;
    inflightRef.current = true;
    setBusy(true);
    try {
      const blob = new Blob(chunksRef.current, { type: recRef.current?.mimeType || "audio/webm" });
      // Send the RAW audio as the request body (Content-Type = the blob's mime).
      // The backend reads it via request.body() and re-wraps it for OpenAI — so
      // this must NOT be multipart/FormData.
      const r = await fetch(`${API_BASE}/api/transcribe`, {
        method: "POST",
        headers: { "Content-Type": blob.type || "audio/webm" },
        body: blob,
      });
      if (r.ok) {
        const { text } = await r.json();
        if (typeof text === "string" && text) onTextRef.current(text);
      } else {
        console.error("transcribe failed", r.status, await r.text().catch(() => ""));
      }
    } catch {
      /* transient network error — next interval retries */
    } finally {
      inflightRef.current = false;
      setBusy(false);
    }
  };

  const start = async () => {
    if (recording) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      chunksRef.current = [];
      const rec = new MediaRecorder(stream);
      rec.ondataavailable = (e) => {
        if (e.data.size) chunksRef.current.push(e.data);
      };
      rec.start(1000); // 1s timeslices so the accumulated blob stays decodable
      recRef.current = rec;
      setRecording(true);
      timerRef.current = setInterval(transcribe, intervalMs);
    } catch {
      setRecording(false); // mic permission denied / unavailable
    }
  };

  const stop = async () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    const rec = recRef.current;
    if (rec && rec.state !== "inactive") {
      await new Promise<void>((resolve) => {
        rec.onstop = () => resolve();
        rec.stop();
      });
    }
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setRecording(false);
    await transcribe(); // final pass over the complete clip
    chunksRef.current = [];
  };

  const toggle = () => {
    if (recording) void stop();
    else void start();
  };

  // Stop the stream if the component unmounts mid-recording.
  useEffect(
    () => () => {
      if (timerRef.current) clearInterval(timerRef.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
    },
    [],
  );

  return { supported, recording, busy, toggle, start, stop };
}
