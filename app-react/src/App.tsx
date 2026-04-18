import { CinematicHero } from "@/components/ui/cinematic-landing-hero";
import { ShaderAnimation } from "@/components/ui/shader-animation";

/**
 * DECA Marketing Cluster landing page — combines two 21st.dev components:
 *   1. ShaderAnimation: fullscreen animated violet shader background
 *   2. CinematicHero: layered tagline + skeuomorphic purple card + CTAs
 *
 * Unified deployment: this React landing is built to /dist/ and then copied
 * to the project root as the site's index.html. The vanilla study app lives
 * alongside it at /app.html. Both are served by the same http.server, so
 * the Start-studying CTA is a same-origin navigation and localStorage is
 * shared (password gate + user profiles carry over to the vanilla app).
 */
export default function App() {
  // Same-origin navigation to the vanilla study app. Going straight to the
  // test list — vanilla's own welcome screen is disabled so clicking Start
  // on this landing drops you straight into studying.
  const VANILLA_APP_URL = "/app.html#/";

  return (
    <div className="relative w-full min-h-screen overflow-x-hidden bg-[#0a0714]">
      {/* Layer 1: animated shader background */}
      <div className="fixed inset-0 z-0 pointer-events-none">
        <ShaderAnimation />
        {/* Soft violet vignette to darken edges and make text pop */}
        <div
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(ellipse at center, transparent 40%, rgba(10,7,20,.72) 100%)",
          }}
          aria-hidden="true"
        />
      </div>

      {/* Layer 2: cinematic hero with scroll timeline.
          The "Built for DECA" eyebrow is rendered inside the hero so it
          fades out with the rest of the hero text on scroll instead of
          sitting on top of the card. */}
      <div className="relative z-10">
        <CinematicHero
          onPrimaryCTA={() => { window.location.href = VANILLA_APP_URL; }}
          onSecondaryCTA={() => { window.location.href = VANILLA_APP_URL; }}
        />
      </div>
    </div>
  );
}
