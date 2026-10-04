import { useEffect, useRef, useState } from 'react';
import { beatDuration, type Beat } from './beats';

const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

/**
 * Plays beats one at a time. A fresh run animates from the start; opening an existing run shows its final
 * state until the reader asks for a replay. New beats that arrive while playing join the queue.
 */
export function usePlayback(beats: Beat[], runKey: string, animateFromStart: boolean) {
  const [shown, setShown] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const initialised = useRef<string | null>(null);

  const playingRef = useRef(playing);
  playingRef.current = playing;
  const caughtUp = useRef(true);
  useEffect(() => {
    if (!beats.length) return;
    if (initialised.current !== runKey) {
      initialised.current = runKey;
      const animate = animateFromStart && !reducedMotion();
      setShown(animate ? 0 : beats.length);
      setPlaying(animate);
      return;
    }
    // Live updates while playback is idle and caught up appear straight away rather than replaying.
    if (!playingRef.current && caughtUp.current) setShown(beats.length);
  }, [runKey, beats.length, animateFromStart]);

  useEffect(() => {
    caughtUp.current = shown >= beats.length;
    if (!playing) return;
    if (shown >= beats.length) return;
    const timer = window.setTimeout(() => setShown((n) => n + 1), beatDuration(beats[shown]) / speed);
    return () => window.clearTimeout(timer);
  }, [playing, shown, beats, speed]);

  return {
    shown: Math.min(shown, beats.length),
    playing: playing && shown < beats.length,
    speed,
    setSpeed,
    /** Continue animating from where playback is, e.g. after the reader approves an experiment. */
    play: () => setPlaying(true),
    replay: () => {
      setShown(0);
      setPlaying(true);
    },
    skip: () => {
      setShown(beats.length);
    },
  };
}
