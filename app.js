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
  let mpCamera = null;

  let currentTool = "glasses";
  let currentGlasses = "neon";
  let currentMakeup = "bold";
  let currentBg = "car";

  // ======== FACE MESH ========
  const faceMesh = new FaceMesh({
    locateFile: (file) =>
      `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`
  });

  faceMesh.setOptions({
    maxNumFaces: 1,
    refineLandmarks: true,
    minDetectionConfidence: 0.7,
    minTrackingConfidence: 0.5
  });

  faceMesh.onResults((results) => {
    drawCanvas(results.multiFaceLandmarks ? results.multiFaceLandmarks[0] : null);
  });

  // ======== DRAW CANVAS ========
  function drawCanvas(landmarks = null) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw uploaded image or live video
    if (uploadedImage) {
      ctx.drawImage(uploadedImage, 0, 0, canvas.width, canvas.height);
    } else {
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    }

    // Background overlay
    if (currentBg !== "none") {
      const bgImg = new Image();
      bgImg.src = `assets/backgrounds/${currentBg}.png`;
      bgImg.onload = () => {
        ctx.globalAlpha = 0.3;
        ctx.drawImage(bgImg, 0, 0, canvas.width, canvas.height);
        ctx.globalAlpha = 1.0;
      };
    }

    // Glasses overlay
    if (currentTool === "glasses" && landmarks) {
      const leftEye = landmarks[33];
      const rightEye = landmarks[263];
      const glassesWidth = (rightEye.x - leftEye.x) * canvas.width * 2;

      const glassesImg = new Image();
      glassesImg.src = `assets/glasses/${currentGlasses}.png`;
      glassesImg.onload = () => {
        const x = leftEye.x * canvas.width - glassesWidth * 0.25;
        const y = leftEye.y * canvas.height - glassesWidth * 0.25;
        ctx.drawImage(glassesImg, x, y, glassesWidth, glassesWidth / 2);
      };
    }

    // Makeup overlay
    if (currentTool === "makeup" && landmarks) {
      ctx.fillStyle =
        currentMakeup === "bold" ? "rgba(255,0,255,0.4)" : "rgba(128,0,255,0.3)";
      const leftCheek = landmarks ? landmarks[234] : { x: 0.3, y: 0.5 };
      const rightCheek = landmarks ? landmarks[454] : { x: 0.7, y: 0.5 };

      ctx.beginPath();
      ctx.arc(leftCheek.x * canvas.width, leftCheek.y * canvas.height, 30, 0, 2 * Math.PI);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(rightCheek.x * canvas.width, rightCheek.y * canvas.height, 30, 0, 2 * Math.PI);
      ctx.fill();
    }
  }

  // ======== IMAGE UPLOAD ========
  uploadInput.addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const img = new Image();
    img.onload = () => {
      uploadedImage = img;
      drawCanvas();
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

      mpCamera = new Camera.Camera(video, {
        onFrame: async () => await faceMesh.send({ image: video }),
        width: 640,
        height: 480
      });
      mpCamera.start();
    } catch (err) {
      console.error("Camera Error:", err);
      alert("Camera not found or permission denied");
    }
  });

  stopBtn.addEventListener("click", () => {
    if (mpCamera) mpCamera.stop();
  });

  // ======== SAVE / DOWNLOAD ========
  saveBtn.addEventListener("click", () => downloadBtn.click());

  downloadBtn.addEventListener("click", () => {
    const link = document.createElement("a");
    link.download = "future_mirror.png";
    link.href = canvas.toDataURL("image/png");
    link.click();
  });

  // ======== CHIP INTERACTIVITY ========
  const chips = document.querySelectorAll(".chip");
  chips.forEach((chip) => {
    chip.addEventListener("click", () => {
      chip.parentElement.querySelectorAll(".chip").forEach(c => c.classList.remove("active"));
      chip.classList.add("active");

      const tool = chip.dataset.tool;
      if (tool) currentTool = tool;

      const style = chip.dataset.style;
      if (style) currentGlasses = style;

      const makeup = chip.dataset.makeup;
      if (makeup) currentMakeup = makeup;

      const bg = chip.dataset.bg;
      if (bg) currentBg = bg;

      drawCanvas();
    });
  });
});
