const videoElement = document.getElementById('input_video');
const canvasElement = document.getElementById('overlay');
const canvasCtx = canvasElement.getContext('2d');
let running=false;
const startBtn=document.getElementById('startBtn');
const stopBtn=document.getElementById('stopBtn');
const saveBtn=document.getElementById('saveBtn');
let camera=null;
let faceMesh=null;
function setupFaceMesh(){
  faceMesh=new FaceMesh.FaceMesh({locateFile:(file)=>`https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`});
  faceMesh.setOptions({maxNumFaces:1,refineLandmarks:true,minDetectionConfidence:0.6,minTrackingConfidence:0.6});
  faceMesh.onResults(onResults);
}
startBtn.addEventListener('click',async()=>{
  if(running)return;
  setupFaceMesh();
  camera=new Camera.Camera(videoElement,{onFrame:async()=>{await faceMesh.send({image:videoElement});},width:1280,height:720});
  camera.start();running=true;
});
stopBtn.addEventListener('click',()=>{if(camera)camera.stop();running=false;});
saveBtn.addEventListener('click',()=>{alert('Save HoloShot clicked — implement download logic here');});
function onResults(results){canvasCtx.clearRect(0,0,canvasElement.width,canvasElement.height);if(results.multiFaceLandmarks){
  // draw key overlays here
}}