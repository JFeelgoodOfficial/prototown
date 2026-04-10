import { useEffect, useRef, useState } from 'react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

export default function Navigation() {
  const navRef = useRef<HTMLElement>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const nav = navRef.current;
    if (!nav) return;

    // Show nav after scrolling past hero
    ScrollTrigger.create({
      trigger: document.body,
      start: '100vh top',
      onEnter: () => {
        setIsVisible(true);
        gsap.to(nav, { opacity: 1, y: 0, duration: 0.3 });
      },
      onLeaveBack: () => {
        setIsVisible(false);
        gsap.to(nav, { opacity: 0, y: -20, duration: 0.3 });
      },
    });

    return () => {
      ScrollTrigger.getAll().forEach(st => {
        if (st.vars.trigger === document.body) st.kill();
      });
    };
  }, []);

  const scrollToSection = (sectionId: string) => {
    const element = document.getElementById(sectionId);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth' });
    }
  };

  return (
    <nav
      ref={navRef}
      className={`fixed top-0 left-0 right-0 z-[100] transition-opacity duration-300 ${
        isVisible ? 'opacity-100' : 'opacity-0'
      }`}
      style={{ transform: isVisible ? 'translateY(0)' : 'translateY(-20px)' }}
    >
      <div className="bg-[#0B0D10]/80 backdrop-blur-xl border-b border-white/5">
        <div className="flex items-center justify-between px-6 lg:px-10 py-4">
          {/* Logo */}
          <button
            onClick={() => scrollToSection('hero')}
            className="text-xl font-bold tracking-tight text-[#F4F6FA] hover:text-[#B8FF3D] transition-colors"
          >
            Prototown
          </button>

          {/* Nav Links */}
          <div className="hidden md:flex items-center gap-8">
            <button
              onClick={() => scrollToSection('live')}
              className="text-sm text-[#A7AFBA] hover:text-[#F4F6FA] transition-colors"
            >
              Campus
            </button>
            <button
              onClick={() => scrollToSection('programs')}
              className="text-sm text-[#A7AFBA] hover:text-[#F4F6FA] transition-colors"
            >
              Programs
            </button>
            <button
              onClick={() => scrollToSection('community')}
              className="text-sm text-[#A7AFBA] hover:text-[#F4F6FA] transition-colors"
            >
              Community
            </button>
            <button
              onClick={() => scrollToSection('contact')}
              className="text-sm text-[#A7AFBA] hover:text-[#F4F6FA] transition-colors"
            >
              Apply
            </button>
          </div>

          {/* CTA Button */}
          <button
            onClick={() => scrollToSection('contact')}
            className="hidden sm:inline-flex items-center px-4 py-2 rounded-full border border-[#B8FF3D]/50 text-[#B8FF3D] text-sm font-medium hover:bg-[#B8FF3D]/10 transition-colors"
          >
            Book a tour
          </button>
        </div>
      </div>
    </nav>
  );
}
