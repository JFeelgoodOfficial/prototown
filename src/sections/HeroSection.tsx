import { useEffect, useRef, useLayoutEffect } from 'react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

interface HeroSectionProps {
  className?: string;
}

export default function HeroSection({ className = '' }: HeroSectionProps) {
  const sectionRef = useRef<HTMLElement>(null);
  const bgRef = useRef<HTMLDivElement>(null);
  const headlineRef = useRef<HTMLHeadingElement>(null);
  const subheadlineRef = useRef<HTMLParagraphElement>(null);
  const ctaRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const coordRef = useRef<HTMLDivElement>(null);

  // Load animation (on mount)
  useEffect(() => {
    const ctx = gsap.context(() => {
      const tl = gsap.timeline({ defaults: { ease: 'power2.out' } });

      // Background fade in
      tl.fromTo(
        bgRef.current,
        { opacity: 0, scale: 1.06 },
        { opacity: 1, scale: 1, duration: 1.2 }
      );

      // Headline words stagger
      const headlineWords = headlineRef.current?.querySelectorAll('.word');
      if (headlineWords) {
        tl.fromTo(
          headlineWords,
          { y: 24, opacity: 0 },
          { y: 0, opacity: 1, duration: 0.6, stagger: 0.04 },
          '-=0.8'
        );
      }

      // Subheadline
      tl.fromTo(
        subheadlineRef.current,
        { y: 14, opacity: 0 },
        { y: 0, opacity: 1, duration: 0.5 },
        '-=0.4'
      );

      // CTAs
      tl.fromTo(
        ctaRef.current?.children ?? [],
        { y: 10, opacity: 0, scale: 0.98 },
        { y: 0, opacity: 1, scale: 1, duration: 0.4, stagger: 0.08 },
        '-=0.3'
      );

      // Bottom card
      tl.fromTo(
        cardRef.current,
        { x: '-6vw', opacity: 0 },
        { x: 0, opacity: 1, duration: 0.6 },
        '-=0.5'
      );

      // Coordinates
      tl.fromTo(
        coordRef.current,
        { x: '6vw', opacity: 0 },
        { x: 0, opacity: 1, duration: 0.6 },
        '-=0.5'
      );
    }, sectionRef);

    return () => ctx.revert();
  }, []);

  // Scroll-driven exit animation
  useLayoutEffect(() => {
    const section = sectionRef.current;
    if (!section) return;

    const ctx = gsap.context(() => {
      const scrollTl = gsap.timeline({
        scrollTrigger: {
          trigger: section,
          start: 'top top',
          end: '+=130%',
          pin: true,
          scrub: 0.6,
          onLeaveBack: () => {
            // Reset elements when scrolling back to top
            gsap.set([headlineRef.current, subheadlineRef.current, ctaRef.current], {
              opacity: 1,
              y: 0,
            });
            gsap.set(cardRef.current, { opacity: 1, x: 0, y: 0 });
            gsap.set(coordRef.current, { opacity: 1, x: 0, y: 0 });
            gsap.set(bgRef.current, { scale: 1 });
          },
        },
      });

      // EXIT phase (70% - 100%)
      // Headline block exit
      scrollTl.fromTo(
        [headlineRef.current, subheadlineRef.current],
        { y: 0, opacity: 1 },
        { y: '-18vh', opacity: 0, ease: 'power2.in' },
        0.7
      );

      // CTA exit
      scrollTl.fromTo(
        ctaRef.current,
        { y: 0, opacity: 1 },
        { y: '-12vh', opacity: 0, ease: 'power2.in' },
        0.72
      );

      // Bottom card exit
      scrollTl.fromTo(
        cardRef.current,
        { y: 0, x: 0, opacity: 1 },
        { y: '18vh', x: '-6vw', opacity: 0, ease: 'power2.in' },
        0.7
      );

      // Coordinates exit
      scrollTl.fromTo(
        coordRef.current,
        { y: 0, x: 0, opacity: 1 },
        { y: '18vh', x: '6vw', opacity: 0, ease: 'power2.in' },
        0.7
      );

      // Background scale
      scrollTl.fromTo(
        bgRef.current,
        { scale: 1 },
        { scale: 1.08, ease: 'none' },
        0.7
      );
    }, section);

    return () => ctx.revert();
  }, []);

  const scrollToSection = (id: string) => {
    const element = document.getElementById(id);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth' });
    }
  };

  return (
    <section
      ref={sectionRef}
      id="hero"
      className={`section-pinned ${className}`}
    >
      {/* Background Image */}
      <div
        ref={bgRef}
        className="absolute inset-0 w-full h-full"
        style={{ opacity: 0 }}
      >
        <img
          src="/hero_campus_night.jpg"
          alt="Prototown campus at night"
          className="w-full h-full object-cover"
        />
        <div className="absolute inset-0 vignette-overlay" />
      </div>

      {/* Top Nav (visible only in hero) */}
      <div className="absolute top-0 left-0 right-0 z-10 px-6 lg:px-10 py-6 flex items-center justify-between">
        <span className="text-xl font-bold tracking-tight text-[#F4F6FA]">
          Prototown
        </span>
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
      </div>

      {/* Center Content */}
      <div className="absolute inset-0 flex flex-col items-center justify-center z-10 px-6">
        <h1
          ref={headlineRef}
          className="text-5xl sm:text-6xl md:text-7xl lg:text-8xl font-bold text-[#F4F6FA] text-center mb-6"
        >
          <span className="word inline-block">Build</span>{' '}
          <span className="word inline-block">the</span>{' '}
          <span className="word inline-block">future</span>
        </h1>
        <p
          ref={subheadlineRef}
          className="text-lg sm:text-xl md:text-2xl text-[#A7AFBA] text-center max-w-2xl mb-10"
          style={{ opacity: 0 }}
        >
          A live/work campus for deep-tech teams.
        </p>
        <div ref={ctaRef} className="flex flex-col sm:flex-row gap-4">
          <button
            onClick={() => scrollToSection('contact')}
            className="btn-primary"
          >
            Request a tour
          </button>
          <button
            onClick={() => scrollToSection('programs')}
            className="btn-secondary"
          >
            View programs
          </button>
        </div>
      </div>

      {/* Bottom Left Card */}
      <div
        ref={cardRef}
        className="absolute left-4 sm:left-6 lg:left-10 bottom-6 sm:bottom-10 z-10 w-full max-w-md"
        style={{ opacity: 0 }}
      >
        <div className="card-glass rounded-[22px] p-5 sm:p-6">
          <p className="text-sm sm:text-base text-[#F4F6FA] leading-relaxed mb-4">
            Prototown is a hardware campus designed for prototypes that need
            space, power, and permission to test.
          </p>
          <div className="flex flex-wrap gap-2">
            <span className="chip-lime">537 acres</span>
            <span className="chip-lime">24/7 access</span>
          </div>
        </div>
      </div>

      {/* Bottom Right Coordinates */}
      <div
        ref={coordRef}
        className="absolute right-4 sm:right-6 lg:right-10 bottom-6 sm:bottom-10 z-10"
        style={{ opacity: 0 }}
      >
        <span className="font-mono text-xs sm:text-sm text-[#A7AFBA] uppercase tracking-wider">
          30.0° N 97.8° W
        </span>
      </div>
    </section>
  );
}
