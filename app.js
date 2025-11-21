document.addEventListener("DOMContentLoaded", () => {
  console.log("Future Mirror Loaded");

  // ======== ELEMENTS ========
  const startBtn = document.getElementById("startBtn");
  const stopBtn = document.getElementById("stopBtn");
  const saveBtn = document.getElementById("saveBtn");
  const downloadBtn = document.getElementById("downloadBtn");

  const video = document.getElementById("input_video");
  const canvas = document.getElementById("overlay");
  const ctx = canvas.getContext("2d");

  // ======== STATE ========
  let mpCamera = null;
  let currentTool = "glasses"; // default tool
  let currentStyle = "neon";
  let currentMakeup = "bold";
  let currentBg = "car";

  // ======== MEDIA PIPE FACE MESH ========
  const faceMesh = new FaceMesh.FaceMesh({
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
    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw camera background
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    // Overlay selected background if any
    if (currentBg !== "none") {
      const bgImg = new Image();
      bgImg.src = `assets/backgrounds/${currentBg}.png`;
      bgImg.onload = () => {
        ctx.globalAlpha = 0.3; // make hologram effect
        ctx.drawImage(bgImg, 0, 0, canvas.width, canvas.height);
        ctx.globalAlpha = 1.0;
      };
    }

    // Draw overlays if landmarks detected
    if (results.multiFaceLandmarks && results.multiFaceLandmarks.length > 0) {
      const landmarks = results.multiFaceLandmarks[0];

      // Example: draw glasses
      if (currentTool === "glasses") {
        const leftEye = landmarks[33];
        const rightEye = landmarks[263];
        const glassesWidth = (rightEye.x - leftEye.x) * canvas.width * 2;

        const glassesImg = new Image();
        glassesImg.src = `assets/glasses/${currentStyle}.png`;
        glassesImg.onload = () => {
          const x = leftEye.x * canvas.width - glassesWidth * 0.25;
          const y = leftEye.y * canvas.height - glassesWidth * 0.25;
          ctx.drawImage(glassesImg, x, y, glassesWidth, glassesWidth / 2);
        };
      }

      // Example: draw makeup (simple neon blush on cheeks)
      if (currentTool === "makeup") {
        ctx.fillStyle = currentMakeup === "bold" ? "rgba(255,0,255,0.4)" : "rgba(128,0,255,0.3)";
        const leftCheek = landmarks[234];
        const rightCheek = landmarks[454];
        ctx.beginPath();
        ctx.arc(leftCheek.x * canvas.width, leftCheek.y * canvas.height, 20, 0, 2 * Math.PI);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(rightCheek.x * canvas.width, rightCheek.y * canvas.height, 20, 0, 2 * Math.PI);
        ctx.fill();
      }
    }
  });

  // ======== CAMERA CONTROL ========
  startBtn.addEventListener("click", async () => {
    console.log("Start clicked");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      video.srcObject = stream;
      await video.play();

      mpCamera = new Camera.Camera(video, {
        onFrame: async () => {
          await faceMesh.send({ image: video });
        },
        width: 640,
        height: 480
      });
      mpCamera.start();
    } catch (error) {
      console.error("Camera Error:", error);
      alert("Camera permission required!");
    }
  });

  stopBtn.addEventListener("click", () => {
    console.log("Stop clicked");
    if (mpCamera) mpCamera.stop();
  });

  // ======== SAVE / DOWNLOAD ========
  saveBtn.addEventListener("click", () => {
    console.log("Save clicked");
    downloadBtn.click();
  });

  downloadBtn.addEventListener("click", () => {
    const link = document.createElement("a");
    link.download = "holo_snapshot.png";
    link.href = canvas.toDataURL("image/png");
    link.click();
  });

  // ======== TOOL SELECTION ========
  const chips = document.querySelectorAll(".chip");
  chips.forEach((chip) => {
    chip.addEventListener("click", () => {
      // Remove active from all siblings
      chip.parentElement.querySelectorAll(".chip").forEach((c) => c.classList.remove("active"));
      chip.classList.add("active");

      const tool = chip.dataset.tool;
      if (tool) currentTool = tool;

      const style = chip.dataset.style;
      if (style) currentStyle = style;

      const makeup = chip.dataset.makeup;
      if (makeup) currentMakeup = makeup;

      const bg = chip.dataset.bg;
      if (bg) currentBg = bg;
    });
  });
});
