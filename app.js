// app.js — Canvas Zoom & Pan + Brush (drag) + Image item placement & transform
document.addEventListener("DOMContentLoaded", () => {
  console.log("Future Mirror Loaded");

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

  // State
  let baseImage = null;   // uploaded image
  let useVideo = false;
  let videoStream = null;
  const video = document.getElementById("input_video");

  // View transform (world -> screen)
  let view = {
    scale: 1.0,
    offsetX: 0,
    offsetY: 0
  };

  // Drawing + items (world coordinates)
  const strokes = []; // {points: [{x,y}], color, size, opacity}
  let currentStroke = null;
  let isDrawing = false;

  const items = []; // {id, img, src, x, y, w, h, scale, rotation}
  let selectedItemId = null;
  let draggingItem = null;
  let dragOffset = { x: 0, y: 0 };

  // active tool/subtool
  let activeCategory = "makeup";
  let activeSubtool = null; // id string
  let activeSubtoolDef = null; // definition from SUBTOOLS

  // brush defaults and palette
  let brushSize = 18;
  let brushColor = "#DC143C";
  let brushOpacityVal = 0.6;
  const colorPalette = ["#DC143C","#FF66B2","#FFCAA0","#8030FF","#0022FF","#FFFFFF","#000000"];
  let paletteIndex = 0;

  // Subtools manifest (update src paths to match your asset filenames)
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

  // UTILS — coordinate transforms
  function screenToWorld(sx, sy) {
    const rect = canvas.getBoundingClientRect();
    const x = (sx - rect.left - view.offsetX) / view.scale;
    const y = (sy - rect.top - view.offsetY) / view.scale;
    return { x, y };
  }
  function worldToScreen(wx, wy) {
    const rect = canvas.getBoundingClientRect();
    const sx = rect.left + view.offsetX + wx * view.scale;
    const sy = rect.top + view.offsetY + wy * view.scale;
    return { x: sx, y: sy };
  }

  // draw helpers
  function drawImageCover(img, dx, dy, dw, dh) {
    const iw = img.width, ih = img.height;
    const r = Math.max(dw / iw, dh / ih);
    const nw = iw * r, nh = ih * r;
    const cx = (nw - dw) / 2, cy = (nh - dh) / 2;
    ctx.drawImage(img, -cx + dx, -cy + dy, nw, nh);
  }

  function redrawAll() {
    // clear
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // save and apply view transform
    ctx.save();
    ctx.translate(view.offsetX, view.offsetY);
    ctx.scale(view.scale, view.scale);

    // draw base
    if (baseImage) {
      drawImageCover(baseImage, 0, 0, canvas.width / view.scale, canvas.height / view.scale);
    } else if (useVideo && video && video.readyState >= 2) {
      // draw video framed to cover
      ctx.drawImage(video, 0, 0, canvas.width / view.scale, canvas.height / view.scale);
    } else {
      ctx.fillStyle = "#0a0610";
      ctx.fillRect(0, 0, canvas.width / view.scale, canvas.height / view.scale);
    }

    // draw strokes (world coords)
    strokes.forEach(s => drawStroke(s));
    if (currentStroke) drawStroke(currentStroke);

    // draw items (world coords)
    items.forEach(it => drawItem(it));

    // draw selection box for selected item
    if (selectedItemId) {
      const it = items.find(i => i.id === selectedItemId);
      if (it) drawSelection(it);
    }

    ctx.restore();
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
    ctx.moveTo(s.points[0].x, s.points[0].y);
    for (let i = 1; i < s.points.length; i++) ctx.lineTo(s.points[i].x, s.points[i].y);
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
    const hw = (it.w * it.scale) / 2, hh = (it.h * it.scale) / 2;
    ctx.strokeStyle = "rgba(255,255,255,0.9)";
    ctx.setLineDash([6,6]);
    ctx.lineWidth = 2 / view.scale;
    ctx.strokeRect(-hw, -hh, hw*2, hh*2);
    ctx.setLineDash([]);
    ctx.restore();
  }

  // hit test in world coords
  function pointInItemWorld(px, py, it) {
    // px,py are world coords
    const dx = px - it.x;
    const dy = py - it.y;
    const angle = -it.rotation * Math.PI / 180;
    const rx = dx * Math.cos(angle) - dy * Math.sin(angle);
    const ry = dx * Math.sin(angle) + dy * Math.cos(angle);
    const hw = (it.w * it.scale) / 2;
    const hh = (it.h * it.scale) / 2;
    return rx >= -hw && rx <= hw && ry >= -hh && ry <= hh;
  }

  // unique id
  function uid(prefix="it") {
    return prefix + "-" + Math.random().toString(36).slice(2,9);
  }

  // build subtools UI based on category
  function buildSubtools(category) {
    subTools.innerHTML = "";
    const list = SUBTOOLS[category] || [];
    list.forEach(st => {
      const el = document.createElement("div");
      el.className = "chip";
      el.textContent = st.label;
      el.dataset.id = st.id;
      el.addEventListener("click", () => {
        // mark active
        subTools.querySelectorAll(".chip").forEach(x=>x.classList.remove("active"));
        el.classList.add("active");
        activeSubtool = st.id;
        activeSubtoolDef = st;
        // set brush defaults if brush
        if (st.type === "brush") {
          brushColor = st.color || brushColor;
          brushSize = st.size || brushSize;
          brushOpacityVal = parseFloat(brushOpacity.value);
          brushColorPicker.value = rgbToHex(brushColor);
          brushSizeVal.textContent = brushSize;
        } else {
          // image tool: set pointer
        }
      });
      subTools.appendChild(el);
    });
  }

  // initial fill
  buildSubtools(activeCategory);

  // main category click
  mainTools.querySelectorAll(".chip").forEach(ch => {
    ch.addEventListener("click", () => {
      mainTools.querySelectorAll(".chip").forEach(x=>x.classList.remove("active"));
      ch.classList.add("active");
      activeCategory = ch.dataset.category || "none";
      activeSubtool = null;
      activeSubtoolDef = null;
      buildSubtools(activeCategory);
      // hide transform panel
      hideTransformPanel();
      canvas.style.cursor = "crosshair";
    });
  });

  // brush controls: size
  const brushSizeDisplayEl = document.getElementById("brushSizeVal");
  brushSizeDisplayEl.textContent = brushSize;
  brushSizePlus.addEventListener("click", () => { brushSize = Math.min(200, brushSize + 2); brushSizeDisplayEl.textContent = brushSize; });
  brushSizeMinus.addEventListener("click", () => { brushSize = Math.max(1, brushSize - 2); brushSizeDisplayEl.textContent = brushSize; });

  // brush color palette
  brushColorPicker.addEventListener("input", (e) => { brushColor = e.target.value; });
  brushOpacity.addEventListener("input", (e) => { brushOpacityVal = parseFloat(e.target.value); });

  brushPrevColor.addEventListener("click", () => {
    paletteIndex = (paletteIndex - 1 + colorPalette.length) % colorPalette.length;
    brushColor = colorPalette[paletteIndex];
    brushColorPicker.value = brushColor;
  });
  brushNextColor.addEventListener("click", () => {
    paletteIndex = (paletteIndex + 1) % colorPalette.length;
    brushColor = colorPalette[paletteIndex];
    brushColorPicker.value = brushColor;
  });

  // transform panel actions
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
    if (idx >= 0) items.splice(idx,1);
    selectedItemId = null;
    hideTransformPanel();
    redrawAll();
  });
  bringFrontBtn.addEventListener("click", () => {
    if (!selectedItemId) return;
    const idx = items.findIndex(i => i.id === selectedItemId);
    if (idx >= 0) {
      const it = items.splice(idx,1)[0];
      items.push(it);
      redrawAll();
    }
  });

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

  // place image item at world coords
  function placeImageAt(src, wx, wy) {
    const img = new Image();
    img.onload = () => {
      const id = uid("itm");
      const w = Math.min(400, img.width);
      const h = Math.min(300, img.height);
      const it = { id, img, src, x: wx, y: wy, w, h, scale: 1, rotation: 0 };
      items.push(it);
      selectedItemId = id;
      showTransformPanelFor(it);
      redrawAll();
    };
    img.onerror = () => alert("Failed to load asset: " + src);
    img.src = src;
  }

  // pointer & interaction handling — map pointer events to world coords
  let pointerDown = false;
  let pointerMode = "idle"; // 'pan' when space held and dragging, 'draw', 'dragItem'
  let lastPointer = { sx:0, sy:0 }; // screen coords
  let lastPan = { x:0, y:0 };

  canvas.addEventListener("pointerdown", (ev) => {
    canvas.setPointerCapture(ev.pointerId);
    pointerDown = true;
    lastPointer.sx = ev.clientX; lastPointer.sy = ev.clientY;

    const isPan = ev.shiftKey || ev.altKey || window.spacePressed; // additional pan keys allowed; also allow space detection
    if (isPan) {
      pointerMode = "pan";
      lastPan.x = ev.clientX; lastPan.y = ev.clientY;
      return;
    }

    const sw = screenToWorld(ev.clientX, ev.clientY);
    // if active subtool is brush -> start stroke (world coords)
    if (activeSubtoolDef && activeSubtoolDef.type === "brush") {
      pointerMode = "draw";
      currentStroke = { points: [{x: sw.x, y: sw.y}], color: brushColor, size: brushSize / view.scale, opacity: brushOpacityVal };
      isDrawing = true;
      redrawAll();
      return;
    }

    // check if clicking an existing item (topmost)
    const top = findTopItemAt(sw.x, sw.y);
    if (top) {
      // select and start dragging
      selectedItemId = top.id;
      draggingItem = top;
      dragOffset.x = sw.x - top.x;
      dragOffset.y = sw.y - top.y;
      pointerMode = "dragItem";
      showTransformPanelFor(top);
      redrawAll();
      return;
    }

    // else if subtool is image -> place image
    if (activeSubtoolDef && activeSubtoolDef.type === "image") {
      placeImageAt(activeSubtoolDef.src, sw.x, sw.y);
      pointerMode = "idle";
      return;
    }

    // otherwise clicked on empty
    selectedItemId = null;
    hideTransformPanel();
    redrawAll();
  });

  canvas.addEventListener("pointermove", (ev) => {
    lastPointer.sx = ev.clientX; lastPointer.sy = ev.clientY;
    if (!pointerDown) return;

    if (pointerMode === "pan") {
      const dx = ev.clientX - lastPan.x;
      const dy = ev.clientY - lastPan.y;
      lastPan.x = ev.clientX; lastPan.y = ev.clientY;
      view.offsetX += dx;
      view.offsetY += dy;
      redrawAll();
      return;
    }

    const sw = screenToWorld(ev.clientX, ev.clientY);

    if (pointerMode === "draw" && currentStroke) {
      currentStroke.points.push({ x: sw.x, y: sw.y });
      redrawAll();
      return;
    }

    if (pointerMode === "dragItem" && draggingItem) {
      draggingItem.x = sw.x - dragOffset.x;
      draggingItem.y = sw.y - dragOffset.y;
      // sync sliders
      if (selectedItemId === draggingItem.id) {
        scaleSlider.value = draggingItem.scale;
        rotateSlider.value = draggingItem.rotation;
      }
      redrawAll();
      return;
    }
  });

  canvas.addEventListener("pointerup", (ev) => {
    canvas.releasePointerCapture(ev.pointerId);
    pointerDown = false;
    if (pointerMode === "draw" && currentStroke) {
      strokes.push(currentStroke);
      currentStroke = null;
      isDrawing = false;
      redrawAll();
    }
    pointerMode = "idle";
    draggingItem = null;
  });
  canvas.addEventListener("pointercancel", () => { pointerDown = false; pointerMode = "idle"; currentStroke=null; draggingItem=null; });

  // find topmost item at world coords
  function findTopItemAt(wx, wy) {
    for (let i = items.length - 1; i >= 0; i--) {
      if (pointInItemWorld(wx, wy, items[i])) return items[i];
    }
    return null;
  }

  // wheel zoom at cursor
  canvas.addEventListener("wheel", (e) => {
    e.preventDefault();
    const delta = -e.deltaY;
    const zoomFactor = delta > 0 ? 1.08 : 0.92;
    const rect = canvas.getBoundingClientRect();
    const cx = e.clientX - rect.left;
    const cy = e.clientY - rect.top;

    // world coordinate at cursor before
    const before = screenToWorld(e.clientX, e.clientY);

    // apply scale
    view.scale *= zoomFactor;
    view.scale = Math.min(Math.max(0.2, view.scale), 8);

    // compute new offset so the same world point stays under cursor
    const afterScreenX = view.offsetX + before.x * view.scale;
    const afterScreenY = view.offsetY + before.y * view.scale;
    view.offsetX += cx - (rect.left + afterScreenX);
    view.offsetY += cy - (rect.top + afterScreenY);

    redrawAll();
  }, { passive: false });

  // zoom buttons
  zoomInBtn.addEventListener("click", () => {
    const rect = canvas.getBoundingClientRect();
    const cx = rect.left + rect.width/2, cy = rect.top + rect.height/2;
    const fakeEvent = { clientX: cx, clientY: cy, deltaY: -120, preventDefault: ()=>{} };
    canvas.dispatchEvent(new WheelEvent('wheel', { deltaY: -120, clientX: cx, clientY: cy }));
  });
  zoomOutBtn.addEventListener("click", () => {
    const rect = canvas.getBoundingClientRect();
    const cx = rect.left + rect.width/2, cy = rect.top + rect.height/2;
    canvas.dispatchEvent(new WheelEvent('wheel', { deltaY: 120, clientX: cx, clientY: cy }));
  });
  resetViewBtn.addEventListener("click", () => {
    view.scale = 1;
    view.offsetX = 0;
    view.offsetY = 0;
    redrawAll();
  });

  // start/stop camera
  startBtn.addEventListener("click", async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      video.srcObject = stream;
      video.play();
      videoStream = stream;
      useVideo = true;
      baseImage = null;
      requestAnimationFrame(loopVideoDraw);
    } catch (err) {
      alert("Camera error: " + (err.message || err.name));
      console.error(err);
    }
  });
  stopBtn.addEventListener("click", () => {
    if (videoStream) { videoStream.getTracks().forEach(t=>t.stop()); videoStream=null; }
    useVideo = false;
    video.srcObject = null;
    redrawAll();
  });

  function loopVideoDraw() {
    if (useVideo && video && video.readyState >= 2) {
      redrawAll();
      requestAnimationFrame(loopVideoDraw);
    }
  }

  // upload file
  uploadInput.addEventListener("change", (e) => {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    const img = new Image();
    img.onload = () => {
      baseImage = img;
      useVideo = false;
      if (videoStream) { videoStream.getTracks().forEach(t=>t.stop()); videoStream = null; }
      // initialize view offsets to center image nicely (optional)
      view.scale = 1;
      view.offsetX = 0;
      view.offsetY = 0;
      redrawAll();
    };
    img.src = URL.createObjectURL(f);
  });

  // save/export
  saveBtn.addEventListener("click", () => {
    // draw one final time
    redrawAll();
    const link = document.createElement("a");
    link.download = "future_mirror.png";
    link.href = canvas.toDataURL("image/png");
    link.click();
  });

  // helper convert color like "#rrggbb" or css rgba -> hex
  function rgbToHex(c) {
    // accept hex already
    if (c.startsWith("#")) return c;
    return "#dc143c";
  }

  // find subtool by id across manifest
  function findSubtool(id) {
    if (!id) return null;
    const arr = Object.values(SUBTOOLS).flat();
    return arr.find(x=>x.id === id) || null;
  }

  // pointer for keyboard space detection (for pan)
  window.spacePressed = false;
  window.addEventListener("keydown", (e)=> { if (e.code === "Space") { window.spacePressed = true; canvas.style.cursor='grab'; e.preventDefault(); } });
  window.addEventListener("keyup", (e)=> { if (e.code === "Space") { window.spacePressed = false; canvas.style.cursor='crosshair'; } });

  // find top item at world coords
  function findTopItemAt(wx, wy) {
    for (let i = items.length - 1; i >= 0; i--) if (pointInItemWorld(wx, wy, items[i])) return items[i];
    return null;
  }

  // expose debug
  window.__fm = { strokes, items, redrawAll, placeImageAt };

  // initial draw
  redrawAll();

  // click subtools population uses same buildSubtools() defined earlier; ensure initial build
  buildSubtools(activeCategory);
});
