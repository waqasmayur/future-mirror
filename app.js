// app.js - Future Mirror upgraded full try-on
document.addEventListener("DOMContentLoaded", () => {
  console.log("Future Mirror Loaded");

  // DOM
  const uploadInput = document.getElementById("uploadImage");
  const canvas = document.getElementById("overlay");
  const ctx = canvas.getContext("2d");

  const startBtn = document.getElementById("startBtn");
  const stopBtn = document.getElementById("stopBtn");
  const saveBtn = document.getElementById("saveBtn");

  const video = document.getElementById("input_video");
  const subPanel = document.getElementById("subPanel");
  const toolList = document.getElementById("toolList");

  // State
  let uploadedImage = null;
  let mpCamera = null;
  let currentStream = null;
  let landmarksCache = null; // last known landmarks

  let activeTool = "makeup"; // makeup, jewelry, glasses, bg, none
  let makeupCategory = "lipstick"; // lipstick, eyeliner, blush
  let jewelryCategory = "earring"; // earring, nose, neck
  let selectedLipColor = "rgba(220,20,60,0.6)"; // red
  let selectedEyelinerColor = "rgba(20,20,20,0.85)";
  let selectedBlushColor = "rgba(255,20,150,0.18)";
  let selectedGlasses = "neon";
  let selectedBg = "none";
  let selectedEarring = "earring1";
  let selectedNose = "nose1";
  let selectedNeck = "neck1";

  // assets manifest (update filenames as needed)
  const assets = {
    glasses: {
      neon: "assets/glasses/neon.png",
      visor: "assets/glasses/visor.png",
      round: "assets/glasses/round.png"
    },
    backgrounds: {
      none: null,
      city: "assets/backgrounds/city.png",
      lab: "assets/backgrounds/lab.png",
      studio: "assets/backgrounds/studio.png"
    },
    jewelry: {
      earring1: "assets/jewelry/earring1.png",
      nose1: "assets/jewelry/nose1.png",
      neck1: "assets/jewelry/neck1.png"
    }
  };

  const cache = { glasses: {}, backgrounds: {}, jewelry: {} };

  // Preload assets
  (function preload() {
    Object.entries(assets.glasses).forEach(([k, src]) => {
      if (!src) return;
      const i = new Image(); i.src = src; cache.glasses[k] = i;
    });
    Object.entries(assets.backgrounds).forEach(([k, src]) => {
      if (!src) return;
      const i = new Image(); i.src = src; cache.backgrounds[k] = i;
    });
    Object.entries(assets.jewelry).forEach(([k, src]) => {
      if (!src) return;
      const i = new Image(); i.src = src; cache.jewelry[k] = i;
    });
  })();

  // Setup mediapipe faceMesh
  const faceMesh = new FaceMesh({
    locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`
  });
  faceMesh.setOptions({
    maxNumFaces: 1,
    refineLandmarks: true,
    minDetectionConfidence: 0.6,
    minTrackingConfidence: 0.5
  });
  faceMesh.onResults((results) => {
    landmarksCache = (results && results.multiFaceLandmarks && results.multiFaceLandmarks[0]) || null;
    drawCanvas(landmarksCache);
  });

  // Utility: draw image cover (aspect cover)
  function drawImageCover(img, x, y, w, h) {
    const iw = img.width, ih = img.height;
    const r = Math.max(w / iw, h / ih);
    const nw = iw * r, nh = ih * r;
    const cx = (nw - w) / 2, cy = (nh - h) / 2;
    ctx.drawImage(img, -cx + x, -cy + y, nw, nh);
  }

  // Main draw: background -> user -> overlays
  function drawCanvas(landmarks = null) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // 1) background first
    if (selectedBg && selectedBg !== "none") {
      const bg = cache.backgrounds[selectedBg];
      if (bg && bg.complete) drawImageCover(bg, 0, 0, canvas.width, canvas.height);
    } else {
      // fill neutral background
      ctx.fillStyle = "#0a0610";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    // 2) user layer (uploaded or video)
    if (uploadedImage) {
      drawImageCover(uploadedImage, 0, 0, canvas.width, canvas.height);
    } else if (video && video.readyState >= 2) {
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    } else {
      // nothing
    }

    // 3) overlays: makeup, jewelry, glasses
    if (!landmarks) {
      // no landmarks: nothing to overlay besides basic UI
      return;
    }

    // helper to convert landmark index to canvas coords
    const p = (i) => ({ x: landmarks[i].x * canvas.width, y: landmarks[i].y * canvas.height });

    // ------- MAKEUP -------
    if (activeTool === "makeup") {
      if (makeupCategory === "lipstick") drawLipstick(landmarks, selectedLipColor);
      if (makeupCategory === "eyeliner") drawEyeliner(landmarks, selectedEyelinerColor);
      if (makeupCategory === "blush") drawBlush(landmarks, selectedBlushColor);
    }

    // ------- JEWELRY -------
    if (activeTool === "jewelry") {
      if (jewelryCategory === "earring") drawEarring(landmarks, selectedEarring);
      if (jewelryCategory === "nose") drawNose(landmarks, selectedNose);
      if (jewelryCategory === "neck") drawNeck(landmarks, selectedNeck);
    }

    // ------- GLASSES -------
    if (activeTool === "glasses" || activeTool === "none") {
      // draw glasses if chosen (glasses tool or none still show glasses if selected)
      if (selectedGlasses) drawGlassesFit(landmarks, selectedGlasses);
    }
  }

  // DRAW LIPS (polygon fill using lip indices)
  const LIP_POINTS = [
    61,146,91,181,84,17,314,405,321,375,291,61 // outer loop (approx)
  ];
  function drawLipstick(landmarks, color) {
    if (!landmarks) return;
    ctx.save();
    ctx.globalCompositeOperation = "overlay";
    ctx.fillStyle = color;
    ctx.beginPath();
    LIP_POINTS.forEach((idx, i) => {
      const pt = landmarks[idx];
      const x = pt.x * canvas.width, y = pt.y * canvas.height;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  // DRAW EYELINER (upper lid curve)
  const UPPER_LID = [33, 160, 158, 133, 153, 144, 145, 153]; // simplified
  function drawEyeliner(landmarks, color) {
    if (!landmarks) return;
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.lineJoin = "round";
    ctx.beginPath();
    UPPER_LID.forEach((idx, i) => {
      const pt = landmarks[idx];
      const x = pt.x * canvas.width, y = pt.y * canvas.height;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.stroke();

    // right eye mirror (use corresponding indices)
    const RIGHT_IDX = [263,387,385,362,382,381,380,382];
    ctx.beginPath();
    RIGHT_IDX.forEach((idx, i) => {
      const pt = landmarks[idx];
      const x = pt.x * canvas.width, y = pt.y * canvas.height;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.stroke();
    ctx.restore();
  }

  // DRAW BLUSH (soft radial gradient on cheeks)
  function drawBlush(landmarks, color) {
    if (!landmarks) return;
    ctx.save();
    const left = landmarks[234], right = landmarks[454];
    const lx = left.x * canvas.width, ly = left.y * canvas.height;
    const rx = right.x * canvas.width, ry = right.y * canvas.height;
    const r = Math.max(28, Math.hypot(rx - lx, ry - ly) * 0.15);

    // left
    const g1 = ctx.createRadialGradient(lx, ly, r * 0.1, lx, ly, r * 1.2);
    g1.addColorStop(0, color);
    g1.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g1;
    ctx.beginPath(); ctx.arc(lx, ly, r, 0, Math.PI * 2); ctx.fill();

    // right
    const g2 = ctx.createRadialGradient(rx, ry, r * 0.1, rx, ry, r * 1.2);
    g2.addColorStop(0, color);
    g2.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g2;
    ctx.beginPath(); ctx.arc(rx, ry, r, 0, Math.PI * 2); ctx.fill();

    ctx.restore();
  }

  // GLASSES FIT (scale + rotate) using eye outer corners
  function drawGlassesFit(landmarks, styleKey) {
    if (!landmarks) return;
    const leftOuter = landmarks[33], rightOuter = landmarks[263];
    const cx = (leftOuter.x + rightOuter.x) / 2 * canvas.width;
    const cy = (leftOuter.y + rightOuter.y) / 2 * canvas.height;

    const dx = (rightOuter.x - leftOuter.x) * canvas.width;
    const dy = (rightOuter.y - leftOuter.y) * canvas.height;
    const dist = Math.hypot(dx, dy);
    const angle = Math.atan2(dy, dx);

    const img = cache.glasses[styleKey];
    if (!img) return;
    if (!img.complete) { img.onload = () => drawCanvas(landmarks); return; }

    const w = dist * 2.6; // tuning factor
    const h = w * 0.45;

    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(angle);
    ctx.drawImage(img, -w * 0.5, -h * 0.5, w, h);
    ctx.restore();
  }

  // JEWELRY: earring near jaw/ear region
  function drawEarring(landmarks, key) {
    const img = cache.jewelry[key];
    if (!img) return;
    if (!img.complete) { img.onload = () => drawCanvas(landmarks); return; }
    // use landmark near ear: 234 (left) and 454 (right)
    const left = landmarks[234], right = landmarks[454];
    const lX = left.x * canvas.width, lY = left.y * canvas.height;
    const rX = right.x * canvas.width, rY = right.y * canvas.height;
    const size = Math.max(24, (Math.hypot(rX - lX, rY - lY) * 0.12));
    ctx.drawImage(img, lX - size * 0.4, lY - size * 0.2, size, size);
    ctx.drawImage(img, rX - size * 0.6, rY - size * 0.2, size, size);
  }

  // NOSE JEWELRY
  function drawNose(landmarks, key) {
    const img = cache.jewelry[key];
    if (!img) return;
    if (!img.complete) { img.onload = () => drawCanvas(landmarks); return; }
    const tip = landmarks[1];
    const size = 28;
    ctx.drawImage(img, tip.x * canvas.width - size/2, tip.y * canvas.height - size/2, size, size);
  }

  // NECKLACE: place under chin using landmark 152 (chin bottom)
  function drawNeck(landmarks, key) {
    const img = cache.jewelry[key];
    if (!img) return;
    if (!img.complete) { img.onload = () => drawCanvas(landmarks); return; }
    const chin = landmarks[152];
    const jawLeft = landmarks[234], jawRight = landmarks[454];
    const width = Math.max(80, Math.hypot((jawRight.x - jawLeft.x) * canvas.width, (jawRight.y - jawLeft.y) * canvas.height) * 1.2);
    const x = chin.x * canvas.width - width/2;
    const y = chin.y * canvas.height + 10;
    ctx.drawImage(img, x, y, width, width * 0.35);
  }

  // CAMERA & UPLOAD HANDLERS
  async function startCamera() {
    if (mpCamera) return;
    try {
      mpCamera = new Camera.Camera(video, {
        onFrame: async () => {
          await faceMesh.send({ image: video });
        },
        width: 640,
        height: 480
      });
      await mpCamera.start();
      video.style.display = "block";
      uploadedImage = null;
    } catch (err) {
      console.error("Camera Error:", err);
      alert("Camera error: " + (err.message || err.name));
      mpCamera = null;
    }
  }

  function stopCamera() {
    try { if (mpCamera && mpCamera.stop) mpCamera.stop(); } catch(e){}
    mpCamera = null;
    try {
      const s = video.srcObject;
      if (s && s.getTracks) s.getTracks().forEach(t => t.stop());
    } catch(e){}
    video.srcObject = null;
    video.style.display = "none";
  }

  // UPLOAD
  uploadInput.addEventListener("change", (e) => {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    const img = new Image();
    img.onload = async () => {
      uploadedImage = img;
      stopCamera();
      try { await faceMesh.send({ image: uploadedImage }); } catch(e){ drawCanvas(null); }
    };
    img.src = URL.createObjectURL(f);
  });

  // SAVE
  saveBtn.addEventListener("click", () => {
    const link = document.createElement("a");
    link.download = "future_mirror.png";
    link.href = canvas.toDataURL("image/png");
    document.body.appendChild(link);
    link.click();
    link.remove();
  });

  // UI: tool selection and dynamic subpanel
  function buildSubPanelFor(tool) {
    subPanel.innerHTML = "";
    if (tool === "makeup") {
      subPanel.innerHTML = `
        <div class="label">Makeup</div>
        <div class="small-row">
          <div class="chip ${makeupCategory==='lipstick'?'active':''}" data-mk="lipstick">Lipstick</div>
          <div class="chip ${makeupCategory==='eyeliner'?'active':''}" data-mk="eyeliner">Eyeliner</div>
          <div class="chip ${makeupCategory==='blush'?'active':''}" data-mk="blush">Blush</div>
        </div>
        <div class="label" style="margin-top:8px">Colors</div>
        <div class="small-row" id="colorSwatches">
          <div class="swatch" style="background:rgba(220,20,60,0.85)" data-color="rgba(220,20,60,0.6)"></div>
          <div class="swatch" style="background:rgba(255,102,178,0.9)" data-color="rgba(255,102,178,0.5)"></div>
          <div class="swatch" style="background:rgba(255,200,170,0.9)" data-color="rgba(255,200,170,0.5)"></div>
          <div class="swatch" style="background:rgba(128,0,255,0.85)" data-color="rgba(128,0,255,0.45)"></div>
          <div class="swatch" style="background:rgba(0,122,255,0.85)" data-color="rgba(0,122,255,0.35)"></div>
        </div>
      `;
      // attach events
      subPanel.querySelectorAll('[data-mk]').forEach(el => el.addEventListener('click', () => {
        makeupCategory = el.dataset.mk;
        buildSubPanelFor('makeup');
        drawCanvas(landmarksCache);
      }));
      subPanel.querySelectorAll('#colorSwatches .swatch').forEach(s => {
        s.addEventListener('click', () => {
          const col = s.dataset.color;
          if (makeupCategory === 'lipstick') selectedLipColor = col;
          if (makeupCategory === 'eyeliner') selectedEyelinerColor = col;
          if (makeupCategory === 'blush') selectedBlushColor = col;
          subPanel.querySelectorAll('.swatch').forEach(x=>x.classList.remove('active'));
          s.classList.add('active');
          drawCanvas(landmarksCache);
        });
      });
    }

    if (tool === "jewelry") {
      subPanel.innerHTML = `
        <div class="label">Jewelry</div>
        <div class="small-row">
          <div class="chip ${jewelryCategory==='earring'?'active':''}" data-j="earring">Earrings</div>
          <div class="chip ${jewelryCategory==='nose'?'active':''}" data-j="nose">Nose Pin</div>
          <div class="chip ${jewelryCategory==='neck'?'active':''}" data-j="neck">Necklace</div>
        </div>
        <div class="label" style="margin-top:8px">Styles</div>
        <div class="small-row">
          <div class="chip" data-style="earring1">Style 1</div>
          <div class="chip" data-style="nose1">Nose 1</div>
          <div class="chip" data-style="neck1">Neck 1</div>
        </div>
      `;
      subPanel.querySelectorAll('[data-j]').forEach(el => el.addEventListener('click', () => {
        jewelryCategory = el.dataset.j; buildSubPanelFor('jewelry'); drawCanvas(landmarksCache);
      }));
      subPanel.querySelectorAll('[data-style]').forEach(el => el.addEventListener('click', () => {
        const s = el.dataset.style;
        if (s.startsWith('earring')) selectedEarring = s;
        if (s.startsWith('nose')) selectedNose = s;
        if (s.startsWith('neck')) selectedNeck = s;
        drawCanvas(landmarksCache);
      }));
    }

    if (tool === "glasses") {
      subPanel.innerHTML = `
        <div class="label">Glasses</div>
        <div class="small-row">
          <div class="chip ${selectedGlasses==='neon'?'active':''}" data-g="neon">Neon</div>
          <div class="chip ${selectedGlasses==='visor'?'active':''}" data-g="visor">Visor</div>
          <div class="chip ${selectedGlasses==='round'?'active':''}" data-g="round">Round</div>
        </div>
      `;
      subPanel.querySelectorAll('[data-g]').forEach(el => el.addEventListener('click', () => {
        selectedGlasses = el.dataset.g; buildSubPanelFor('glasses'); drawCanvas(landmarksCache);
      }));
    }

    if (tool === "bg") {
      subPanel.innerHTML = `
        <div class="label">Backgrounds</div>
        <div class="small-row">
          <div class="chip ${selectedBg==='none'?'active':''}" data-bg="none">None</div>
          <div class="chip ${selectedBg==='city'?'active':''}" data-bg="city">Neon City</div>
          <div class="chip ${selectedBg==='lab'?'active':''}" data-bg="lab">Holo Lab</div>
          <div class="chip ${selectedBg==='studio'?'active':''}" data-bg="studio">Studio</div>
        </div>
      `;
      subPanel.querySelectorAll('[data-bg]').forEach(el => el.addEventListener('click', () => {
        selectedBg = el.dataset.bg; buildSubPanelFor('bg'); drawCanvas(landmarksCache);
      }));
    }
  }

  // tool list click
  toolList.querySelectorAll('.tool').forEach(el => {
    el.addEventListener('click', () => {
      toolList.querySelectorAll('.tool').forEach(t => t.classList.remove('active'));
      el.classList.add('active');
      activeTool = el.dataset.tool;
      buildSubPanelFor(activeTool);
      drawCanvas(landmarksCache);
    });
  });

  // init subpanel
  buildSubPanelFor(activeTool);

  // Start / Stop Buttons
  startBtn.addEventListener('click', async () => {
    startBtn.disabled = true;
    await startCamera();
    startBtn.disabled = false;
  });
  stopBtn.addEventListener('click', () => stopCamera());

  // start camera function
  async function startCamera() {
    if (mpCamera) return;
    try {
      mpCamera = new Camera.Camera(video, {
        onFrame: async () => await faceMesh.send({ image: video }),
        width: 640, height: 480
      });
      await mpCamera.start();
      video.style.display = "block";
      uploadedImage = null;
    } catch (err) {
      console.error("Camera start error:", err);
      alert("Camera error: " + (err.message || err.name));
      mpCamera = null;
    }
  }

  function stopCamera() {
    try { if (mpCamera && mpCamera.stop) mpCamera.stop(); } catch(e){}
    mpCamera = null;
    try { const s = video.srcObject; if (s && s.getTracks) s.getTracks().forEach(t=>t.stop()); } catch(e){}
    video.srcObject = null;
    video.style.display = "none";
  }

  // cleanup
  window.addEventListener('beforeunload', () => stopCamera());

  // initial blank draw
  drawCanvas(null);
});
