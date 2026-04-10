import { useRef, useLayoutEffect } from 'react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { Rocket, Plane, Cog } from 'lucide-react';

gsap.registerPlugin(ScrollTrigger);

interface CommunitySectionProps {
  className?: string;
}

const events = [
  {
    title: 'Propulsion Demo Day',
    date: 'Mar 14',
    description: 'Static fire tests and thrust stand reviews.',
    image: '/event_propulsion.jpg',
    icon: Rocket,
  },
  {
    title: 'Flight Corridor Office Hours',
    date: 'Mar 21',
    description: 'Airspace, safety, and telemetry planning.',
    image: '/event_flight.jpg',
    icon: Plane,
  },
  {
    title: 'Manufacturing Office Hours',
    date: 'Mar 28',
    description: 'DFM, vendors, and small-batch setup.',
    image: '/event_manufacturing.jpg',
    icon: Cog,
  },
];

const tenants = [
  'Atmos',
  'Eden Tech',
  'ScoutLabs',
  'Allen Control',
  'Atomic Alchemy',
  'Oklo',
];

export default function CommunitySection({ className = '' }: CommunitySectionProps) {
  const sectionRef = useRef<HTMLElement>(null);
  const headingRef = useRef<HTMLDivElement>(null);
  const cardsRef = useRef<HTMLDivElement>(null);
  const logosRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const section = sectionRef.current;
    if (!section) return;

    const ctx = gsap.context(() => {
      // Heading animation
      gsap.fromTo(
        headingRef.current,
        { y: 24, opacity: 0 },
        {
          y: 0,
          opacity: 1,
          duration: 0.6,
          scrollTrigger: {
            trigger: headingRef.current,
            start: 'top 80%',
            end: 'top 55%',
            scrub: 0.5,
          },
        }
      );

      // Cards animation
      const cards = cardsRef.current?.querySelectorAll('.event-card');
      if (cards) {
        gsap.fromTo(
          cards,
          { y: 30, opacity: 0, scale: 0.98 },
          {
            y: 0,
            opacity: 1,
            scale: 1,
            stagger: 0.12,
            duration: 0.5,
            scrollTrigger: {
              trigger: cardsRef.current,
              start: 'top 75%',
              end: 'top 50%',
              scrub: 0.5,
            },
          }
        );
      }

      // Logos animation
      const logos = logosRef.current?.querySelectorAll('.tenant-logo');
      if (logos) {
        gsap.fromTo(
          logos,
          { opacity: 0, y: 12 },
          {
            opacity: 1,
            y: 0,
            stagger: 0.08,
            duration: 0.4,
            scrollTrigger: {
              trigger: logosRef.current,
              start: 'top 80%',
              end: 'top 60%',
              scrub: 0.5,
            },
          }
        );
      }
    }, section);

    return () => ctx.revert();
  }, []);

  return (
    <section
      ref={sectionRef}
      id="community"
      className={`relative bg-[#0B0D10] py-20 lg:py-32 ${className}`}
    >
      <div className="px-6 lg:px-10">
        {/* Heading */}
        <div ref={headingRef} className="mb-12 lg:mb-16" style={{ opacity: 0 }}>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-[#F4F6FA] mb-4">
            Community that moves fast
          </h2>
          <p className="text-base sm:text-lg text-[#A7AFBA] max-w-2xl">
            Weekly demos, office hours, and field tests—so you're never building
            alone.
          </p>
        </div>

        {/* Event Cards */}
        <div
          ref={cardsRef}
          className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-16 lg:mb-24"
        >
          {events.map((event, index) => (
            <div
              key={index}
              className="event-card group bg-[#14181D] rounded-[22px] overflow-hidden border border-white/5 hover:border-[#B8FF3D]/30 transition-colors"
              style={{ opacity: 0 }}
            >
              <div className="relative h-48 overflow-hidden">
                <img
                  src={event.image}
                  alt={event.title}
                  className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-[#14181D] to-transparent" />
                <div className="absolute top-4 left-4">
                  <span className="chip-lime">{event.date}</span>
                </div>
              </div>
              <div className="p-5">
                <div className="flex items-center gap-2 mb-3">
                  <event.icon className="w-4 h-4 text-[#B8FF3D]" />
                  <h3 className="text-lg font-semibold text-[#F4F6FA]">
                    {event.title}
                  </h3>
                </div>
                <p className="text-sm text-[#A7AFBA]">{event.description}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Tenant Logos */}
        <div ref={logosRef}>
          <p className="font-mono text-xs text-[#A7AFBA] uppercase tracking-wider mb-6">
            Resident teams
          </p>
          <div className="flex flex-wrap gap-4 lg:gap-6">
            {tenants.map((tenant, index) => (
              <div
                key={index}
                className="tenant-logo px-5 py-3 bg-[#14181D] rounded-xl border border-white/5 text-[#A7AFBA] hover:text-[#F4F6FA] hover:border-white/10 transition-colors cursor-default"
                style={{ opacity: 0 }}
              >
                <span className="text-sm font-medium">{tenant}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
