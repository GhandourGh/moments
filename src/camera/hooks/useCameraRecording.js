import { useCallback, useEffect, useRef, useState } from "react";
import { VIDEO_MAX_MS } from "../constants.js";
import { playRecordStart, playRecordStop } from "../../lib/sounds.js";

export function useCameraRecording({
  streamRef,
  adapter,
  isSelfie,
  torchOn,
  torchSupported,
  selfieFlashOn,
  setPending,
  setError,
  onRecordingChange,
}) {
  const recorderRef = useRef(null);
  const recordChunksRef = useRef([]);
  const recordTimerRef = useRef(0);
  const recordStartRef = useRef(0);
  const recordMimeRef = useRef("");
  const [recording, setRecording] = useState(false);
  const [recordElapsed, setRecordElapsed] = useState(0);
  const [ringLightOn, setRingLightOn] = useState(false);

  useEffect(() => {
    onRecordingChange?.(recording);
  }, [recording, onRecordingChange]);

  useEffect(() => () => {
    if (recordTimerRef.current) {
      clearInterval(recordTimerRef.current);
      recordTimerRef.current = 0;
    }
    if (recorderRef.current) {
      try { recorderRef.current.ondataavailable = null; recorderRef.current.onstop = null; } catch { /* no-op */ }
      try { recorderRef.current.state !== "inactive" && recorderRef.current.stop(); } catch { /* no-op */ }
      recorderRef.current = null;
    }
  }, []);

  const stopRecording = useCallback(() => {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state === "inactive") return;
    try { navigator.vibrate?.(8); } catch { /* no-op */ }
    playRecordStop();
    try {
      if (recorder.state === "recording") recorder.requestData();
      recorder.stop();
    } catch {
      /* onstop may still fire */
    }
  }, []);

  const abortRecording = useCallback(() => {
    if (recorderRef.current) {
      try { recorderRef.current.ondataavailable = null; recorderRef.current.onstop = null; recorderRef.current.onerror = null; } catch { /* no-op */ }
      try { recorderRef.current.state !== "inactive" && recorderRef.current.stop(); } catch { /* no-op */ }
      recorderRef.current = null;
      recordChunksRef.current = [];
    }
    if (recordTimerRef.current) {
      clearInterval(recordTimerRef.current);
      recordTimerRef.current = 0;
    }
    setRecording(false);
    setRecordElapsed(0);
    setRingLightOn(false);
  }, []);

  const startRecording = useCallback(async () => {
    const stream = streamRef.current;
    if (!stream) return { error: "Camera not ready." };
    if (recorderRef.current) return { error: "Already recording." };

    const videoTracks = stream.getVideoTracks();
    if (!videoTracks.length || videoTracks[0].readyState !== "live") {
      return { error: "Camera not ready." };
    }

    let recorder;
    try {
      recorder = adapter.createMediaRecorder(stream);
    } catch (e) {
      if (e?.code === "no-mediarecorder") {
        return { error: "Video recording isn't supported in this browser." };
      }
      return { error: "This browser can't record video. Try a different browser." };
    }

    const mime = recorder.mimeType || adapter.pickVideoMime() || "video/webm";
    recordMimeRef.current = mime;

    let torchLit = false;
    let ringLit = false;
    if (!isSelfie && torchSupported && torchOn) {
      torchLit = await adapter.setTorch(stream, true);
    } else if (isSelfie && selfieFlashOn) {
      setRingLightOn(true);
      ringLit = true;
    }

    recordChunksRef.current = [];
    recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) recordChunksRef.current.push(e.data);
    };
    recorder.onstop = () => {
      const blob = new Blob(recordChunksRef.current, {
        type: recordMimeRef.current || recorder.mimeType || "video/webm",
      });
      recordChunksRef.current = [];
      recorderRef.current = null;
      clearInterval(recordTimerRef.current);
      recordTimerRef.current = 0;
      if (torchLit) adapter.setTorch(streamRef.current, false).catch(() => {});
      if (ringLit) setRingLightOn(false);
      setRecording(false);
      setRecordElapsed(0);

      if (blob.size > 0) {
        setError?.("");
        setPending({ blob, url: URL.createObjectURL(blob), mediaType: "video" });
      } else {
        setError?.("Recording was empty. Try holding the button a little longer.");
      }
    };

    recorder.onerror = () => {
      setError?.("Recording failed. Try again.");
      abortRecording();
    };

    recorderRef.current = recorder;
    try {
      // No timeslice — one clean blob on stop (works for short clips on iOS Safari).
      recorder.start();
    } catch {
      recorderRef.current = null;
      if (torchLit) adapter.setTorch(stream, false).catch(() => {});
      if (ringLit) setRingLightOn(false);
      return { error: "Couldn't start recording. Try again." };
    }

    recordStartRef.current = Date.now();
    setRecording(true);
    setRecordElapsed(0);
    try { navigator.vibrate?.(14); } catch { /* no-op */ }
    playRecordStart();
    recordTimerRef.current = setInterval(() => {
      const ms = Date.now() - recordStartRef.current;
      setRecordElapsed(ms);
      if (ms >= VIDEO_MAX_MS) stopRecording();
    }, 200);
    return { ok: true };
  }, [adapter, abortRecording, isSelfie, selfieFlashOn, setError, setPending, stopRecording, streamRef, torchOn, torchSupported]);

  return {
    recording,
    recordElapsed,
    ringLightOn,
    startRecording,
    stopRecording,
    abortRecording,
  };
}
