import { useEffect, useRef, useState } from 'react';
import {
  AGENT_COUNT,
  assignVerdicts,
  buildCinemaLayout,
  CINEMA_TIMING,
  type CinemaSeat,
  cinemaMinDurationMs,
  cinemaPhaseLabel,
  cinemaVerdictStartMs,
} from '@/lib/agentCinema';

export interface AgentCinemaResult {
  greenCount: number;
  redCount: number;
  greenRatio: number;
}

interface AgentCinemaVerdictProps {
  taskTitle: string;
  taskSubtitle?: string;
  greenRatio: number;
  minDurationMs?: number;
  onComplete?: (result: AgentCinemaResult) => void;
}

export function AgentCinemaVerdict({
  taskTitle,
  taskSubtitle,
  greenRatio,
  minDurationMs = cinemaMinDurationMs(),
  onComplete,
}: AgentCinemaVerdictProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const seatsRef = useRef<CinemaSeat[]>([]);
  const startRef = useRef(performance.now());
  const completedRef = useRef(false);
  const ratioLockedRef = useRef(false);
  const activeRatioRef = useRef(greenRatio);
  const [stats, setStats] = useState({
    spawned: 0,
    green: 0,
    red: 0,
    phase: 'Preparing the grid…',
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    completedRef.current = false;
    ratioLockedRef.current = false;
    activeRatioRef.current = greenRatio;
    startRef.current = performance.now();

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const rect = canvas.getBoundingClientRect();
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const layout = buildCinemaLayout(rect.width, rect.height);
      assignVerdicts(layout.seats, activeRatioRef.current);
      seatsRef.current = layout.seats;
      return { layout, w: rect.width, h: rect.height };
    };

    let { layout, w, h } = resize();
    const onResize = () => {
      ({ layout, w, h } = resize());
    };
    window.addEventListener('resize', onResize);

    const verdictLockAt = cinemaVerdictStartMs() - CINEMA_TIMING.ratioLockBeforeVerdictMs;

    const drawFlatScreen = (elapsed: number) => {
      const s = layout.screen;
      const fade = Math.min(1, Math.max(0, (elapsed - 600) / 2000));

      ctx.strokeStyle = `rgba(245, 166, 35, ${0.5 * fade})`;
      ctx.lineWidth = 1.5;
      ctx.fillStyle = `rgba(245, 166, 35, ${0.12 * fade})`;
      ctx.fillRect(s.x, s.y, s.w, s.h);
      ctx.strokeRect(s.x, s.y, s.w, s.h);

      if (fade > 0.25) {
        ctx.fillStyle = `rgba(255,255,255,${0.9 * fade})`;
        ctx.font = '600 14px DM Sans, system-ui';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(taskTitle, s.x + s.w / 2, s.y + s.h * 0.42);
        if (taskSubtitle) {
          ctx.fillStyle = `rgba(255,255,255,${0.5 * fade})`;
          ctx.font = '400 11px DM Sans, system-ui';
          ctx.fillText(taskSubtitle, s.x + s.w / 2, s.y + s.h * 0.72);
        }
      }
    };

    const drawFlatGrid = () => {
      const g = layout.grid;
      ctx.strokeStyle = 'rgba(255,255,255,0.04)';
      ctx.lineWidth = 1;
      ctx.strokeRect(g.x, g.y, g.w, g.h);
    };

    const drawSeat2D = (seat: CinemaSeat, elapsed: number) => {
      const half = seat.size / 2;
      const showVerdict = elapsed >= seat.verdictAt;
      const reviewing = elapsed >= CINEMA_TIMING.introMs && !showVerdict;

      if (showVerdict) {
        seat.glow = Math.min(1, (elapsed - seat.verdictAt) / CINEMA_TIMING.verdictGlowMs);
      }

      let fill = 'rgba(51, 65, 85, 0.75)';
      if (showVerdict && seat.finalVerdict === 'green') {
        fill = `rgba(34, 197, 94, ${0.5 + seat.glow * 0.5})`;
      } else if (showVerdict && seat.finalVerdict === 'red') {
        fill = `rgba(239, 68, 68, ${0.5 + seat.glow * 0.5})`;
      } else if (reviewing) {
        const breathe = (Math.sin(elapsed / 700 + seat.id * 0.02) + 1) / 2;
        fill = `rgba(245, 166, 35, ${0.22 + breathe * 0.12})`;
      }

      ctx.fillStyle = fill;
      ctx.fillRect(seat.x - half, seat.y - half, half * 2, half * 2);

      if (showVerdict && seat.glow > 0.3) {
        ctx.strokeStyle =
          seat.finalVerdict === 'green'
            ? `rgba(134, 239, 172, ${seat.glow * 0.8})`
            : `rgba(252, 165, 165, ${seat.glow * 0.8})`;
        ctx.lineWidth = 1;
        ctx.strokeRect(seat.x - half - 0.5, seat.y - half - 0.5, half * 2 + 1, half * 2 + 1);
      }

      return true;
    };

    let frame: number;
    const loop = (now: number) => {
      const elapsed = now - startRef.current;
      ctx.clearRect(0, 0, w, h);

      ctx.fillStyle = '#080c12';
      ctx.fillRect(0, 0, w, h);

      drawFlatGrid();
      drawFlatScreen(elapsed);

      if (elapsed >= verdictLockAt && !ratioLockedRef.current && seatsRef.current.length) {
        ratioLockedRef.current = true;
        assignVerdicts(seatsRef.current, activeRatioRef.current);
      }

      let spawned = 0;
      let green = 0;
      let red = 0;

      for (const seat of seatsRef.current) {
        if (drawSeat2D(seat, elapsed)) spawned++;
        if (elapsed >= seat.verdictAt) {
          if (seat.finalVerdict === 'green') green++;
          else red++;
        }
      }

      setStats({
        spawned,
        green,
        red,
        phase: cinemaPhaseLabel(elapsed, spawned, green + red),
      });

      const done = elapsed >= minDurationMs && green + red >= AGENT_COUNT * 0.92;

      if (done && !completedRef.current) {
        completedRef.current = true;
        onComplete?.({
          greenCount: green,
          redCount: red,
          greenRatio: green / Math.max(green + red, 1),
        });
      }

      if (!done) frame = requestAnimationFrame(loop);
    };

    frame = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('resize', onResize);
    };
  }, [taskTitle, taskSubtitle, greenRatio, minDurationMs, onComplete]);

  useEffect(() => {
    activeRatioRef.current = greenRatio;
  }, [greenRatio]);

  const pct = stats.spawned
    ? Math.round((stats.green / Math.max(stats.green + stats.red, 1)) * 100)
    : 0;
  const verdictTotal = stats.green + stats.red;

  return (
    <div className="relative w-full h-full min-h-[480px] rounded-xl overflow-hidden border border-border/40 bg-[#080c12]">
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />

      <div className="absolute inset-x-0 bottom-0 p-6 pointer-events-none bg-gradient-to-t from-black/90 to-transparent">
        <p className="text-sm text-white/70 mb-3 transition-opacity duration-1000">{stats.phase}</p>
        <div className="flex flex-wrap items-end gap-6">
          <Stat label="Agents spawned" value={stats.spawned.toLocaleString()} />
          <Stat label="Ship" value={stats.green.toLocaleString()} color="text-emerald-400" />
          <Stat label="Kill" value={stats.red.toLocaleString()} color="text-red-400" />
          {verdictTotal > 100 && <Stat label="Ship %" value={`${pct}%`} color="text-primary" />}
        </div>
        <div className="mt-4 h-1 rounded-full bg-white/10 overflow-hidden flex">
          <div
            className="h-full bg-emerald-500 transition-all duration-[2500ms] ease-out"
            style={{ width: `${pct}%` }}
          />
          <div
            className="h-full bg-red-500 transition-all duration-[2500ms] ease-out"
            style={{ width: `${100 - pct}%` }}
          />
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wider text-white/40">{label}</p>
      <p
        className={`text-2xl font-semibold tabular-nums transition-all duration-700 ${color ?? 'text-white'}`}
      >
        {value}
      </p>
    </div>
  );
}
