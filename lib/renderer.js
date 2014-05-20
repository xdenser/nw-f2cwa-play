/**
 * Created with JetBrains WebStorm.
 * User: Den
 * Date: 10.05.14
 * Time: 19:26
 * To change this template use File | Settings | File Templates.
 */
var
   maxFrames = 50;


function Renderer(options){

    this.canvas = window.document.querySelector(options.canvas);
    if(!this.canvas) return console.log('no canvas!');
    this.width = options.width;
    this.height = options.height;
    this.canvas.width = this.width;
    this.canvas.height = this.height;
    this.vctx = this.canvas.getContext("2d");
    this.imgData = this.vctx.getImageData(0,0,this.width,this.height);
   // console.log('imgData',this.imgData.data);
    this.frameBuf = new window.Uint8Array(this.imgData.data.buffer);
    this.fps = options.fps;
    this.actx = Renderer.actx; //new window.webkitAudioContext();
    this.player = options.player;
    this.paused = true;

   // console.log('options',options)

    this.frames = [];
    this.player.on('video',this._newVideoFrame.bind(this));


    this.audioQueue = [];
    this.scheduled = [];
    this.maxScheduled = options.audioScheduleSize||100;
    this.player.on('audio',this._newAudioBuffer.bind(this));

}

Renderer.prototype._renderFrame = function(buf){
    var s = window.performance.now(), e,asamp, calcStart;
    this.frameBuf.set(buf);
    e = window.performance.now();
 //  console.log(e-s);
    if(!this._startTime) this._startTime = e;
    this.currentTime = buf.frameNumber * 1/this.fps;
    //console.log('asamp',this.audioQueue.length,((this.currentTime+3/this.fps),(this.audioQueue[0].sampleNum*1/this.fps)));
    while(this.audioQueue.length && ((this.currentTime+1)>=(this.audioQueue[0].sampleNum*1/this.fps))){
        asamp = this.audioQueue.shift();
        calcStart = this.actx.currentTime + (asamp.sampleNum*1/this.fps-this.currentTime);
        if(!this.prevStartAt) asamp.startAt = calcStart;
        else {
            asamp.startAt = this.prevStartAt+1/this.fps;
            if(Math.abs(asamp.startAt-calcStart)>0.04){
                console.log('reset time',asamp.startAt,calcStart)
                asamp.startAt = calcStart;
            }
        }
        this.prevStartAt = asamp.startAt;
        asamp.start(asamp.startAt);
       // console.log('schedule audio',asamp.startAt,asamp.buffer.length);

        while(this.scheduled.length && (this.scheduled[0].startAt < this.actx.currentTime)) {
            this.scheduled.shift();
        }
        this.scheduled.push(asamp);
    }
    this.vctx.putImageData(this.imgData, 0, 0);
    buf.reuse();
}

Renderer.prototype._newVideoFrame = function(buf){
    this.frames.push(buf);
    if(this.frames.length>maxFrames) this.player.pauseRead();
}

Renderer.prototype._renderer = function(){
    if(this.stopped || this.paused) return;
    var
        now = window.performance.now();
    if(!this.frames.length) console.log('no frames!');
    if(this.frames.length && now>=(this._startedAt + this.frames[0].frameNumber*1000/this.fps)) {
       // console.log('render frame',this.frames[0].frameNumber);
        this._renderFrame(this.frames.shift());
    }
    window.requestAnimationFrame(this._renderer.bind(this));
    if(this.frames.length<(maxFrames/2) && this.player.readPaused) this.player.resumeRead();
}

function disconnectBuffSrc(){
    this.disconnect();
}

Renderer.prototype._newAudioBuffer = function(buf){
    var bufAsUint8Arr = new window.Uint8Array(/*buf.toArrayBuffer?buf.toArrayBuffer():*/buf.buffer),
        ab = new window.ArrayBuffer(buf.buffer.length),
        view = new window.Uint8Array(ab),
        float32Arr,abuf,buffSource,channelData;

   // try {
    view.set(bufAsUint8Arr);
    float32Arr = new window.Float32Array(ab);
    abuf = this.actx.createBuffer(1,float32Arr.length,48000),
    buffSource = this.actx.createBufferSource(),
    channelData = abuf.getChannelData(0);
    channelData.set(float32Arr);
    buffSource.buffer = abuf;
    buffSource.connect(this.actx.destination);

    if(!this.audioSampleNum) this.audioSampleNum = 0;
    buffSource.onended = disconnectBuffSrc.bind(buffSource);
    buffSource.sampleNum = this.audioSampleNum++;
    this.audioQueue.push(buffSource);
    this.player.audioBuffers.push(buf);
 /*
    if(!this.prevStopAt) this.prevStopAt = this.actx.currentTime+0.5; //delay sound so as video
    this.prevStopAt += float32Arr.length/48000;


    while(this.scheduled.length && (this.scheduled[0].startAt < this.actx.currentTime)) {
        this.scheduled.shift();
    }
    while(this.scheduled.length<this.maxScheduled) {
        bufToSchedule = this.audioQueue.shift();
        if(bufToSchedule) {
            bufToSchedule.start(bufToSchedule.startAt);
            this.scheduled.push(bufToSchedule);
        } else break;
    }
    this.checkAudioQueue();
    */
/*    }

    catch(e){
        console.log('error in audio _newAudioBuffer',e);
    } */
}

Renderer.prototype.checkAudioQueue = function(){
    var
        bufToSchedule;
    while(this.scheduled.length && (this.scheduled[0].startAt < this.actx.currentTime)) {
        this.scheduled.shift();
    }
    while(this.scheduled.length<this.maxScheduled) {
        bufToSchedule = this.audioQueue.shift();
        if(bufToSchedule) {
            bufToSchedule.start(bufToSchedule.startAt);
            this.scheduled.push(bufToSchedule);
        } else break;
    }
}

Renderer.prototype.play = function(){
    this.paused = false;
    this._startedAt = window.performance.now()-(this.currentTime||0)*1000 + 300;
    this.prevStopAt = this.audioQueue.reduce(function(prevStopAt,buff){
        buff.startAt = prevStopAt;
        return prevStopAt + buff.buffer.length/48000;
    },this.actx.currentTime+0.5);
    this._renderer();
}

Renderer.prototype.pause = function(){
    this.paused = true;

    // remove all started
    this.scheduled.forEach(function(buffSrc){ buffSrc.stop(); buffSrc.disconnect();});
    this.scheduled =[];

}

Renderer.prototype.stop = function(){
    this.stopped = true;
    this.scheduled.forEach(function(buffSrc){ buffSrc.stop(); buffSrc.disconnect(); });
    this.scheduled = [];
}
Renderer.actx =  new window.webkitAudioContext();

exports.Renderer = Renderer;


