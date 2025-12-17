
import React, { Suspense, useState, useCallback, useEffect, useRef } from 'react';
import { Canvas } from '@react-three/fiber';
import Scene from './components/Scene';
import GestureController from './components/GestureController';

type MeteorPhase = 'IDLE' | 'INCOMING' | 'IMPACT';

const App: React.FC = () => {
  const [stormActive, setStormActive] = useState(false);
  const [meteorPhase, setMeteorPhase] = useState<MeteorPhase>('IDLE');
  
  // Visual severity of sand accumulation (0.0 to 1.0)
  const [sandSeverity, setSandSeverity] = useState(0);
  // Permanent damage floor for sand severity
  const [permanentDust, setPermanentDust] = useState(0);
  
  // Controls when the sand overlay is allowed to fade
  const [isFadingSand, setIsFadingSand] = useState(false);
  const animationFrameRef = useRef<number | null>(null);

  // 1. Random Sandstorm Scheduler
  // Triggers a start event after 30-40 seconds of idleness
  useEffect(() => {
    // If an event is already active, don't schedule a random storm
    if (stormActive || meteorPhase !== 'IDLE') return;

    // Schedule next storm between 30 and 40 seconds (range 10000ms + base 30000ms)
    const delay = Math.random() * 10000 + 30000;
    
    console.log(`Next random storm scheduled in ${(delay/1000).toFixed(1)}s`);

    const timer = setTimeout(() => {
        console.log("Random Sandstorm Started!");
        setStormActive(true);
    }, delay);

    return () => clearTimeout(timer);
  }, [stormActive, meteorPhase]);

  // 2. Sandstorm Duration Manager
  // Ensures storm always lasts exactly 10 seconds once active
  useEffect(() => {
    if (stormActive) {
        const timer = setTimeout(() => {
            console.log("Sandstorm Ended (Duration: 10s)");
            setStormActive(false);
        }, 10000);
        return () => clearTimeout(timer);
    }
  }, [stormActive]);

  // Logic to handle the 10-second persistence of dust blindness after storm ends
  useEffect(() => {
    let fadeTimer: ReturnType<typeof setTimeout>;
    
    if (stormActive) {
        setIsFadingSand(false);
    } else {
        // Storm ended. Wait 10 seconds before allowing the sand to fade.
        fadeTimer = setTimeout(() => {
            setIsFadingSand(true);
        }, 10000); 
    }
    return () => clearTimeout(fadeTimer);
  }, [stormActive]);

  // Execute the fading animation when permitted using requestAnimationFrame
  useEffect(() => {
      if (isFadingSand && sandSeverity > permanentDust) {
          const animate = () => {
              setSandSeverity(prev => {
                  const floor = permanentDust;
                  const next = Math.max(floor, prev - 0.005);
                  if (next <= floor + 0.001) {
                      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
                      return floor;
                  }
                  animationFrameRef.current = requestAnimationFrame(animate);
                  return next;
              });
          };
          animationFrameRef.current = requestAnimationFrame(animate);
      } else {
           if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
      }
      return () => {
           if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
      }
  }, [isFadingSand, sandSeverity > permanentDust, permanentDust]); 

  const handleWave = useCallback(() => {
    if (stormActive) return; 

    console.log("Wave detected! Triggering dust storm.");
    setStormActive(true);
    // Duration is handled by the useEffect above
  }, [stormActive]);

  const handlePress = useCallback(() => {
    if (meteorPhase !== 'IDLE') return;

    console.log("Press detected! Meteor incoming.");
    
    // 1. Warning Phase: Rover seeks cover
    setMeteorPhase('INCOMING');
    
    // 2. Impact Phase: Meteors fall
    setTimeout(() => {
        setMeteorPhase('IMPACT');
    }, 2500); // 2.5 seconds to find cover

    // 3. End
    setTimeout(() => {
        setMeteorPhase('IDLE');
    }, 8000);
  }, [meteorPhase]);
  
  const handleSandExposure = useCallback((amount: number) => {
      setSandSeverity(prev => Math.min(1.0, prev + amount));
      // Accumulate permanent dust damage
      // Factor 0.03 means ~36% permanent opacity after a full 10s storm if ignored.
      // This ensures it starts faint but becomes severe if repeated.
      setPermanentDust(prev => Math.min(0.98, prev + (amount * 0.03)));
  }, []);

  // SVG Noise Data URI for grain effect
  const noiseUrl = "data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)' opacity='0.4'/%3E%3C/svg%3E";

  return (
    <div className="relative w-full h-screen bg-[#000000]">
      {/* Gesture Controller (Webcam Logic) */}
      <GestureController onWave={handleWave} onPress={handlePress} />

      {/* 3D Canvas */}
      <Canvas shadows dpr={[1, 2]}>
        <Suspense fallback={null}>
          <Scene 
            stormActive={stormActive} 
            meteorPhase={meteorPhase} 
            onSandExposure={handleSandExposure}
          />
        </Suspense>
      </Canvas>

      {/* UI Overlay */}
      <div className="absolute top-0 left-0 w-full h-full pointer-events-none flex flex-col justify-between p-8 md:p-12">
        {/* Header */}
        <header className="flex flex-col items-start space-y-2 animate-fade-in">
          <h1 className="text-4xl md:text-6xl font-black text-white tracking-tighter drop-shadow-lg opacity-90">
            MARS<span className="text-[#852821]">.EXPLORE</span>
          </h1>
          <div className="h-1 w-24 bg-white rounded-full opacity-80"></div>
          <p className="text-white text-opacity-80 font-medium max-w-xs text-sm md:text-base mt-4 shadow-black drop-shadow-md">
            Wave to summon storm. Press to seek cover. O to toggle Camera.
          </p>
        </header>

        {/* Footer / Controls Hint */}
        <footer className="flex justify-between items-end">
          <div className="text-white text-opacity-70 text-xs md:text-sm font-mono">
            <p>LAT: 4.5892 N</p>
            <p>LON: 137.441 E</p>
            <p className={`font-bold transition-colors duration-300 ${
                sandSeverity > 0.5 ? 'text-red-500 animate-pulse' :
                meteorPhase !== 'IDLE' ? 'text-orange-500 animate-pulse' : 
                stormActive ? 'text-red-500 animate-pulse' : 
                permanentDust > 0.1 ? 'text-yellow-500' : ''
            }`}>
               STATUS: {
                   sandSeverity > 0.9 ? 'CRITICAL: VISIBILITY LOST' :
                   meteorPhase === 'INCOMING' ? 'WARNING: INCOMING OBJECTS' :
                   meteorPhase === 'IMPACT' ? 'DANGER: IMPACT DETECTED' :
                   stormActive ? 'CRITICAL - STORM SURGE' : 
                   permanentDust > 0.7 ? 'CRITICAL: OPTICS RUINED' :
                   permanentDust > 0.4 ? 'WARNING: LENS OBSTRUCTED' :
                   permanentDust > 0.15 ? 'CAUTION: DUST ACCUMULATION' : 'NOMINAL'
               }
            </p>
          </div>
          
          <div className="flex items-center space-x-2 text-white text-opacity-60 text-xs uppercase tracking-widest">
            <span className={`w-2 h-2 rounded-full ${stormActive || meteorPhase !== 'IDLE' ? 'bg-red-500' : 'bg-green-400'} animate-pulse`}></span>
            <span>Live Feed</span>
          </div>
        </footer>
      </div>

      {/* --- SANDSTORM BLINDING OVERLAY --- */}
      <div 
        className="absolute inset-0 pointer-events-none transition-all duration-300 ease-out"
        style={{
            opacity: sandSeverity,
            // Increased blur significantly (24px -> 64px) and added grayscale to simulate camera sensor failure
            backdropFilter: `blur(${sandSeverity * 64}px) grayscale(${sandSeverity * 100}%)`,
            backgroundColor: `rgba(180, 100, 70, ${sandSeverity * 0.6})`
        }}
      >
          {/* Grain Texture */}
          <div 
            className="absolute inset-0 w-full h-full mix-blend-overlay"
            style={{ 
                backgroundImage: `url("${noiseUrl}")`,
                backgroundSize: '200px',
                opacity: 0.6
            }}
          />
      </div>

      {/* Storm Overlay Vignette */}
      <div className={`absolute inset-0 pointer-events-none bg-[#661a15] mix-blend-overlay transition-opacity duration-1000 ${stormActive ? 'opacity-80' : 'opacity-0'}`}></div>
      
      {/* Meteor Flash Overlay */}
      <div className={`absolute inset-0 pointer-events-none bg-orange-500 mix-blend-screen transition-opacity duration-200 ${meteorPhase === 'IMPACT' ? 'opacity-20' : 'opacity-0'}`}></div>
      
      {/* Standard Overlay */}
      <div className="absolute inset-0 pointer-events-none bg-gradient-to-t from-[#852821]/30 to-transparent mix-blend-multiply"></div>
      <div className="absolute inset-0 pointer-events-none shadow-[inset_0_0_100px_rgba(0,0,0,0.2)]"></div>
    </div>
  );
};

export default App;
