import { useEffect } from 'react';
import { ScrollTrigger } from './lib/gsap';
import Nav from './components/Nav';
import Hero from './components/Hero';
import Handoff from './components/Handoff';
import WorkdayTimeline from './components/WorkdayTimeline';
import AttendanceShowcase from './components/AttendanceShowcase';
import DefenderShowcase from './components/DefenderShowcase';
import CombinedScene from './components/CombinedScene';
import HowItWorks from './components/HowItWorks';
import Trust from './components/Trust';
import FinalCta from './components/FinalCta';
import Footer from './components/Footer';

export default function App() {
  // Trigger positions depend on layout, which settles after fonts and images load.
  useEffect(() => {
    const refresh = () => ScrollTrigger.refresh();
    document.fonts?.ready.then(refresh);
    window.addEventListener('load', refresh);
    return () => window.removeEventListener('load', refresh);
  }, []);

  return (
    <>
      <a href="#main" className="skip-link">Skip to content</a>
      <Nav />
      <main id="main">
        <Hero />
        <Handoff />
        <WorkdayTimeline />
        <Handoff />
        <div id="products">
          <AttendanceShowcase />
          <Handoff from="#315CE8" to="#B9F36A" />
          <DefenderShowcase />
        </div>
        <Handoff from="#B9F36A" to="#B9F36A" />
        <CombinedScene />
        <HowItWorks />
        <Trust />
        <Handoff from="#B9F36A" to="#315CE8" />
        <FinalCta />
      </main>
      <Footer />
    </>
  );
}
