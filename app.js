const videoElement = document.getElementById('input_video');
const canvasElement = document.getElementById('overlay');
const canvasCtx = canvasElement.getContext('2d');
let camera = null;
let faceMesh = null;
let running = false;
const startBtn = document.getElementById('startBtn');
const stopBtn = document.getElementById('stopBtn');
const saveBtn = document.getElementById('saveBtn');
const cameraWrap = document.getElementById('cameraWrap');
let activeBg = 'car';
const bgMap = {
  none: '',
  car: 'url("assets/backgrounds/car.jpg") center/cover no-repeat',
  city: 'url("assets/backgrounds/city.jpg") center/cover no-repeat',
  lab: 'url("assets/backgrounds/lab.jpg") center/cover no-repeat'
};
function applyBackground(){ if(cameraWrap) cameraWrap.style.background = bgMap[activeBg] || 'transparent'; }
function setupFaceMesh(){ faceMesh = new FaceMesh.FaceMesh({locateFile:(file)=>`https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`}); faceMesh.setOptions({maxNumFaces:1,refineLandmarks:true,minDetectionConfidence:0.6,minTrackingConfidence:0.6}); faceMesh.onResults(onResults); }
startBtn && startBtn.addEventListener('click', async ()=>{ if(running) return; setupFaceMesh(); canvasElement.width = cameraWrap.clientWidth; canvasElement.height = cameraWrap.clientHeight; camera = new Camera.Camera(videoElement, { onFrame: async ()=>{ await faceMesh.send({image: videoElement}); }, width:1280, height:720 }); camera.start(); running = true; });
stopBtn && stopBtn.addEventListener('click', ()=>{ if(camera) camera.stop(); running=false; });
document.querySelectorAll('.chip').forEach(chip=>{ chip.addEventListener('click', ()=>{ if(chip.dataset.bg){ document.querySelectorAll('[data-bg]').forEach(c=>c.classList.remove('active')); chip.classList.add('active'); activeBg = chip.dataset.bg; applyBackground(); } if(chip.dataset.tool){ document.querySelectorAll('[data-tool]').forEach(c=>c.classList.remove('active')); chip.classList.add('active'); } }); });
function onResults(results){ if(!results.multiFaceLandmarks || results.multiFaceLandmarks.length===0){ canvasCtx.clearRect(0,0,canvasElement.width,canvasElement.height); return; } if(canvasElement.width !== cameraWrap.clientWidth || canvasElement.height !== cameraWrap.clientHeight){ canvasElement.width = cameraWrap.clientWidth; canvasElement.height = cameraWrap.clientHeight; } const landmarks = results.multiFaceLandmarks[0]; canvasCtx.clearRect(0,0,canvasElement.width,canvasElement.height); canvasCtx.fillStyle = 'rgba(200,160,255,0.06)'; for(let i=0;i<landmarks.length;i++){ const x = landmarks[i].x * canvasElement.width; const y = landmarks[i].y * canvasElement.height; canvasCtx.beginPath(); canvasCtx.arc(x,y,1,0,Math.PI*2); canvasCtx.fill(); } }