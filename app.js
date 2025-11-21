document.addEventListener("DOMContentLoaded", () => {
  console.log("Future Mirror Loaded");

  const uploadInput = document.getElementById("uploadImage");
  const canvas = document.getElementById("overlay");
  const ctx = canvas.getContext("2d");

  const startBtn = document.getElementById("startBtn");
  const stopBtn = document.getElementById("stopBtn");
  const saveBtn = document.getElementById("saveBtn");
  const downloadBtn = document.getElementById("downloadBtn");

  const video = document.getElementById("input_video");

  let uploadedImage = null;
  let currentTool = null;
  let currentCategory = null;
  const appliedItems = [];

  // ======== IMAGE UPLOAD ========
  uploadInput.addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const img = new Image();
    img.onload = () => {
      uploadedImage = img;
      redrawCanvas();
    };
    img.src = URL.createObjectURL(file);
  });

  // ======== CAMERA ========
  startBtn.addEventListener("click", async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      video.srcObject = stream;
      video.style.display = "block";

      uploadedImage = null;
      redrawCanvas();
    } catch (err) {
      console.error("Camera Error:", err);
      alert("Camera not found or permission denied");
    }
  });

  stopBtn.addEventListener("click", () => {
    const tracks = video.srcObject ? video.srcObject.getTracks() : [];
    tracks.forEach(t => t.stop());
    video.style.display = "none";
  });

  // ======== REDRAW CANVAS ========
  function redrawCanvas() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (uploadedImage) {
      ctx.drawImage(uploadedImage, 0, 0, canvas.width, canvas.height);
    } else if (video.srcObject) {
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    }

    appliedItems.forEach(item => {
      const img = new Image();
      img.onload = () => {
        ctx.drawImage(
          img,
          item.x - item.w / 2,
          item.y - item.h / 2,
          item.w,
          item.h
        );
      };
      img.src = item.src;
    });
  }

  // ======== CANVAS CLICK TO APPLY ========
  canvas.addEventListener("click", (e) => {
    if (!currentTool) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const srcPath = `assets/${currentCategory}/${currentTool}.png`;

    // Preload to store correct width/height
    const img = new Image();
    img.onload = () => {
      appliedItems.push({
        src: srcPath,
        x,
        y,
        w: img.width,
        h: img.height
      });
      redrawCanvas();
    };
    img.src = srcPath;
  });

  // ======== CHIP SELECTION ========
  const chips = document.querySelectorAll(".chip");

  chips.forEach(chip => {
    chip.addEventListener("click", () => {
      chip.parentElement
        .querySelectorAll(".chip")
        .forEach(c => c.classList.remove("active"));

      chip.classList.add("active");

      currentTool = chip.dataset.tool || null;

      if (chip.dataset.makeup) currentCategory = "makeup";
      else if (chip.dataset.style) currentCategory = "glasses";
      else if (chip.dataset.jewelry) currentCategory = "jewelry";

      // Update cursor preview
      if (currentTool && currentCategory) {
        canvas.style.cursor =
          `url(assets/${currentCategory}/${currentTool}.png) 16 16, auto`;
      } else {
        canvas.style.cursor = "default";
      }
    });
  });

  // ======== SAVE / DOWNLOAD ========
  saveBtn.addEventListener("click", () => downloadBtn.click());

  downloadBtn.addEventListener("click", () => {
    const link = document.createElement("a");
    link.download = "future_mirror.png";
    link.href = canvas.toDataURL("image/png");
    link.click();
  });
});
