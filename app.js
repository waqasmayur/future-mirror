// app.js - Click-to-place + Brush stroke + image item transform
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

  const mainTools = document.getElementById("mainTools");
  const subTools = document.getElementById("subTools");
  const transformPanel = document.getElementById("transformPanel");
  const scaleSlider = document.getElementById("scaleSlider");
  const rotateSlider = document.getElementById("rotateSlider");
  const deleteItemBtn = document.getElementById("deleteItemBtn");
  const bringFrontBtn = document.getElementById("bringFrontBtn");

  // STATE
  let baseImage = null; // uploaded image element
  let useVideo = false;
  let videoStream = null;

  let activeCategory = "makeup"; // makeup | glasses | jewelry | none
  let activeSubtool = null;      // e.g. 'lip-red' or 'glasses-black'
  let activeSubtoolType = null;  // 'brush' or 'image' or null

  // brush strokes storage
  const strokes = []; // {points: [{x,y},...], color, size}
  let isDrawing = false;
  let currentStroke = null;

  // placed image items
  const items = []; // {id, src, x, y, scale, rotation, img (Image obj), w, h}
  let selectedItemId = null;

  // assets manifest for subtools (files must exist in assets/...)
  const SUBTOOLS = {
    makeup: [
      { id: "lip-red", label: "Lipstick Red", type: "brush", color: "rgba(220,20,60,0.6)", size: 18 },
      { id: "lip-pink", label: "Lipstick Pink", type: "brush", color: "rgba(255,102,178,0.5)", size: 16 },
      { id: "eyeliner-black", label: "Eyeliner Black", type: "brush", color: "rgba(20,20,20,0.95)", size: 4 },
      { id: "blush-rose", label: "Blush Rose", type: "brush", color: "rgba(255,20,150,0.18)", size: 40 }
    ],
    glasses: [
      { id: "glasses-black", label: "Glasses Black", type: "image", src: "assets/glasses/glasses-black.png" },
      { id: "glasses-round", label: "Glasses Round", type: "image", src: "assets/glasses/glasses-round.png" },
      { id: "glasses-aviator", label: "Aviator", type: "image", src: "assets/glasses/glasses-cat.png" }
    ],
    jewelry: [
      { id: "earring-hoop", label: "Earring Hoop", type: "image", src: "assets/jewelry/earring-hoop.png" },
      { id: "earring-stud", label: "Earring Stud", type: "image", src: "assets/jewelry/earring-stud.png" },
      { id: "necklace-gold", label: "Necklace Gold", type: "image", src: "assets/jewelry/necklace-gold.png" },
      { id: "nose-ring", label: "Nose Ring", type: "image", src: "assets/jewelry/nose-ring.png" }
    ]
  };

  // UTILITIES
  function fitCanvasToDisplay() {
    // keep canvas at fixed internal resolution; use CSS width for responsiveness
    // canvas.width & canvas.height already set in HTML
  }

  // DRAW LOOP (synchronous redraw)
  function redrawAll() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // draw base: uploaded image or video
    if (baseImage) {
      drawImageCover(baseImage, 0, 0, canvas.width, canvas.height);
    } else if (useVideo && video && video.readyState >= 2) {
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    } else {
      // blank bg
      ctx.fillStyle = "#0a0610";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    // draw strokes
    strokes.forEach(s => {
      drawStroke(s);
    });

    // if currently drawing, draw it too
    if (currentStroke) drawStroke(currentStroke);

    // draw items in order
    items.forEach(it => {
      drawItem(it);
    });

    // draw selection box if an item selected
    if (selectedItemId) {
      const it = items.find(i => i.id === selectedItemId);
      if (it) drawSelection(it);
    }
  }

  function drawImageCover(img, x, y, w, h) {
    // cover behavior to fill canvas while keeping aspect
    const iw = img.width, ih = img.height;
    const r = Math.max(w / iw, h / ih);
    const nw = iw * r, nh = ih * r;
    const cx = (nw - w) / 2, cy = (nh - h) / 2;
    ctx.drawImage(img, -cx + x, -cy + y, nw, nh);
  }

  // strokes: points array
  function drawStroke(s) {
    if (!s || !s.points || s.points.length === 0) return;
    ctx.save();
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.strokeStyle = s.color;
    ctx.lineWidth = s.size;
    ctx.beginPath();
    ctx.moveTo(s.points[0].x, s.points[0].y);
    for (let i = 1; i < s.points.length; i++) {
      ctx.lineTo(s.points[i].x, s.points[i].y);
    }
    ctx.stroke();
    ctx.restore();
  }

  // draw an image item with transform
  function drawItem(it) {
    if (!it.img || !it.img.complete) return;
    ctx.save();
    ctx.translate(it.x, it.y);
    ctx.rotate(it.rotation * Math.PI / 180);
    ctx.scale(it.scale, it.scale);
    ctx.drawImage(it.img, -it.w / 2, -it.h / 2, it.w, it.h);
    ctx.restore();
  }

  function drawSelection(it) {
    if (!it.img || !it.img.complete) return;
    // compute box in world coords
    const halfW = (it.w * it.scale) / 2;
    const halfH = (it.h * it.scale) / 2;
    // draw rotated rect
    ctx.save();
    ctx.translate(it.x, it.y);
    ctx.rotate(it.rotation * Math.PI / 180);
    ctx.strokeStyle = "rgba(255,255,255,0.8)";
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 6]);
    ctx.strokeRect(-halfW, -halfH, halfW * 2, halfH * 2);
    ctx.setLineDash([]);
    ctx.restore();
  }

  // ITEM HIT TEST (click to select or to place)
  function pointInItem(px, py, it) {
    // transform point into item local space
    const dx = px - it.x;
    const dy = py - it.y;
    const angle = -it.rotation * Math.PI / 180;
    const rx = dx * Math.cos(angle) - dy * Math.sin(angle);
    const ry = dx * Math.sin(angle) + dy * Math.cos(angle);
    const hw = (it.w * it.scale) / 2;
    const hh = (it.h * it.scale) / 2;
    return rx >= -hw && rx <= hw && ry >= -hh && ry <= hh;
  }

  // generate unique id
  function uid(prefix = "it") {
    return prefix + "-" + Math.random().toString(36).slice(2, 9);
  }

  // EVENTS: main tool click -> populate subTools
  mainTools.querySelectorAll(".chip").forEach(ch => {
    ch.addEventListener("click", () => {
      mainTools.querySelectorAll(".chip").forEach(x => x.classList.remove("active"));
      ch.classList.add("active");
      activeCategory = ch.dataset.category || "none";
      buildSubtools(activeCategory);
      // clear active subtool selection
      activeSubtool = null;
      activeSubtoolType = null;
      canvas.style.cursor = "default";
      hideTransformPanel();
    });
  });

  function buildSubtools(category) {
    subTools.innerHTML = "";
    if (!SUBTOOLS[category]) return;
    SUBTOOLS[category].forEach(st => {
      const d = document.createElement("div");
      d.className = "chip";
      d.textContent = st.label;
      d.dataset.id = st.id;
      d.addEventListener("click", () => {
        // visually mark active among subtools
        subTools.querySelectorAll(".chip").forEach(x => x.classList.remove("active"));
        d.classList.add("active");
        activeSubtool = st.id;
        activeSubtoolType = st.type;
        // if brush, change cursor and prepare color/size
        if (st.type === "brush") {
          canvas.style.cursor = "crosshair";
        } else if (st.type === "image") {
          // image tools use default cursor (we will show preview when placing)
          canvas.style.cursor = "pointer";
        }
      });
      subTools.appendChild(d);
    });
  }

  // initial build
  buildSubtools(activeCategory);

  // CANVAS POINTER HANDLING (supports brush draw drag and item interactions)
  let pointerDown = false;
  let draggingItem = null;
  let dragOffset = { x: 0, y: 0 };

  canvas.addEventListener("pointerdown", (e) => {
    const rect = canvas.getBoundingClientRect();
    const px = (e.clientX - rect.left);
    const py = (e.clientY - rect.top);
    pointerDown = true;

    // If active subtool is brush type -> start stroke
    const st = findSubtoolById(activeSubtool);
    if (st && st.type === "brush") {
      isDrawing = true;
      currentStroke = { points: [{ x: px, y: py }], color: st.color, size: st.size };
      redrawAll();
      return;
    }

    // else if clicking on existing item -> select & start dragging
    const topItem = findTopItemAt(px, py);
    if (topItem) {
      selectedItemId = topItem.id;
      draggingItem = topItem;
      dragOffset.x = px - topItem.x;
      dragOffset.y = py - topItem.y;
      showTransformPanelFor(topItem);
      redrawAll();
      return;
    }

    // else if subtool is image -> place a new image at clicked point
    if (st && st.type === "image") {
      placeImageAt(st.src, px, py);
      return;
    }

    // click on empty space -> deselect
    selectedItemId = null;
    hideTransformPanel();
    redrawAll();
  });

  canvas.addEventListener("pointermove", (e) => {
    if (!pointerDown) return;
    const rect = canvas.getBoundingClientRect();
    const px = (e.clientX - rect.left);
    const py = (e.clientY - rect.top);

    if (isDrawing && currentStroke) {
      currentStroke.points.push({ x: px, y: py });
      redrawAll();
      return;
    }

    if (draggingItem) {
      draggingItem.x = px - dragOffset.x;
      draggingItem.y = py - dragOffset.y;
      // update sliders values to reflect new transform
      if (selectedItemId === draggingItem.id) {
        updateTransformSliders(draggingItem);
      }
      redrawAll();
      return;
    }
  });

  canvas.addEventListener("pointerup", (e) => {
    pointerDown = false;
    if (isDrawing && currentStroke) {
      strokes.push(currentStroke);
      currentStroke = null;
      isDrawing = false;
      redrawAll();
    }
    draggingItem = null;
  });

  canvas.addEventListener("pointercancel", () => {
    pointerDown = false;
    isDrawing = false;
    draggingItem = null;
    currentStroke = null;
  });

  function findSubtoolById(id) {
    if (!id) return null;
    const all = Object.values(SUBTOOLS).flat();
    return all.find(s => s.id === id) || null;
  }

  function findTopItemAt(px, py) {
    // iterate items from top to bottom (end is top)
    for (let i = items.length - 1; i >= 0; i--) {
      if (pointInItem(px, py, items[i])) return items[i];
    }
    return null;
  }

  // place image item
  function placeImageAt(src, x, y) {
    const img = new Image();
    img.onload = () => {
      const id = uid("item");
      const it = {
        id,
        src,
        img,
        x,
        y,
        w: Math.min(img.width, 300),
        h: Math.min(img.height, 200),
        scale: 1,
        rotation: 0
      };
      items.push(it);
      selectedItemId = id;
      showTransformPanelFor(it);
      redrawAll();
    };
    img.onerror = () => {
      alert("Failed to load asset: " + src);
    };
    img.src = src;
  }

  // transform panel handlers
  function showTransformPanelFor(it) {
    transformPanel.style.display = "";
    scaleSlider.value = it.scale;
    rotateSlider.value = it.rotation;
    selectedItemId = it.id;
  }
  function hideTransformPanel() {
    transformPanel.style.display = "none";
    selectedItemId = null;
  }
  scaleSlider.addEventListener("input", () => {
    if (!selectedItemId) return;
    const it = items.find(i => i.id === selectedItemId);
    if (!it) return;
    it.scale = parseFloat(scaleSlider.value);
    redrawAll();
  });
  rotateSlider.addEventListener("input", () => {
    if (!selectedItemId) return;
    const it = items.find(i => i.id === selectedItemId);
    if (!it) return;
    it.rotation = parseFloat(rotateSlider.value);
    redrawAll();
  });
  deleteItemBtn.addEventListener("click", () => {
    if (!selectedItemId) return;
    const idx = items.findIndex(i => i.id === selectedItemId);
    if (idx >= 0) items.splice(idx, 1);
    selectedItemId = null;
    hideTransformPanel();
    redrawAll();
  });
  bringFrontBtn.addEventListener("click", () => {
    if (!selectedItemId) return;
    const idx = items.findIndex(i => i.id === selectedItemId);
    if (idx >= 0) {
      const it = items.splice(idx, 1)[0];
      items.push(it);
      redrawAll();
    }
  });

  function updateTransformSliders(it) {
    scaleSlider.value = it.scale;
    rotateSlider.value = it.rotation;
  }

  // save button - export canvas to PNG
  saveBtn.addEventListener("click", () => {
    // redraw to ensure current frame is drawn
    redrawAll();
    const link = document.createElement("a");
    link.download = "future_mirror.png";
    link.href = canvas.toDataURL("image/png");
    link.click();
  });

  // camera start/stop
  startBtn.addEventListener("click", async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      video.srcObject = stream;
      video.play();
      videoStream = stream;
      useVideo = true;
      baseImage = null;
      // redraw video frame in requestAnimationFrame loop
      requestAnimationFrame(videoFrameLoop);
    } catch (err) {
      alert("Camera error: " + (err.message || err.name));
      console.error(err);
    }
  });

  stopBtn.addEventListener("click", () => {
    if (videoStream) {
      videoStream.getTracks().forEach(t => t.stop());
      videoStream = null;
    }
    useVideo = false;
    video.srcObject = null;
    redrawAll();
  });

  function videoFrameLoop() {
    if (useVideo && video && video.readyState >= 2) {
      // draw live frame then overlays
      redrawAll();
      requestAnimationFrame(videoFrameLoop);
    }
  }

  // upload image
  uploadInput.addEventListener("change", (e) => {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    const img = new Image();
    img.onload = () => {
      baseImage = img;
      useVideo = false;
      if (videoStream) { videoStream.getTracks().forEach(t => t.stop()); videoStream = null; }
      redrawAll();
    };
    img.src = URL.createObjectURL(f);
  });

  // initial draw
  redrawAll();

  // helper uid
  function uid(prefix = "id") { return prefix + "-" + Math.random().toString(36).slice(2,9); }

  // Expose some debug helpers (optional)
  window.__fm = { strokes, items, redrawAll, placeImageAt };

});
