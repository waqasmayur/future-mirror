document.addEventListener("DOMContentLoaded", function () {

    console.log("Future Mirror Loaded");

    // ======= SELECT ELEMENTS =======
    const startBtn = document.getElementById("startBtn");
    const captureBtn = document.getElementById("captureBtn");
    const clearBtn = document.getElementById("clearBtn");
    const video = document.getElementById("videoElement");
    const canvas = document.getElementById("outputCanvas");
    const ctx = canvas.getContext("2d");

    let camera = null;

    // ======= START CAMERA =======
    startBtn.addEventListener("click", async () => {
        console.log("Start button clicked");

        try {
            const stream = await navigator.mediaDevices.getUserMedia({ video: true });
            video.srcObject = stream;

            console.log("Camera started");

            await video.play();

            const mpCamera = new Camera.Camera(video, {
                onFrame: async () => {
                    await faceMesh.send({ image: video });
                },
                width: 640,
                height: 480
            });

            mpCamera.start();
        } catch (error) {
            console.error("Camera Error:", error);
        }
    });

    // ======= CAPTURE IMAGE =======
    captureBtn.addEventListener("click", () => {
        console.log("Capture clicked");
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    });

    // ======= CLEAR CANVAS =======
    clearBtn.addEventListener("click", () => {
        console.log("Clear clicked");
        ctx.clearRect(0, 0, canvas.width, canvas.height);
    });

    // ======= MEDIAPIPE FACEMESH =======
    const faceMesh = new FaceMesh.FaceMesh({
        locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`
    });

    faceMesh.setOptions({
        maxNumFaces: 1,
        refineLandmarks: true,
        minDetectionConfidence: 0.7,
        minTrackingConfidence: 0.5
    });

    faceMesh.onResults((results) => {
        console.log("FaceMesh result received");
        // Future Hologram overlays will go here
    });

});
