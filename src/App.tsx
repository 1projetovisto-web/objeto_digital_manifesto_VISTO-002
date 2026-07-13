import { useEffect, useRef, useState } from 'react';

// Declarações para o TypeScript
declare global {
  interface Window {
    p5: any;
    FilesetResolver: any;
    PoseLandmarker: any;
    HandLandmarker: any;
    ImageSegmenter: any;
  }
}

export default function App() {
  const canvasContainerRef = useRef<HTMLDivElement>(null);
  const [isLibraryReady, setIsLibraryReady] = useState(false);

  // Módulo 1: Garante a injeção e carregamento estrito dos scripts no DOM
  useEffect(() => {
    const loadScript = (src: string) => {
      return new Promise((resolve, reject) => {
        if (document.querySelector(`script[src="${src}"]`)) return resolve(true);
        const script = document.createElement('script');
        script.src = src;
        script.async = false; // Carregamento síncrono ordenado
        script.onload = () => resolve(true);
        script.onerror = () => reject();
        document.head.appendChild(script);
      });
    };

    const initializeDependencies = async () => {
      try {
        console.log("[V.I.S.T.O] Carregando bibliotecas essenciais via CDN...");
        await loadScript('https://cdnjs.cloudflare.com/ajax/libs/p5.js/1.9.0/p5.min.js');
        await loadScript('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.8/wasm/vision_bundle.js');
        console.log("[V.I.S.T.O] CDNs injetadas com sucesso.");
        setIsLibraryReady(true);
      } catch (err) {
        console.error("[V.I.S.T.O] Falha Crítica no carregamento das CDN's visuais:", err);
      }
    };

    initializeDependencies();
  }, []);

  // Módulo 2: Gerenciamento do ciclo de vida do sketch p5.js e MediaPipe
  useEffect(() => {
    if (!isLibraryReady || !window.p5) return;

    let p5Instance: any;

    // Referências limpas salvas fora do loop p5 para descarte ativo no cleanup
    let poseLandmarkerRef: any = null;
    let handLandmarkerRef: any = null;
    let imageSegmenterRef: any = null;
    let videoRef: any = null;

    const sketch = (p: any) => {
      let video: any;
      let poseLandmarker: any;
      let handLandmarker: any;
      let imageSegmenter: any;

      let poseResults: any = null;
      let handResults: any = null;
      let segmentationMask: any = null;

      let isModelsLoaded = false;
      let isProcessing = false; // Trava contra sobrecarga de frames na GPU
      let smoothedBlobPoints: any[] = [];

      let leftHandSpring: any = null;
      let rightHandSpring: any = null;
      const SPRING_K = 0.15;
      const SPRING_DAMP = 0.8;
      let leftVel: any, rightVel: any;

      const initializeMediaPipe = async () => {
        try {
          console.log("[V.I.S.T.O] Resolvendo arquivos de suporte WebAssembly...");
          // URL alternativa confiável para evitar travamentos de CORS internos no resolvedor
          const vision = await window.FilesetResolver.forVisionTasks(
            "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.8/wasm"
          );

          console.log("[V.I.S.T.O] Alocando instâncias dos modelos na GPU...");
          
          poseLandmarker = await window.PoseLandmarker.createFromOptions(vision, {
            baseOptions: { modelAssetPath: `https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/1/pose_landmarker_full.task`, delegate: "GPU" },
            runningMode: "VIDEO"
          });
          console.log("[V.I.S.T.O] Model 1/3: PoseLandmarker pronto.");

          handLandmarker = await window.HandLandmarker.createFromOptions(vision, {
            baseOptions: { modelAssetPath: `https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task`, delegate: "GPU" },
            runningMode: "VIDEO", numHands: 2
          });
          console.log("[V.I.S.T.O] Model 2/3: HandLandmarker pronto.");

          imageSegmenter = await window.ImageSegmenter.createFromOptions(vision, {
            baseOptions: { modelAssetPath: `https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/1/selfie_segmenter.task`, delegate: "GPU" },
            runningMode: "VIDEO", outputCategoryMask: true
          });
          console.log("[V.I.S.T.O] Model 3/3: ImageSegmenter pronto.");

          // Exportação de referências para o garbage collector do unmount
          poseLandmarkerRef = poseLandmarker;
          handLandmarkerRef = handLandmarker;
          imageSegmenterRef = imageSegmenter;

          isModelsLoaded = true;
          console.log("[V.I.S.T.O] Todos os pipelines de visão estão operacionais.");
          
          const statusEl = document.getElementById('loading-status');
          if (statusEl) {
            statusEl.innerText = "SYSTEMS ONLINE // INTERACTIVE CONTEXT READY";
            setTimeout(() => statusEl.style.display = 'none', 3000);
          }
        } catch (error) {
          console.error("[V.I.S.T.O] Falha fatal na inicialização do MediaPipe:", error);
          const statusEl = document.getElementById('loading-status');
          if (statusEl) statusEl.innerText = "CRITICAL ERROR: GPU INTERFACE TIMEOUT";
        }
      };

      p.setup = () => {
        p.createCanvas(p.windowWidth, p.windowHeight);

        console.log("[V.I.S.T.O] Inicializando captura de hardware da câmera...");
        video = p.createCapture(p.VIDEO, () => {
          console.log("[V.I.S.T.O] Hardware de vídeo respondendo. Iniciando visão computacional...");
          initializeMediaPipe();
        });
        video.size(640, 480);
        video.hide();
        videoRef = video;

        leftVel = p.createVector(0, 0);
        rightVel = p.createVector(0, 0);
        leftHandSpring = p.createVector(p.width / 2, p.height / 2);
        rightHandSpring = p.createVector(p.width / 2, p.height / 2);

        for (let i = 0; i < 40; i++) {
          smoothedBlobPoints.push(p.createVector(p.width / 2, p.height / 2));
        }
      };

      p.draw = () => {
        p.background(5, 5, 12);

        if (!video || video.width === 0) return;

        // Processamento assíncrono sequencial e seguro contra concorrência e drop de frames
        if (isModelsLoaded && video.elt.readyState >= 3 && !isProcessing) {
          isProcessing = true;
          const timestamp = performance.now();

          try {
            poseResults = poseLandmarker.detectForVideo(video.elt, timestamp);
            handResults = handLandmarker.detectForVideo(video.elt, timestamp);

            imageSegmenter.segmentForVideo(video.elt, timestamp, (result: any) => {
              if (segmentationMask && segmentationMask !== result.categoryMask) {
                segmentationMask.close(); // Limpeza explícita da memória Heap da GPU/Wasm
              }
              segmentationMask = result.categoryMask;
              isProcessing = false; // Desbloqueia o pipeline para processar o próximo frame disponível
            });
          } catch (err) {
            console.warn("[V.I.S.T.O] Frame drop ignorado para proteger barramento WebGL:", err);
            isProcessing = false; // Garante o destravamento imediato do loop de desenho
          }
        }

        drawVideoBackground();

        if (segmentationMask) {
          generateBlobFromMask(segmentationMask);
        }

        renderGenerativeSystems();
      };

      const drawVideoBackground = () => {
        const vw = video.width;
        const vh = video.height;
        if (!vw || !vh) return;

        // Renderização em aspect-ratio inteligente "cover" sem distorção anamórfica
        const scale = Math.max(p.width / vw, p.height / vh);
        const sw = vw * scale;
        const sh = vh * scale;
        const ox = (p.width - sw) / 2;
        const oy = (p.height - sh) / 2;

        p.push();
        p.translate(p.width, 0);
        p.scale(-1, 1); // Correção de espelhamento interativo para performance em palco/pátio
        p.tint(255, 65);
        p.image(video, p.width - (ox + sw), oy, sw, sh);
        p.pop();
      };

      const generateBlobFromMask = (mask: any) => {
        const maskWidth = mask.width;
        const maskHeight = mask.height;
        let maskData;

        try {
          maskData = mask.getAsUint8Array();
        } catch (e) {
          return; // Previne exceções de leitura de ponteiros de memória já destruídos no frame
        }

        let rawPoints = [];
        const numAngles = 40;

        let centerX = p.width / 2;
        let centerY = p.height / 2;

        if (poseResults && poseResults.landmarks && poseResults.landmarks[0] && poseResults.landmarks[0][0]) {
          centerX = (1 - poseResults.landmarks[0][0].x) * p.width;
          centerY = poseResults.landmarks[0][0].y * p.height;
        }

        for (let i = 0; i < numAngles; i++) {
          let angle = (p.TWO_PI / numAngles) * i;
          let maxRadius = p.max(p.width, p.height) * 0.5;
          let foundEdge = false;

          for (let r = 10; r < maxRadius; r += 15) {
            let checkX = centerX + p.cos(angle) * r;
            let checkY = centerY + p.sin(angle) * r;

            let maskImgX = p.floor(p.map(checkX, 0, p.width, maskWidth, 0));
            let maskImgY = p.floor(p.map(checkY, 0, p.height, 0, maskHeight));

            if (maskImgX >= 0 && maskImgX < maskWidth && maskImgY >= 0 && maskImgY < maskHeight) {
              let index = maskImgY * maskWidth + maskImgX;
              if (maskData[index] === 0) {
                rawPoints.push(p.createVector(checkX, checkY));
                foundEdge = true;
                break;
              }
            }
          }
          if (!foundEdge) {
            rawPoints.push(p.createVector(centerX + p.cos(angle) * 150, centerY + p.sin(angle) * 150));
          }
        }

        for (let i = 0; i < numAngles; i++) {
          if (rawPoints[i]) {
            smoothedBlobPoints[i].x = p.lerp(smoothedBlobPoints[i].x, rawPoints[i].x, 0.15);
            smoothedBlobPoints[i].y = p.lerp(smoothedBlobPoints[i].y, rawPoints[i].y, 0.15);
          }
        }

        p.push();
        p.noFill();
        p.strokeWeight(4);

        p.drawingContext.shadowBlur = 25;
        p.drawingContext.shadowColor = '#00fff2';
        p.stroke(0, 255, 242, 220);

        let wave = p.sin(p.frameCount * 0.04) * 6;

        p.beginShape();
        for (let i = 0; i < numAngles; i++) {
          let pt = smoothedBlobPoints[i];
          let dynamicX = pt.x + p.cos(i) * wave;
          let dynamicY = pt.y + p.sin(i) * wave;
          p.curveVertex(dynamicX, dynamicY);
        }
        for (let i = 0; i < 3; i++) {
          let pt = smoothedBlobPoints[i];
          p.curveVertex(pt.x + p.cos(i) * wave, pt.y + p.sin(i) * wave);
        }
        p.endShape();

        p.drawingContext.shadowBlur = 10;
        p.strokeWeight(0.5);
        p.stroke(255, 0, 128, 70);
        for (let i = 0; i < numAngles; i += 2) {
          p.line(centerX, centerY, smoothedBlobPoints[i].x, smoothedBlobPoints[i].y);
        }
        p.pop();
      };

      const renderGenerativeSystems = () => {
        let leftHandPos = null;
        let rightHandPos = null;

        if (poseResults && poseResults.landmarks) {
          for (const landmarks of poseResults.landmarks) {
            const structuralJoints = [11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28];

            p.strokeWeight(1.5);
            p.stroke(255, 255, 255, 80);
            connectJoints(landmarks, 11, 12);
            connectJoints(landmarks, 11, 13); connectJoints(landmarks, 13, 15);
            connectJoints(landmarks, 12, 14); connectJoints(landmarks, 14, 16);
            connectJoints(landmarks, 11, 23); connectJoints(landmarks, 12, 24);
            connectJoints(landmarks, 23, 24);
            connectJoints(landmarks, 23, 25); connectJoints(landmarks, 25, 27);
            connectJoints(landmarks, 24, 26); connectJoints(landmarks, 26, 28);

            if (landmarks[15] && landmarks[16]) {
              leftHandPos = p.createVector((1 - landmarks[15].x) * p.width, landmarks[15].y * p.height);
              rightHandPos = p.createVector((1 - landmarks[16].x) * p.width, landmarks[16].y * p.height);
            }

            for (let i = 0; i < landmarks.length; i++) {
              if (!landmarks[i]) continue;
              let x = (1 - landmarks[i].x) * p.width;
              let y = landmarks[i].y * p.height;

              p.push();
              p.drawingContext.shadowBlur = 15;
              if (structuralJoints.includes(i)) {
                p.drawingContext.shadowColor = '#ff0080';
                p.fill(255, 0, 128);
                p.noStroke();
                p.circle(x, y, 14);
                p.fill(255);
                p.circle(x, y, 6);
              } else {
                p.drawingContext.shadowColor = '#00fff2';
                p.fill(0, 255, 242, 200);
                p.noStroke();
                p.circle(x, y, 6);
              }
              p.pop();
            }
          }
        }

        let currentLeftTip = null;
        let currentRightTip = null;

        if (handResults && handResults.landmarks) {
          for (let h = 0; h < handResults.landmarks.length; h++) {
            let handLandmarks = handResults.landmarks[h];
            let handedness = handResults.handednesses?.[h]?.[0]?.categoryName;
            let isVisualRight = handedness === "Left";

            if (handLandmarks && handLandmarks[8]) {
              let tipX = (1 - handLandmarks[8].x) * p.width;
              let tipY = handLandmarks[8].y * p.height;

              if (isVisualRight) {
                currentRightTip = p.createVector(tipX, tipY);
              } else {
                currentLeftTip = p.createVector(tipX, tipY);
              }
            }

            const fingerTips = [4, 8, 12, 16, 20];
            for (let index of fingerTips) {
              if (handLandmarks && handLandmarks[index]) {
                let fx = (1 - handLandmarks[index].x) * p.width;
                let fy = handLandmarks[index].y * p.height;
                p.push();
                p.drawingContext.shadowBlur = 20;
                p.drawingContext.shadowColor = '#ffff00';
                p.fill(255, 255, 0);
                p.noStroke();
                p.circle(fx, fy, 10);
                p.pop();
              }
            }
          }
        }

        if (!currentLeftTip && leftHandPos) currentLeftTip = leftHandPos;
        if (!currentRightTip && rightHandPos) currentRightTip = rightHandPos;

        if (currentLeftTip && currentRightTip) {
          let forceL = window.p5.Vector.sub(currentLeftTip, leftHandSpring).mult(SPRING_K);
          leftVel.add(forceL).mult(SPRING_DAMP);
          leftHandSpring.add(leftVel);

          let forceR = window.p5.Vector.sub(currentRightTip, rightHandSpring).mult(SPRING_K);
          rightVel.add(forceR).mult(SPRING_DAMP);
          rightHandSpring.add(rightVel);

          let d = p.dist(leftHandSpring.x, leftHandSpring.y, rightHandSpring.x, rightHandSpring.y);
          let dynamicWeight = p.map(d, 0, p.width, 1, 15);

          p.push();
          p.drawingContext.shadowBlur = 30;

          let cycle = (p.frameCount * 0.02) % 3;
          let threadColor;
          if (cycle < 1) {
            threadColor = p.color(p.lerpColor(p.color(0, 255, 242), p.color(255, 0, 128), cycle));
          } else if (cycle < 2) {
            threadColor = p.color(p.lerpColor(p.color(255, 0, 128), p.color(255, 255, 0), cycle - 1));
          } else {
            threadColor = p.color(p.lerpColor(p.color(255, 255, 0), p.color(0, 255, 242), cycle - 2));
          }

          p.drawingContext.shadowColor = threadColor.toString();
          p.stroke(threadColor);
          p.strokeWeight(dynamicWeight);
          p.line(leftHandSpring.x, leftHandSpring.y, rightHandSpring.x, rightHandSpring.y);

          p.strokeWeight(1);
          p.stroke(255, 255, 255, 150);
          p.line(leftHandSpring.x, leftHandSpring.y, rightHandSpring.x, rightHandSpring.y);
          p.pop();
        }
      };

      const connectJoints = (points: any, j1: number, j2: number) => {
        if (points[j1] && points[j2]) {
          let x1 = (1 - points[j1].x) * p.width;
          let y1 = points[j1].y * p.height;
          let x2 = (1 - points[j2].x) * p.width;
          let y2 = points[j2].y * p.height;
          p.line(x1, y1, x2, y2);
        }
      };

      p.windowResized = () => {
        p.resizeCanvas(p.windowWidth, p.windowHeight);
      };
    };

    p5Instance = new window.p5(sketch, canvasContainerRef.current);

    return () => {
      console.log("[V.I.S.T.O] Executando rotina restrita de unmount de hardware e VRAM...");
      poseLandmarkerRef?.close?.();
      handLandmarkerRef?.close?.();
      imageSegmenterRef?.close?.();

      if (videoRef?.elt?.srcObject) {
        const stream = videoRef.elt.srcObject as MediaStream;
        stream.getTracks().forEach((track) => track.stop());
      }

      if (p5Instance) {
        p5Instance.remove();
      }
    };
  }, [isLibraryReady]);

  return (
    <div style={{
      margin: 0,
      padding: 0,
      backgroundColor: '#050508',
      overflow: 'hidden',
      fontFamily: "'Courier New', Courier, monospace",
      color: '#ffffff',
      userSelect: 'none',
      minHeight: '100vh',
      position: 'relative'
    }}>
      {/* UI Overlay Panel */}
      <div id="ui-overlay" style={{
        position: 'absolute',
        top: '20px',
        left: '20px',
        display: 'flex',
        alignItems: 'center',
        gap: '20px',
        background: 'rgba(5, 5, 10, 0.65)',
        backdropFilter: 'blur(12px)',
        border: '1px solid rgba(0, 255, 242, 0.2)',
        padding: '15px 25px',
        borderRadius: '8px',
        boxShadow: '0 0 20px rgba(0, 255, 242, 0.1)',
        pointerEvents: 'none',
        maxWidth: '600px',
        zIndex: 10
      }}>
        <img
          id="logo"
          src="https://res.cloudinary.com/dwx6kf2f6/image/upload/v1780873975/favicon_aebdg1.jpg"
          alt="V.I.S.T.O Logo"
          style={{ width: '60px', height: '60px', borderRadius: '4px', border: '1px solid rgba(255, 0, 128, 0.5)', objectFit: 'cover' }}
        />
        <div id="title-container" style={{ display: 'flex', flexDirection: 'column' }}>
          <h1 id="main-title" style={{ fontSize: '16px', fontWeight: 'bold', letterSpacing: '2px', color: '#00fff2', margin: '0 0 4px 0' }}>
            V.I.S.T.O: OCUPAÇÕES VÍDEO_COREOGRÁFICAS
          </h1>
          <p id="subtitle" style={{ fontSize: '11px', letterSpacing: '1px', color: '#ffffff', opacity: 0.85, margin: 0 }}>
            REABRINDO O LUGARZINHO NO 4º DISTRITO / POA
          </p>
        </div>
      </div>

      <div id="loading-status" style={{
        position: 'absolute',
        bottom: '20px',
        right: '20px',
        background: 'rgba(255, 0, 128, 0.15)',
        border: '1px solid #ff0080',
        padding: '8px 15px',
        fontSize: '12px',
        borderRadius: '4px',
        textShadow: '0 0 5px #ff0080',
        zIndex: 10
      }}>
        {isLibraryReady ? "INITIALIZING COMPUTER VISION SYSTEMS..." : "
