/**
 * Created with JetBrains WebStorm.
 * User: Den
 * Date: 10.05.14
 * Time: 19:26
 * To change this template use File | Settings | File Templates.
 */



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
    this.source = options.source;

   // console.log('options',options)

    this.frames = [];
    this.freeBuffers = [];
    this.source.on('video',this._newVideoFrame.bind(this));

    this._renderer();

    this.audioQueue = [];
    this.scheduled = [];
    this.maxScheduled = options.audioScheduleSize||100;
    this.source.on('audio',this._newAudioBuffer.bind(this));
}

Renderer.prototype._renderFrame = function(buf){
    var s = window.performance.now(),e;
    this.frameBuf.set(buf);
   e = window.performance.now();
 //  console.log(e-s);
    this.vctx.putImageData(this.imgData, 0, 0);
   // if(this.prevBuf) this.freeBuffers.push(this.prevBuf);
   // this.prevBuf = buf;
}

Renderer.prototype._newVideoFrame = function(buf){

    var
        arr = new window.Uint8Array(buf);
    if(!this.prevTimeStamp) this.prevTimeStamp = window.performance.now()+500; // delay playback for 500 ms so we always have enough buffers
    arr.timeStamp = this.prevTimeStamp+1000/this.fps;
    this.prevTimeStamp = arr.timeStamp;
    this.frames.push(arr);
}

Renderer.prototype._renderer = function(){
    if(this.stopped) return;
    var
        now = window.performance.now();
    if(!this.frames.length) console.log('no frames!');
    if(this.frames.length && this.frames[0].timeStamp<=now) {
        this._renderFrame(this.frames.shift());
    }
    window.requestAnimationFrame(this._renderer.bind(this));
}

function disconnectBuffSrc(){
    this.disconnect();
}

Renderer.prototype._newAudioBuffer = function(buf){
    var bufAsUint8Arr = new window.Uint8Array(/*buf.toArrayBuffer?buf.toArrayBuffer():*/buf),
        ab = new window.ArrayBuffer(buf.length),
        view = new window.Uint8Array(ab),
        float32Arr,abuf,buffSource,channelData,bufToSchedule;

   // try {
    view.set(bufAsUint8Arr);
    float32Arr = new window.Float32Array(ab);
    abuf = this.actx.createBuffer(1,float32Arr.length,48000),
    buffSource = this.actx.createBufferSource(),
    channelData = abuf.getChannelData(0);
    channelData.set(float32Arr);
    buffSource.buffer = abuf;
    buffSource.connect(this.actx.destination);

    if(!this.prevStopAt) this.prevStopAt = 0;
    buffSource.onended = disconnectBuffSrc.bind(buffSource);
    buffSource.startAt = this.prevStopAt;
    this.audioQueue.push(buffSource);


    if(!this.prevStopAt) this.prevStopAt = this.actx.currentTime;
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
/*    }

    catch(e){
        console.log('error in audio _newAudioBuffer',e);
    } */
}

Renderer.prototype.stop = function(){
    this.stopped = true;
}
Renderer.actx =  new window.webkitAudioContext();

exports.Renderer = Renderer;


