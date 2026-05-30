"use client";
import React, { useEffect, useRef, useState } from "react";
import { Room, RoomEvent, Track } from "livekit-client";

interface AvatarStageProps {
  url: string;
  token: string;
  onDisconnect: () => void;
  isSpeaking: boolean;
}

export function AvatarStage({ url, token, onDisconnect, isSpeaking }: AvatarStageProps) {
  const isIframe = url.startsWith("https://bey.chat/");

  if (isIframe) {
    return (
      <div className="relative flex h-full w-full flex-col items-center justify-center overflow-hidden rounded-2xl border border-[color:var(--line)] bg-[color:var(--bg)]/90 backdrop-blur-sm shadow-[0_8px_32px_rgba(0,0,0,0.4)]">
        <iframe
          src={url}
          allow="camera; microphone"
          className="w-full h-full border-none rounded-2xl min-h-[350px]"
          title="Beyond Presence Digital Advisor"
        />
        <div className="absolute bottom-4 right-4 z-50">
          <button
            onClick={onDisconnect}
            className="flex h-10 px-4 items-center justify-center gap-2 rounded-xl border border-red-500/20 bg-red-500/20 text-red-400 hover:bg-red-500/30 hover:text-red-300 transition-all font-semibold text-xs cursor-pointer shadow-lg"
            title="End Conversation"
            aria-label="End Conversation"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.68 13.31a16 16 0 0 0 3.41 2.6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7 2 2 0 0 1 1.72 2v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.42 19.42 0 0 1-3.33-2.67m-2.67-3.34a19.79 19.79 0 0 1-3.07-8.63A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91"/><line x1="22" x2="2" y1="2" y2="22"/></svg>
            Exit Advisor
          </button>
        </div>
      </div>
    );
  }

  const [room, setRoom] = useState<Room | null>(null);
  const [loading, setLoading] = useState(true);
  const [micEnabled, setMicEnabled] = useState(true);
  const [cameraEnabled, setCameraEnabled] = useState(true);
  const [status, setStatus] = useState("Initializing WebRTC Connection...");

  const remoteVideoRef = useRef<HTMLDivElement>(null);
  const remoteAudioRef = useRef<HTMLDivElement>(null);
  const localVideoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    let activeRoom: Room | null = null;

    async function connect() {
      try {
        setStatus("Establishing tunnel to Beyond Presence Cloud...");
        const r = new Room({
          adaptiveStream: true,
          dynacast: true,
        });

        activeRoom = r;
        setRoom(r);

        r.on(RoomEvent.TrackSubscribed, (track, publication, participant) => {
          if (track.kind === "video") {
            const el = track.attach();
            el.className = "w-full h-full object-cover rounded-2xl";
            if (remoteVideoRef.current) {
              remoteVideoRef.current.innerHTML = "";
              remoteVideoRef.current.appendChild(el);
            }
          } else if (track.kind === "audio") {
            const el = track.attach();
            if (remoteAudioRef.current) {
              remoteAudioRef.current.appendChild(el);
            }
          }
        });

        r.on(RoomEvent.ParticipantDisconnected, () => {
          onDisconnect();
        });

        setStatus("Connecting to LiveKit server...");
        await r.connect(url, token);

        setStatus("Requesting camera and microphone inputs...");
        await r.localParticipant.enableCameraAndMicrophone();

        // Bind local camera preview
        const videoPub = Array.from(r.localParticipant.videoTrackPublications.values()).find(
          (pub) => pub.source === Track.Source.Camera
        ) || Array.from(r.localParticipant.videoTrackPublications.values())[0];
        if (videoPub && videoPub.track && localVideoRef.current) {
          videoPub.track.attach(localVideoRef.current);
        }

        setLoading(false);
      } catch (err) {
        console.error("WebRTC room connection failed:", err);
        setStatus(`Error: ${String(err)}`);
        setTimeout(() => onDisconnect(), 3000);
      }
    }

    void connect();

    return () => {
      if (activeRoom) {
        activeRoom.disconnect();
      }
    };
  }, [url, token, onDisconnect]);

  const toggleMic = () => {
    if (!room) return;
    const next = !micEnabled;
    room.localParticipant.setMicrophoneEnabled(next);
    setMicEnabled(next);
  };

  const toggleCamera = () => {
    if (!room) return;
    const next = !cameraEnabled;
    room.localParticipant.setCameraEnabled(next);
    setCameraEnabled(next);
  };

  return (
    <div className="relative flex h-full w-full flex-col items-center justify-center overflow-hidden rounded-2xl border border-[color:var(--line)] bg-[color:var(--bg)]/90 backdrop-blur-sm shadow-[0_8px_32px_rgba(0,0,0,0.4)]">
      {/* Audio sink node */}
      <div ref={remoteAudioRef} className="hidden" />

      {/* Main Avatar Stage */}
      <div className="relative flex-1 w-full h-full">
        {loading ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-[color:var(--bg)] p-6 text-center">
            <div className="relative h-12 w-12 animate-spin rounded-full border-2 border-[color:var(--line-2)] border-t-[color:var(--accent)]" />
            <p className="mt-4 font-mono text-[11px] uppercase tracking-wider text-[color:var(--fg-2)]">
              {status}
            </p>
          </div>
        ) : (
          <div
            ref={remoteVideoRef}
            className={`w-full h-full overflow-hidden transition-all duration-500 ${
              isSpeaking
                ? "shadow-[0_0_40px_rgba(122,90,248,0.25)_inset] border border-[color:var(--accent)]"
                : ""
            }`}
          />
        )}

        {/* Local user floating video viewport */}
        {!loading && (
          <div className="absolute bottom-4 right-4 h-[100px] w-[140px] overflow-hidden rounded-xl border border-[color:var(--line-2)] bg-black/50 shadow-lg transition-transform hover:scale-105">
            <video
              ref={localVideoRef}
              autoPlay
              playsInline
              muted
              className="h-full w-full object-cover scale-x-[-1]"
            />
            <div className="absolute bottom-1.5 left-2 rounded bg-black/60 px-1 py-0.5 text-[8.5px] uppercase font-bold tracking-wider text-white">
              You
            </div>
          </div>
        )}

        {/* Speaking Overlay indicator */}
        {!loading && isSpeaking && (
          <div className="absolute top-4 left-4 flex items-center gap-2 rounded-full border border-violet-500/20 bg-violet-500/10 px-3 py-1 shadow-lg backdrop-blur-md">
            <span className="flex h-2 w-2 relative">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-violet-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-violet-500"></span>
            </span>
            <span className="text-[10px] font-bold uppercase tracking-wider text-violet-400">
              Advisor Speaking
            </span>
          </div>
        )}
      </div>

      {/* Control panel buttons */}
      {!loading && (
        <div className="absolute bottom-4 left-1/2 flex -translate-x-1/2 items-center gap-3 rounded-2xl border border-[color:var(--line)] bg-black/60 px-4 py-2.5 shadow-2xl backdrop-blur-md">
          {/* Mute microphone toggle */}
          <button
            onClick={toggleMic}
            className={`flex h-10 w-10 items-center justify-center rounded-xl border transition-all ${
              micEnabled
                ? "border-zinc-800 bg-zinc-900/80 text-zinc-300 hover:border-zinc-700 hover:text-white"
                : "border-red-900/30 bg-red-950/20 text-red-400 hover:bg-red-950/30"
            }`}
            title={micEnabled ? "Mute Microphone" : "Unmute Microphone"}
            aria-label={micEnabled ? "Mute Microphone" : "Unmute Microphone"}
          >
            {micEnabled ? (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" x2="12" y1="19" y2="22"/></svg>
            ) : (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="2" x2="22" y1="2" y2="22"/><path d="M18.89 13.23A7.12 7.12 0 0 0 19 12v-2"/><path d="M5 10v2a7 7 0 0 0 12 5"/><path d="M15 9.34V5a3 3 0 0 0-5.68-1.33"/><path d="M9 9v3a3 3 0 0 0 5.12 2.12"/><line x1="12" x2="12" y1="19" y2="22"/></svg>
            )}
          </button>

          {/* Toggle Camera preview */}
          <button
            onClick={toggleCamera}
            className={`flex h-10 w-10 items-center justify-center rounded-xl border transition-all ${
              cameraEnabled
                ? "border-zinc-800 bg-zinc-900/80 text-zinc-300 hover:border-zinc-700 hover:text-white"
                : "border-red-900/30 bg-red-950/20 text-red-400 hover:bg-red-950/30"
            }`}
            title={cameraEnabled ? "Turn Camera Off" : "Turn Camera On"}
            aria-label={cameraEnabled ? "Turn Camera Off" : "Turn Camera On"}
          >
            {cameraEnabled ? (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m22 8-6 4 6 4V8Z"/><rect width="14" height="12" x="2" y="6" rx="2" ry="2"/></svg>
            ) : (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m2 2 20 20"/><path d="M21 16V8a2 2 0 0 0-2-2h-9.83"/><path d="m7 7-5 5v6a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-1"/><path d="m22 8-6 4 6 4V8Z"/></svg>
            )}
          </button>

          {/* End Call / Disconnect session */}
          <button
            onClick={onDisconnect}
            className="flex h-10 w-10 items-center justify-center rounded-xl border border-red-500/20 bg-red-500/10 text-red-400 hover:bg-red-500/20 hover:text-red-300 transition-all"
            title="End Conversation"
            aria-label="End Conversation"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.68 13.31a16 16 0 0 0 3.41 2.6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7 2 2 0 0 1 1.72 2v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.42 19.42 0 0 1-3.33-2.67m-2.67-3.34a19.79 19.79 0 0 1-3.07-8.63A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91"/><line x1="22" x2="2" y1="2" y2="22"/></svg>
          </button>
        </div>
      )}
    </div>
  );
}
