import { useRef, useLayoutEffect, useState } from 'react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { Mail, MapPin, Calendar, Send } from 'lucide-react';
import { toast } from 'sonner';

gsap.registerPlugin(ScrollTrigger);

interface ContactSectionProps {
  className?: string;
}

export default function ContactSection({ className = '' }: ContactSectionProps) {
  const sectionRef = useRef<HTMLElement>(null);
  const leftColRef = useRef<HTMLDivElement>(null);
  const rightColRef = useRef<HTMLDivElement>(null);

  const [formData, setFormData] = useState({
    name: '',
    email: '',
    company: '',
    stage: '',
    message: '',
  });

  useLayoutEffect(() => {
    const section = sectionRef.current;
    if (!section) return;

    const ctx = gsap.context(() => {
      gsap.fromTo(
        leftColRef.current,
        { x: '-4vw', opacity: 0 },
        {
          x: 0,
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

      gsap.fromTo(
        rightColRef.current,
        { x: '4vw', opacity: 0 },
        {
          x: 0,
          opacity: 1,
          duration: 0.6,
          scrollTrigger: {
            trigger: rightColRef.current,
            start: 'top 80%',
            end: 'top 55%',
            scrub: 0.5,
          },
        }
      );
    }, section);

    return () => ctx.revert();
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    toast.success('Application submitted! We will be in touch soon.');
    setFormData({ name: '', email: '', company: '', stage: '', message: '' });
  };

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => {
    setFormData(prev => ({ ...prev, [e.target.name]: e.target.value }));
  };

  return (
    <section
      ref={sectionRef}
      id="contact"
      className={`relative bg-[#14181D] py-20 lg:py-32 ${className}`}
    >
      {/* Background overlay */}
      <div className="absolute inset-0 opacity-10">
        <img
          src="/hero_campus_night.jpg"
          alt=""
          className="w-full h-full object-cover"
        />
      </div>

      <div className="relative px-6 lg:px-10">
        <div className="flex flex-col lg:flex-row gap-12 lg:gap-16 max-w-6xl mx-auto">
          {/* Left Column - Contact Info */}
          <div
            ref={leftColRef}
            className="lg:w-[45%]"
            style={{ opacity: 0 }}
          >
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-[#F4F6FA] mb-4">
              Ready to build?
            </h2>
            <p className="text-base sm:text-lg text-[#A7AFBA] mb-10">
              Tell us what you're making. We'll recommend a program and schedule
              a tour.
            </p>

            <div className="space-y-6">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-lg bg-[#B8FF3D]/10 flex items-center justify-center">
                  <Mail className="w-5 h-5 text-[#B8FF3D]" />
                </div>
                <div>
                  <p className="text-sm text-[#A7AFBA]">Email</p>
                  <p className="text-[#F4F6FA]">hello@prototown.io</p>
                </div>
              </div>

              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-lg bg-[#B8FF3D]/10 flex items-center justify-center">
                  <MapPin className="w-5 h-5 text-[#B8FF3D]" />
                </div>
                <div>
                  <p className="text-sm text-[#A7AFBA]">Location</p>
                  <p className="font-mono text-sm text-[#F4F6FA]">
                    30.0° N 97.8° W
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-lg bg-[#B8FF3D]/10 flex items-center justify-center">
                  <Calendar className="w-5 h-5 text-[#B8FF3D]" />
                </div>
                <div>
                  <p className="text-sm text-[#A7AFBA]">Tours</p>
                  <p className="text-[#F4F6FA]">Tue + Thu</p>
                </div>
              </div>
            </div>
          </div>

          {/* Right Column - Form */}
          <div
            ref={rightColRef}
            className="lg:w-[55%]"
            style={{ opacity: 0 }}
          >
            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                <div>
                  <label className="block text-sm text-[#A7AFBA] mb-2">
                    Name
                  </label>
                  <input
                    type="text"
                    name="name"
                    value={formData.name}
                    onChange={handleChange}
                    required
                    className="w-full px-4 py-3 bg-[#0B0D10] border border-white/10 rounded-xl text-[#F4F6FA] placeholder:text-[#A7AFBA]/50 focus:outline-none focus:border-[#B8FF3D]/50 transition-colors"
                    placeholder="Your name"
                  />
                </div>
                <div>
                  <label className="block text-sm text-[#A7AFBA] mb-2">
                    Email
                  </label>
                  <input
                    type="email"
                    name="email"
                    value={formData.email}
                    onChange={handleChange}
                    required
                    className="w-full px-4 py-3 bg-[#0B0D10] border border-white/10 rounded-xl text-[#F4F6FA] placeholder:text-[#A7AFBA]/50 focus:outline-none focus:border-[#B8FF3D]/50 transition-colors"
                    placeholder="you@company.com"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                <div>
                  <label className="block text-sm text-[#A7AFBA] mb-2">
                    Company
                  </label>
                  <input
                    type="text"
                    name="company"
                    value={formData.company}
                    onChange={handleChange}
                    className="w-full px-4 py-3 bg-[#0B0D10] border border-white/10 rounded-xl text-[#F4F6FA] placeholder:text-[#A7AFBA]/50 focus:outline-none focus:border-[#B8FF3D]/50 transition-colors"
                    placeholder="Company name"
                  />
                </div>
                <div>
                  <label className="block text-sm text-[#A7AFBA] mb-2">
                    Stage
                  </label>
                  <select
                    name="stage"
                    value={formData.stage}
                    onChange={handleChange}
                    className="w-full px-4 py-3 bg-[#0B0D10] border border-white/10 rounded-xl text-[#F4F6FA] focus:outline-none focus:border-[#B8FF3D]/50 transition-colors appearance-none cursor-pointer"
                  >
                    <option value="">Select stage</option>
                    <option value="idea">Idea / Concept</option>
                    <option value="prototype">Prototype</option>
                    <option value="pilot">Pilot / MVP</option>
                    <option value="production">Production</option>
                    <option value="scale">Scaling</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm text-[#A7AFBA] mb-2">
                  What are you building?
                </label>
                <textarea
                  name="message"
                  value={formData.message}
                  onChange={handleChange}
                  rows={4}
                  className="w-full px-4 py-3 bg-[#0B0D10] border border-white/10 rounded-xl text-[#F4F6FA] placeholder:text-[#A7AFBA]/50 focus:outline-none focus:border-[#B8FF3D]/50 transition-colors resize-none"
                  placeholder="Tell us about your project..."
                />
              </div>

              <button type="submit" className="btn-primary w-full sm:w-auto">
                <Send className="w-4 h-4 mr-2" />
                Send application
              </button>
            </form>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-20 pt-8 border-t border-white/5 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-sm text-[#A7AFBA]">
            © 2026 Prototown. All rights reserved.
          </p>
          <div className="flex items-center gap-6">
            <a
              href="#"
              className="text-sm text-[#A7AFBA] hover:text-[#F4F6FA] transition-colors"
            >
              Privacy
            </a>
            <a
              href="#"
              className="text-sm text-[#A7AFBA] hover:text-[#F4F6FA] transition-colors"
            >
              Terms
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}
