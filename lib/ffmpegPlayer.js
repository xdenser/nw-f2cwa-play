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
       '-ac','1'
   ],
   ffmpegPath = path.join(__dirname,'..','vendor','ffmpeg');

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
}

Player.prototype._startServers = function(){
    this.videoSrv = net.createServer(function(c){
        c.on('data', this._videoData.bind(this));
        c.on('error',function(err){
           console.log('video connection error',err);
        });
    }.bind(this));
    this.audioSrv = net.createServer(function(c){
        c.on('data', this._audioData.bind(this));
        c.on('error',function(err){
            console.log('audio connection error',err);
        });
    }.bind(this));
    this.videoSrv.listen(this.videoPort);
    this.audioSrv.listen(this.audioPort);
}

Player.prototype.playFile = function(fileName,skip){
    var args = skip?['-ss',skip]:[];
    args =  args.concat(['-re','-i',fileName],videoArgs,this.videoDest,audioArgs,this.audioDest);
    this.currentSrc = fileName;
    this.proc = child_process.spawn(this.ffmpegPath,args);
    this.proc.stderr.on('data',this._stderr.bind(this));
}

Player.prototype._stderr = function(data){
    //console.log(data.toString());
    if(!this.metaReceived){
        if(!this.output) this.output = '';
        this.output += data.toString();
    var
        size = /Video: .+ (\d+)x(\d+)/.exec(this.output),
        fps = /Video: .+, ([0-9.]+) fps,/.exec(this.output);

    if(size && !fps){
      if(!this._fpsMiss) this._fpsMiss=1;
      if(this._fpsMiss++ == 2) fps = 25;
    }

    if(size && fps) {
        this.width = parseInt(size[1]);
        this.height = parseInt(size[2]);
        this.fps = parseFloat(fps[1]);
        this.createBuffers();
        this.createRenderer();
        this.metaReceived = true;
    }
    }
}

Player.prototype.createBuffers = function(){
    if(!this.frames.length){
        for(var i=0; i<this.frameCount;i++){
            this.frames.push(new FrameBuffer(this.width,this.height));
        }
    }
}

Player.prototype._videoData = function(data){
    //console.log(data.length,this.frames.length)
    if(!this.frames.length) return;

    if(!(this.currFrame>=0)) this.currFrame = 0;
    this.frames[this.currFrame].append(data,function(ready,addData){
        if(ready){
            this.emit('video',this.frames[this.currFrame].buffer);
            this.currFrame++;
            if(this.currFrame==this.frames.length)  this.currFrame = 0;
            if(addData) this._videoData(addData);
        }
    }.bind(this))
}

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
        source: this
    });
}

Player.prototype.stop = function(){
    if(this.renderer) this.renderer.stop();
    this.proc.kill();
    this.videoSrv.close();
    this.audioSrv.close();
}

exports.Player = Player;