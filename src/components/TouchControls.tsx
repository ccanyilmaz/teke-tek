import React, { useRef, useState } from 'react';
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp } from 'lucide-react';

interface TouchControlsProps {
  onMoveVectorChange: (x: number, y: number) => void;
  onPunch: () => void;
}

export const TouchControls: React.FC<TouchControlsProps> = ({
  onMoveVectorChange,
  onPunch,
}) => {
  const padRef = useRef<HTMLDivElement | null>(null);
  const activePointerIdRef = useRef<number | null>(null);
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

    if (dist < 8) {
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
    activePointerIdRef.current = e.pointerId;
    e.currentTarget.setPointerCapture(e.pointerId);
    updateVectorFromPointer(e.clientX, e.clientY);
  };

  const handlePadPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (activePointerIdRef.current !== e.pointerId) return;
    e.preventDefault();
    updateVectorFromPointer(e.clientX, e.clientY);
  };

  const handlePadPointerEnd = (e: React.PointerEvent<HTMLDivElement>) => {
    if (activePointerIdRef.current !== e.pointerId) return;
    e.preventDefault();
    activePointerIdRef.current = null;
    setKnob({ x: 0, y: 0 });
    onMoveVectorChange(0, 0);
  };

  const handlePunchDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    e.preventDefault();
    setPunchActive(true);
    onPunch();
  };

  const handlePunchEnd = (e: React.PointerEvent<HTMLButtonElement>) => {
    e.preventDefault();
    setPunchActive(false);
  };

  const handlePunchClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    // Keyboard/assistive click fallback without double-triggering pointer taps
    if (e.detail === 0) {
      onPunch();
    }
  };

  return (
    <div
      className="flex w-full select-none items-center justify-between gap-4 px-3 py-2"
      style={{ touchAction: 'none' }}
    >
      {/* Left 4-Way Touch Pad (supports both tap & thumb slide continuously) */}
      <div
        ref={padRef}
        role="group"
        aria-label="Yön kontrolü"
        onPointerDown={handlePadPointerDown}
        onPointerMove={handlePadPointerMove}
        onPointerUp={handlePadPointerEnd}
        onPointerCancel={handlePadPointerEnd}
        className="relative flex h-[126px] w-[126px] shrink-0 items-center justify-center rounded-full border-[3px] border-[#1E293B] bg-[#FFFDF7] shadow-[0_4px_0_#1E293B]"
        style={{ touchAction: 'none' }}
      >
        <ArrowUp
          className="pointer-events-none absolute top-2.5 h-5 w-5 text-[#64748B]"
          aria-hidden="true"
        />
        <ArrowDown
          className="pointer-events-none absolute bottom-2.5 h-5 w-5 text-[#64748B]"
          aria-hidden="true"
        />
        <ArrowLeft
          className="pointer-events-none absolute left-2.5 h-5 w-5 text-[#64748B]"
          aria-hidden="true"
        />
        <ArrowRight
          className="pointer-events-none absolute right-2.5 h-5 w-5 text-[#64748B]"
          aria-hidden="true"
        />

        {/* Thumb Stick Knob */}
        <div
          className="pointer-events-none h-12 w-12 rounded-full border-[3px] border-[#1E293B] bg-[#FACC15] shadow-[0_2px_0_#1E293B]"
          style={{
            transform: `translate3d(${knob.x}px, ${knob.y}px, 0)`,
          }}
        />
      </div>

      {/* Right Big Thumb Punch Button */}
      <button
        type="button"
        aria-label="Yumruk at"
        onPointerDown={handlePunchDown}
        onPointerUp={handlePunchEnd}
        onPointerCancel={handlePunchEnd}
        onPointerLeave={handlePunchEnd}
        onClick={handlePunchClick}
        style={{ touchAction: 'none' }}
        className={`flex h-[96px] w-[96px] shrink-0 cursor-pointer flex-col items-center justify-center rounded-full border-[3px] border-[#1E293B] text-white transition-transform sm:h-[104px] sm:w-[104px] ${
          punchActive
            ? 'translate-y-1 bg-[#DC2626] shadow-none'
            : 'bg-[#E63946] shadow-[0_6px_0_#1E293B]'
        }`}
      >
        <span className="text-base font-black tracking-wide">YUMRUK</span>
      </button>
    </div>
  );
};
