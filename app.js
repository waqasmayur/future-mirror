document.addEventListener("DOMContentLoaded", () => {
    console.log("DOM fully loaded");

    const startBtn = document.getElementById("startBtn");
    const stopBtn = document.getElementById("stopBtn");
    const saveBtn = document.getElementById("saveBtn");

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
