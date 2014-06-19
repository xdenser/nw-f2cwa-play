/**
 * Created with JetBrains WebStorm.
 * User: Den
 * Date: 10.05.14
 * Time: 19:26
 * To change this template use File | Settings | File Templates.
 */
var
   maxFrames = 200;


function Renderer(options){

    this.canvas = window.document.querySelector(options.canvas);
    if(!this.canvas) throw new Error('no canvas found for rendering!');
    this.width = options.width;
    this.height = options.height;
    this.canvas.width = this.width;
    this.canvas.height = this.height;
    this.vctx = this.canvas.getContext("2d");
    this.imgData = this.vctx.getImageData(0,0,this.width,this.height);
    this.frameBuf = new window.Uint32Array(this.imgData.data.buffer);
    this.fps = options.fps;
    this.actx = Renderer.actx; //new window.webkitAudioContext();
   // console.log(this.actx.sampleRate);
    this.player = options.player;
    this.paused = true;
    this._timeCorrections = 0;


    this.frames = [];
    this.player.on('video',this._newVideoFrame.bind(this));


    this.audioQueue = [];
    this.scheduled = [];
    this.maxScheduled = options.audioScheduleSize||100;
    this.player.on('audio',this._newAudioBuffer.bind(this));

}

var psamppts=0;
Renderer.prototype._renderFrame = function(buf){
    this.currentTime = buf.framePts/1000;
    this.frameBuf.set(buf);
    this.vctx.putImageData(this.imgData, 0, 0);
    buf.reuse();
}

Renderer.prototype._renderAFrames = function(streamTime){
    var
        startTime, endTime, aSample;

    while(this.audioQueue.length && (streamTime+2000)>=(this.audioQueue[0].pts/48)){
        aSample = this.audioQueue.shift();
        startTime = aSample.pts/48;
        endTime = startTime + aSample.tlen;
        if(streamTime<=startTime){
            aSample.start(this.actx.currentTime+(startTime-streamTime)/1000);
            this.scheduled.push(aSample);
        }
        else {
            if(!this.scheduled.length &&  (streamTime - startTime) > 100){
                console.log('resync',streamTime,this.currentTime);
                this._startedAt = 0;
                if(this.player.autoDownScale) {
                    if(this._timeCorrections++>5) {
                        //   console.log('auto downscale');
                        this.player.downScale(this.currentTime); // downscale video as probably frame processing takes too much time and rendering speed is too slow
                        return;
                    }
                    clearTimeout(this._tcid);
                    this._tcid = setTimeout(function(){
                        this._timeCorrections = 0;
                    }.bind(this),this.player.autoDownScaleTimeout);
                }
            }
            aSample.disconnect();
        }
    }
    while(this.scheduled.length && (this.scheduled[0].playbackState==3)) {
        this.scheduled[0].disconnect();
        this.scheduled.shift();
    }
}

Renderer.prototype._newVideoFrame = function(buf){
    this.frames.push(buf);
    if(this.frames.length>maxFrames) this.player.pauseRead();
}

Renderer.prototype._renderer = function(){
    if(this.stopped || this.paused) return;
    var
        now = this.actx.currentTime*1000,streamTime;
      //  now = window.performance.now(),streamTime; // when there is no audio use this timesource

    if(!this._startedAt && this.frames.length) this._startedAt =  now-this.frames[0].framePts+300;
    if(this._startedAt) streamTime = now - this._startedAt;
    while(this.frames.length && (streamTime>=this.frames[0].framePts)) {
      //  console.log(this.frames.length,streamTime,this.frames[0].framePts);
        this._renderFrame(this.frames.shift(),streamTime);

    }
    this._renderAFrames(streamTime);
    window.requestAnimationFrame(this._renderer.bind(this));
    if(this.frames.length<(maxFrames*2/3) && this.player.readPaused) this.player.resumeRead();
}

function disconnectBuffSrc(){
    this.disconnect();
    this.playbackState = 3;
}

Renderer.prototype._newAudioBuffer = function(buf){
    var bufAsUint8Arr = new window.Uint8Array(/*buf.toArrayBuffer?buf.toArrayBuffer():*/buf.buffer),
        //ab = new window.ArrayBuffer(buf.buffer.length),
        //view = new window.Uint8Array(bufAsUint8Arr.buffer),
        float32Arr,abuf,buffSource,channelData;

   // try {
    //view.set(bufAsUint8Arr);
    float32Arr = new window.Float32Array(bufAsUint8Arr.buffer);
    abuf = this.actx.createBuffer(1,float32Arr.length,48000),
    buffSource = this.actx.createBufferSource(),
    buffSource.pts = buf.pts;
    channelData = abuf.getChannelData(0);
    channelData.set(float32Arr);
    buffSource.buffer = abuf;
    buffSource.connect(this.actx.destination);

    if(!this.audioSampleNum) this.audioSampleNum = 0;
   // buffSource.onended = disconnectBuffSrc.bind(buffSource);
    buffSource.sampleNum = this.audioSampleNum++;
    //console.log('buffSource.pts',buffSource,this.actx.currentTime);
    buffSource.tlen = float32Arr.length/48;
    this.audioQueue.push(buffSource);
    this.player.audioBuffers.push(buf);

}


Renderer.prototype.play = function(){
    this.paused = false;
    this._renderer();
}

Renderer.prototype.pause = function(){
    this.paused = true;
    this._startedAt = 0;
    // remove all started
    this.scheduled.forEach(function(buffSrc){ buffSrc.stop(0); buffSrc.disconnect();});
    this.scheduled =[];

}

Renderer.prototype.stop = function(){
    this.stopped = true;
    this.scheduled.forEach(function(buffSrc){ buffSrc.stop(0); buffSrc.disconnect(); });
    this.scheduled = [];
}

Renderer.prototype.reset = function(){
  this.audioSampleNum = 0;
  this.audioQueue = [];
  this.frames = [];
  this.scheduled.forEach(function(as){
     as.stop(0);
     as.disconnect();
  })
  this.scheduled = [];
  this._startedAt = 0;
}

Renderer.actx =  new window.webkitAudioContext();

exports.Renderer = Renderer;


