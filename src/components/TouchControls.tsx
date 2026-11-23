import React, { useRef, useState } from 'react';
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Shield, Sparkles, Wind } from 'lucide-react';

interface TouchControlsProps {
  onMoveVectorChange: (x: number, y: number) => void;
  onPunch: () => void;
  onSpecial: () => void;
  onDodge: () => void;
  onBlockChange: (blocking: boolean) => void;
  actionLabel?: string;
  specialReady?: boolean;
  specialCooldownSec?: number;
  dodgeReady?: boolean;
  dodgeCooldownSec?: number;
  isBlocking?: boolean;
  floating?: boolean;
}

export const TouchControls: React.FC<TouchControlsProps> = ({
  onMoveVectorChange,
  onPunch,
  onSpecial,
  onDodge,
  onBlockChange,
  actionLabel = 'SALDIR',
  specialReady = true,
  specialCooldownSec = 0,
  dodgeReady = true,
  dodgeCooldownSec = 0,
  isBlocking = false,
  floating = false,
}) => {
  const padRef = useRef<HTMLDivElement | null>(null);
  const padPointerIdRef = useRef<number | null>(null);
  const blockPointerIdRef = useRef<number | null>(null);
  const punchPointerIdRef = useRef<number | null>(null);
  const [knob, setKnob] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [punchActive, setPunchActive] = useState(false);

  const updateVectorFromPointer = (clientX: number, clientY: number) => {
    const pad = padRef.current;
    if (!pad) return;
    const rect = pad.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const maxRadius = rect.width * 0.36;

    const dx = clientX - cx;
    const dy = clientY - cy;
    const dist = Math.hypot(dx, dy);

    if (dist < 7) {
      setKnob({ x: 0, y: 0 });
      onMoveVectorChange(0, 0);
      return;
    }

    const clamped = Math.min(dist, maxRadius);
    const nx = dx / dist;
    const ny = dy / dist;
    const strength = Math.min(1, (clamped / maxRadius) * 1.45);
    setKnob({ x: nx * clamped, y: ny * clamped });
    onMoveVectorChange(nx * strength, ny * strength);
  };

  const handlePadPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (padPointerIdRef.current !== null) return;
    padPointerIdRef.current = e.pointerId;
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // Ignore if synthetic pointer event cannot be captured
    }
    updateVectorFromPointer(e.clientX, e.clientY);
  };

  const handlePadPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (padPointerIdRef.current !== e.pointerId) return;
    e.preventDefault();
    updateVectorFromPointer(e.clientX, e.clientY);
  };

  const handlePadPointerEnd = (e: React.PointerEvent<HTMLDivElement>) => {
    if (padPointerIdRef.current !== e.pointerId) return;
    e.preventDefault();
    padPointerIdRef.current = null;
    setKnob({ x: 0, y: 0 });
    onMoveVectorChange(0, 0);
  };

  const handlePunchDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    e.preventDefault();
    punchPointerIdRef.current = e.pointerId;
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // Ignore if synthetic pointer event
    }
    setPunchActive(true);
    onPunch();
  };

  const handlePunchEnd = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (punchPointerIdRef.current !== null && punchPointerIdRef.current !== e.pointerId) {
      return;
    }
    e.preventDefault();
    punchPointerIdRef.current = null;
    setPunchActive(false);
  };

  const handleBlockDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    e.preventDefault();
    blockPointerIdRef.current = e.pointerId;
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // Ignore if synthetic pointer event
    }
    onBlockChange(true);
  };

  const handleBlockEnd = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (blockPointerIdRef.current !== null && blockPointerIdRef.current !== e.pointerId) {
      return;
    }
    e.preventDefault();
    blockPointerIdRef.current = null;
    onBlockChange(false);
  };

  return (
    <div
      className={`flex w-full select-none items-end justify-between gap-3 ${
        floating ? 'pointer-events-none px-2.5 pb-1.5 sm:px-4 sm:pb-2.5' : 'px-1 py-0.5 min-[390px]:px-2'
      }`}
      style={{ touchAction: 'none' }}
    >
      {/* Left Virtual Joystick */}
      <div
        ref={padRef}
        role="group"
        aria-label="Yön kontrolü"
        onPointerDown={handlePadPointerDown}
        onPointerMove={handlePadPointerMove}
        onPointerUp={handlePadPointerEnd}
        onPointerCancel={handlePadPointerEnd}
        className={`pointer-events-auto relative flex shrink-0 items-center justify-center rounded-full border-[3px] border-[#1E293B] shadow-[0_4px_0_#1E293B] ${
          floating
            ? 'h-[96px] w-[96px] bg-[#FFFDF7]/88 sm:h-[110px] sm:w-[110px]'
            : 'h-[104px] w-[104px] bg-[#FFFDF7] min-[390px]:h-[114px] min-[390px]:w-[114px] sm:h-[124px] sm:w-[124px]'
        }`}
        style={{ touchAction: 'none' }}
      >
        <ArrowUp
          className="pointer-events-none absolute top-1.5 h-4 w-4 text-[#475569] sm:top-2"
          aria-hidden="true"
        />
        <ArrowDown
          className="pointer-events-none absolute bottom-1.5 h-4 w-4 text-[#475569] sm:bottom-2"
          aria-hidden="true"
        />
        <ArrowLeft
          className="pointer-events-none absolute left-1.5 h-4 w-4 text-[#475569] sm:left-2"
          aria-hidden="true"
        />
        <ArrowRight
          className="pointer-events-none absolute right-1.5 h-4 w-4 text-[#475569] sm:right-2"
          aria-hidden="true"
        />

        <div
          className="pointer-events-none h-9 w-9 rounded-full border-[3px] border-[#1E293B] bg-[#FACC15] shadow-[0_2px_0_#1E293B] sm:h-10 sm:w-10"
          style={{
            transform: `translate3d(${knob.x}px, ${knob.y}px, 0)`,
          }}
        />
      </div>

      {/* Right Multi-Touch Action Cluster */}
      <div className="pointer-events-auto flex items-end gap-2">
        <div className="flex flex-col items-end gap-2">
          <div className="flex items-center gap-2">
            {/* Dodge Button */}
            <button
              type="button"
              aria-label="Kaçın"
              onPointerDown={(e) => {
                e.preventDefault();
                onDodge();
              }}
              onClick={(e) => {
                if (e.detail === 0) onDodge();
              }}
              style={{ touchAction: 'none' }}
              className={`flex h-11 min-w-[54px] cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-[#1E293B] px-2 text-[10px] font-black transition-transform active:translate-y-0.5 active:shadow-none sm:h-12 sm:min-w-[60px] ${
                dodgeReady
                  ? 'bg-[#E0F2FE]/95 text-[#0369A1] shadow-[0_3px_0_#1E293B]'
                  : 'bg-[#E2E8F0]/90 text-[#64748B] opacity-85 shadow-[0_2px_0_#64748B]'
              }`}
            >
              <Wind className="h-3.5 w-3.5 sm:h-4 sm:w-4" aria-hidden="true" />
              <span className="tabular-nums">
                {dodgeReady ? 'KAÇIN' : `${dodgeCooldownSec.toFixed(1)}s`}
              </span>
            </button>

            {/* Special Attack Button */}
            <button
              type="button"
              aria-label="Özel saldırı"
              onPointerDown={(e) => {
                e.preventDefault();
                onSpecial();
              }}
              onClick={(e) => {
                if (e.detail === 0) onSpecial();
              }}
              style={{ touchAction: 'none' }}
              className={`flex h-11 min-w-[54px] cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-[#1E293B] px-2 text-[10px] font-black transition-transform active:translate-y-0.5 active:shadow-none sm:h-12 sm:min-w-[62px] ${
                specialReady
                  ? 'bg-[#FACC15]/95 text-[#1E293B] shadow-[0_3px_0_#1E293B]'
                  : 'bg-[#FEF3C7]/90 text-[#92400E] opacity-85 shadow-[0_2px_0_#92400E]'
              }`}
            >
              <Sparkles className="h-3.5 w-3.5 sm:h-4 sm:w-4" aria-hidden="true" />
              <span className="tabular-nums">
                {specialReady ? 'ÖZEL' : `${specialCooldownSec.toFixed(1)}s`}
              </span>
            </button>
          </div>

          {/* Hold-to-Block Button */}
          <button
            type="button"
            aria-label="Blok yap"
            onPointerDown={handleBlockDown}
            onPointerUp={handleBlockEnd}
            onPointerCancel={handleBlockEnd}
            onLostPointerCapture={handleBlockEnd}
            style={{ touchAction: 'none' }}
            className={`flex h-10 w-full cursor-pointer items-center justify-center gap-1.5 rounded-2xl border-2 border-[#1E293B] px-2.5 text-[11px] font-black transition-transform sm:h-11 sm:text-xs ${
              isBlocking
                ? 'translate-y-0.5 bg-[#0284C7] text-white shadow-none'
                : 'bg-[#FFFDF7]/92 text-[#1E293B] shadow-[0_3px_0_#1E293B]'
            }`}
          >
            <Shield className="h-3.5 w-3.5 shrink-0 sm:h-4 sm:w-4" aria-hidden="true" />
            <span>BLOK</span>
          </button>
        </div>

        {/* Main Primary Attack Button */}
        <button
          type="button"
          aria-label="Saldır"
          onPointerDown={handlePunchDown}
          onPointerUp={handlePunchEnd}
          onPointerCancel={handlePunchEnd}
          onLostPointerCapture={handlePunchEnd}
          onClick={(e) => {
            if (e.detail === 0) onPunch();
          }}
          style={{ touchAction: 'none' }}
          className={`flex h-[74px] w-[74px] shrink-0 cursor-pointer flex-col items-center justify-center rounded-full border-[3px] border-[#1E293B] text-white transition-transform sm:h-[86px] sm:w-[86px] ${
            punchActive
              ? 'translate-y-1 bg-[#DC2626] shadow-none'
              : 'bg-[#E63946]/95 shadow-[0_5px_0_#1E293B]'
          }`}
        >
          <span className="text-xs font-black tracking-wide sm:text-sm">{actionLabel}</span>
        </button>
      </div>
    </div>
  );
};
