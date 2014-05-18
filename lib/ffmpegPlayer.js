/**
 * Created with JetBrains WebStorm.
 * User: Den
 * Date: 10.05.14
 * Time: 11:46
 * To change this template use File | Settings | File Templates.
 */
var
   events = require('events'),
   util = require('util'),
   child_process=require('child_process'),
   net = require('net'),
   path = require('path'),
   Renderer = require('./renderer').Renderer,
   videoArgs = [
       '-f', 'image2pipe',
       '-pix_fmt', 'bgr32',
       '-vcodec','rawvideo'
   ],
   audioArgs = [
       '-f', 's16le',
       '-acodec', 'pcm_f32le',
       '-ar', '48000',
       '-ac','1'
   ],
   ffmpegPath = path.join(__dirname,'..','vendor','ffmpeg'),
   maxFrames = 100;

function AgregateBuffer(size){
    this.buffer = new Buffer(size);
    this.pos = 0;
}

AgregateBuffer.prototype.append = function(buf,cb){
    var toWrite = Math.min(buf.length,this.buffer.length-this.pos);
    buf.copy(this.buffer,this.pos,0,toWrite);
    this.pos +=  toWrite;
    var ready = this.pos==this.buffer.length;
    if(ready) this.pos = 0;
    cb(ready,toWrite<buf.length?buf.slice(toWrite):null);

}
util.inherits(FrameBuffer,AgregateBuffer);
function FrameBuffer(w,h){
    AgregateBuffer.call(this,w*h*4);
}

util.inherits(AudioBuffer,AgregateBuffer);
function AudioBuffer(duration,rate,channels){
    rate = rate||48000;
    channels = channels||1;
    AgregateBuffer.call(this,Math.floor(duration*rate*channels));
}


util.inherits(Player,events.EventEmitter)
function Player(options){
    events.EventEmitter.call(this);
    options = options || {};

    this.frameCount = options.frameCount||25;
    this.frames = [];
    this.ffmpegPath = options.ffmpegPath||ffmpegPath;

    this.audioBuffers = [new AudioBuffer(2),new AudioBuffer(2),new AudioBuffer(2)];

    this.selector = options.selector;

    this.videoPort = options.videoPort||35898;
    this.videoDest = 'tcp://127.0.0.1:'+this.videoPort;
    this.audioPort = options.audioPort||35899;
    this.audioDest = 'tcp://127.0.0.1:'+this.audioPort;
    this._startServers();
    this.paused = true;
}

Player.prototype._startServers = function(){
    this.videoSrv = net.createServer(function(c){
        this._videoStream = c;
        this._videoData(new Buffer(0));
        c.on('data', this._videoData.bind(this));
        c.on('error',function(err){
           console.log('video connection error',err);
        });
    }.bind(this));
    this.audioSrv = net.createServer(function(c){
        this._audioStream = c;
        c.on('data', this._audioData.bind(this));
        c.on('error',function(err){
            console.log('audio connection error',err);
        });
    }.bind(this));
    this.videoSrv.listen(this.videoPort);
    this.audioSrv.listen(this.audioPort);
}

Player.prototype.openSrc = function(fileName,skip){
    var args = skip?['-ss',skip]:[];
    args =  args.concat(['-i',fileName],videoArgs,this.videoDest,audioArgs,this.audioDest);
    this.currentSrc = fileName;
    this.proc = child_process.spawn(this.ffmpegPath,args);
    this.proc.stderr.on('data',this._stderr.bind(this));
    this.proc.on('exit',function(){
        console.log('proc exit');
    })
}


function parseDuration(str){
    if(str=='N/A') return 0;
    var t = /([0-9]+):([0-9]+):([0-9]+.[0-9]+)/.exec(str);
    if(t){
        return parseInt(t[1],10)*60*60+parseInt(t[2],10)*60+parseFloat(t[3]);
    }
}

Player.prototype._stderr = function(data){
    //console.log(data.toString());
    if(!this.metaReceived){
        if(!this.output) this.output = '';
        this.output += data.toString();
     var
        size = /Video: .+ (\d+)x(\d+)/.exec(this.output),
        fps = /Video: .+, ([0-9.]+) fps,/.exec(this.output),
        duration = /Duration: ([0-9\.:]+|N\/A),/.exec(this.output);

     if(size && !fps){
       if(!this._fpsMiss) this._fpsMiss=1;
       if(this._fpsMiss++ == 2) fps = 25;
     }

        // Duration: 01:47:01.68

     if(size && fps && duration) {
        this.width = parseInt(size[1]);
        this.height = parseInt(size[2]);
        this.fps = parseFloat(fps[1]);
        this.duration = parseDuration(duration[1]);
        this.createRenderer();
        this.metaReceived = true;
        this.emit('canplay');
     }
    }
}

Player.prototype._videoData = function(data){
    var currPos = 0, currBuffer, frameCount = 0,
        freeBuffers = [];
    console.log('first call');
    this._videoData = function(data){
        var
            buffer = currBuffer || freeBuffers.shift() || (this.metaReceived ? new window.Uint8Array(this.width*this.height*4):null),
            toWrite;

        if(!buffer) return currPos+=data.length;
        if(!buffer.reuse) buffer.reuse = function(){
            freeBuffers.push(this);
        };

        currPos = currPos % buffer.length;
        toWrite = Math.min(data.length,buffer.length-currPos);
        buffer.set(data.slice(0,toWrite),currPos); // very inefficient, needs fast way to convert Node Buffer to ArrayBuffer
        currPos += toWrite;
       // console.log(data.length,currPos,freeBuffers.length,buffer.length);

        if(currPos == buffer.length){
            currBuffer = null;
            buffer.frameNumber = frameCount++;
            this.emit('video',buffer);
            currPos = 0;
        } else currBuffer = buffer;

        if(toWrite<data.length) {
            process.nextTick(this._videoData.bind(this,data.slice(toWrite)));
        }
    };
    this._videoData(data);
};

Player.prototype._audioData = function(data){
    if(!this.audioBuffers.length) return;
    if(!(this.currABuf>=0)) this.currABuf = 0;
    this.audioBuffers[this.currABuf].append(data,function(ready,addData){
        if(ready){
            this.emit('audio',this.audioBuffers[this.currABuf].buffer);
            this.currABuf++;
            if(this.currABuf==this.audioBuffers.length)  this.currABuf = 0;
            if(addData) this._audioData(addData);
        }
    }.bind(this))
}

Player.prototype.createRenderer = function(){
    this.renderer = new Renderer({
        canvas: this.selector,
        width: this.width,
        height: this.height,
        fps: this.fps,
        player: this
    });

    this.timeUpdaterId = setInterval(function(){
        if(this.renderer.currentTime>=0) this.emit('time',this.renderer.currentTime);
    }.bind(this),1000);
}

Player.prototype.stop = function(){
    if(this.renderer) this.renderer.stop();
    this.proc.kill();
    this.videoSrv.close();
    this.audioSrv.close();
    clearInterval(this.timeUpdaterId);
}

Player.prototype.pauseRead = function(){
    if(this._videoStream) this._videoStream.pause();
    if(this._audioStream) this._audioStream.pause();
    this.readPaused = true;
    console.log('pause read');
}

Player.prototype.resumeRead = function(){
    if(this._videoStream) this._videoStream.resume();
    if(this._audioStream) this._audioStream.resume();
    this.readPaused = false;
    console.log('resume read');
}

Player.prototype.pause = function(){
    if(this.renderer) this.renderer.pause();
    this.paused = true;
}

Player.prototype.play = function(){
    if(this.renderer) this.renderer.play();
    this.paused = false;
}

exports.Player = Player;