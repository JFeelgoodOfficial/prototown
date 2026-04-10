import { useRef, useLayoutEffect } from 'react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { Home, Factory, Building2, Check } from 'lucide-react';

gsap.registerPlugin(ScrollTrigger);

interface ProgramsSectionProps {
  className?: string;
}

const programs = [
  {
    name: 'Residency',
    duration: '3–12 months',
    description: 'Workshop + housing + range access',
    price: 'From $1,200/mo',
    icon: Home,
    features: [
      '24/7 workshop access',
      'Furnished housing unit',
      'Outdoor range access',
      'Community events',
      'Mentorship network',
    ],
  },
  {
    name: 'Manufacturing',
    duration: '6–24 months',
    description: 'Assembly line + logistics + shipping',
    price: 'From $3,800/mo',
    icon: Factory,
    features: [
      'Dedicated assembly line',
      'CNC & 3D printing',
      'Logistics support',
      'Shipping coordination',
      'Quality control lab',
    ],
  },
  {
    name: 'Enterprise',
    duration: 'Custom',
    description: 'Dedicated buildings + security + compliance',
    price: 'Custom',
    icon: Building2,
    features: [
      'Dedicated building',
      'Enhanced security',
      'Compliance support',
      'Custom infrastructure',
      'Priority support',
    ],
  },
];

export default function ProgramsSection({ className = '' }: ProgramsSectionProps) {
  const sectionRef = useRef<HTMLElement>(null);
  const leftColRef = useRef<HTMLDivElement>(null);
  const rightColRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const section = sectionRef.current;
    if (!section) return;

    const ctx = gsap.context(() => {
      // Left column animation
      gsap.fromTo(
        leftColRef.current,
        { y: 18, opacity: 0 },
        {
          y: 0,
          opacity: 1,
          duration: 0.6,
          scrollTrigger: {
            trigger: leftColRef.current,
            start: 'top 80%',
            end: 'top 55%',
            scrub: 0.5,
          },
        }
      );

      // Right column cards animation
      const cards = rightColRef.current?.querySelectorAll('.program-card');
      if (cards) {
        gsap.fromTo(
          cards,
          { x: '6vw', opacity: 0 },
          {
            x: 0,
            opacity: 1,
            stagger: 0.15,
            duration: 0.5,
            scrollTrigger: {
              trigger: rightColRef.current,
              start: 'top 75%',
              end: 'top 45%',
              scrub: 0.5,
            },
          }
        );
      }
    }, section);

    return () => ctx.revert();
  }, []);

  const scrollToContact = () => {
    const element = document.getElementById('contact');
    if (element) {
      element.scrollIntoView({ behavior: 'smooth' });
    }
  };

  return (
    <section
      ref={sectionRef}
      id="programs"
      className={`relative bg-[#0B0D10] py-20 lg:py-32 ${className}`}
    >
      <div className="px-6 lg:px-10">
        <div className="flex flex-col lg:flex-row gap-12 lg:gap-16">
          {/* Left Column - Sticky */}
          <div
            ref={leftColRef}
            className="lg:w-[40%] lg:sticky lg:top-[12vh] lg:self-start"
            style={{ opacity: 0 }}
          >
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-[#F4F6FA] mb-4">
              Choose your program
            </h2>
            <p className="text-base sm:text-lg text-[#A7AFBA] mb-8">
              From short-term residencies to long-term manufacturing leases—scale
              as you grow.
            </p>
            <button onClick={scrollToContact} className="btn-primary">
              Talk to our team
            </button>
          </div>

          {/* Right Column - Cards */}
          <div ref={rightColRef} className="lg:w-[60%] space-y-6">
            {programs.map((program, index) => (
              <div
                key={index}
                className="program-card relative bg-[#14181D] rounded-[22px] p-6 sm:p-8 border border-white/5 hover:border-[#B8FF3D]/30 transition-colors"
                style={{ opacity: 0 }}
              >
                {/* Lime top border accent */}
                <div className="absolute top-0 left-6 right-6 h-px bg-gradient-to-r from-transparent via-[#B8FF3D]/50 to-transparent" />

                <div className="flex items-start justify-between mb-6">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-xl bg-[#B8FF3D]/10 flex items-center justify-center">
                      <program.icon className="w-6 h-6 text-[#B8FF3D]" />
                    </div>
                    <div>
                      <h3 className="text-xl font-semibold text-[#F4F6FA]">
                        {program.name}
                      </h3>
                      <p className="text-sm text-[#A7AFBA]">{program.duration}</p>
                    </div>
                  </div>
                  <span className="text-lg font-semibold text-[#B8FF3D]">
                    {program.price}
                  </span>
                </div>

                <p className="text-[#A7AFBA] mb-6">{program.description}</p>

                <ul className="space-y-2">
                  {program.features.map((feature, fIndex) => (
                    <li
                      key={fIndex}
                      className="flex items-center gap-2 text-sm text-[#A7AFBA]"
                    >
                      <Check className="w-4 h-4 text-[#B8FF3D]" />
                      {feature}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
