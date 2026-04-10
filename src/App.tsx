import { useEffect, useRef } from 'react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import HeroSection from './sections/HeroSection';
import LiveSection from './sections/LiveSection';
import WorkSection from './sections/WorkSection';
import BuildSection from './sections/BuildSection';
import TestSection from './sections/TestSection';
import CollageSection from './sections/CollageSection';
import CommunitySection from './sections/CommunitySection';
import ProgramsSection from './sections/ProgramsSection';
import ContactSection from './sections/ContactSection';
import Navigation from './sections/Navigation';

gsap.registerPlugin(ScrollTrigger);

function App() {
  const mainRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Global snap for pinned sections
    const setupGlobalSnap = () => {
      const pinned = ScrollTrigger.getAll()
        .filter(st => st.vars.pin)
        .sort((a, b) => a.start - b.start);
      
      const maxScroll = ScrollTrigger.maxScroll(window);
      if (!maxScroll || pinned.length === 0) return;

      const pinnedRanges = pinned.map(st => ({
        start: st.start / maxScroll,
        end: (st.end ?? st.start) / maxScroll,
        center: (st.start + ((st.end ?? st.start) - st.start) * 0.5) / maxScroll,
      }));

      ScrollTrigger.create({
        snap: {
          snapTo: (value: number) => {
            const inPinned = pinnedRanges.some(
              r => value >= r.start - 0.02 && value <= r.end + 0.02
            );
            if (!inPinned) return value;

            const target = pinnedRanges.reduce(
              (closest, r) =>
                Math.abs(r.center - value) < Math.abs(closest - value)
                  ? r.center
                  : closest,
              pinnedRanges[0]?.center ?? 0
            );
            return target;
          },
          duration: { min: 0.15, max: 0.35 },
          delay: 0,
          ease: 'power2.out',
        },
      });
    };

    // Delay to allow all sections to register their ScrollTriggers
    const timer = setTimeout(setupGlobalSnap, 500);

    return () => {
      clearTimeout(timer);
      ScrollTrigger.getAll().forEach(st => st.kill());
    };
  }, []);

  return (
    <div ref={mainRef} className="relative bg-[#0B0D10]">
      {/* Grain overlay */}
      <div className="grain-overlay" />
      
      {/* Navigation */}
      <Navigation />
      
      {/* Sections with z-index stacking */}
      <main className="relative">
        <HeroSection className="z-10" />
        <LiveSection className="z-20" />
        <WorkSection className="z-30" />
        <BuildSection className="z-40" />
        <TestSection className="z-50" />
        <CollageSection className="z-[60]" />
        <CommunitySection className="z-[70]" />
        <ProgramsSection className="z-[80]" />
        <ContactSection className="z-[90]" />
      </main>
    </div>
  );
}

export default App;
