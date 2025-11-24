// app.js — Full engine: zoom/pan world-space, smooth brush, eraser, stickers, undo/redo
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

  // view transform
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
  const colorPalette = ["#DC143C","#FF66B2","#FFCAA0","#8030FF","#0022FF","#FFFFFF","#000000"];
  let paletteIndex = 0;

  // eraser state
  let eraserSize = 36;

  // stroke & items
  const strokes = []; // {id, points:[{x,y}], color, size, opacity}
  let currentStroke = null;
  let isDrawing = false;

  const items = []; // {id, img, src, x, y, w, h, scale, rotation}
  let selectedItemId = null;
  let draggingItem = null;
  let dragOffset = { x: 0, y: 0 };

  // undo/redo stacks (actions)
  const undoStack = [];
  const redoStack = [];
  function pushUndo(action) { undoStack.push(action); if (undoStack.length > 200) undoStack.shift(); redoStack.length = 0; updateUndoButtons(); }
  function updateUndoButtons() { undoBtn.disabled = undoStack.length === 0; redoBtn.disabled = redoStack.length === 0; }

  // SUBTOOLS manifest — update src paths to your actual asset filenames
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

  // ---------- Coordinate transforms ----------
  function screenToWorld(sx, sy) {
    // convert screen clientX/Y to world coordinates used for strokes/items
    const rect = canvas.getBoundingClientRect();
    const cx = sx - rect.left;
    const cy = sy - rect.top;
    const wx = (cx - view.offsetX) / view.scale;
    const wy = (cy - view.offsetY) / view.scale;
    return { x: wx, y: wy };
  }
  function worldToScreen(wx, wy) {
    const rect = canvas.getBoundingClientRect();
    const sx = rect.left + view.offsetX + wx * view.scale;
    const sy = rect.top + view.offsetY + wy * view.scale;
    return { x: sx, y: sy };
  }

  // ---------- Drawing helpers ----------
  function drawImageCover(img, x, y, w, h) {
    // cover behaviour while considering world space (we pass world width/height)
    const iw = img.width, ih = img.height;
    const r = Math.max(w / iw, h / ih);
    const nw = iw * r, nh = ih * r;
    const cx = (nw - w) / 2, cy = (nh - h) / 2;
    ctx.drawImage(img, -cx + x, -cy + y, nw, nh);
  }

  function redrawAll() {
    // clear screen
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // apply view transform
    ctx.save();
    ctx.translate(view.offsetX, view.offsetY);
    ctx.scale(view.scale, view.scale);

    // draw base (world area is canvas.width/view.scale by canvas.height/view.scale)
    if (baseImage) {
      drawImageCover(baseImage, 0, 0, canvas.width / view.scale, canvas.height / view.scale);
    } else if (useVideo && video && video.readyState >= 2) {
      ctx.drawImage(video, 0, 0, canvas.width / view.scale, canvas.height / view.scale);
    } else {
      ctx.fillStyle = "#0a0610";
      ctx.fillRect(0, 0, canvas.width / view.scale, canvas.height / view.scale);
    }

    // draw strokes
    strokes.forEach(s => drawStroke(s));
    if (currentStroke) drawStroke(currentStroke);

    // draw items
    items.forEach(it => drawItem(it));

    // draw selected item bounding box
    if (selectedItemId) {
      const it = items.find(i => i.id === selectedItemId);
      if (it) drawSelection(it);
    }

    ctx.restore();

    // optionally draw eraser cursor indicator in screen space
    if (eraserActive) {
      // draw circle at screen cursor
      if (lastPointerPos) {
        const rect = canvas.getBoundingClientRect();
        const screenX = lastPointerPos.sx - rect.left;
        const screenY = lastPointerPos.sy - rect.top;
        ctx.save();
        ctx.setTransform(1,0,0,1,0,0);
        ctx.beginPath();
        ctx.strokeStyle = 'rgba(255,255,255,0.6)';
        ctx.lineWidth = 1;
        ctx.arc(screenX, screenY, eraserSize, 0, Math.PI*2);
        ctx.stroke();
        ctx.restore();
      }
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
    ctx.moveTo(s.points[0].x, s.points[0].y);
    // smooth using quadratic curve
    for (let i = 1; i < s.points.length - 1; i++) {
      const midx = (s.points[i].x + s.points[i+1].x) / 2;
      const midy = (s.points[i].y + s.points[i+1].y) / 2;
      ctx.quadraticCurveTo(s.points[i].x, s.points[i].y, midx, midy);
    }
    // last line to final point
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
    ctx.drawImage(it.img, -it.w/2, -it.h/2, it.w, it.h);
    ctx.restore();
  }

  function drawSelection(it) {
    if (!it) return;
    ctx.save();
    ctx.translate(it.x, it.y);
    ctx.rotate(it.rotation * Math.PI/180);
    const hw = (it.w * it.scale)/2, hh = (it.h * it.scale)/2;
    ctx.strokeStyle = "rgba(255,255,255,0.9)";
    ctx.setLineDash([6,6]);
    ctx.lineWidth = 2 / view.scale;
    ctx.strokeRect(-hw, -hh, hw*2, hh*2);
    ctx.setLineDash([]);
    ctx.restore();
  }

  // ---------- hit tests ----------
  function pointInItemWorld(px, py, it) {
    const dx = px - it.x, dy = py - it.y;
    const angle = -it.rotation * Math.PI / 180;
    const rx = dx * Math.cos(angle) - dy * Math.sin(angle);
    const ry = dx * Math.sin(angle) + dy * Math.cos(angle);
    const hw = (it.w * it.scale)/2, hh = (it.h * it.scale)/2;
    return rx >= -hw && rx <= hw && ry >= -hh && ry <= hh;
  }

  // ---------- utilities ----------
  function uid(prefix="id") { return prefix + "-" + Math.random().toString(36).slice(2,9); }
  function findSubtoolById(id) {
    if (!id) return null;
    const all = Object.values(SUBTOOLS).flat();
    return all.find(s => s.id === id) || null;
  }
  function findTopItemAtWorld(wx, wy) {
    for (let i = items.length - 1; i >= 0; i--) {
      if (pointInItemWorld(wx, wy, items[i])) return items[i];
    }
    return null;
  }

  // ---------- build subtools UI ----------
  function buildSubtools(category) {
    subTools.innerHTML = "";
    const list = SUBTOOLS[category] || [];
    list.forEach(st => {
      const el = document.createElement("div");
      el.className = "chip";
      el.textContent = st.label;
      el.dataset.id = st.id;
      el.addEventListener("click", () => {
        subTools.querySelectorAll(".chip").forEach(x=>x.classList.remove("active"));
        el.classList.add("active");
        activeSubtool = st.id;
        activeSubtoolDef = st;
        // if brush supply default brush settings
        if (st.type === "brush") {
          brushColor = st.color || brushColor;
          brushSize = st.size || brushSize;
          brushSizeVal.textContent = brushSize;
          brushColorPicker.value = rgbToHex(brushColor);
          brushOpacity.value = brushOpacityVal;
          eraserActive = false;
          eraserBtn.classList.remove('active');
        } else {
          // image tool
          eraserActive = false;
          eraserBtn.classList.remove('active');
        }
      });
      subTools.appendChild(el);
    });
  }
  buildSubtools(activeCategory);

  // ---------- main categories ----------
  mainTools.querySelectorAll(".chip").forEach(ch => {
    ch.addEventListener("click", () => {
      mainTools.querySelectorAll(".chip").forEach(x=>x.classList.remove("active"));
      ch.classList.add("active");
      activeCategory = ch.dataset.category || "none";
      activeSubtool = null;
      activeSubtoolDef = null;
      buildSubtools(activeCategory);
      hideTransformPanel();
    });
  });

  // ---------- brush controls ----------
  brushSizeVal.textContent = brushSize;
  brushSizePlus.addEventListener("click", ()=>{ brushSize = Math.min(200, brushSize+2); brushSizeVal.textContent = brushSize; });
  brushSizeMinus.addEventListener("click", ()=>{ brushSize = Math.max(1, brushSize-2); brushSizeVal.textContent = brushSize; });
  brushColorPicker.addEventListener("input", (e)=>{ brushColor = e.target.value; });
  brushOpacity.addEventListener("input", (e)=>{ brushOpacityVal = parseFloat(e.target.value); });
  brushPrevColor.addEventListener("click", ()=>{ paletteIndex=(paletteIndex-1+colorPalette.length)%colorPalette.length; brushColor=colorPalette[paletteIndex]; brushColorPicker.value=brushColor; });
  brushNextColor.addEventListener("click", ()=>{ paletteIndex=(paletteIndex+1)%colorPalette.length; brushColor=colorPalette[paletteIndex]; brushColorPicker.value=brushColor; });

  // eraser toggles & size
  eraserBtn.addEventListener("click", ()=>{ eraserActive = !eraserActive; eraserBtn.classList.toggle('active'); });
  eraserSizeVal.textContent = eraserSize;
  eraserPlus.addEventListener("click", ()=>{ eraserSize = Math.min(400, eraserSize+8); eraserSizeVal.textContent = eraserSize; });
  eraserMinus.addEventListener("click", ()=>{ eraserSize = Math.max(8, eraserSize-8); eraserSizeVal.textContent = eraserSize; });

  // transform panel handlers
  scaleSlider.addEventListener("input", ()=>{ if (!selectedItemId) return; const it = items.find(i=>i.id===selectedItemId); if (it){ it.scale = parseFloat(scaleSlider.value); pushUndo({type:'transform', id:it.id, after:{scale:it.scale, rotation:it.rotation}}); redrawAll(); } });
  rotateSlider.addEventListener("input", ()=>{ if (!selectedItemId) return; const it = items.find(i=>i.id===selectedItemId); if (it){ it.rotation = parseFloat(rotateSlider.value); pushUndo({type:'transform', id:it.id, after:{scale:it.scale, rotation:it.rotation}}); redrawAll(); } });
  deleteItemBtn.addEventListener("click", ()=>{ if (!selectedItemId) return; const idx=items.findIndex(i=>i.id===selectedItemId); if (idx>=0){ const [it]=items.splice(idx,1); pushUndo({type:'deleteItem', item:it}); selectedItemId=null; hideTransformPanel(); redrawAll(); }});
  bringFrontBtn.addEventListener("click", ()=>{ if (!selectedItemId) return; const idx=items.findIndex(i=>i.id===selectedItemId); if (idx>=0){ const it=items.splice(idx,1)[0]; items.push(it); pushUndo({type:'reorder', id:it.id}); redrawAll(); }});

  function showTransformPanelFor(it) {
    transformPanel.style.display = "";
    scaleSlider.value = it.scale;
    rotateSlider.value = it.rotation;
    selectedItemId = it.id;
  }
  function hideTransformPanel(){ transformPanel.style.display='none'; selectedItemId=null; }

  // place image at world coords
  function placeImageAt(src, wx, wy) {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const id = uid("it");
      const w = Math.min(400, img.width);
      const h = Math.min(300, img.height);
      const it = { id, img, src, x: wx, y: wy, w, h, scale: 1, rotation: 0 };
      items.push(it);
      pushUndo({ type: 'addItem', item: JSON.parse(JSON.stringify(it, ['id','src','x','y','w','h','scale','rotation'])) });
      selectedItemId = id;
      showTransformPanelFor(it);
      redrawAll();
    };
    img.onerror = ()=> alert("Failed to load asset: " + src);
    img.src = src;
  }

  // ---------- pointer interactions (world-space) ----------
  let pointerDown = false;
  let pointerMode = "idle"; // 'pan' | 'draw' | 'dragItem' | 'idle'
  let lastPointerPos = null;
  let lastPan = { x:0, y:0 };

  canvas.addEventListener("pointerdown", (e) => {
    canvas.setPointerCapture(e.pointerId);
    pointerDown = true;
    lastPointerPos = { sx: e.clientX, sy: e.clientY };
    const isPan = window.spacePressed; // pan when space held
    if (isPan) {
      pointerMode = "pan";
      lastPan.x = e.clientX; lastPan.y = e.clientY;
      return;
    }

    const world = screenToWorld(e.clientX, e.clientY);

    // if eraser active -> erase everything under cursor (whole strokes & items)
    if (eraserActive) {
      handleEraseAt(world.x, world.y);
      return;
    }

    // if active subtool is brush -> start stroke
    if (activeSubtoolDef && activeSubtoolDef.type === "brush") {
      pointerMode = "draw";
      currentStroke = { id: uid("s"), points: [{x: world.x, y: world.y}], color: brushColor, size: brushSize / view.scale, opacity: brushOpacityVal };
      isDrawing = true;
      redrawAll();
      return;
    }

    // check if clicked topmost item
    const top = findTopItemAtWorld(world.x, world.y);
    if (top) {
      // select & start dragging
      selectedItemId = top.id;
      draggingItem = top;
      dragOffset.x = world.x - top.x;
      dragOffset.y = world.y - top.y;
      pointerMode = "dragItem";
      showTransformPanelFor(top);
      redrawAll();
      return;
    }

    // else if active subtool is image -> place an image at click
    if (activeSubtoolDef && activeSubtoolDef.type === "image") {
      placeImageAt(activeSubtoolDef.src, world.x, world.y);
      return;
    }

    // else deselect
    selectedItemId = null;
    hideTransformPanel();
    redrawAll();
  });

  canvas.addEventListener("pointermove", (e) => {
    lastPointerPos = { sx: e.clientX, sy: e.clientY };
    if (!pointerDown) return;

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

    if (pointerMode === "draw" && currentStroke) {
      currentStroke.points.push({ x: world.x, y: world.y });
      redrawAll();
      return;
    }

    if (pointerMode === "dragItem" && draggingItem) {
      draggingItem.x = world.x - dragOffset.x;
      draggingItem.y = world.y - dragOffset.y;
      // update sliders to reflect new pos (scale/rotation remain)
      if (selectedItemId === draggingItem.id) {
        scaleSlider.value = draggingItem.scale;
        rotateSlider.value = draggingItem.rotation;
      }
      redrawAll();
      return;
    }
  });

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
    pointerMode = "idle";
    draggingItem = null;
  });

  canvas.addEventListener("pointercancel", () => {
    pointerDown = false; pointerMode = "idle"; currentStroke = null; draggingItem = null;
  });

  // ---------- wheel zoom centered at cursor ----------
  canvas.addEventListener("wheel", (e) => {
    e.preventDefault();
    const delta = -e.deltaY;
    const zoomFactor = delta > 0 ? 1.08 : 0.92;
    const rect = canvas.getBoundingClientRect();
    const cx = e.clientX - rect.left;
    const cy = e.clientY - rect.top;
    const before = screenToWorld(e.clientX, e.clientY);

    view.scale *= zoomFactor;
    view.scale = Math.min(Math.max(0.2, view.scale), 8);

    // after scaling, adjust offsets to keep world point under cursor
    const afterScreenX = view.offsetX + before.x * view.scale;
    const afterScreenY = view.offsetY + before.y * view.scale;
    view.offsetX += cx - afterScreenX;
    view.offsetY += cy - afterScreenY;

    redrawAll();
  }, { passive: false });

  // zoom buttons
  zoomInBtn.addEventListener("click", ()=> {
    const rect = canvas.getBoundingClientRect();
    const centerX = rect.left + rect.width/2, centerY = rect.top + rect.height/2;
    const evt = new WheelEvent('wheel', { deltaY: -120, clientX: centerX, clientY: centerY });
    canvas.dispatchEvent(evt);
  });
  zoomOutBtn.addEventListener("click", ()=> {
    const rect = canvas.getBoundingClientRect();
    const centerX = rect.left + rect.width/2, centerY = rect.top + rect.height/2;
    const evt = new WheelEvent('wheel', { deltaY: 120, clientX: centerX, clientY: centerY });
    canvas.dispatchEvent(evt);
  });
  resetViewBtn.addEventListener("click", ()=> { view.scale = 1; view.offsetX = 0; view.offsetY = 0; redrawAll(); });

  // ---------- camera & upload ----------
  startBtn.addEventListener("click", async ()=> {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      video.srcObject = stream; video.play(); videoStream = stream; useVideo = true; baseImage = null;
      requestAnimationFrame(loopVideo);
    } catch (err) {
      alert("Camera error: " + (err.message || err.name)); console.error(err);
    }
  });
  stopBtn.addEventListener("click", ()=> {
    if (videoStream) { videoStream.getTracks().forEach(t=>t.stop()); videoStream=null; }
    useVideo = false; video.srcObject = null; redrawAll();
  });

  function loopVideo() { if (useVideo && video && video.readyState >= 2) { redrawAll(); requestAnimationFrame(loopVideo); } }

  uploadInput.addEventListener("change", (e)=> {
    const f = e.target.files && e.target.files[0]; if (!f) return;
    const img = new Image();
    img.onload = ()=> { baseImage = img; useVideo = false; if (videoStream) { videoStream.getTracks().forEach(t=>t.stop()); videoStream=null; } view.scale = 1; view.offsetX = 0; view.offsetY = 0; redrawAll(); };
    img.src = URL.createObjectURL(f);
  });

  // ---------- eraser behavior ----------
  function handleEraseAt(wx, wy) {
    // erase strokes: remove any stroke that has at least one point within eraser radius
    const erasedStrokes = [];
    for (let i = strokes.length - 1; i >= 0; i--) {
      const s = strokes[i];
      const hit = s.points.some(p => Math.hypot(p.x - wx, p.y - wy) <= eraserSize / view.scale);
      if (hit) {
        erasedStrokes.push({ index: i, stroke: s });
        strokes.splice(i, 1);
      }
    }
    // erase items: remove any item whose center is within eraser radius
    const erasedItems = [];
    for (let i = items.length - 1; i >= 0; i--) {
      const it = items[i];
      if (Math.hypot(it.x - wx, it.y - wy) <= eraserSize / view.scale) {
        erasedItems.push({ index: i, item: it });
        items.splice(i, 1);
      }
    }
    if (erasedStrokes.length || erasedItems.length) {
      pushUndo({ type: 'erase', strokes: erasedStrokes.map(x=>x.stroke), items: erasedItems.map(x=>x.item) });
      selectedItemId = null; hideTransformPanel(); redrawAll();
    }
  }

  // ---------- undo / redo ----------
  function doUndo() {
    if (undoStack.length === 0) return;
    const a = undoStack.pop();
    redoStack.push(a);
    // handle action types
    if (a.type === 'addStroke') {
      // remove last stroke with same id
      const idx = strokes.findIndex(s => s.id === a.stroke.id);
      if (idx >= 0) strokes.splice(idx, 1);
    } else if (a.type === 'addItem') {
      // remove item by id
      const idx = items.findIndex(it => it.id === a.item.id);
      if (idx >= 0) items.splice(idx, 1);
    } else if (a.type === 'deleteItem') {
      // restore item
      items.push(a.item);
    } else if (a.type === 'erase') {
      // restore erased strokes & items
      (a.strokes || []).forEach(s => strokes.push(s));
      (a.items || []).forEach(it => items.push(it));
    } else if (a.type === 'transform') {
      // store earlier/after? our transform pushes only 'after' currently; for simplicity skip complex inverse here
      // In practice transforms are pushed as 'transform' with item id and before/after — we didn't implement before => skip
    } else if (a.type === 'reorder') {
      // can't reliably undo reorder without storing previous order; skip
    }
    redrawAll();
    updateUndoButtons();
  }
  function doRedo() {
    if (redoStack.length === 0) return;
    const a = redoStack.pop();
    undoStack.push(a);
    // basic reapply of add operations
    if (a.type === 'addStroke') { strokes.push(a.stroke); }
    else if (a.type === 'addItem') { const it = JSON.parse(JSON.stringify(a.item)); // shallow
      const img = new Image(); img.src = it.src; img.onload = ()=> { items.push({ ...it, img }); redrawAll(); }; 
    } else if (a.type === 'erase') {
      // redo erase: remove any stroke/item that matches ids/shape (best-effort)
      (a.strokes||[]).forEach(s=>{
        const idx = strokes.findIndex(x=>x.id===s.id);
        if (idx>=0) strokes.splice(idx,1);
      });
      (a.items||[]).forEach(it=>{
        const idx = items.findIndex(x=>x.id===it.id);
        if (idx>=0) items.splice(idx,1);
      });
    }
    redrawAll();
    updateUndoButtons();
  }

  // simplified pushUndo wrappers for actions we know
  function pushUndo(action) {
    pushUndoInner(action);
  }
  function pushUndoInner(action) {
    undoStack.push(action);
    if (undoStack.length > 200) undoStack.shift();
    redoStack.length = 0;
    updateUndoButtons();
  }

  // UI undo/redo buttons
  undoBtn.addEventListener("click", doUndo);
  redoBtn.addEventListener("click", doRedo);

  // keyboard shortcuts for undo/redo & spacepan detection
  window.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 'z') { e.preventDefault(); doUndo(); }
    if ((e.ctrlKey || e.metaKey) && (e.key.toLowerCase() === 'y' || (e.shiftKey && e.key.toLowerCase() === 'z'))) { e.preventDefault(); doRedo(); }
    if (e.code === 'Space') { window.spacePressed = true; canvas.style.cursor = 'grab'; e.preventDefault(); }
  });
  window.addEventListener("keyup", (e)=>{ if (e.code === 'Space') { window.spacePressed = false; canvas.style.cursor = 'crosshair'; } });

  // ---------- helpers and initializations ----------
  function rgbToHex(c) {
    if (typeof c === 'string' && c.startsWith('#')) return c;
    return '#DC143C';
  }

  // find top item at world coords
  function findTopItemAtWorld(wx, wy) {
    for (let i = items.length - 1; i >= 0; i--) if (pointInItemWorld(wx, wy, items[i])) return items[i];
    return null;
  }

  // expose for debug
  window.__fm = { strokes, items, redrawAll, placeImageAt: (s,x,y)=>placeImageAt(s,x,y) };

  // ---------- camera/upload handlers ----------
  startBtn.addEventListener("click", async ()=> {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      video.srcObject = stream; video.play(); videoStream = stream; useVideo = true; baseImage = null;
      requestAnimationFrame(loopVideo);
    } catch (err) { alert("Camera error: " + (err.message || err.name)); console.error(err); }
  });
  stopBtn.addEventListener("click", ()=> {
    if (videoStream) { videoStream.getTracks().forEach(t=>t.stop()); videoStream=null; }
    useVideo = false; video.srcObject = null; redrawAll();
  });

  function loopVideo() { if (useVideo && video && video.readyState >= 2) { redrawAll(); requestAnimationFrame(loopVideo); } }

  uploadInput.addEventListener("change", (e)=> {
    const f = e.target.files && e.target.files[0]; if (!f) return;
    const img = new Image();
    img.onload = ()=> { baseImage = img; useVideo = false; if (videoStream) videoStream.getTracks().forEach(t=>t.stop()); videoStream=null; view.scale = 1; view.offsetX = 0; view.offsetY = 0; redrawAll(); };
    img.src = URL.createObjectURL(f);
  });

  // ---------- initial draw ----------
  redrawAll();
});
