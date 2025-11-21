document.addEventListener("DOMContentLoaded", () => {
    console.log("Future Mirror Loaded");

    const startBtn = document.getElementById("startBtn");
    const stopBtn = document.getElementById("stopBtn");
    const saveBtn = document.getElementById("saveBtn");

    // FIXED: match IDs exactly from your HTML
    const video = document.getElementById("input_video");
    const canvas = document.getElementById("overlay");

    if (!canvas) {
        console.error("Canvas #overlay NOT FOUND!");
        alert("Canvas element missing!");
        return;
    }

    const ctx = canvas.getContext("2d");
    console.log("Canvas loaded, context OK");

    startBtn.addEventListener("click", () => {
        console.log("Start clicked");
        alert("Start clicked — JS is working!");
    });

    stopBtn.addEventListener("click", () => {
        console.log("Stop clicked");
    });

    saveBtn.addEventListener("click", () => {
        console.log("Save clicked");
    });
});
