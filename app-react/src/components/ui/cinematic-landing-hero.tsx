"use client";

import React, { useEffect, useRef } from "react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { cn } from "@/lib/utils";
import { ShaderBackground } from "@/components/ui/shader-background";

if (typeof window !== "undefined") {
  gsap.registerPlugin(ScrollTrigger);
}

// Purple-themed skeuomorphic styles — adapted from the 21st.dev cinematic hero.
const INJECTED_STYLES = `
  .gsap-reveal { visibility: hidden; }

  .film-grain {
      position: absolute; inset: 0; width: 100%; height: 100%;
      pointer-events: none; z-index: 50; opacity: 0.05; mix-blend-mode: overlay;
      background: url('data:image/svg+xml;utf8,<svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg"><filter id="noiseFilter"><feTurbulence type="fractalNoise" baseFrequency="0.8" numOctaves="3" stitchTiles="stitch"/></filter><rect width="100%" height="100%" filter="url(%23noiseFilter)"/></svg>');
  }

  .text-3d-matte {
      color: #f5f3ff;
      text-shadow:
          0 10px 30px rgba(124, 58, 237, 0.35),
          0 2px 4px rgba(0, 0, 0, 0.3);
  }

  .text-silver-matte {
      background: linear-gradient(180deg, #f5f3ff 0%, #a78bfa 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
      transform: translateZ(0);
      filter:
          drop-shadow(0px 10px 20px rgba(124, 58, 237, 0.35))
          drop-shadow(0px 2px 4px rgba(0, 0, 0, 0.3));
  }

  .text-card-silver-matte {
      background: linear-gradient(180deg, #FFFFFF 0%, #c4b5fd 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
      transform: translateZ(0);
      filter:
          drop-shadow(0px 12px 24px rgba(0,0,0,0.8))
          drop-shadow(0px 4px 8px rgba(124, 58, 237, 0.4));
  }

  /* Deep purple card */
  .premium-depth-card {
      background: linear-gradient(145deg, #3b1f78 0%, #14062b 100%);
      box-shadow:
          0 40px 100px -20px rgba(0, 0, 0, 0.9),
          0 20px 40px -20px rgba(91, 33, 182, 0.5),
          inset 0 1px 2px rgba(255, 255, 255, 0.12),
          inset 0 -2px 4px rgba(0, 0, 0, 0.8);
      border: 1px solid rgba(167, 139, 250, 0.18);
      position: relative;
  }

  /* Inner stats card — lighter shade so it lifts off the outer card */
  .inner-stats-card {
      background: linear-gradient(155deg, #6d28d9 0%, #3b1370 55%, #2a0c54 100%);
      box-shadow:
          0 30px 60px -15px rgba(0, 0, 0, 0.7),
          0 12px 28px -10px rgba(139, 92, 246, 0.55),
          inset 0 1px 2px rgba(255, 255, 255, 0.22),
          inset 0 -2px 4px rgba(0, 0, 0, 0.55);
      border: 1px solid rgba(196, 181, 253, 0.32);
      position: relative;
  }

  .card-sheen {
      position: absolute; inset: 0; border-radius: inherit; pointer-events: none; z-index: 50;
      background: radial-gradient(800px circle at var(--mouse-x, 50%) var(--mouse-y, 50%), rgba(167,139,250,0.10) 0%, transparent 40%);
      mix-blend-mode: screen; transition: opacity 0.3s ease;
  }

  .floating-ui-badge {
      background: linear-gradient(135deg, rgba(167, 139, 250, 0.12) 0%, rgba(124, 58, 237, 0.02) 100%);
      backdrop-filter: blur(24px);
      -webkit-backdrop-filter: blur(24px);
      box-shadow:
          0 0 0 1px rgba(167, 139, 250, 0.2),
          0 25px 50px -12px rgba(0, 0, 0, 0.8),
          inset 0 1px 1px rgba(255,255,255,0.2),
          inset 0 -1px 1px rgba(0,0,0,0.5);
  }

  .widget-depth {
      background: linear-gradient(180deg, rgba(167, 139, 250, 0.08) 0%, rgba(124, 58, 237, 0.02) 100%);
      box-shadow:
          0 10px 20px rgba(0,0,0,0.3),
          inset 0 1px 1px rgba(255,255,255,0.08),
          inset 0 -1px 1px rgba(0,0,0,0.5);
      border: 1px solid rgba(167, 139, 250, 0.12);
  }

  .btn-purple-primary, .btn-purple-ghost {
      transition: all 0.4s cubic-bezier(0.25, 1, 0.5, 1);
  }
  .btn-purple-primary {
      background: linear-gradient(135deg, #22d3ee 0%, #a78bfa 45%, #7c3aed 100%);
      color: #ffffff;
      box-shadow:
          0 0 0 1px rgba(167,139,250,0.4),
          0 2px 4px rgba(91, 33, 182, 0.5),
          0 16px 32px -6px rgba(91, 33, 182, 0.6),
          inset 0 1px 1px rgba(255,255,255,0.35),
          inset 0 -3px 6px rgba(55,17,115,0.5);
  }
  .btn-purple-primary:hover {
      transform: translateY(-3px);
      box-shadow:
          0 0 0 1px rgba(167,139,250,0.6),
          0 6px 12px -2px rgba(91, 33, 182, 0.6),
          0 24px 40px -6px rgba(91, 33, 182, 0.8),
          inset 0 1px 1px rgba(255,255,255,0.4),
          inset 0 -3px 6px rgba(55,17,115,0.5);
  }
  .btn-purple-primary:active {
      transform: translateY(1px);
      background: linear-gradient(180deg, #7c3aed 0%, #5b21b6 100%);
  }
  .btn-purple-ghost {
      background: rgba(255,255,255,0.06);
      color: #f5f3ff;
      border: 1px solid rgba(167,139,250,0.25);
      backdrop-filter: blur(12px);
  }
  .btn-purple-ghost:hover {
      background: rgba(167,139,250,0.15);
      transform: translateY(-3px);
  }

  .progress-ring {
      transform: rotate(-90deg);
      transform-origin: center;
      stroke-dasharray: 402;
      stroke-dashoffset: 402;
      stroke-linecap: round;
  }

  /* Scroll hint (bottom-center mouse + chevron on first frame) */
  @keyframes scroll-dot-bounce {
      0%, 20%   { transform: translateY(0);   opacity: 1;   }
      80%, 100% { transform: translateY(16px); opacity: 0;  }
  }
  @keyframes scroll-chevron-pulse {
      0%, 100% { transform: translateY(0);   opacity: 0.6; }
      50%      { transform: translateY(4px); opacity: 1;   }
  }
  .scroll-dot { animation: scroll-dot-bounce 1.6s cubic-bezier(.65,.05,.36,1) infinite; }
  .scroll-chevron { animation: scroll-chevron-pulse 1.6s ease-in-out infinite; }
`;

export interface CinematicHeroProps extends React.HTMLAttributes<HTMLDivElement> {
  brandName?: string;
  tagline1?: string;
  tagline2?: string;
  cardHeading?: string;
  cardDescription?: React.ReactNode;
  metricValue?: number;
  metricLabel?: string;
  ctaHeading?: string;
  ctaDescription?: string;
  onPrimaryCTA?: () => void;
  onSecondaryCTA?: () => void;
}

export function CinematicHero({
  brandName = "MARKETING",
  tagline1 = "Win first place",
  tagline2 = "at DECA ICDC.",
  cardHeading = "Marketing Cluster, mastered.",
  cardDescription = (
    <>
      <span className="text-white font-semibold">DECA Marketing Study</span> gives you
      38 practice tests, 20 deep-dive topic guides, per-user stats, and a study
      flow that's actually aligned with the ICDC blueprint.
    </>
  ),
  metricValue = 100,
  metricLabel = "% Ready",
  ctaHeading = "Start studying now.",
  ctaDescription = "The test is sooner than you think. Stop plateauing at 88 — build the framework that gets you to 95+.",
  onPrimaryCTA,
  onSecondaryCTA,
  className,
  ...props
}: CinematicHeroProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mainCardRef = useRef<HTMLDivElement>(null);
  const mockupRef = useRef<HTMLDivElement>(null);
  const requestRef = useRef<number>(0);

  // High-performance mouse-tracking for the card sheen
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (window.scrollY > window.innerHeight * 2) return;
      cancelAnimationFrame(requestRef.current);
      requestRef.current = requestAnimationFrame(() => {
        if (mainCardRef.current && mockupRef.current) {
          const rect = mainCardRef.current.getBoundingClientRect();
          const mouseX = e.clientX - rect.left;
          const mouseY = e.clientY - rect.top;
          mainCardRef.current.style.setProperty("--mouse-x", `${mouseX}px`);
          mainCardRef.current.style.setProperty("--mouse-y", `${mouseY}px`);

          const xVal = (e.clientX / window.innerWidth - 0.5) * 2;
          const yVal = (e.clientY / window.innerHeight - 0.5) * 2;
          gsap.to(mockupRef.current, {
            rotationY: xVal * 12,
            rotationX: -yVal * 12,
            ease: "power3.out",
            duration: 1.2,
          });
        }
      });
    };
    window.addEventListener("mousemove", handleMouseMove);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      cancelAnimationFrame(requestRef.current);
    };
  }, []);

  // Scroll-driven cinematic timeline
  useEffect(() => {
    const isMobile = window.innerWidth < 768;
    const ctx = gsap.context(() => {
      gsap.set(".text-track", { autoAlpha: 0, y: 60, scale: 0.85, filter: "blur(20px)", rotationX: -20 });
      gsap.set(".text-days", { autoAlpha: 1, clipPath: "inset(0 100% 0 0)" });
      gsap.set(".main-card", { y: window.innerHeight + 200, autoAlpha: 1 });
      gsap.set([".card-left-text", ".card-right-text", ".mockup-scroll-wrapper", ".floating-badge", ".phone-widget"], { autoAlpha: 0 });
      gsap.set(".cta-wrapper", { autoAlpha: 0, scale: 0.8, filter: "blur(30px)" });

      const introTl = gsap.timeline({ delay: 0.3 });
      introTl
        .to(".text-track", { duration: 1.8, autoAlpha: 1, y: 0, scale: 1, filter: "blur(0px)", rotationX: 0, ease: "expo.out" })
        .to(".text-days", { duration: 1.4, clipPath: "inset(0 0% 0 0)", ease: "power4.inOut" }, "-=1.0");

      const scrollTl = gsap.timeline({
        scrollTrigger: {
          trigger: containerRef.current,
          start: "top top",
          end: "+=7000",
          pin: true,
          scrub: 1,
          anticipatePin: 1,
        },
      });

      scrollTl
        .to([".hero-text-wrapper"], { scale: 1.15, filter: "blur(20px)", opacity: 0.2, ease: "power2.inOut", duration: 2 }, 0)
        .to(".scroll-hint", { autoAlpha: 0, y: 40, duration: 1, ease: "power2.out" }, 0)
        .to(".main-card", { y: 0, ease: "power3.inOut", duration: 2 }, 0)
        .to(".main-card", { width: "100%", height: "100%", borderRadius: "0px", ease: "power3.inOut", duration: 1.5 })
        .fromTo(".mockup-scroll-wrapper",
          { y: 300, z: -500, rotationX: 50, rotationY: -30, autoAlpha: 0, scale: 0.6 },
          { y: 0, z: 0, rotationX: 0, rotationY: 0, autoAlpha: 1, scale: 1, ease: "expo.out", duration: 2.5 }, "-=0.8"
        )
        .fromTo(".phone-widget", { y: 40, autoAlpha: 0, scale: 0.95 }, { y: 0, autoAlpha: 1, scale: 1, stagger: 0.15, ease: "back.out(1.2)", duration: 1.5 }, "-=1.5")
        .to(".progress-ring", { strokeDashoffset: 0, duration: 2, ease: "power3.inOut" }, "-=1.2")
        .to(".counter-val", { innerHTML: metricValue, snap: { innerHTML: 1 }, duration: 2, ease: "expo.out" }, "-=2.0")
        .fromTo(".floating-badge", { y: 100, autoAlpha: 0, scale: 0.7, rotationZ: -10 }, { y: 0, autoAlpha: 1, scale: 1, rotationZ: 0, ease: "back.out(1.5)", duration: 1.5, stagger: 0.2 }, "-=2.0")
        .fromTo(".card-left-text", { x: -50, autoAlpha: 0 }, { x: 0, autoAlpha: 1, ease: "power4.out", duration: 1.5 }, "-=1.5")
        .fromTo(".card-right-text", { x: 50, autoAlpha: 0, scale: 0.8 }, { x: 0, autoAlpha: 1, scale: 1, ease: "expo.out", duration: 1.5 }, "<")
        .to({}, { duration: 2.5 })
        .set(".hero-text-wrapper", { autoAlpha: 0 })
        .set(".cta-wrapper", { autoAlpha: 1 })
        .to({}, { duration: 1.5 })
        .to([".mockup-scroll-wrapper", ".floating-badge", ".card-left-text", ".card-right-text"], {
          scale: 0.9, y: -40, z: -200, autoAlpha: 0, ease: "power3.in", duration: 1.2, stagger: 0.05,
        })
        .to(".main-card", {
          width: isMobile ? "92vw" : "85vw",
          height: isMobile ? "92vh" : "85vh",
          borderRadius: isMobile ? "32px" : "40px",
          ease: "expo.inOut",
          duration: 1.8,
        }, "pullback")
        .to(".cta-wrapper", { scale: 1, filter: "blur(0px)", ease: "expo.inOut", duration: 1.8 }, "pullback")
        .to(".main-card", { y: -window.innerHeight - 300, ease: "power3.in", duration: 1.5 });
    }, containerRef);

    return () => ctx.revert();
  }, [metricValue]);

  return (
    <div
      ref={containerRef}
      className={cn(
        "relative w-screen h-screen overflow-hidden flex items-center justify-center font-sans antialiased",
        className,
      )}
      style={{ perspective: "1500px", color: "#f5f3ff" }}
      {...props}
    >
      <style dangerouslySetInnerHTML={{ __html: INJECTED_STYLES }} />
      <div className="film-grain" aria-hidden="true" />

      {/* Eyebrow tag — inside the hero so GSAP fades it with the hero text
          (prevents it from sitting on top of the card mid-scroll). */}
      <div className="hero-text-wrapper absolute top-8 left-1/2 -translate-x-1/2 z-20 pointer-events-none">
        <span className="hero-eyebrow inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/5 border border-violet-300/25 backdrop-blur-md text-[10px] md:text-xs font-semibold tracking-[0.3em] uppercase text-violet-200/90">
          <span className="w-1.5 h-1.5 rounded-full bg-violet-300 animate-pulse" aria-hidden="true" />
          Built for DECA · Marketing Cluster
        </span>
      </div>

      {/* BACKGROUND LAYER: Hero Texts */}
      <div className="hero-text-wrapper absolute z-10 flex flex-col items-center justify-center text-center w-screen px-4 will-change-transform">
        <h1 className="text-track gsap-reveal text-3d-matte text-5xl md:text-7xl lg:text-[6rem] font-bold tracking-tight mb-2">
          {tagline1}
        </h1>
        <h1 className="text-days gsap-reveal text-silver-matte text-5xl md:text-7xl lg:text-[6rem] font-extrabold tracking-tighter">
          {tagline2}
        </h1>
      </div>

      {/* Scroll hint — pulses at the bottom of the screen on the opening frame
          so users understand the page is scroll-driven. GSAP fades it out
          once the card drops in. */}
      <div className="scroll-hint absolute bottom-8 left-1/2 -translate-x-1/2 z-40 flex flex-col items-center gap-2 pointer-events-none select-none">
        <span className="text-[10px] uppercase tracking-[0.4em] font-semibold text-violet-200/70">
          Scroll
        </span>
        <div className="relative w-7 h-11 rounded-full border border-violet-300/40 bg-white/5 backdrop-blur-sm flex items-start justify-center pt-2">
          <span className="scroll-dot block w-1.5 h-1.5 rounded-full bg-violet-200" />
        </div>
        <svg className="w-4 h-4 text-violet-200/60 scroll-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </div>

      {/* BACKGROUND LAYER 2: CTAs after scroll.
          Gets its own shader background (grid + plasma lines) so the final
          frame feels distinct from the opening violet wash. */}
      <div className="cta-wrapper absolute inset-0 z-10 flex flex-col items-center justify-center text-center w-screen gsap-reveal pointer-events-auto will-change-transform">
        <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden="true">
          <ShaderBackground />
          {/* Vignette + softening overlay so CTA text stays crisp over the shader */}
          <div
            className="absolute inset-0"
            style={{
              background:
                "radial-gradient(ellipse at center, rgba(10,7,20,0.35) 0%, rgba(10,7,20,0.78) 65%, rgba(10,7,20,0.92) 100%)",
            }}
          />
        </div>
        <div className="relative z-10 flex flex-col items-center px-4">
          <h2 className="text-4xl md:text-6xl lg:text-7xl font-bold mb-6 tracking-tight text-silver-matte">
            {ctaHeading}
          </h2>
          <p className="text-lg md:text-xl mb-12 max-w-xl mx-auto font-light leading-relaxed" style={{ color: "#c9c1e6" }}>
            {ctaDescription}
          </p>
          <div className="flex flex-col sm:flex-row gap-6">
            <button onClick={onPrimaryCTA} className="btn-purple-primary flex items-center justify-center gap-3 px-8 py-4 rounded-[1.25rem] text-lg font-bold" style={{ border: 0, cursor: "pointer" }}>
              Start studying now
              <span aria-hidden="true">→</span>
            </button>
            <button onClick={onSecondaryCTA} className="btn-purple-ghost flex items-center justify-center gap-3 px-8 py-4 rounded-[1.25rem] text-lg font-bold" style={{ cursor: "pointer" }}>
              Browse practice tests
            </button>
          </div>
        </div>
      </div>

      {/* FOREGROUND: The deep purple card */}
      <div className="absolute inset-0 z-20 flex items-center justify-center pointer-events-none" style={{ perspective: "1500px" }}>
        <div
          ref={mainCardRef}
          className="main-card premium-depth-card relative overflow-hidden gsap-reveal flex items-center justify-center pointer-events-auto w-[92vw] md:w-[85vw] h-[92vh] md:h-[85vh] rounded-[32px] md:rounded-[40px]"
        >
          <div className="card-sheen" aria-hidden="true" />

          <div className="relative w-full h-full max-w-5xl mx-auto px-4 lg:px-8 flex flex-col justify-evenly lg:grid lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] items-center lg:gap-6 xl:gap-8 z-10 py-6 lg:py-0 overflow-hidden">
            {/* Right side: cluster pill + brand wordmark + stat chips.
                Uses min-w-0 so the column can actually shrink inside the grid
                — without it the MARKETING word forces overflow past the card. */}
            <div className="card-right-text gsap-reveal order-1 lg:order-2 flex flex-col items-center lg:items-start justify-center gap-4 lg:gap-5 z-20 w-full min-w-0 max-w-md lg:max-w-none">
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/5 border border-violet-300/20 backdrop-blur-sm">
                <span className="w-1.5 h-1.5 rounded-full bg-violet-300 animate-pulse" aria-hidden="true" />
                <span className="text-[10px] lg:text-[11px] tracking-[0.24em] uppercase font-semibold text-violet-200/90">
                  ICDC Marketing Cluster
                </span>
              </div>
              <h2 className="hidden lg:block text-[2.75rem] xl:text-[3.5rem] leading-[0.95] font-black uppercase tracking-tight truncate max-w-full"
                  style={{
                    background: "linear-gradient(135deg, #67e8f9 0%, #ede9fe 35%, #a78bfa 70%, #f0abfc 100%)",
                    WebkitBackgroundClip: "text",
                    WebkitTextFillColor: "transparent",
                    backgroundClip: "text",
                  }}>
                {brandName}
              </h2>
              <div className="grid grid-cols-3 gap-2 lg:gap-2.5 w-full max-w-xs lg:max-w-[20rem]">
                {[
                  { k: "38", l: "practice tests", border: "border-cyan-300/30", bg: "bg-cyan-400/[0.06]", num: "text-cyan-50", lab: "text-cyan-200/70" },
                  { k: "3.8k+", l: "questions",  border: "border-violet-300/30", bg: "bg-violet-400/[0.08]", num: "text-white", lab: "text-violet-200/70" },
                  { k: "20", l: "topic guides", border: "border-pink-300/30", bg: "bg-pink-400/[0.06]", num: "text-pink-50", lab: "text-pink-200/70" },
                ].map((s) => (
                  <div key={s.l}
                       className={`rounded-xl border ${s.border} ${s.bg} px-2 py-2.5 text-center backdrop-blur-[2px]`}>
                    <div className={`${s.num} font-extrabold text-lg lg:text-xl leading-none tracking-tight`}>{s.k}</div>
                    <div className={`text-[8px] lg:text-[9px] mt-1.5 uppercase tracking-[0.12em] ${s.lab} font-semibold`}>{s.l}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Stats mockup — anchor of the card */}
            <div className="mockup-scroll-wrapper order-2 lg:order-1 relative w-full min-w-0 h-[360px] lg:h-[480px] flex items-center justify-center z-10" style={{ perspective: "1000px" }}>
              <div className="relative w-full h-full flex items-center justify-center transform scale-[0.7] md:scale-90 lg:scale-100">
                <div
                  ref={mockupRef}
                  className="relative w-[320px] h-[480px] rounded-[1.5rem] p-6 inner-stats-card will-change-transform"
                >
                  <div className="relative w-full h-full flex flex-col text-white">
                    <div className="phone-widget flex justify-between items-center mb-6">
                      <div className="flex flex-col">
                        <span className="text-[10px] text-violet-300 uppercase tracking-widest font-bold mb-1">Your Dashboard</span>
                        <span className="text-lg font-bold tracking-tight text-white drop-shadow-md">Study progress</span>
                      </div>
                      <div className="w-9 h-9 rounded-full bg-violet-500/20 text-white flex items-center justify-center font-bold text-sm border border-violet-400/30" aria-hidden="true">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
                          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                          <circle cx="12" cy="7" r="4" />
                        </svg>
                      </div>
                    </div>

                    {/* % Ready progress ring */}
                    <div className="phone-widget relative w-36 h-36 mx-auto flex items-center justify-center mb-6 drop-shadow-[0_15px_25px_rgba(0,0,0,0.8)]">
                      <svg className="absolute inset-0 w-full h-full" aria-hidden="true">
                        <circle cx="72" cy="72" r="64" fill="none" stroke="rgba(167,139,250,0.10)" strokeWidth="10" />
                        <circle className="progress-ring" cx="72" cy="72" r="64" fill="none" stroke="#a78bfa" strokeWidth="10" />
                      </svg>
                      <div className="text-center z-10 flex flex-col items-center">
                        <span className="counter-val text-4xl font-extrabold tracking-tighter text-white">0</span>
                        <span className="text-[9px] text-violet-200/70 uppercase tracking-[0.1em] font-bold mt-0.5">{metricLabel}</span>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <div className="phone-widget widget-depth rounded-xl p-3 flex items-center">
                        <span className="text-xs font-mono bg-cyan-500/25 text-cyan-200 px-2 py-1 rounded mr-3">IM</span>
                        <span className="text-xs text-violet-100/80 flex-1">Marketing-Information Management</span>
                        <span className="text-xs text-cyan-200 font-bold">23 wrongs</span>
                      </div>
                      <div className="phone-widget widget-depth rounded-xl p-3 flex items-center">
                        <span className="text-xs font-mono bg-pink-500/25 text-pink-200 px-2 py-1 rounded mr-3">PM</span>
                        <span className="text-xs text-violet-100/80 flex-1">Product/Service Management</span>
                        <span className="text-xs text-pink-200 font-bold">19 wrongs</span>
                      </div>
                      <div className="phone-widget widget-depth rounded-xl p-3 flex items-center">
                        <span className="text-xs font-mono bg-amber-500/25 text-amber-200 px-2 py-1 rounded mr-3">PR</span>
                        <span className="text-xs text-violet-100/80 flex-1">Promotion</span>
                        <span className="text-xs text-amber-200 font-bold">16 wrongs</span>
                      </div>
                    </div>
                  </div>
                </div>

              </div>
            </div>

            {/* Tagline block — spans the full card width under both columns. */}
            <div className="card-left-text gsap-reveal order-3 lg:order-3 lg:col-span-2 flex flex-col justify-center items-center text-center z-20 w-full px-4 lg:px-0 lg:pt-4 xl:pt-6">
              <h3 className="text-white text-3xl md:text-4xl lg:text-[3rem] xl:text-[3.5rem] font-bold mb-4 lg:mb-5 tracking-tight leading-[1.05]"
                  style={{
                    background: "linear-gradient(180deg, #ffffff 0%, #c4b5fd 100%)",
                    WebkitBackgroundClip: "text",
                    WebkitTextFillColor: "transparent",
                    backgroundClip: "text",
                  }}>
                {cardHeading}
              </h3>
              <p className="hidden md:block text-violet-100/75 text-sm md:text-base lg:text-lg font-normal leading-relaxed max-w-2xl">
                {cardDescription}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
