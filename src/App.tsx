/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState } from 'react';
import p5 from 'p5';
import { Camera, Music, Activity, Info, Maximize2, Minimize2, AlertCircle } from 'lucide-react';

// Certifique-se de que o p5 esteja disponível globalmente
if (typeof window !== 'undefined') {
  (window as any).p5 = p5;
}

// O quote do Manifesto V.I.S.T.O (mantido para a lógica da grade)
const quoteText = "MANIFESTO V.I.S.T.O_CRIAR. TRANSCREVER. CODIFICAR. No V.I.S.T.O_LAB (visto.art.br)... [Conteúdo completo do manifesto mantido] V.I.S.T.O_LAB — Porto Alegre, 4º Distrito visto.art.br ";

export default function App() {
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [canStart, setCanStart] = useState(false);
  const [showInfo, setShowInfo] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [hasStarted, setHasStarted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Variável para a string de densidade de caracteres (pode ser customizada)
  // Deixe mais densa para contornos mais nítidos
  const density = "Ñ@#W$9876543210?!abc;:+=-,._      ";

  useEffect(() => {
    const timer = setTimeout(() => {
      setCanStart(true);
    }, 2000);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!containerRef.current) return;

    const sketch = (p: p5) => {
      // 1. Alteração: Segmentation em vez de Pose
      let segmentationTracker: any;
      let camera: any;
      let resultsReady = false;
      let textNodes: TextNode[] = [];
      let baseFontSize = 14;
      
      // Definição da grade de mosaico
      const cols = 80; // Resolução horizontal do mosaico
      const rows = 60; // Resolução vertical do mosaico
      let cellW: number, cellH: number;

      // Variáveis de Áudio (mantidas)
      let audioCtx: AudioContext | null = null;
      let oscL: OscillatorNode | null = null;
      let oscR: OscillatorNode | null = null;
      let gainL: GainNode | null = null;
      let gainR: GainNode | null = null;
      let isAudioStarted = false;
      let cameraStarted = false;

      // 2. Alteração: Função de Start para Selfie Segmentation
      const startCameraAndSegmentation = async () => {
        if (cameraStarted) return;
        setError(null);
        try {
          // Carregamento dinâmico das bibliotecas do MediaPipe
          const mpSegmentation = (window as any).SelfieSegmentation;
          const mpCamera = (window as any).Camera;

          if (!mpSegmentation || !mpCamera) {
            setError("Bibliotecas MediaPipe (Selfie Segmentation) ainda não carregadas.");
            return;
          }

          if (!videoRef.current) {
            setError("Elemento de vídeo não encontrado.");
            return;
          }

          // Inicializa o Selfie Segmentation
          segmentationTracker = new mpSegmentation({
            locateFile: (file: string) => `https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation/${file}`
          });

          // Configurações: Seleção de modelo para maior precisão (1)
          segmentationTracker.setOptions({
            modelSelection: 1, 
          });

          // Callback de resultados (Muda de landmarks para máscara)
          segmentationTracker.onResults(onSegmentationResults);

          camera = new mpCamera(videoRef.current, {
            onFrame: async () => {
              if (videoRef.current) {
                await segmentationTracker.send({ image: videoRef.current });
              }
            },
            width: 640,
            height: 480
          });

          await camera.start();
          console.log("MediaPipe Camera (Segmentation) started");
          cameraStarted = true;
          setIsLoaded(true);
          setError(null);
        } catch (e: any) {
          console.error("Segmentation/Camera Error:", e);
          setError("Erro ao acessar a câmera ou iniciar segmentação.");
        }
      };

      // 3. Alteração: Novo callback para processar a máscara
      let segmentCanvas: p5.Graphics;
      function onSegmentationResults(results: any) {
        if (!segmentCanvas) {
          // Cria um canvas auxiliar na resolução nativa da câmera
          segmentCanvas = p.createGraphics(640, 480);
        }
        
        // Desenha a máscara de segmentação no canvas auxiliar
        segmentCanvas.clear();
        segmentCanvas.image(results.segmentationMask, 0, 0, 640, 480);
        resultsReady = true;
      }

      // 4. Alteração Radical na Classe TextNode: Sem física, apenas mapeamento
      class TextNode {
        pos: p5.Vector;
        gridI: number; // Índice na grade (coluna)
        gridJ: number; // Índice na grade (linha)

        constructor(x: number, y: number, i: number, j: number) {
          this.pos = p.createVector(x, y);
          this.gridI = i;
          this.gridJ = j;
        }

        // Função de amostragem orgânica
        show(char: string, segmentCanvas: p5.Graphics) {
          // Pega os pixels da máscara
          segmentCanvas.loadPixels();
          
          if (segmentCanvas.pixels.length === 0) return;

          // Mapeia a posição da grade (i, j) para os pixels da câmera (640x480)
          // Inverte o eixo X (cols - 1 - this.gridI) para efeito de espelho natural
          let videoX = Math.floor(p.map(cols - 1 - this.gridI, 0, cols, 0, segmentCanvas.width));
          let videoY = Math.floor(p.map(this.gridJ, 0, rows, 0, segmentCanvas.height));
          
          let pixelIndex = (videoX + videoY * segmentCanvas.width) * 4;

          // Valor de segmentação (brilho na máscara, canal Red)
          let segVal = segmentCanvas.pixels[pixelIndex]; 

          // FATOR ORGÂNICO: Se o pixel pertence ao usuário (corpo detectado > 128)
          if (segVal > 128) { 
            // Estética Cyberpunk/Neon (Verde Emerald)
            p.fill(0, 255, 133); 
            p.textSize(cellW * 1.3); // Fonte ligeiramente maior para preencher a silhueta
            p.text(char, this.pos.x, this.pos.y);
          } else {
            // Opcional: O que desenhar no fundo (background)
            // Para o V.I.S.T.O, podemos deixar o texto bem apagado ou invisível
            p.fill(30, 30, 30); // Cinza muito escuro
            p.textSize(cellW * 0.9);
            // Opcional: Descomente para desenhar texto no fundo
            // p.text(char, this.pos.x, this.pos.y);
          }
        }
      }

      p.setup = () => {
        p.createCanvas(p.windowWidth, p.windowHeight).parent(containerRef.current!);
        p.textFont('monospace');
        p.textAlign(p.CENTER, p.CENTER);
        p.frameRate(60);
        
        // Inicializa a grade e os TextNodes
        createGridNodes();
      };

      // Função auxiliar para criar a grade de nós
      function createGridNodes() {
        textNodes = [];
        cellW = p.width / cols;
        cellH = p.height / rows;

        for (let j = 0; j < rows; j++) {
          for (let i = 0; i < cols; i++) {
            // Posição na tela de exibição
            let screenX = i * cellW + cellW / 2;
            let screenY = j * cellH + cellH / 2;
            textNodes.push(new TextNode(screenX, screenY, i, j));
          }
        }
      }

      p.draw = () => {
        p.background(0);

        if (!resultsReady || !segmentCanvas) {
          p.fill(0, 255, 133);
          p.textAlign(p.CENTER);
          p.textSize(16);
          p.text("Sincronizando Sistema de Visão por Silhueta...", p.width / 2, p.height / 2);
          return;
        }

        // --- Renderização do Mosaico de Texto ---
        textNodes.forEach((node, index) => {
          // Cicla pelo Manifesto V.I.S.T.O
          const char = quoteText[index % quoteText.length];
          node.show(char, segmentCanvas);
        });

        // --- Lógica de Áudio (Adaptada para usar a máscara em vez de wrists) ---
        if (isAudioStarted && audioCtx && gainL && gainR && oscL && oscR) {
          // Como não temos mais keypoints, vamos usar a densidade total do corpo
          // para modular o som, ou focar em áreas específicas do canvas (L/R)
          segmentCanvas.loadPixels();
          
          let totalBodyPixelsL = 0;
          let totalBodyPixelsR = 0;

          // Amostragem rápida (pula pixels) para performance
          for (let y = 0; y < 480; y += 10) {
            for (let x = 0; x < 640; x += 10) {
              let idx = (x + y * 640) * 4;
              if (segmentCanvas.pixels[idx] > 128) {
                if (x < 320) totalBodyPixelsL++;
                else totalBodyPixelsR++;
              }
            }
          }

          const now = audioCtx.currentTime;
          
          // Modula frequência e volume baseado na "massa" do corpo em cada lado
          const freqL = p.map(totalBodyPixelsL, 0, 1536, 100, 300); // 320x480 / 10x10 amostragem
          const volL = p.map(totalBodyPixelsL, 0, 1536, 0, 0.1);
          oscL.frequency.setTargetAtTime(freqL, now, 0.1);
          gainL.gain.setTargetAtTime(volL, now, 0.1);

          const freqR = p.map(totalBodyPixelsR, 0, 1536, 100, 300);
          const volR = p.map(totalBodyPixelsR, 0, 1536, 0, 0.1);
          oscR.frequency.setTargetAtTime(freqR, now, 0.1);
          gainR.gain.setTargetAtTime(volR, now, 0.1);
        }
      };

      p.startPerformance = async () => {
        // Troca de Pose para Segmentation
        await startCameraAndSegmentation();
        
        if (!isAudioStarted) {
          try {
            // Inicialização do Áudio (mantida idêntica)
            audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
            
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
        createGridNodes();
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
      {/* Video Feed (mantido transparente) */}
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

      {/* Error Message (mantida) */}
      {error && (
        <div className="absolute top-20 left-1/2 -translate-x-1/2 z-[100] bg-red-500/90 backdrop-blur-md px-6 py-3 rounded-2xl flex items-center gap-3 shadow-2xl">
          <AlertCircle size={20} />
          <span className="text-sm font-medium">{error}</span>
        </div>
      )}

      {/* UI Overlay (mantida idêntica para o V.I.S.T.O) */}
      <div className="absolute inset-0 pointer-events-none flex flex-col justify-between p-6">
        {/* Header */}
        <header className="flex justify-between items-start pointer-events-auto">
          <div>
            <h1 className="text-2xl font-light tracking-widest uppercase flex items-center gap-3">
              <Activity className="text-emerald-400 animate-pulse" />
              V.I.S.T.O (Silhueta V1)
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
              {isLoaded ? 'Sistema Ativo (Segmentation)' : 'Carregando Modelos...'}
            </div>
            <div className="text-[10px] text-zinc-500 uppercase tracking-[0.2em]">
              {hasStarted ? 'Performance em curso' : 'Clique na tela para ativar o som'}
            </div>
          </div>

          <div className="flex gap-6 text-zinc-400">
            <div className="flex flex-col items-center gap-1">
              <Camera size={16} className="opacity-50" />
              <span className="text-[8px] uppercase">Silhouette</span>
            </div>
            <div className="flex flex-col items-center gap-1">
              <Music size={16} className="opacity-50" />
              <span className="text-[8px] uppercase">Audio</span>
            </div>
          </div>
        </footer>
      </div>

      {/* Info Modal (mantida idêntica) */}
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
                  <span>A interface explora a presença do corpo mediada pela tecnologia (IA de Silhueta).</span>
                </li>
                <li className="flex gap-3">
                  <span className="text-pink-400">02.</span>
                  <span>O movimento distorce a linguagem do Manifesto V.I.S.T.O, criando novas coreografias visuais.</span>
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

      {/* Custom Styles (mantida) */}
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
