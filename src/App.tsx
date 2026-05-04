/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState } from 'react';
import p5 from 'p5';
import { Camera, Music, Activity, Info, Maximize2, Minimize2, AlertCircle } from 'lucide-react';

// Ensure p5 is available globally for CDN addons
if (typeof window !== 'undefined') {
  (window as any).p5 = p5;
}

// --- Types & Interfaces ---
interface Pose {
  keypoints: { x: number; y: number; confidence: number; name: string }[];
  left_wrist?: { x: number; y: number };
  right_wrist?: { x: number; y: number };
  nose?: { x: number; y: number };
}

export default function App() {
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [canStart, setCanStart] = useState(false);
  const [showInfo, setShowInfo] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [hasStarted, setHasStarted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Delay to ensure MediaPipe libraries and browser permissions settle inside iframe
    const timer = setTimeout(() => {
      setCanStart(true);
    }, 2000);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!containerRef.current) return;

    const sketch = (p: p5) => {
      let poseTracker: any;
      let camera: any;
      let landmarks: any[] = [];
      let smoothedLandmarks: any[] = [];
      const alpha = 0.15; // Temporal smoothing factor
      let textNodes: TextNode[] = [];
      let baseFontSize = 14;
      const quote = "MANIFESTO V.I.S.T.O_CRIAR. TRANSCREVER. CODIFICAR. No V.I.S.T.O_LAB (visto.art.br) , buscamos nos associar à todes aqueles que recusam a ideia de que a tecnologia deve ser uma 'caixa preta' — um segredo guardado por engenheiros. Acreditamos que objetos sociotécnicos analógicos e digitais de código aberto colaboram para a criação de novas possibilidades de pesquisa, experimentação e experiência digital-somática. Não estamos aqui apenas para criar performance; estamos aqui para colaborar com a democratização do acesso à tecnologia crítica e criativa. Para nós, as tecnologias e o código atuam como meio de investigação somática, onde o dado se torna movimento e gesto de criação — e vice-versa. Quando um artista move o corpo e vê uma malha de dados reagir em tempo real, ele não está apenas 'usando um software'. Ele está habitando uma experimentação digital-somática onde o dado se converte em movimento e gesto de criação, e a tecnologia se torna um campo aberto para a sua pesquisa. Uma das nossas missões é a transcriação: pegar as ferramentas avançadas da indústria — como MediaPipe e p5.js — e traduzi-las em uma linguagem acessível para artistas e educadores. Queremos que você deixe de ser espectador da tecnologia para se tornar o agente do seu próprio algoritmo. Cada linha de código que tornamos pública é um convite para que o erro, a falha e o improviso humano reescrevam a precisão fria das máquinas. Não buscamos a perfeição do processamento, mas a potência do encontro entre a carne e o pixel em ambientes de colaboração radical. Nossa prática também é política: ao desmistificar o algoritmo, transformamos a tecnologia em um bem comum e o aprendizado em um ato de resistência criativa. Entendemos que o domínio técnico não é um fim em si mesmo, mas o meio pelo qual tomamos consciência de como as coisas operam no mundo — e de como podemos intervir sobre elas. Contra a armadilha das aparências e o fetiche da interface polida, propomos o revelar. Nos objetos analógicos, os mecanismos permanecem visíveis, expondo as entranhas da máquina como prova de sua materialidade e de sua história. No digital, o código se manifesta em seu nível tautológico: ele não 'representa' algo — ele é a própria coisa, a estrutura fundamental através da qual o mundo é operado e reescrito. É através do código, portanto, que nós também nos tornamos parte da estrutura: autores, e não apenas usuários. Assumimos o Manifesto Hacker como uma ética coletiva. Acreditamos que o conhecimento deve ser livre e que os sistemas precisam ser abertos para que todos possam compreender, questionar e recriar. Reconhecemos que caminhamos ao lado de muitos outros que já colaboram para que a tecnologia seja um bem comum. No V.I.S.T.O_LAB, como nos primórdios da internet, hackear não é um ato de destruição — é um gesto de generosidade. É trazer à luz o desnudamento do sistema para que nenhum corpo precise ser apenas um usuário, mas possa se tornar, em comunidade, autor de sua própria experiência técnica e política. Essa visão de manter os mecanismos visíveis pulsa também no nosso contexto físico. No Atelier LUGARzinho, localizado no 4º Distrito de Porto Alegre, a construção e a tecnologia se encontram de forma honesta. O espaço não esconde suas costuras: as paredes, as ferramentas, os processos em andamento fazem parte da obra. O inacabado não é ausência — é método. A plataforma visto.art.br é o nosso território infinito, mas é nesse chão concreto do 4º Distrito que a investigação ganha corpo, calor e endereço. Propomos a criação operativa porque recusamos a tecnologia como abstração ou como 'mágica'. Nossa busca é pelo nível concreto: a relação física e visceral com a operatividade, com o que pode ser tocado, desmontado, reconfigurado. Não nos interessa o brilho da superfície. Nos interessa o que está por baixo — o mecanismo, o processo, a decisão que antecede o resultado. É nessa camada que a autonomia criativa se abre como possibilidade, e é para ela que convidamos cada artista, cada educador, cada corpo que cruza o nosso espaço. V.I.S.T.O_LAB — Porto Alegre, 4º Distrito visto.art.br ";
      let audioCtx: AudioContext | null = null;
      let oscL: OscillatorNode | null = null;
      let oscR: OscillatorNode | null = null;
      let gainL: GainNode | null = null;
      let gainR: GainNode | null = null;
      let isAudioStarted = false;
      let cameraStarted = false;

      const startCameraAndPose = async () => {
        if (cameraStarted) return;
        setError(null);
        try {
          const mpPose = (window as any).Pose;
          const mpCamera = (window as any).Camera;

          if (!mpPose || !mpCamera) {
            setError("Bibliotecas MediaPipe ainda não carregadas.");
            return;
          }

          if (!videoRef.current) {
            setError("Elemento de vídeo não encontrado.");
            return;
          }

          poseTracker = new mpPose({
            locateFile: (file: string) => `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${file}`
          });

          poseTracker.setOptions({
            modelComplexity: 1,
            smoothLandmarks: true,
            minDetectionConfidence: 0.5,
            minTrackingConfidence: 0.5
          });

          poseTracker.onResults((results: any) => {
            if (results.poseLandmarks) {
              landmarks = results.poseLandmarks;
              
              // Exponential Moving Average (EMA) for Smoothing
              if (smoothedLandmarks.length === 0) {
                smoothedLandmarks = results.poseLandmarks.map((lm: any) => ({ ...lm }));
              } else {
                results.poseLandmarks.forEach((lm: any, i: number) => {
                  if (smoothedLandmarks[i]) {
                    smoothedLandmarks[i].x = lm.x * alpha + smoothedLandmarks[i].x * (1 - alpha);
                    smoothedLandmarks[i].y = lm.y * alpha + smoothedLandmarks[i].y * (1 - alpha);
                    smoothedLandmarks[i].z = lm.z * alpha + smoothedLandmarks[i].z * (1 - alpha);
                    smoothedLandmarks[i].visibility = lm.visibility * alpha + smoothedLandmarks[i].visibility * (1 - alpha);
                  }
                });
              }
            }
          });

          camera = new mpCamera(videoRef.current, {
            onFrame: async () => {
              if (videoRef.current) {
                await poseTracker.send({ image: videoRef.current });
              }
            },
            width: 640,
            height: 480
          });

          await camera.start();
          console.log("MediaPipe Camera started");
          cameraStarted = true;
          setIsLoaded(true);
          setError(null);
        } catch (e: any) {
          console.error("Pose/Camera Error:", e);
          let userFriendlyMsg = "Erro ao acessar a câmera.";
          if (e.name === 'NotAllowedError' || e.message?.includes('Permission denied')) {
            userFriendlyMsg = "Permissão de câmera negada. Por favor, autorize o acesso no seu navegador.";
          }
          setError(userFriendlyMsg);
        }
      };

      // --- Text Node System ---
      class TextNode {
        char: string;
        anchor: p5.Vector;
        pos: p5.Vector;
        color: p5.Color;

        constructor(char: string, x: number, y: number) {
          this.char = char;
          this.anchor = p.createVector(x, y);
          this.pos = p.createVector(x, y);
          this.color = p.color(255);
        }

        update(landmarks: any[]) {
          let targetPos = this.anchor.copy();
          let thresholdDist = 38; 
          let totalForce = p.createVector(0, 0);

          if (landmarks && landmarks.length > 0) {
            const getPoint = (idx: number) => {
              const lm = landmarks[idx];
              if (!lm || lm.visibility < 0.3) return null;
              return p.createVector(p.map(lm.x, 0, 1, p.width, 0), p.map(lm.y, 0, 1, 0, p.height));
            };

            // 1. Head & Torso Volume (Massa Volumétrica)
            const earL = getPoint(7);
            const earR = getPoint(8);
            const shoulderL = getPoint(11);
            const shoulderR = getPoint(12);

            // Head Volume (Oval)
            if (earL && earR) {
              const headCenter = p5.Vector.lerp(earL, earR, 0.5);
              const earDist = p5.Vector.dist(earL, earR);
              headCenter.y -= earDist * 0.35; // Forehead position
              const dHead = p.dist(this.anchor.x, this.anchor.y, headCenter.x, headCenter.y);
              const headRadius = earDist * 0.95;
              if (dHead < headRadius) {
                let f = p.map(dHead, 0, headRadius, 1, 0);
                let diff = p5.Vector.sub(this.anchor, headCenter).normalize();
                totalForce.add(diff.mult(f * f * 55));
              }
            }

            // Chest/Sternum Mass
            if (shoulderL && shoulderR) {
              const sternum = p5.Vector.lerp(shoulderL, shoulderR, 0.5);
              const dChest = p.dist(this.anchor.x, this.anchor.y, sternum.x, sternum.y);
              const chestRadius = p5.Vector.dist(shoulderL, shoulderR) * 0.45;
              if (dChest < chestRadius) {
                let f = p.map(dChest, 0, chestRadius, 1, 0);
                let diff = p5.Vector.sub(this.anchor, sternum).normalize();
                totalForce.add(diff.mult(f * 35));
              }
            }

            // 2. Bone Skeleton (Segmentos Conectores - Modelo Completo)
            const connections = [
              [11, 12], [11, 13], [13, 15],       // L Arm & Shoulders
              [12, 14], [14, 16],                 // R Arm
              [15, 17], [15, 19], [15, 21],       // L Hand (Wrist to Pinky, Index, Thumb)
              [16, 18], [16, 20], [16, 22],       // R Hand
              [11, 23], [12, 24], [23, 24],       // Torso Perimeter
              [23, 25], [25, 27], [27, 29], [27, 31], [29, 31], // L Leg & Foot (Ankle-Heel-Toe loop)
              [24, 26], [26, 28], [28, 30], [28, 32], [30, 32]  // R Leg & Foot
            ];

            connections.forEach(([i1, i2]) => {
              const p1 = getPoint(i1);
              const p2 = getPoint(i2);
              
              if (p1 && p2) {
                const v = p5.Vector.sub(p2, p1);
                const w = p5.Vector.sub(this.anchor, p1);
                let t = w.dot(v) / v.magSq();
                t = Math.max(0, Math.min(1, t));
                const closest = p5.Vector.add(p1, v.mult(t));
                
                const d = p.dist(this.anchor.x, this.anchor.y, closest.x, closest.y);
                
                if (d < thresholdDist) {
                  const avgVis = (landmarks[i1].visibility + landmarks[i2].visibility) / 2;
                  let force = p.map(d, 0, thresholdDist, 1, 0);
                  let diff = p5.Vector.sub(this.anchor, closest).normalize();
                  diff.mult(force * force * 42 * avgVis);
                  totalForce.add(diff);
                }
              }
            });
          }
          
          targetPos.add(totalForce);
          this.pos.lerp(targetPos, 0.12);
          
          let displacement = p.dist(this.pos.x, this.pos.y, this.anchor.x, this.anchor.y);
          this.color = p.lerpColor(p.color(45, 45, 45), p.color(0, 255, 200), p.map(displacement, 0, 50, 0, 1));
        }

        show() {
          p.fill(this.color);
          p.text(this.char, this.pos.x, this.pos.y);
        }
      }

      p.setup = () => {
        p.createCanvas(p.windowWidth, p.windowHeight).parent(containerRef.current!);
        p.textFont('monospace');
        p.textAlign(p.CENTER, p.CENTER);
        p.frameRate(60);
        
        const spacingX = 15;
        const spacingY = 22;
        let charIdx = 0;
        for (let y = spacingY; y < p.height; y += spacingY) {
          for (let x = spacingX; x < p.width; x += spacingX) {
            const char = quote[charIdx % quote.length];
            textNodes.push(new TextNode(char, x, y));
            charIdx++;
          }
        }
      };

      p.draw = () => {
        p.background(0);

        if (!cameraStarted) {
          p.fill(0, 255, 200);
          p.textAlign(p.CENTER);
          p.textSize(16);
          p.text("Aguardando início...", p.width / 2, p.height / 2);
          return;
        }

        // --- Visual Essence: Mirrored Dancer Silhouette (Ghost/Soul) ---
        // Using native drawingContext for maximum safety against p5 'width' TypeErrors
        if (videoRef.current && videoRef.current.readyState >= 3 && videoRef.current.videoWidth > 0) {
          p.push();
          p.translate(p.width, 0);
          p.scale(-1, 1);
          
          // tint(255, 45) emulation via native globalAlpha
          const prevAlpha = p.drawingContext.globalAlpha;
          p.drawingContext.globalAlpha = 0.17; // ~45/255
          p.drawingContext.drawImage(videoRef.current, 0, 0, p.width, p.height);
          p.drawingContext.globalAlpha = prevAlpha;
          
          p.pop();
        }

        if (smoothedLandmarks && smoothedLandmarks.length > 0) {
          // Audio feedback: Hand verticality cross-mapped to stereo synthesis
          const leftWrist = smoothedLandmarks[15];
          const rightWrist = smoothedLandmarks[16];

          if (isAudioStarted && audioCtx && gainL && gainR && oscL && oscR) {
            const now = audioCtx.currentTime;
            
            // Handle Left Wrist -> Left Ear
            if (leftWrist && leftWrist.visibility > 0.5) {
              const freqL = p.map(leftWrist.y, 1, 0, 80, 500); // 80Hz to 500Hz
              const volL = p.map(leftWrist.visibility, 0.5, 1, 0, 0.12);
              oscL.frequency.setTargetAtTime(freqL, now, 0.1);
              gainL.gain.setTargetAtTime(volL, now, 0.1);
            } else {
              gainL.gain.setTargetAtTime(0, now, 0.2);
            }

            // Handle Right Wrist -> Right Ear
            if (rightWrist && rightWrist.visibility > 0.5) {
              const freqR = p.map(rightWrist.y, 1, 0, 80, 500);
              const volR = p.map(rightWrist.visibility, 0.5, 1, 0, 0.12);
              oscR.frequency.setTargetAtTime(freqR, now, 0.1);
              gainR.gain.setTargetAtTime(volR, now, 0.1);
            } else {
              gainR.gain.setTargetAtTime(0, now, 0.2);
            }
          }
        }

        p.textSize(baseFontSize);
        textNodes.forEach(node => {
          node.update(smoothedLandmarks);
          node.show();
        });
      };

      p.startPerformance = async () => {
        await startCameraAndPose();
        
        if (!isAudioStarted) {
          try {
            // Initialize Web Audio API
            audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
            
            // Create Audio Chain: Osc -> Gain -> Panner -> Destination
            oscL = audioCtx.createOscillator();
            oscR = audioCtx.createOscillator();
            gainL = audioCtx.createGain();
            gainR = audioCtx.createGain();
            const panL = audioCtx.createStereoPanner();
            const panR = audioCtx.createStereoPanner();

            oscL.type = 'sine';
            oscR.type = 'sine';
            gainL.gain.setValueAtTime(0, audioCtx.currentTime);
            gainR.gain.setValueAtTime(0, audioCtx.currentTime);
            panL.pan.setValueAtTime(-0.7, audioCtx.currentTime);
            panR.pan.setValueAtTime(0.7, audioCtx.currentTime);

            oscL.connect(gainL).connect(panL).connect(audioCtx.destination);
            oscR.connect(gainR).connect(panR).connect(audioCtx.destination);

            oscL.start();
            oscR.start();
            
            if (audioCtx.state === 'suspended') {
              await audioCtx.resume();
            }
            
            isAudioStarted = true;
          } catch(e) {
            console.error("Audio init error", e);
          }
          setHasStarted(true);
        }
      };

      p.mousePressed = () => {
        p.startPerformance();
      };

      p.windowResized = () => {
        p.resizeCanvas(p.windowWidth, p.windowHeight);
        textNodes = [];
        const spacingX = 15;
        const spacingY = 22;
        let charIdx = 0;
        for (let y = spacingY; y < p.height; y += spacingY) {
          for (let x = spacingX; x < p.width; x += spacingX) {
            const char = quote[charIdx % quote.length];
            textNodes.push(new TextNode(char, x, y));
            charIdx++;
          }
        }
      };
    };

    const p5Instance = new p5(sketch);
    (window as any).p5Instance = p5Instance;

    return () => {
      p5Instance.remove();
      delete (window as any).p5Instance;
    };
  }, []);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen();
      setIsFullscreen(true);
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen();
        setIsFullscreen(false);
      }
    }
  };

  return (
    <div className="relative w-full h-screen bg-black overflow-hidden font-sans text-white">
      {/* Video Feed for MediaPipe (Technically visible but transparent to satisfy browser policies) */}
      <video
        ref={videoRef}
        playsInline
        autoPlay
        muted
        width={640}
        height={480}
        className="fixed top-0 left-0 w-[640px] h-[480px] opacity-0 pointer-events-none -z-50"
      />

      {/* Canvas Container */}
      <div ref={containerRef} className="absolute inset-0 z-0" />

      {/* Error Message */}
      {error && (
        <div className="absolute top-20 left-1/2 -translate-x-1/2 z-[100] bg-red-500/90 backdrop-blur-md px-6 py-3 rounded-2xl flex items-center gap-3 shadow-2xl">
          <AlertCircle size={20} />
          <span className="text-sm font-medium">{error}</span>
        </div>
      )}

      {/* UI Overlay */}
      <div className="absolute inset-0 pointer-events-none flex flex-col justify-between p-6">
        {/* Header */}
        <header className="flex justify-between items-start pointer-events-auto">
          <div>
            <h1 className="text-2xl font-light tracking-widest uppercase flex items-center gap-3">
              <Activity className="text-emerald-400 animate-pulse" />
              V.I.S.T.O
            </h1>
            <p className="text-xs text-zinc-500 mt-1 tracking-wider uppercase">
              Ocupações Vídeo_Coreográficas &bull; 4º Distrito Poa
            </p>
          </div>
          
          <div className="flex gap-4">
            <button 
              onClick={() => setShowInfo(!showInfo)}
              className="p-2 rounded-full border border-white/10 bg-black/20 backdrop-blur-md hover:bg-white/10 transition-colors"
            >
              <Info size={20} />
            </button>
            <button 
              onClick={toggleFullscreen}
              className="p-2 rounded-full border border-white/10 bg-black/20 backdrop-blur-md hover:bg-white/10 transition-colors"
            >
              {isFullscreen ? <Minimize2 size={20} /> : <Maximize2 size={20} />}
            </button>
          </div>
        </header>

        {/* Status & Controls */}
        <footer className="flex justify-between items-end pointer-events-auto">
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[10px] uppercase tracking-tighter">
              <div className={`w-1.5 h-1.5 rounded-full ${isLoaded ? 'bg-emerald-400' : 'bg-zinc-600 animate-ping'}`} />
              {isLoaded ? 'Sistema Ativo' : 'Carregando Modelos...'}
            </div>
            <div className="text-[10px] text-zinc-500 uppercase tracking-[0.2em]">
              {hasStarted ? 'Performance em curso' : 'Clique na tela para ativar o som'}
            </div>
          </div>

          <div className="flex gap-6 text-zinc-400">
            <div className="flex flex-col items-center gap-1">
              <Camera size={16} className="opacity-50" />
              <span className="text-[8px] uppercase">Vision</span>
            </div>
            <div className="flex flex-col items-center gap-1">
              <Music size={16} className="opacity-50" />
              <span className="text-[8px] uppercase">Audio</span>
            </div>
          </div>
        </footer>
      </div>

      {/* Info Modal */}
      {showInfo && (
        <div className="absolute inset-0 z-50 flex items-center justify-center p-6 bg-black/60 backdrop-blur-xl pointer-events-auto">
          <div className="max-w-md w-full bg-zinc-900 border border-white/10 rounded-3xl p-8 shadow-2xl">
            <div className="flex justify-between items-start mb-6">
              <h2 className="text-xl font-light uppercase tracking-widest">Lab V.I.S.T.O</h2>
              <button onClick={() => setShowInfo(false)} className="text-zinc-500 hover:text-white">
                <Minimize2 size={20} />
              </button>
            </div>
            
            <div className="space-y-4 text-zinc-400 text-sm leading-relaxed">
              <p>
                <strong>Dispositivos de Presença Intermediada</strong><br/>
                Este experimento integra o projeto <em>V.I.S.T.O: Ocupações Vídeo_Coreográficas</em>, celebrando a reabertura do <strong>LUGARzinho</strong> no 4º Distrito de Porto Alegre.
              </p>
              <ul className="space-y-2">
                <li className="flex gap-3">
                  <span className="text-emerald-400">01.</span>
                  <span>A interface explora a presença do corpo mediada pela tecnologia.</span>
                </li>
                <li className="flex gap-3">
                  <span className="text-pink-400">02.</span>
                  <span>O movimento distorce a linguagem, criando novas coreografias visuais.</span>
                </li>
              </ul>
            </div>

            <div className="mt-8 flex justify-center">
              <img 
                src="https://raw.githubusercontent.com/1projetovisto-web/visto_lab_landing/main/public/favicon.jpg" 
                width="120" 
                height="120" 
                alt="v.i.s.t.o favicon" 
                className="rounded-none shadow-2xl border border-white/10 opacity-90 animate-neon-blink"
              />
            </div>

            <button 
              onClick={() => {
                if (!canStart) return;
                setShowInfo(false);
                if ((window as any).p5Instance) {
                  (window as any).p5Instance.startPerformance();
                }
              }}
              disabled={!canStart}
              className={`w-full mt-8 py-4 rounded-2xl font-medium uppercase tracking-widest text-xs transition-all ${
                canStart 
                  ? "bg-white text-black hover:bg-emerald-400 cursor-pointer" 
                  : "bg-zinc-800 text-zinc-500 cursor-not-allowed opacity-50"
              }`}
            >
              {canStart ? "Iniciar Performance" : "Sincronizando Sistema..."}
            </button>
          </div>
        </div>
      )}

      {/* Custom Styles */}
      <style dangerouslySetInnerHTML={{ __html: `
        canvas {
          display: block;
        }
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
        @keyframes neon-blink {
          0%, 100% { opacity: 0.7; filter: brightness(0.9) drop-shadow(0 0 5px rgba(52, 211, 153, 0.3)); }
          50% { opacity: 1; filter: brightness(1.2) drop-shadow(0 0 20px rgba(52, 211, 153, 0.7)); }
        }
        .animate-neon-blink {
          animation: neon-blink 3s infinite ease-in-out;
        }
      `}} />
    </div>
  );
}
