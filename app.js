// app.js — FULL updated engine: centered zoom, hand-drag pan when no tool, spacebar pan when tool selected,
// smooth brush, eraser, items, transform panel, undo/redo, camera, save.
// Replace your existing app.js with this file.

document.addEventListener("DOMContentLoaded", () => {
  console.log("Future Mirror Loaded — final zoom+pan behavior");

  // DOM
  const uploadInput = document.getElementById("uploadImage");
  const canvas = document.getElementById("overlay");
  const ctx = canvas.getContext("2d");

  const startBtn = document.getElementById("startBtn");
  const stopBtn = document.getElementById("stopBtn");
  const saveBtn = document.getElementById("saveBtn");

  const mainTools = document.getElementById("mainTools");
  const subTools = document.getElementById("subTools");
  const transformPanel = document.getElementById("transformPanel");
  const scaleSlider = document.getElementById("scaleSlider");
  const rotateSlider = document.getElementById("rotateSlider");
  const deleteItemBtn = document.getElementById("deleteItemBtn");
  const bringFrontBtn = document.getElementById("bringFrontBtn");

  const zoomInBtn = document.getElementById("zoomInBtn");
  const zoomOutBtn = document.getElementById("zoomOutBtn");
  const resetViewBtn = document.getElementById("resetViewBtn");

  const brushSizePlus = document.getElementById("brushSizePlus");
  const brushSizeMinus = document.getElementById("brushSizeMinus");
  const brushSizeVal = document.getElementById("brushSizeVal");
  const brushColorPicker = document.getElementById("brushColorPicker");
  const brushPrevColor = document.getElementById("brushPrevColor");
  const brushNextColor = document.getElementById("brushNextColor");
  const brushOpacity = document.getElementById("brushOpacity");

  const eraserBtn = document.getElementById("eraserBtn");
  const eraserPlus = document.getElementById("eraserPlus");
  const eraserMinus = document.getElementById("eraserMinus");
  const eraserSizeVal = document.getElementById("eraserSizeVal");

  const undoBtn = document.getElementById("undoBtn");
  const redoBtn = document.getElementById("redoBtn");

  // State
  let baseImage = null; // uploaded image element
  let useVideo = false;
  let videoStream = null;
  const video = document.getElementById("input_video");

  // view transform (world <-> screen)
  // view.scale = zoom factor applied to world
  // view.offsetX/Y = translation in screen pixels (applied before scale)
  const view = { scale: 1.0, offsetX: 0, offsetY: 0 };

  // tools state
  let activeCategory = "makeup";
  let activeSubtool = null;
  let activeSubtoolDef = null;
  let eraserActive = false;

  // brush state
  let brushSize = 18;
  let brushColor = "#DC143C";
  let brushOpacityVal = 0.6;
  const colorPalette = ["#DC143C", "#FF66B2", "#FFCAA0", "#8030FF", "#0022FF", "#FFFFFF", "#000000"];
  let paletteIndex = 0;

  // eraser state
  let eraserSize = 36;

  // stroke & items (world coordinates)
  const strokes = []; // {id, points:[{x,y}], color, size, opacity}
  let currentStroke = null;
  let isDrawing = false;

  const items = []; // {id, img, src, x, y, w, h, scale, rotation}
  let selectedItemId = null;
  let draggingItem = null;
  let dragOffset = { x: 0, y: 0 };

  // undo/redo stacks
  const undoStack = [];
  const redoStack = [];
  function pushUndo(action) {
    undoStack.push(action);
    if (undoStack.length > 500) undoStack.shift();
    redoStack.length = 0;
    updateUndoButtons();
  }
  function updateUndoButtons() {
    undoBtn.disabled = undoStack.length === 0;
    redoBtn.disabled = redoStack.length === 0;
  }

  // SUBTOOLS manifest — update src filenames to your asset names if needed
  const SUBTOOLS = {
    makeup: [
      { id: "lip-red", label: "Lipstick Red", type: "brush", color: "#DC143C", size: 18 },
      { id: "lip-pink", label: "Lipstick Pink", type: "brush", color: "#FF66B2", size: 16 },
      { id: "eyeliner-black", label: "Eyeliner Black", type: "brush", color: "#111111", size: 3 },
      { id: "blush-rose", label: "Blush Rose", type: "brush", color: "#FF1493", size: 36 }
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

  // ---------- Utility: coords transforms ----------
  // Convert screen (clientX,clientY) to world coordinates (canvas logical coordinates that scale)
  function screenToWorld(sx, sy) {
    const rect = canvas.getBoundingClientRect();
    const cx = sx - rect.left;
    const cy = sy - rect.top;
    const wx = (cx - view.offsetX) / view.scale;
    const wy = (cy - view.offsetY) / view.scale;
    return { x: wx, y: wy };
  }

  // Convert world coordinates -> screen client coords (useful for positioning overlays)
  function worldToScreen(wx, wy) {
    const rect = canvas.getBoundingClientRect();
    const sx = rect.left + view.offsetX + wx * view.scale;
    const sy = rect.top + view.offsetY + wy * view.scale;
    return { x: sx, y: sy };
  }

  // ---------- Drawing helpers ----------
  function drawImageCover(img, x, y, w, h) {
    // Draw "cover" style inside world rectangle (0,0,w,h)
    const iw = img.width, ih = img.height;
    const r = Math.max(w / iw, h / ih);
    const nw = iw * r, nh = ih * r;
    const cx = (nw - w) / 2, cy = (nh - h) / 2;
    ctx.drawImage(img, -cx + x, -cy + y, nw, nh);
  }

  function redrawAll() {
    // clear full canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // save and apply world transform
    ctx.save();
    ctx.translate(view.offsetX, view.offsetY);
    ctx.scale(view.scale, view.scale);

    // draw base image / video. world area size = canvas.width/view.scale, canvas.height/view.scale
    if (baseImage) {
      drawImageCover(baseImage, 0, 0, canvas.width / view.scale, canvas.height / view.scale);
    } else if (useVideo && video && video.readyState >= 2) {
      ctx.drawImage(video, 0, 0, canvas.width / view.scale, canvas.height / view.scale);
    } else {
      ctx.fillStyle = "#0a0610";
      ctx.fillRect(0, 0, canvas.width / view.scale, canvas.height / view.scale);
    }

    // draw strokes (world coordinates)
    strokes.forEach(s => drawStroke(s));
    if (currentStroke) drawStroke(currentStroke);

    // draw items
    items.forEach(it => drawItem(it));

    // selection bounding box
    if (selectedItemId) {
      const it = items.find(i => i.id === selectedItemId);
      if (it) drawSelection(it);
    }

    ctx.restore();

    // draw eraser cursor in screen-space if active
    if (eraserActive && lastPointerPos) {
      const rect = canvas.getBoundingClientRect();
      const sx = lastPointerPos.clientX - rect.left;
      const sy = lastPointerPos.clientY - rect.top;
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.beginPath();
      ctx.strokeStyle = "rgba(255,255,255,0.6)";
      ctx.lineWidth = 1;
      ctx.arc(sx, sy, eraserSize, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  }

  function drawStroke(s) {
    if (!s || !s.points || s.points.length === 0) return;
    ctx.save();
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.strokeStyle = s.color;
    ctx.globalAlpha = s.opacity;
    ctx.lineWidth = s.size;
    // smooth stroke with quadratic curves
    ctx.moveTo(s.points[0].x, s.points[0].y);
    for (let i = 1; i < s.points.length - 1; i++) {
      const midx = (s.points[i].x + s.points[i + 1].x) / 2;
      const midy = (s.points[i].y + s.points[i + 1].y) / 2;
      ctx.quadraticCurveTo(s.points[i].x, s.points[i].y, midx, midy);
    }
    if (s.points.length > 1) {
      const p = s.points[s.points.length - 1];
      ctx.lineTo(p.x, p.y);
    }
    ctx.stroke();
    ctx.restore();
  }

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
    if (!it) return;
    ctx.save();
    ctx.translate(it.x, it.y);
    ctx.rotate(it.rotation * Math.PI / 180);
    const hw = (it.w * it.scale) / 2;
    const hh = (it.h * it.scale) / 2;
    ctx.strokeStyle = "rgba(255,255,255,0.9)";
    ctx.setLineDash([6, 6]);
    ctx.lineWidth = 2 / view.scale;
    ctx.strokeRect(-hw, -hh, hw * 2, hh * 2);
    ctx.setLineDash([]);
    ctx.restore();
  }

  // ---------- Hit tests ----------
  function pointInItemWorld(px, py, it) {
    const dx = px - it.x;
    const dy = py - it.y;
    const angle = -it.rotation * Math.PI / 180;
    const rx = dx * Math.cos(angle) - dy * Math.sin(angle);
    const ry = dx * Math.sin(angle) + dy * Math.cos(angle);
    const hw = (it.w * it.scale) / 2;
    const hh = (it.h * it.scale) / 2;
    return rx >= -hw && rx <= hw && ry >= -hh && ry <= hh;
  }

  function uid(prefix = "id") { return prefix + "-" + Math.random().toString(36).slice(2, 9); }

  // ---------- Subtools UI ----------
  function buildSubtools(category) {
    subTools.innerHTML = "";
    const list = SUBTOOLS[category] || [];
    list.forEach(st => {
      const el = document.createElement("div");
      el.className = "chip";
      el.textContent = st.label;
      el.dataset.id = st.id;
      el.addEventListener("click", () => {
        subTools.querySelectorAll(".chip").forEach(x => x.classList.remove("active"));
        el.classList.add("active");
        activeSubtool = st.id;
        activeSubtoolDef = st;
        if (st.type === "brush") {
          brushColor = st.color || brushColor;
          brushSize = st.size || brushSize;
          brushSizeVal.textContent = brushSize;
          brushColorPicker.value = (st.color && st.color.startsWith('#')) ? st.color : rgbToHex(st.color || brushColor);
          brushOpacity.value = brushOpacityVal;
          eraserActive = false;
          eraserBtn.classList.remove('active');
        } else {
          eraserActive = false;
          eraserBtn.classList.remove('active');
        }
        updateCursor(); // update cursor when tool selected
      });
      subTools.appendChild(el);
    });
  }
  buildSubtools(activeCategory);

  // main category click
  mainTools.querySelectorAll(".chip").forEach(ch => {
    ch.addEventListener("click", () => {
      mainTools.querySelectorAll(".chip").forEach(x => x.classList.remove("active"));
      ch.classList.add("active");
      activeCategory = ch.dataset.category || "none";
      activeSubtool = null;
      activeSubtoolDef = null;
      buildSubtools(activeCategory);
      hideTransformPanel();
      updateCursor();
    });
  });

  // ---------- Brush & Controls ----------
  brushSizeVal.textContent = brushSize;
  brushSizePlus.addEventListener("click", () => { brushSize = Math.min(200, brushSize + 2); brushSizeVal.textContent = brushSize; });
  brushSizeMinus.addEventListener("click", () => { brushSize = Math.max(1, brushSize - 2); brushSizeVal.textContent = brushSize; });
  brushColorPicker.addEventListener("input", (e) => { brushColor = e.target.value; });
  brushOpacity.addEventListener("input", (e) => { brushOpacityVal = parseFloat(e.target.value); });
  brushPrevColor.addEventListener("click", () => { paletteIndex = (paletteIndex - 1 + colorPalette.length) % colorPalette.length; brushColor = colorPalette[paletteIndex]; brushColorPicker.value = brushColor; });
  brushNextColor.addEventListener("click", () => { paletteIndex = (paletteIndex + 1) % colorPalette.length; brushColor = colorPalette[paletteIndex]; brushColorPicker.value = brushColor; });

  // eraser controls
  eraserBtn.addEventListener("click", () => { eraserActive = !eraserActive; eraserBtn.classList.toggle('active'); updateCursor(); });
  eraserSizeVal.textContent = eraserSize;
  eraserPlus.addEventListener("click", () => { eraserSize = Math.min(400, eraserSize + 8); eraserSizeVal.textContent = eraserSize; });
  eraserMinus.addEventListener("click", () => { eraserSize = Math.max(8, eraserSize - 8); eraserSizeVal.textContent = eraserSize; });

  // ---------- Transform panel actions ----------
  scaleSlider.addEventListener("input", () => {
    if (!selectedItemId) return;
    const it = items.find(i => i.id === selectedItemId);
    if (!it) return;
    const before = { scale: it.scale, rotation: it.rotation };
    it.scale = parseFloat(scaleSlider.value);
    const after = { scale: it.scale, rotation: it.rotation };
    pushUndo({ type: 'transform', id: it.id, before, after });
    redrawAll();
  });
  rotateSlider.addEventListener("input", () => {
    if (!selectedItemId) return;
    const it = items.find(i => i.id === selectedItemId);
    if (!it) return;
    const before = { scale: it.scale, rotation: it.rotation };
    it.rotation = parseFloat(rotateSlider.value);
    const after = { scale: it.scale, rotation: it.rotation };
    pushUndo({ type: 'transform', id: it.id, before, after });
    redrawAll();
  });
  deleteItemBtn.addEventListener("click", () => {
    if (!selectedItemId) return;
    const idx = items.findIndex(i => i.id === selectedItemId);
    if (idx >= 0) {
      const [it] = items.splice(idx, 1);
      pushUndo({ type: 'deleteItem', item: it });
      selectedItemId = null;
      hideTransformPanel();
      redrawAll();
    }
  });
  bringFrontBtn.addEventListener("click", () => {
    if (!selectedItemId) return;
    const idx = items.findIndex(i => i.id === selectedItemId);
    if (idx >= 0) {
      const it = items.splice(idx, 1)[0];
      items.push(it);
      pushUndo({ type: 'reorder', id: it.id });
      redrawAll();
    }
  });

  function showTransformPanelFor(it) {
    transformPanel.style.display = "";
    scaleSlider.value = it.scale;
    rotateSlider.value = it.rotation;
    selectedItemId = it.id;
    updateCursor();
  }
  function hideTransformPanel() { transformPanel.style.display = "none"; selectedItemId = null; updateCursor(); }

  // place image item
  function placeImageAt(src, wx, wy) {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const id = uid("it");
      const w = Math.min(400, img.width);
      const h = Math.min(300, img.height);
      const it = { id, img, src, x: wx, y: wy, w, h, scale: 1, rotation: 0 };
      items.push(it);
      pushUndo({ type: 'addItem', item: cloneItemForUndo(it) });
      selectedItemId = id;
      showTransformPanelFor(it);
      redrawAll();
    };
    img.onerror = () => alert("Failed to load asset: " + src);
    img.src = src;
  }

  function cloneItemForUndo(it) {
    return { id: it.id, src: it.src, x: it.x, y: it.y, w: it.w, h: it.h, scale: it.scale, rotation: it.rotation };
  }

  // ---------- Pointer interactions + Pan behavior ----------
  // pointerMode: 'idle' | 'pan' | 'draw' | 'dragItem' | 'erase'
  let pointerDown = false;
  let pointerMode = "idle";
  let lastPointerPos = null;
  let lastPan = { x: 0, y: 0 };

  // Determine if hand-pan mode is allowed (no tool selected) OR spacebar held
  function isHandPanAllowed() {
    // hand-pan allowed when NO subtool is active and category is not "none"
    // (User requested: when nothing selected in makeup/jewelry/glasses -> hand sign cursor and drag moves image)
    // We'll treat "no activeSubtool" as nothing selected.
    return activeSubtool === null;
  }

  // Update canvas cursor based on current mode
  function updateCursor() {
    if (eraserActive) {
      canvas.style.cursor = "crosshair";
      return;
    }
    if (selectedItemId) {
      canvas.style.cursor = "move";
      return;
    }
    if (isHandPanAllowed()) {
      // show hand cursor for pan when nothing selected
      canvas.style.cursor = "grab";
      return;
    }
    // default: show crosshair for tools; if space pressed -> show grab
    if (window.spacePressed) canvas.style.cursor = "grab"; else canvas.style.cursor = "crosshair";
  }

  // pointerdown logic: choose pan vs draw vs place vs drag
  canvas.addEventListener("pointerdown", (e) => {
    canvas.setPointerCapture(e.pointerId);
    pointerDown = true;
    lastPointerPos = { clientX: e.clientX, clientY: e.clientY };

    const handPan = isHandPanAllowed(); // true when no subtool selected
    const isPanMode = handPan || window.spacePressed; // either hand-pan mode OR space pressed
    if (isPanMode) {
      pointerMode = "pan";
      lastPan.x = e.clientX; lastPan.y = e.clientY;
      canvas.style.cursor = "grabbing";
      return;
    }

    const world = screenToWorld(e.clientX, e.clientY);

    if (eraserActive) {
      pointerMode = "erase";
      handleEraseAt(world.x, world.y);
      return;
    }

    if (activeSubtoolDef && activeSubtoolDef.type === "brush") {
      pointerMode = "draw";
      currentStroke = { id: uid("s"), points: [{ x: world.x, y: world.y }], color: brushColor, size: brushSize / view.scale, opacity: brushOpacityVal };
      isDrawing = true;
      redrawAll();
      return;
    }

    const top = findTopItemAtWorld(world.x, world.y);
    if (top) {
      selectedItemId = top.id;
      draggingItem = top;
      dragOffset.x = world.x - top.x;
      dragOffset.y = world.y - top.y;
      pointerMode = "dragItem";
      showTransformPanelFor(top);
      redrawAll();
      return;
    }

    if (activeSubtoolDef && activeSubtoolDef.type === "image") {
      placeImageAt(activeSubtoolDef.src, world.x, world.y);
      return;
    }

    // default deselect
    selectedItemId = null;
    hideTransformPanel();
    redrawAll();
  });

  // pointermove logic
  canvas.addEventListener("pointermove", (e) => {
    lastPointerPos = { clientX: e.clientX, clientY: e.clientY };
    if (!pointerDown) {
      // update cursor hover while not dragging
      updateCursor();
      return;
    }

    if (pointerMode === "pan") {
      const dx = e.clientX - lastPan.x;
      const dy = e.clientY - lastPan.y;
      lastPan.x = e.clientX; lastPan.y = e.clientY;
      view.offsetX += dx;
      view.offsetY += dy;
      redrawAll();
      return;
    }

    const world = screenToWorld(e.clientX, e.clientY);

    if (pointerMode === "erase") {
      handleEraseAt(world.x, world.y);
      return;
    }

    if (pointerMode === "draw" && currentStroke) {
      currentStroke.points.push({ x: world.x, y: world.y });
      redrawAll();
      return;
    }

    if (pointerMode === "dragItem" && draggingItem) {
      draggingItem.x = world.x - dragOffset.x;
      draggingItem.y = world.y - dragOffset.y;
      // sync sliders
      if (selectedItemId === draggingItem.id) {
        scaleSlider.value = draggingItem.scale;
        rotateSlider.value = draggingItem.rotation;
      }
      redrawAll();
      return;
    }
  });

  // pointerup
  canvas.addEventListener("pointerup", (e) => {
    canvas.releasePointerCapture(e.pointerId);
    pointerDown = false;

    if (pointerMode === "draw" && currentStroke) {
      strokes.push(currentStroke);
      pushUndo({ type: 'addStroke', stroke: JSON.parse(JSON.stringify(currentStroke)) });
      currentStroke = null;
      isDrawing = false;
      redrawAll();
    }

    // end pan drag cursor style
    if (pointerMode === "pan") updateCursor();

    pointerMode = "idle";
    draggingItem = null;
  });

  canvas.addEventListener("pointercancel", () => {
    pointerDown = false; pointerMode = "idle"; currentStroke = null; draggingItem = null;
  });

  // ---------- Wheel zoom (centered) ----------
  // Zoom at cursor with math that keeps world point under cursor stationary.
  canvas.addEventListener("wheel", (e) => {
    e.preventDefault();
    // zoom sensitivity
    const delta = -e.deltaY;
    const zoomFactor = delta > 0 ? 1.08 : 0.92;

    const rect = canvas.getBoundingClientRect();
    const cx = e.clientX - rect.left;
    const cy = e.clientY - rect.top;

    // world point under cursor before zoom
    const wx = (cx - view.offsetX) / view.scale;
    const wy = (cy - view.offsetY) / view.scale;

    // apply centered zoom: we will constrain scale and then compute new offsets so world point remains under cursor
    const newScale = Math.min(Math.max(0.2, view.scale * zoomFactor), 8);
    view.scale = newScale;

    // compute offsets so that (wx,wy) maps back to (cx,cy)
    view.offsetX = cx - wx * view.scale;
    view.offsetY = cy - wy * view.scale;

    redrawAll();
  }, { passive: false });

  // zoom buttons (zoom at canvas center)
  zoomInBtn.addEventListener("click", () => {
    const rect = canvas.getBoundingClientRect();
    const cx = rect.width / 2;
    const cy = rect.height / 2;
    // world center before zoom
    const wx = (cx - view.offsetX) / view.scale;
    const wy = (cy - view.offsetY) / view.scale;
    view.scale = Math.min(Math.max(0.2, view.scale * 1.12), 8);
    view.offsetX = cx - wx * view.scale;
    view.offsetY = cy - wy * view.scale;
    redrawAll();
  });

  zoomOutBtn.addEventListener("click", () => {
    const rect = canvas.getBoundingClientRect();
    const cx = rect.width / 2;
    const cy = rect.height / 2;
    const wx = (cx - view.offsetX) / view.scale;
    const wy = (cy - view.offsetY) / view.scale;
    view.scale = Math.min(Math.max(0.2, view.scale * 0.88), 8);
    view.offsetX = cx - wx * view.scale;
    view.offsetY = cy - wy * view.scale;
    redrawAll();
  });

  resetViewBtn.addEventListener("click", () => {
    // Reset view; keep image centered in the canvas
    view.scale = 1;
    // center the world origin so base image covers canvas starting at (0,0)
    // We'll keep offset at 0 which places world origin at top-left of canvas; user can pan
    view.offsetX = 0;
    view.offsetY = 0;
    redrawAll();
  });

  // ---------- Camera & Upload ----------
  startBtn.addEventListener("click", async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      video.srcObject = stream; video.play(); videoStream = stream; useVideo = true; baseImage = null;
      requestAnimationFrame(loopVideo);
    } catch (err) {
      alert("Camera error: " + (err.message || err.name)); console.error(err);
    }
  });
  stopBtn.addEventListener("click", () => {
    if (videoStream) { videoStream.getTracks().forEach(t => t.stop()); videoStream = null; }
    useVideo = false; video.srcObject = null; redrawAll();
  });

  function loopVideo() { if (useVideo && video && video.readyState >= 2) { redrawAll(); requestAnimationFrame(loopVideo); } }

  uploadInput.addEventListener("change", (e) => {
    const f = e.target.files && e.target.files[0]; if (!f) return;
    const img = new Image();
    img.onload = () => {
      baseImage = img; useVideo = false; if (videoStream) { videoStream.getTracks().forEach(t => t.stop()); videoStream = null; }
      // reset view to show image naturally (top-left anchored); user can pan with hand or space
      view.scale = 1; view.offsetX = 0; view.offsetY = 0;
      redrawAll();
    };
    img.src = URL.createObjectURL(f);
  });

  // ---------- Eraser ----------
  function handleEraseAt(wx, wy) {
    const r = eraserSize / view.scale;
    const removedStrokes = [];
    for (let i = strokes.length - 1; i >= 0; i--) {
      const s = strokes[i];
      const hit = s.points.some(p => Math.hypot(p.x - wx, p.y - wy) <= r);
      if (hit) {
        removedStrokes.push(s);
        strokes.splice(i, 1);
      }
    }
    const removedItems = [];
    for (let i = items.length - 1; i >= 0; i--) {
      const it = items[i];
      const dist = Math.hypot(it.x - wx, it.y - wy);
      if (dist <= r) {
        removedItems.push(it);
        items.splice(i, 1);
        if (selectedItemId === it.id) selectedItemId = null;
      }
    }
    if (removedStrokes.length || removedItems.length) {
      pushUndo({ type: 'erase', strokes: removedStrokes.map(s => JSON.parse(JSON.stringify(s))), items: removedItems.map(cloneItemForUndo) });
      hideTransformPanel();
      redrawAll();
    }
  }

  // ---------- Undo / Redo ----------
  function doUndo() {
    if (undoStack.length === 0) return;
    const action = undoStack.pop();
    redoStack.push(action);

    if (action.type === 'addStroke') {
      const idx = strokes.findIndex(s => s.id === action.stroke.id);
      if (idx >= 0) strokes.splice(idx, 1);
    } else if (action.type === 'addItem') {
      const idx = items.findIndex(it => it.id === action.item.id);
      if (idx >= 0) items.splice(idx, 1);
    } else if (action.type === 'deleteItem') {
      items.push(rehydrateItem(action.item));
    } else if (action.type === 'erase') {
      (action.strokes || []).forEach(s => strokes.push(s));
      (action.items || []).forEach(it => items.push(rehydrateItem(it)));
    } else if (action.type === 'transform') {
      const it = items.find(i => i.id === action.id);
      if (it && action.before) { it.scale = action.before.scale; it.rotation = action.before.rotation; }
    } else if (action.type === 'reorder') {
      // best-effort: no-op (can't reliably revert without storing previous order)
    }
    updateUndoButtons();
    redrawAll();
  }

  function doRedo() {
    if (redoStack.length === 0) return;
    const action = redoStack.pop();
    undoStack.push(action);

    if (action.type === 'addStroke') strokes.push(action.stroke);
    else if (action.type === 'addItem') {
      const it = rehydrateItem(action.item);
      items.push(it);
    } else if (action.type === 'deleteItem') {
      const idx = items.findIndex(i => i.id === action.item.id);
      if (idx >= 0) items.splice(idx, 1);
    } else if (action.type === 'erase') {
      (action.strokes || []).forEach(s => {
        const idx = strokes.findIndex(x => x.id === s.id);
        if (idx >= 0) strokes.splice(idx, 1);
      });
      (action.items || []).forEach(it => {
        const idx = items.findIndex(x => x.id === it.id);
        if (idx >= 0) items.splice(idx, 1);
      });
    } else if (action.type === 'transform') {
      const it = items.find(i => i.id === action.id);
      if (it && action.after) { it.scale = action.after.scale; it.rotation = action.after.rotation; }
    }
    updateUndoButtons();
    redrawAll();
  }

  undoBtn.addEventListener("click", doUndo);
  redoBtn.addEventListener("click", doRedo);

  // keyboard shortcuts (undo/redo + space detection)
  window.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 'z') { e.preventDefault(); doUndo(); }
    if ((e.ctrlKey || e.metaKey) && (e.key.toLowerCase() === 'y' || (e.shiftKey && e.key.toLowerCase() === 'z'))) { e.preventDefault(); doRedo(); }
    if (e.code === 'Space') { window.spacePressed = true; updateCursor(); e.preventDefault(); }
  });
  window.addEventListener("keyup", (e) => { if (e.code === 'Space') { window.spacePressed = false; updateCursor(); } });

  // ---------- Helpers ----------
  function cloneItemForUndo(it) { return { id: it.id, src: it.src, x: it.x, y: it.y, w: it.w, h: it.h, scale: it.scale, rotation: it.rotation }; }
  function rehydrateItem(obj) {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.src = obj.src;
    return { id: obj.id, img, src: obj.src, x: obj.x, y: obj.y, w: obj.w, h: obj.h, scale: obj.scale, rotation: obj.rotation };
  }

  // ---------- Debug API ----------
  window.__fm = { strokes, items, redrawAll, placeImageAt: (s, x, y) => placeImageAt(s, x, y) };

  // ---------- Camera & upload handlers (re-attach) ----------
  startBtn.addEventListener("click", async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      video.srcObject = stream; video.play(); videoStream = stream; useVideo = true; baseImage = null;
      requestAnimationFrame(loopVideo);
    } catch (err) {
      alert("Camera error: " + (err.message || err.name)); console.error(err);
    }
  });
  stopBtn.addEventListener("click", () => {
    if (videoStream) { videoStream.getTracks().forEach(t => t.stop()); videoStream = null; }
    useVideo = false; video.srcObject = null; redrawAll();
  });

  function loopVideo() { if (useVideo && video && video.readyState >= 2) { redrawAll(); requestAnimationFrame(loopVideo); } }

  uploadInput.addEventListener("change", (e) => {
    const f = e.target.files && e.target.files[0]; if (!f) return;
    const img = new Image();
    img.onload = () => {
      baseImage = img; useVideo = false; if (videoStream) { videoStream.getTracks().forEach(t => t.stop()); videoStream = null; }
      view.scale = 1; view.offsetX = 0; view.offsetY = 0; redrawAll();
    };
    img.src = URL.createObjectURL(f);
  });

  // final initial draw
  updateCursor();
  redrawAll();
});
