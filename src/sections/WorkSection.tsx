import { useRef, useLayoutEffect } from 'react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

interface WorkSectionProps {
  className?: string;
}

export default function WorkSection({ className = '' }: WorkSectionProps) {
  const sectionRef = useRef<HTMLElement>(null);
  const bgRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const thumbnailRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const bodyRef = useRef<HTMLParagraphElement>(null);
  const chipsRef = useRef<HTMLDivElement>(null);

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
        cardRef.current,
        { x: '-60vw', opacity: 0, scale: 0.96 },
        { x: 0, opacity: 1, scale: 1, ease: 'power2.out' },
        0
      );

      scrollTl.fromTo(
        thumbnailRef.current,
        { x: '60vw', opacity: 0, scale: 0.96 },
        { x: 0, opacity: 1, scale: 1, ease: 'power2.out' },
        0.06
      );

      scrollTl.fromTo(
        titleRef.current,
        { y: 18, opacity: 0 },
        { y: 0, opacity: 1, ease: 'power2.out' },
        0.1
      );

      scrollTl.fromTo(
        bodyRef.current,
        { y: 14, opacity: 0 },
        { y: 0, opacity: 1, ease: 'power2.out' },
        0.14
      );

      scrollTl.fromTo(
        chipsRef.current?.children ?? [],
        { y: 10, opacity: 0 },
        { y: 0, opacity: 1, stagger: 0.02, ease: 'power2.out' },
        0.18
      );

      // EXIT (70% - 100%)
      scrollTl.fromTo(
        cardRef.current,
        { x: 0, opacity: 1 },
        { x: '-28vw', opacity: 0, ease: 'power2.in' },
        0.7
      );

      scrollTl.fromTo(
        thumbnailRef.current,
        { x: 0, opacity: 1 },
        { x: '28vw', opacity: 0, ease: 'power2.in' },
        0.7
      );

      scrollTl.fromTo(
        bgRef.current,
        { scale: 1, y: 0 },
        { scale: 1.06, y: '-3vh', ease: 'none' },
        0.7
      );
    }, section);

    return () => ctx.revert();
  }, []);

  return (
    <section
      ref={sectionRef}
      id="work"
      className={`section-pinned ${className}`}
    >
      {/* Background Image */}
      <div ref={bgRef} className="absolute inset-0 w-full h-full">
        <img
          src="/workshop_bench.jpg"
          alt="Work at Prototown"
          className="w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-[#0B0D10]/70 via-[#0B0D10]/30 to-[#0B0D10]/70" />
      </div>

      {/* Left Card */}
      <div
        ref={cardRef}
        className="absolute left-4 sm:left-6 lg:left-[6vw] top-1/2 -translate-y-1/2 z-10 w-[calc(100%-2rem)] sm:w-[44vw] max-w-[520px]"
        style={{ opacity: 0 }}
      >
        <div className="card-glass rounded-[22px] p-6 sm:p-8">
          <h2
            ref={titleRef}
            className="text-4xl sm:text-5xl lg:text-6xl font-bold text-[#F4F6FA] mb-4"
          >
            Work
          </h2>
          <p
            ref={bodyRef}
            className="text-base sm:text-lg text-[#A7AFBA] leading-relaxed mb-6"
          >
            Prototype with CNC, welding, electronics, and assembly space. Move
            from CAD to physical parts in hours, not weeks.
          </p>
          <div ref={chipsRef} className="flex flex-wrap gap-2">
            <span className="chip-lime">CNC</span>
            <span className="chip-lime">Electronics</span>
          </div>
        </div>
      </div>

      {/* Right Thumbnail */}
      <div
        ref={thumbnailRef}
        className="hidden lg:block absolute right-[6vw] top-1/2 -translate-y-1/2 z-10 w-[34vw] max-w-[420px] h-[62vh]"
        style={{ opacity: 0 }}
      >
        <div className="relative w-full h-full rounded-[22px] overflow-hidden">
          <img
            src="/workshop_tools_thumbnail.jpg"
            alt="Workshop floor"
            className="w-full h-full object-cover"
          />
          <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-[#0B0D10] to-transparent p-4">
            <span className="font-mono text-xs text-[#A7AFBA] uppercase tracking-wider">
              Workshop floor
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}
