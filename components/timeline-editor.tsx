"use client";

import { useEffect, useRef, useState } from "react";
import { t, type Locale, type MessageKey } from "@/lib/i18n";
import { JOINT_LIMITS } from "@/lib/presets";
import { animationForClip, sampleAnimation, EASES } from "@/lib/motion";
import { POSES } from "@/lib/poses";
import {
  addKeyframe,
  animationFromPose,
  applyPosePresetToKeyframe,
  channelLimits,
  CURVE_CHANNELS,
  duplicateKeyframe,
  followPose,
  mirrorKeyframe,
  moveKeyframe,
  removeKeyframe,
  renameAnimation,
  setDuration,
  setLoop,
  syncLoopEndpoints,
  waveStarter,
  writeEase,
  writeJoint,
  writePose,
  writeScalar,
  writeYaw,
  type CurveChannel,
  type EditResult,
} from "@/lib/timeline";
import type { AnimationDef, BuiltinClipId, EaseId, Joints } from "@/lib/types";

const JOINT_KEYS = Object.keys(JOINT_LIMITS) as (keyof Joints)[];

export function TimelineEditor({
  locale,
  animation,
  rest,
  playerId,
  activeClip,
  getPlayhead,
  onChange,
  onError,
  onCreate,
  onScrub,
  onScrubEnd,
}: {
  locale: Locale;
  animation: AnimationDef | null;
  rest: Joints;
  playerId: string;
  activeClip?: BuiltinClipId;
  getPlayhead: () => number;
  onChange: (animation: AnimationDef) => void;
  onError: (error: string) => void;
  onCreate: (animation: AnimationDef) => void;
  onScrub: (time: number) => void;
  onScrubEnd: () => void;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const scrubbing = useRef(false);
  const [playhead, setPlayhead] = useState(0);
  const [held, setHeld] = useState<number | null>(null);
  const [paused, setPaused] = useState(false);
  const [index, setIndex] = useState(0);
  const [channel, setChannel] = useState<CurveChannel>("rArmZ");
  const [seenPlayer, setSeenPlayer] = useState(playerId);
  const tr = (key: MessageKey, vars?: Record<string, string | number>) => t(locale, key, vars);

  if (seenPlayer !== playerId) {
    setSeenPlayer(playerId);
    setIndex(0);
    setHeld(null);
  }

  useEffect(() => {
    if (!animation || paused) return;
    let frame = 0;
    const tick = () => {
      if (!scrubbing.current) setPlayhead(getPlayhead());
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [animation, getPlayhead, paused, playerId]);

  if (!animation) {
    return (
      <div className="timeline-empty">
        <p>{tr("timelineEmpty")}</p>
        <div className="row" style={{ flexWrap: "wrap", gap: 6 }}>
          {activeClip ? (
            <button
              className="btn primary"
              type="button"
              onClick={() => onCreate(animationForClip(activeClip))}
            >
              {tr("timelineExpandClip")}
            </button>
          ) : null}
          <button className="btn" type="button" onClick={() => onCreate(waveStarter(tr("waveDraftName"), rest))}>
            {tr("timelineWave")}
          </button>
          <button className="btn ghost" type="button" onClick={() => onCreate(animationFromPose(tr("clipDraftName"), rest))}>
            {tr("timelineFromPose")}
          </button>
        </div>
      </div>
    );
  }

  const selected = Math.max(0, Math.min(animation.keyframes.length - 1, seenPlayer === playerId ? index : 0));
  const frame = animation.keyframes[selected];
  const shownTime = held === null ? playhead : (animation.keyframes[held]?.time ?? playhead);
  const limits = channelLimits(channel);

  function apply(result: EditResult) {
    if (!result.ok) {
      onError(result.error);
      return;
    }
    setIndex(result.index);
    onChange(result.animation);
    if (paused) {
      const kf = result.animation.keyframes[result.index];
      if (kf) {
        setPlayhead(kf.time);
        onScrub(kf.time);
      }
    }
  }

  function togglePlay() {
    if (paused) {
      setPaused(false);
      onScrubEnd();
    } else {
      setPaused(true);
      onScrub(playhead);
    }
  }

  function prevKey() {
    if (!animation) return;
    const prev = Math.max(0, selected - 1);
    const time = animation.keyframes[prev].time;
    setIndex(prev);
    setPlayhead(time);
    setPaused(true);
    onScrub(time);
  }

  function nextKey() {
    if (!animation) return;
    const next = Math.min(animation.keyframes.length - 1, selected + 1);
    const time = animation.keyframes[next].time;
    setIndex(next);
    setPlayhead(time);
    setPaused(true);
    onScrub(time);
  }

  function timeAt(clientX: number) {
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect || rect.width <= 0) return 0;
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    return ratio * animation!.duration;
  }

  function pointerRatio(clientX: number) {
    return timeAt(clientX);
  }

  const samples = Array.from({ length: 40 }, (_, step) => {
    const time = (step / 39) * animation.duration;
    return sampleAnimation(animation, time, rest);
  });
  const curve = samples.map((sample, step) => {
    const value = channel === "bob" || channel === "sway" || channel === "roll" || channel === "cape" || channel === "yaw" ? sample[channel] : sample.joints[channel];
    const x = (step / 39) * 100;
    const y = 100 - ((value - limits.min) / Math.max(0.001, limits.max - limits.min)) * 100;
    return `${x},${Math.min(100, Math.max(0, y))}`;
  });

  return (
    <div className="timeline">
      <div className="row" style={{ alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <div className="row" style={{ gap: 6 }}>
          <button className={paused ? "btn" : "btn primary"} type="button" onClick={togglePlay}>
            {paused ? tr("timelinePlay") : tr("timelinePause")}
          </button>
          <button className="btn ghost" type="button" onClick={prevKey} disabled={selected <= 0} title={tr("timelinePrevKey")}>
            {tr("timelinePrevKey")}
          </button>
          <button className="btn ghost" type="button" onClick={nextKey} disabled={selected >= animation.keyframes.length - 1} title={tr("timelineNextKey")}>
            {tr("timelineNextKey")}
          </button>
        </div>
        {activeClip ? (
          <button
            className="btn ghost"
            type="button"
            onClick={() => onCreate(animationForClip(activeClip))}
            title={tr("timelineExpandClip")}
          >
            {tr("timelineExpandClip")}
          </button>
        ) : null}
      </div>
      <div className="timeline-head">
        <label className="field">
          <span>{tr("timelineName")}</span>
          <input
            value={animation.name}
            maxLength={48}
            aria-label={tr("timelineName")}
            onChange={(event) => {
              const result = renameAnimation(animation, event.target.value);
              if (result.ok) onChange(result.animation);
            }}
          />
        </label>
        <label className="check">
          <input type="checkbox" checked={animation.loop} onChange={(event) => apply(setLoop(animation, event.target.checked))} />
          {tr("timelineLoop")}
        </label>
      </div>
      <label className="slider">
        <span>{tr("timelineDuration")}</span>
        <input
          type="range"
          min={0.4}
          max={8}
          step={0.1}
          value={Math.min(8, Math.max(0.4, animation.duration))}
          aria-label={tr("timelineDuration")}
          onChange={(event) => apply(setDuration(animation, Number(event.target.value)))}
        />
        <strong>{animation.duration.toFixed(1)}s</strong>
      </label>
      <div
        className="track"
        ref={trackRef}
        role="slider"
        tabIndex={0}
        aria-label={tr("timeline")}
        aria-valuemin={0}
        aria-valuemax={animation.duration}
        aria-valuenow={Number(shownTime.toFixed(2))}
        onPointerDown={(event) => {
          if ((event.target as HTMLElement).closest(".key")) return;
          scrubbing.current = true;
          setPaused(true);
          const time = pointerRatio(event.clientX);
          setPlayhead(time);
          onScrub(time);
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={(event) => {
          if (!scrubbing.current || held !== null) return;
          const time = pointerRatio(event.clientX);
          setPlayhead(time);
          onScrub(time);
        }}
        onPointerUp={(event) => {
          if (!scrubbing.current) return;
          scrubbing.current = false;
          if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
        }}
      >
        <svg className="curve" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
          <polyline points={curve.join(" ")} />
        </svg>
        <div className="playhead" style={{ left: `${(shownTime / animation.duration) * 100}%` }} />
        {animation.keyframes.map((key, keyIndex) => (
          <button
            key={keyIndex}
            type="button"
            className={keyIndex === selected ? "key active" : "key"}
            style={{ left: `${(key.time / animation.duration) * 100}%` }}
            aria-label={tr("timelineKey", { n: keyIndex + 1 })}
            onPointerDown={(event) => {
              event.stopPropagation();
              setIndex(keyIndex);
              setHeld(keyIndex);
              scrubbing.current = true;
              setPaused(true);
              setPlayhead(key.time);
              onScrub(key.time);
              event.currentTarget.setPointerCapture(event.pointerId);
            }}
            onPointerMove={(event) => {
              if (held !== keyIndex) return;
              const time = timeAt(event.clientX);
              const result = moveKeyframe(animation, keyIndex, time);
              if (!result.ok) return;
              setPlayhead(result.animation.keyframes[result.index].time);
              onScrub(result.animation.keyframes[result.index].time);
              onChange(result.animation);
            }}
            onPointerUp={(event) => {
              setHeld(null);
              scrubbing.current = false;
              if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
            }}
          />
        ))}
      </div>
      <p className="hint">{tr("timelineHint")}</p>
      <label className="field">
        <span>{tr("timelineEase")}</span>
        <select
          value={frame.ease ?? "smoothstep"}
          aria-label={tr("timelineEase")}
          title={tr("timelineEaseFrom")}
          onChange={(event) => apply(writeEase(animation, selected, event.target.value === "smoothstep" ? null : (event.target.value as EaseId)))}
        >
          {EASES.map((ease) => (
            <option key={ease} value={ease}>
              {tr(`ease.${ease}`)}
            </option>
          ))}
        </select>
      </label>
      <label className="slider">
        <span>{tr("timelineYaw")}</span>
        <input
          type="range"
          min={-360}
          max={360}
          step={1}
          value={frame.yaw ?? 0}
          aria-label={tr("timelineYaw")}
          onChange={(event) => apply(writeYaw(animation, selected, Number(event.target.value)))}
        />
        <strong>{Math.round(frame.yaw ?? 0)}°</strong>
      </label>
      <div className="row" style={{ flexWrap: "wrap", gap: 6 }}>
        <button className="btn" type="button" onClick={() => apply(addKeyframe(animation, shownTime, rest))}>
          {tr("timelineAdd")}
        </button>
        <button className="btn ghost" type="button" onClick={() => apply(removeKeyframe(animation, selected))}>
          {tr("timelineDelete")}
        </button>
        <button className="btn ghost" type="button" onClick={() => apply(duplicateKeyframe(animation, selected))}>
          {tr("timelineDuplicateKey")}
        </button>
        <button className="btn ghost" type="button" onClick={() => apply(mirrorKeyframe(animation, selected, rest))}>
          {tr("timelineMirrorKey")}
        </button>
        <button className="btn ghost" type="button" onClick={() => apply(syncLoopEndpoints(animation))}>
          {tr("timelineSyncLoop")}
        </button>
        <button className="btn ghost" type="button" onClick={() => apply(writePose(animation, selected, rest))}>
          {tr("timelineWrite")}
        </button>
        <button className="btn ghost" type="button" onClick={() => apply(followPose(animation, selected))}>
          {tr("timelineFollow")}
        </button>
      </div>
      <label className="field" style={{ marginTop: 8 }}>
        <span>{tr("timelineApplyPose")}</span>
        <select
          value=""
          aria-label={tr("timelineApplyPose")}
          onChange={(event) => {
            const poseId = event.target.value;
            if (!poseId) return;
            const targetPose = POSES.find((p) => p.id === poseId);
            if (targetPose) {
              apply(applyPosePresetToKeyframe(animation, selected, targetPose.joints));
            }
          }}
        >
          <option value="">{`-- ${tr("timelineApplyPose")} --`}</option>
          {POSES.map((p) => (
            <option key={p.id} value={p.id}>
              {tr(`pose.${p.id}` as MessageKey)}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        <span>{tr("timelineChannel")}</span>
        <select value={channel} aria-label={tr("timelineChannel")} onChange={(event) => setChannel(event.target.value as CurveChannel)}>
          {CURVE_CHANNELS.map((item) => (
            <option key={item} value={item}>
              {tr(channelLabel(item))}
            </option>
          ))}
        </select>
      </label>
      <div className="sliders key-sliders">
        {JOINT_KEYS.map((key) => {
          const keyed = frame.joints[key];
          const value = keyed ?? rest[key];
          return (
            <label className="slider" key={key}>
              <span className={keyed === undefined ? undefined : "keyed"}>{tr(`joint.${key}`)}</span>
              <input
                type="range"
                min={JOINT_LIMITS[key].min}
                max={JOINT_LIMITS[key].max}
                value={value}
                aria-label={tr(`joint.${key}`)}
                onChange={(event) => apply(writeJoint(animation, selected, key, Number(event.target.value)))}
              />
              <strong>{Math.round(value)}°</strong>
            </label>
          );
        })}
        {(["bob", "sway", "roll", "cape"] as const).map((key) => (
          <label className="slider" key={key}>
            <span>{tr(`scalar.${key}`)}</span>
            <input
              type="range"
              min={channelLimits(key).min}
              max={channelLimits(key).max}
              step={key === "cape" ? 1 : 0.1}
              value={frame[key]}
              aria-label={tr(`scalar.${key}`)}
              onChange={(event) => apply(writeScalar(animation, selected, key, Number(event.target.value)))}
            />
            <strong>{frame[key].toFixed(key === "cape" ? 0 : 1)}</strong>
          </label>
        ))}
      </div>
    </div>
  );
}

function channelLabel(channel: CurveChannel): MessageKey {
  if (channel === "yaw") return "timelineYaw";
  if (channel === "bob" || channel === "sway" || channel === "roll" || channel === "cape") return `scalar.${channel}`;
  return `joint.${channel}`;
}
