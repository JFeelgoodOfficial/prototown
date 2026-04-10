import { useRef, useLayoutEffect } from 'react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

interface CollageSectionProps {
  className?: string;
}

export default function CollageSection({ className = '' }: CollageSectionProps) {
  const sectionRef = useRef<HTMLElement>(null);
  const topLeftRef = useRef<HTMLDivElement>(null);
  const bottomLeftRef = useRef<HTMLDivElement>(null);
  const rightTallRef = useRef<HTMLDivElement>(null);
  const headlineRef = useRef<HTMLHeadingElement>(null);
  const microcopyRef = useRef<HTMLParagraphElement>(null);

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
        },
      });

      // ENTRANCE (0% - 30%)
      scrollTl.fromTo(
        topLeftRef.current,
        { x: '-40vw', y: '-20vh', opacity: 0, scale: 0.96 },
        { x: 0, y: 0, opacity: 1, scale: 1, ease: 'power2.out' },
        0
      );

      scrollTl.fromTo(
        bottomLeftRef.current,
        { x: '-40vw', y: '20vh', opacity: 0, scale: 0.96 },
        { x: 0, y: 0, opacity: 1, scale: 1, ease: 'power2.out' },
        0.06
      );

      scrollTl.fromTo(
        rightTallRef.current,
        { x: '50vw', opacity: 0, scale: 0.98 },
        { x: 0, opacity: 1, scale: 1, ease: 'power2.out' },
        0.08
      );

      scrollTl.fromTo(
        headlineRef.current,
        { y: '18vh', opacity: 0, scale: 0.98 },
        { y: 0, opacity: 1, scale: 1, ease: 'power2.out' },
        0.12
      );

      scrollTl.fromTo(
        microcopyRef.current,
        { x: '10vw', opacity: 0 },
        { x: 0, opacity: 1, ease: 'power2.out' },
        0.16
      );

      // EXIT (70% - 100%)
      scrollTl.fromTo(
        topLeftRef.current,
        { x: 0, y: 0, opacity: 1 },
        { x: '-18vw', y: '-10vh', opacity: 0, ease: 'power2.in' },
        0.7
      );

      scrollTl.fromTo(
        bottomLeftRef.current,
        { x: 0, y: 0, opacity: 1 },
        { x: '-18vw', y: '10vh', opacity: 0, ease: 'power2.in' },
        0.7
      );

      scrollTl.fromTo(
        rightTallRef.current,
        { x: 0, opacity: 1 },
        { x: '18vw', opacity: 0, ease: 'power2.in' },
        0.7
      );

      scrollTl.fromTo(
        headlineRef.current,
        { y: 0, opacity: 1 },
        { y: '-10vh', opacity: 0, ease: 'power2.in' },
        0.7
      );

      scrollTl.fromTo(
        microcopyRef.current,
        { opacity: 1 },
        { opacity: 0, ease: 'power2.in' },
        0.8
      );
    }, section);

    return () => ctx.revert();
  }, []);

  return (
    <section
      ref={sectionRef}
      id="collage"
      className={`section-pinned ${className}`}
    >
      {/* Background */}
      <div className="absolute inset-0 bg-[#0B0D10]">
        <div className="absolute inset-0 vignette-overlay" />
      </div>

      {/* Top Right Microcopy */}
      <p
        ref={microcopyRef}
        className="absolute right-4 sm:right-6 lg:right-[6vw] top-[10vh] z-10 w-[28vw] max-w-[320px] text-right text-sm sm:text-base text-[#A7AFBA] hidden lg:block"
        style={{ opacity: 0 }}
      >
        A campus built for teams who ship hardware—fast, safely, and at scale.
      </p>

      {/* Top Left Image */}
      <div
        ref={topLeftRef}
        className="absolute left-4 sm:left-6 lg:left-[6vw] top-[10vh] z-10 w-[calc(50%-1.5rem)] lg:w-[34vw] h-[25vh] lg:h-[34vh]"
        style={{ opacity: 0 }}
      >
        <div className="w-full h-full rounded-[22px] overflow-hidden">
          <img
            src="/collage_aerial_campus.jpg"
            alt="Aerial view of campus"
            className="w-full h-full object-cover"
          />
        </div>
      </div>

      {/* Bottom Left Image */}
      <div
        ref={bottomLeftRef}
        className="absolute left-4 sm:left-6 lg:left-[6vw] top-[40vh] lg:top-[54vh] z-10 w-[calc(50%-1.5rem)] lg:w-[34vw] h-[25vh] lg:h-[34vh]"
        style={{ opacity: 0 }}
      >
        <div className="w-full h-full rounded-[22px] overflow-hidden">
          <img
            src="/collage_hangar_interior.jpg"
            alt="Hangar interior"
            className="w-full h-full object-cover"
          />
        </div>
      </div>

      {/* Right Tall Image */}
      <div
        ref={rightTallRef}
        className="absolute right-4 sm:right-6 lg:right-[6vw] top-[10vh] z-10 w-[calc(50%-1.5rem)] lg:w-[34vw] h-[55vh] lg:h-[78vh]"
        style={{ opacity: 0 }}
      >
        <div className="w-full h-full rounded-[22px] overflow-hidden">
          <img
            src="/collage_control_room.jpg"
            alt="Control room"
            className="w-full h-full object-cover"
          />
        </div>
      </div>

      {/* Center Headline */}
      <h2
        ref={headlineRef}
        className="absolute left-1/2 -translate-x-1/2 top-1/2 -translate-y-1/2 z-20 text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-bold text-[#F4F6FA] text-center whitespace-nowrap"
        style={{ opacity: 0 }}
      >
        <span className="block">Built for</span>
        <span className="block text-[#B8FF3D]">real-world</span>
        <span className="block">progress</span>
      </h2>
    </section>
  );
}
