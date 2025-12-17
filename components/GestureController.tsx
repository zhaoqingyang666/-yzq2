
import React, { useEffect, useRef, useState } from 'react';
import { HandLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';

interface GestureControllerProps {
  onWave: () => void;
  onPress: () => void;
}

const GestureController: React.FC<GestureControllerProps> = ({ onWave, onPress }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [loaded, setLoaded] = useState(false);
  const [handDetected, setHandDetected] = useState(false);
  const lastVideoTime = useRef(-1);
  const requestRef = useRef<number | null>(null);
  const landmarkerRef = useRef<HandLandmarker | null>(null);
  
  // Detection state
  const historyRef = useRef<{x: number, y: number, time: number}[]>([]);
  const cooldownRef = useRef(false);

  useEffect(() => {
    const init = async () => {
      try {
        const vision = await FilesetResolver.forVisionTasks(
          "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3/wasm"
        );
        
        landmarkerRef.current = await HandLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: `https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task`,
            delegate: "GPU"
          },
          runningMode: "VIDEO",
          numHands: 2
        });
        
        // Start Camera
        const constraints = { video: { width: 320, height: 240 } };
        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.addEventListener("loadeddata", () => {
             videoRef.current?.play();
             setLoaded(true);
             predict();
          });
        }
      } catch (err) {
        console.error("Error initializing gesture controller:", err);
      }
    };
    
    init();

    return () => {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    };
  }, []);

  const drawHand = (landmarks: any[]) => {
      const ctx = canvasRef.current?.getContext('2d');
      if (!ctx || !canvasRef.current) return;

      ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
      
      // Mirror transform to match video
      ctx.save();
      ctx.scale(-1, 1);
      ctx.translate(-canvasRef.current.width, 0);

      ctx.lineWidth = 2;
      ctx.strokeStyle = cooldownRef.current ? '#ef4444' : '#00ff00'; // Red if cooldown
      ctx.fillStyle = cooldownRef.current ? '#ef4444' : '#00ff00';

      // Connections for a hand skeleton
      const connections = [
          [0,1], [1,2], [2,3], [3,4], // Thumb
          [0,5], [5,6], [6,7], [7,8], // Index
          [5,9], [9,10], [10,11], [11,12], // Middle
          [9,13], [13,14], [14,15], [15,16], // Ring
          [13,17], [17,18], [18,19], [19,20], // Pinky
          [0,17] // Palm base
      ];

      for (const hand of landmarks) {
          for (const [start, end] of connections) {
              const p1 = hand[start];
              const p2 = hand[end];
              ctx.beginPath();
              ctx.moveTo(p1.x * canvasRef.current.width, p1.y * canvasRef.current.height);
              ctx.lineTo(p2.x * canvasRef.current.width, p2.y * canvasRef.current.height);
              ctx.stroke();
          }
          for (const point of hand) {
              ctx.beginPath();
              ctx.arc(point.x * canvasRef.current.width, point.y * canvasRef.current.height, 3, 0, 2 * Math.PI);
              ctx.fill();
          }
      }
      ctx.restore();
  };

  const predict = () => {
    const video = videoRef.current;
    const landmarker = landmarkerRef.current;

    if (video && landmarker && !video.paused && !video.ended) {
      const nowInMs = Date.now();
      if (video.currentTime !== lastVideoTime.current) {
        lastVideoTime.current = video.currentTime;
        const result = landmarker.detectForVideo(video, nowInMs);

        if (result.landmarks && result.landmarks.length > 0) {
          setHandDetected(true);
          drawHand(result.landmarks);

          // Use the first detected hand
          const landmarks = result.landmarks[0];
          const wrist = landmarks[0];
          
          // Add to history
          historyRef.current.push({ x: wrist.x, y: wrist.y, time: nowInMs });
          
          // Keep last 1000ms
          historyRef.current = historyRef.current.filter(h => nowInMs - h.time < 1000);
          
          detectGestures(landmarks);
        } else {
            setHandDetected(false);
            const ctx = canvasRef.current?.getContext('2d');
            ctx?.clearRect(0, 0, canvasRef.current?.width || 0, canvasRef.current?.height || 0);
        }
      }
    }
    requestRef.current = requestAnimationFrame(predict);
  };

  const detectGestures = (landmarks: any[]) => {
      if (cooldownRef.current) return;
      if (historyRef.current.length < 5) return;

      // 1. Detect Wave (Horizontal Movement)
      const xs = historyRef.current.map(h => h.x);
      const minX = Math.min(...xs);
      const maxX = Math.max(...xs);
      const diffX = maxX - minX;

      if (diffX > 0.25) {
          onWave();
          console.log("Wave Detected");
          triggerCooldown();
          return;
      }

      // 2. Detect Press (Downward Vertical Movement)
      const ys = historyRef.current.map(h => h.y);
      const startY = ys[0];
      const endY = ys[ys.length - 1];
      const diffY = endY - startY; // Positive if moving down

      // Check if consistent downward movement
      if (diffY > 0.25) { 
          onPress();
          console.log("Press Detected");
          triggerCooldown();
      }
  };

  const triggerCooldown = () => {
      cooldownRef.current = true;
      setTimeout(() => { cooldownRef.current = false }, 2000); 
  };

  return (
    <>
      <div className="absolute bottom-4 right-4 w-[160px] h-[120px] rounded-lg overflow-hidden border-2 border-white/20 z-50 bg-black/50">
        <video 
          id="gesture-video"
          ref={videoRef} 
          autoPlay 
          playsInline 
          muted 
          className="absolute inset-0 w-full h-full object-cover opacity-50 transform -scale-x-100"
        />
        <canvas 
            ref={canvasRef}
            width={320}
            height={240}
            className="absolute inset-0 w-full h-full object-cover pointer-events-none"
        />
        <div className="absolute bottom-1 left-2 text-[10px] font-mono text-white/80 shadow-black drop-shadow-md">
            {loaded ? (handDetected ? "TRACKING ACTIVE" : "SEARCHING HAND...") : "INITIALIZING..."}
        </div>
      </div>
    </>
  );
};

export default GestureController;
