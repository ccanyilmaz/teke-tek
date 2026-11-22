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
      className="flex w-full select-none items-center justify-between gap-2 px-1 py-0.5 min-[390px]:px-2"
      style={{ touchAction: 'none' }}
    >
      {/* Left 4-Way Touch Pad */}
      <div
        ref={padRef}
        role="group"
        aria-label="Yön kontrolü"
        onPointerDown={handlePadPointerDown}
        onPointerMove={handlePadPointerMove}
        onPointerUp={handlePadPointerEnd}
        onPointerCancel={handlePadPointerEnd}
        className="relative flex h-[104px] w-[104px] shrink-0 items-center justify-center rounded-full border-[3px] border-[#1E293B] bg-[#FFFDF7] shadow-[0_4px_0_#1E293B] min-[390px]:h-[114px] min-[390px]:w-[114px] sm:h-[124px] sm:w-[124px]"
        style={{ touchAction: 'none' }}
      >
        <ArrowUp
          className="pointer-events-none absolute top-1.5 h-4 w-4 text-[#64748B] min-[390px]:top-2 min-[390px]:h-5 min-[390px]:w-5"
          aria-hidden="true"
        />
        <ArrowDown
          className="pointer-events-none absolute bottom-1.5 h-4 w-4 text-[#64748B] min-[390px]:bottom-2 min-[390px]:h-5 min-[390px]:w-5"
          aria-hidden="true"
        />
        <ArrowLeft
          className="pointer-events-none absolute left-1.5 h-4 w-4 text-[#64748B] min-[390px]:left-2 min-[390px]:h-5 min-[390px]:w-5"
          aria-hidden="true"
        />
        <ArrowRight
          className="pointer-events-none absolute right-1.5 h-4 w-4 text-[#64748B] min-[390px]:right-2 min-[390px]:h-5 min-[390px]:w-5"
          aria-hidden="true"
        />

        <div
          className="pointer-events-none h-10 w-10 rounded-full border-[3px] border-[#1E293B] bg-[#FACC15] shadow-[0_2px_0_#1E293B] min-[390px]:h-11 min-[390px]:w-11"
          style={{
            transform: `translate3d(${knob.x}px, ${knob.y}px, 0)`,
          }}
        />
      </div>

      {/* Right Action Cluster: Block + Dodge + Special + Primary Attack */}
      <div className="flex items-end gap-1.5 min-[390px]:gap-2">
        <div className="flex flex-col items-end gap-1.5 min-[390px]:gap-2">
          <div className="flex items-center gap-1.5 min-[390px]:gap-2">
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
              className={`flex h-12 min-w-[54px] cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-[#1E293B] px-1.5 text-[10px] font-black transition-transform active:translate-y-0.5 active:shadow-none min-[390px]:min-w-[60px] min-[390px]:px-2 ${
                dodgeReady
                  ? 'bg-[#E0F2FE] text-[#0369A1] shadow-[0_3px_0_#1E293B]'
                  : 'bg-[#E2E8F0] text-[#64748B] opacity-80 shadow-[0_2px_0_#64748B]'
              }`}
            >
              <Wind className="h-4 w-4" aria-hidden="true" />
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
              className={`flex h-12 min-w-[56px] cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-[#1E293B] px-1.5 text-[10px] font-black transition-transform active:translate-y-0.5 active:shadow-none min-[390px]:min-w-[62px] min-[390px]:px-2 ${
                specialReady
                  ? 'bg-[#FACC15] text-[#1E293B] shadow-[0_3px_0_#1E293B]'
                  : 'bg-[#FEF3C7] text-[#92400E] opacity-80 shadow-[0_2px_0_#92400E]'
              }`}
            >
              <Sparkles className="h-4 w-4" aria-hidden="true" />
              <span className="tabular-nums">
                {specialReady ? 'ÖZEL' : `${specialCooldownSec.toFixed(1)}s`}
              </span>
            </button>
          </div>

          {/* Hold-to-Block Button (captured pointer so thumb drift never drops guard) */}
          <button
            type="button"
            aria-label="Blok yap"
            onPointerDown={handleBlockDown}
            onPointerUp={handleBlockEnd}
            onPointerCancel={handleBlockEnd}
            onLostPointerCapture={handleBlockEnd}
            style={{ touchAction: 'none' }}
            className={`flex h-11 w-full cursor-pointer items-center justify-center gap-1.5 rounded-2xl border-2 border-[#1E293B] px-2.5 text-[11px] font-black transition-transform min-[390px]:text-xs ${
              isBlocking
                ? 'translate-y-0.5 bg-[#0284C7] text-white shadow-none'
                : 'bg-[#FFFDF7] text-[#1E293B] shadow-[0_3px_0_#1E293B]'
            }`}
          >
            <Shield className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span>BLOK (BASILI)</span>
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
          className={`flex h-[78px] w-[78px] shrink-0 cursor-pointer flex-col items-center justify-center rounded-full border-[3px] border-[#1E293B] text-white transition-transform min-[390px]:h-[86px] min-[390px]:w-[86px] sm:h-[94px] sm:w-[94px] ${
            punchActive
              ? 'translate-y-1 bg-[#DC2626] shadow-none'
              : 'bg-[#E63946] shadow-[0_6px_0_#1E293B]'
          }`}
        >
          <span className="text-sm font-black tracking-wide sm:text-base">{actionLabel}</span>
        </button>
      </div>
    </div>
  );
};
