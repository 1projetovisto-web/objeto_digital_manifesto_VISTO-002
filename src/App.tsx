<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>V.I.S.T.O - Ocupações Vídeo-Coreográficas</title>
  
  <script src="https://cdnjs.cloudflare.com/ajax/libs/p5.js/1.9.0/p5.min.js"></script>
  
  <script src="https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.8/wasm/vision_bundle.js" crossorigin="anonymous"></script>

  <style>
    body {
      margin: 0;
      padding: 0;
      background-color: #050508;
      overflow: hidden;
      font-family: 'Courier New', Courier, monospace;
      color: #ffffff;
      user-select: none;
    }

    #canvas-container {
      width: 100vw;
      height: 100vh;
      display: flex;
      justify-content: center;
      align-items: center;
    }

    /* UI Overlay Panel */
    #ui-overlay {
      position: absolute;
      top: 20px;
      left: 20px;
      display: flex;
      align-items: center;
      gap: 20px;
      background: rgba(5, 5, 10, 0.65);
      backdrop-filter: blur(12px);
      border: 1px solid rgba(0, 255, 242, 0.2);
      padding: 15px 25px;
      border-radius: 8px;
      box-shadow: 0 0 20px rgba(0, 255, 242, 0.1);
      pointer-events: none;
      max-width: 600px;
      z-index: 10;
    }

    #logo {
      width: 60px;
      height: 60px;
      border-radius: 4px;
      border: 1px solid rgba(255, 0, 128, 0.5);
      object-fit: cover;
    }

    #title-container {
      display: flex;
      flex-direction: column;
    }

    #main-title {
      font-size: 16px;
      font-weight: bold;
      letter-spacing: 2px;
      color: #00fff2;
      text-shadow: 0 0 8px rgba(0, 255, 242, 0.6);
      margin: 0 0 4px 0;
    }

    #subtitle {
      font-size: 11px;
      letter-spacing: 1px;
      color: #ffffff;
      opacity: 0.85;
      margin: 0;
    }

    #loading-status {
      position: absolute;
      bottom: 20px;
      right: 20px;
      background: rgba(255, 0, 128, 0.15);
      border: 1px solid #ff0080;
      padding: 8px 15px;
      font-size: 12px;
      border-radius: 4px;
      text-shadow: 0 0 5px #ff0080;
      animation: pulse 2s infinite ease-in-out;
      z-index: 10;
    }

    @keyframes pulse {
      0% { opacity: 0.6; }
      50% { opacity: 1; }
      100% { opacity: 0.6; }
    }
  </style>
</head>
<body>

  <div id="ui-overlay">
    <img id="logo" src="https://res.cloudinary.com/dwx6kf2f6/image/upload/v1780873975/favicon_aebdg1.jpg" alt="V.I.S.T.O Logo">
    <div id="title-container">
      <h1 id="main-title">V.I.S.T.O: OCUPAÇÕES VÍDEO_COREOGRÁFICAS</h1>
      <p id="subtitle">REABRINDO O LUGARZINHO NO 4º DISTRITO / POA</p>
    </div>
  </div>

  <div id="loading-status">INITIALIZING COMPUTER VISION SYSTEMS...</div>

  <div id="canvas-container"></div>

  <script>
    let video;
    let poseLandmarker;
    let handLandmarker;
    let imageSegmenter;
    
    let poseResults = null;
    let handResults = null;
    let segmentationMask = null;
    
    let isModelsLoaded = false;
    let blobPoints = [];
    let smoothedBlobPoints = [];
    
    // Spring vectors for elastic threads interpolation
    let leftHandSpring = null;
    let rightHandSpring = null;
    const SPRING_K = 0.15;
    const SPRING_DAMP = 0.8;
    let leftVel, rightVel;

    async function initializeMediaPipe() {
      const vision = await FilesetResolver.forVisionTasks(
        "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.8/wasm"
      );

      // 1. Pose Landmarker
      poseLandmarker = await PoseLandmarker.createFromOptions(vision, {
        baseOptions: { modelAssetPath: `https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/1/pose_landmarker_full.task`, delegate: "GPU" },
        runningMode: "VIDEO", outputBytestream: false
      });

      // 2. Hand Landmarker
      handLandmarker = await HandLandmarker.createFromOptions(vision, {
        baseOptions: { modelAssetPath: `https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task`, delegate: "GPU" },
        runningMode: "VIDEO", numHands: 2
      });

      // 3. Image Segmenter (Selfie Segmenter for cleaner, faster body silhouette)
      imageSegmenter = await ImageSegmenter.createFromOptions(vision, {
        baseOptions: { modelAssetPath: `https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/1/selfie_segmenter.task`, delegate: "GPU" },
        runningMode: "VIDEO", outputCategoryMask: true
      });

      isModelsLoaded = true;
      document.getElementById('loading-status').innerText = "SYSTEMS ONLINE // INTERACTIVE CONTEXT READY";
      setTimeout(() => document.getElementById('loading-status').style.display = 'none', 3000);
    }

    function setup() {
      const canvas = createCanvas(windowWidth, windowHeight);
      canvas.parent('canvas-container');
      
      video = createCapture(VIDEO, () => {
        initializeMediaPipe();
      });
      video.size(640, 480);
      video.hide();

      leftVel = createVector(0, 0);
      rightVel = createVector(0, 0);
      leftHandSpring = createVector(width / 2, height / 2);
      rightHandSpring = createVector(width / 2, height / 2);
      
      // Initialize smoothed points structure
      for (let i = 0; i < 40; i++) {
        smoothedBlobPoints.push(createVector(width / 2, height / 2));
      }
    }

    function draw() {
      background(5, 5, 12);
      
      if (!video || video.width === 0) return;

      // Track systems when video frame updates
      if (isModelsLoaded && video.elt.readyState >= 3) {
        const timestamp = performance.now();
        
        // Run inference frames synchronously for the rendering ticks
        poseLandmarker.detectForVideo(video.elt, timestamp, (results) => { poseResults = results; });
        handLandmarker.detectForVideo(video.elt, timestamp, (results) => { handResults = results; });
        imageSegmenter.segmentForVideo(video.elt, timestamp, (results) => { 
          segmentationMask = results.categoryMask; 
        });
      }

      // Layer 1: Mirror and Draw Live Webcam Background
      push();
      translate(width, 0);
      scale(-1, 1);
      tint(255, 65); // Muted backdrop blend
      image(video, 0, 0, width, height);
      pop();

      // Layer 2: Compute and Render Organic Body Blob Contour
      if (segmentationMask) {
        generateBlobFromMask(segmentationMask);
      }

      // Layer 3: Dynamic Mechanics (Elastic Threads, Skeleton & Particle Joints)
      renderGenerativeSystems();
    }

    function generateBlobFromMask(mask) {
      const maskWidth = mask.width;
      const maskHeight = mask.height;
      const maskData = mask.getAsUint8Array();
      
      let rawPoints = [];
      const numAngles = 40; 
      
      // Compute center of gravity approximation based on pose tracking if available, else center screen
      let centerX = width / 2;
      let centerY = height / 2;
      
      if (poseResults && poseResults.landmarks && poseResults.landmarks[0] && poseResults.landmarks[0][0]) {
        centerX = (1 - poseResults.landmarks[0][0].x) * width;
        centerY = poseResults.landmarks[0][0].y * height;
      }

      // Cast radial rays outward to detect boundaries of the high contrast mask segmentation
      for (let i = 0; i < numAngles; i++) {
        let angle = (TWO_PI / numAngles) * i;
        let maxRadius = max(width, height) * 0.5;
        let foundEdge = false;
        
        // Ray marching along the segment space
        for (let r = 10; r < maxRadius; r += 15) {
          let checkX = centerX + cos(angle) * r;
          let checkY = centerY + sin(angle) * r;
          
          // Map screen coordinates back to mask matrix indices
          let maskImgX = floor(map(checkX, 0, width, maskWidth, 0)); // Account for horizontal mirroring
          let maskImgY = floor(map(checkY, 0, height, 0, maskHeight));
          
          if (maskImgX >= 0 && maskImgX < maskWidth && maskImgY >= 0 && maskImgY < maskHeight) {
            let index = maskImgY * maskWidth + maskImgX;
            // Class 0 is background usually, human segment holds values > 0
            if (maskData[index] === 0) { 
              rawPoints.push(createVector(checkX, checkY));
              foundEdge = true;
              break;
            }
          }
        }
        if (!foundEdge) {
          rawPoints.push(createVector(centerX + cos(angle) * 150, centerY + sin(angle) * 150));
        }
      }

      // Smooth boundaries with temporal easing to create organic latency
      for (let i = 0; i < numAngles; i++) {
        smoothedBlobPoints[i].x = lerp(smoothedBlobPoints[i].x, rawPoints[i].x, 0.15);
        smoothedBlobPoints[i].y = lerp(smoothedBlobPoints[i].y, rawPoints[i].y, 0.15);
      }

      // Draw the neon organic mesh blob boundary
      push();
      noFill();
      strokeWeight(4);
      
      // Cyber neon glow styling
      drawingContext.shadowBlur = 25;
      drawingContext.shadowColor = '#00fff2';
      stroke(0, 255, 242, 220);
      
      // Pulse animation dynamic offset
      let wave = sin(frameCount * 0.04) * 6;

      beginShape();
      for (let i = 0; i < numAngles; i++) {
        let p = smoothedBlobPoints[i];
        let dynamicX = p.x + cos(i) * wave;
        let dynamicY = p.y + sin(i) * wave;
        curveVertex(dynamicX, dynamicY);
      }
      // Close curve smoothly
      for (let i = 0; i < 3; i++) {
        let p = smoothedBlobPoints[i];
        curveVertex(p.x + cos(i) * wave, p.y + sin(i) * wave);
      }
      endShape();
      
      // Cyber Web grid overlay fills
      drawingContext.shadowBlur = 10;
      strokeWeight(0.5);
      stroke(255, 0, 128, 70);
      for (let i = 0; i < numAngles; i += 2) {
        line(centerX, centerY, smoothedBlobPoints[i].x, smoothedBlobPoints[i].y);
      }
      pop();
    }

    function renderGenerativeSystems() {
      let leftHandPos = null;
      let rightHandPos = null;

      // Extract Pose data and draw elements
      if (poseResults && poseResults.landmarks) {
        for (const landmarks of poseResults.landmarks) {
          
          // Custom indices mapping structural tracking elements
          const structuralJoints = [11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28]; // Shoulders, Elbows, Wrists, Hips, Knees, Ankles
          
          // Draw connecting bones
          strokeWeight(1.5);
          stroke(255, 255, 255, 80);
          connectJoints(landmarks, 11, 12); // Shoulders
          connectJoints(landmarks, 11, 13); connectJoints(landmarks, 13, 15); // Left arm
          connectJoints(landmarks, 12, 14); connectJoints(landmarks, 14, 16); // Right arm
          connectJoints(landmarks, 11, 23); connectJoints(landmarks, 12, 24); // Torso
          connectJoints(landmarks, 23, 24); // Hips
          connectJoints(landmarks, 23, 25); connectJoints(landmarks, 25, 27); // Left leg
          connectJoints(landmarks, 24, 26); connectJoints(landmarks, 26, 28); // Right leg

          // Extract Wrists directly for tracking anchoring fallback
          leftHandPos = createVector((1 - landmarks[15].x) * width, landmarks[15].y * height);
          rightHandPos = createVector((1 - landmarks[16].x) * width, landmarks[16].y * height);

          // Draw Joint Node Glow Particles
          for (let i = 0; i < landmarks.length; i++) {
            let x = (1 - landmarks[i].x) * width;
            let y = landmarks[i].y * height;
            
            push();
            drawingContext.shadowBlur = 15;
            if (structuralJoints.includes(i)) {
              drawingContext.shadowColor = '#ff0080';
              fill(255, 0, 128);
              noStroke();
              circle(x, y, 14);
              fill(255);
              circle(x, y, 6);
            } else {
              drawingContext.shadowColor = '#00fff2';
              fill(0, 255, 242, 200);
              noStroke();
              circle(x, y, 6);
            }
            pop();
          }
        }
      }

      // Process Hand Fingertips and update Elastic Links
      let currentLeftTip = null;
      let currentRightTip = null;

      if (handResults && handResults.landmarks) {
        for (let h = 0; h < handResults.landmarks.length; h++) {
          let handLandmarks = handResults.landmarks[h];
          let handedness = handResults.handednesses[h][0].categoryName; 
          
          // Mirroring maps "Left" tracker data to visual Right screen space
          let isVisualRight = handedness === "Left"; 
          
          // Index fingertip tracker node
          let tipX = (1 - handLandmarks[8].x) * width;
          let tipY = handLandmarks[8].y * height;
          
          if (isVisualRight) {
            currentRightTip = createVector(tipX, tipY);
          } else {
            currentLeftTip = createVector(tipX, tipY);
          }

          // Draw Glowing tip nodes
          const fingerTips = [4, 8, 12, 16, 20];
          for (let index of fingerTips) {
            let fx = (1 - handLandmarks[index].x) * width;
            let fy = handLandmarks[index].y * height;
            push();
            drawingContext.shadowBlur = 20;
            drawingContext.shadowColor = '#ffff00';
            fill(255, 255, 0);
            noStroke();
            circle(fx, fy, 10);
            pop();
          }
        }
      }

      // Fallback structural coordination anchoring if hands data falls offline
      if (!currentLeftTip && leftHandPos) currentLeftTip = leftHandPos;
      if (!currentRightTip && rightHandPos) currentRightTip = rightHandPos;

      // Handle Spring Interpolation Dynamics for Elastic Threads
      if (currentLeftTip && currentRightTip) {
        // Left spring update
        let forceL = p5.Vector.sub(currentLeftTip, leftHandSpring).mult(SPRING_K);
        leftVel.add(forceL).mult(SPRING_DAMP);
        leftHandSpring.add(leftVel);

        // Right spring update
        let forceR = p5.Vector.sub(currentRightTip, rightHandSpring).mult(SPRING_K);
        rightVel.add(forceR).mult(SPRING_DAMP);
        rightHandSpring.add(rightVel);

        // Calculate kinetic configuration metrics
        let d = dist(leftHandSpring.x, leftHandSpring.y, rightHandSpring.x, rightHandSpring.y);
        let dynamicWeight = map(d, 0, width, 1, 15);
        
        // Render Adaptive Elastic Line
        push();
        drawingContext.shadowBlur = 30;
        
        // Color transition space based on cyclic oscillation frames
        let cycle = (frameCount * 0.02) % 3;
        let threadColor;
        if (cycle < 1) {
          threadColor = color(lerpColor(color(0, 255, 242), color(255, 0, 128), cycle));
        } else if (cycle < 2) {
          threadColor = color(lerpColor(color(255, 0, 128), color(255, 255, 0), cycle - 1));
        } else {
          threadColor = color(lerpColor(color(255, 255, 0), color(0, 255, 242), cycle - 2));
        }
        
        drawingContext.shadowColor = threadColor.toString();
        stroke(threadColor);
        strokeWeight(dynamicWeight);
        line(leftHandSpring.x, leftHandSpring.y, rightHandSpring.x, rightHandSpring.y);
        
        // Additive sub-mesh accentuation paths
        strokeWeight(1);
        stroke(255, 255, 255, 150);
        line(leftHandSpring.x, leftHandSpring.y, rightHandSpring.x, rightHandSpring.y);
        pop();
      }
    }

    function connectJoints(points, j1, j2) {
      if (points[j1] && points[j2]) {
        let x1 = (1 - points[j1].x) * width;
        let y1 = points[j1].y * height;
        let x2 = (1 - points[j2].x) * width;
        let y2 = points[j2].y * height;
        line(x1, y1, x2, y2);
      }
    }

    function windowResized() {
      resizeCanvas(windowWidth, windowHeight);
    }
  </script>
</body>
</html>
