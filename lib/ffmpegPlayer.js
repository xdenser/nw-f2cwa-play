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
   memcpy = require('node-memcpy'),
   Renderer = require('./renderer').Renderer,
   videoArgs = [
       '-copyts',
       '-f', 'image2pipe',
       '-pix_fmt', 'bgr32',
       '-vcodec','rawvideo'
   ],
   audioArgs = [
       '-f', 's16le',
       '-acodec', 'pcm_f32le',
       '-ar', '48000',
       '-ac','1',
       '-af', 'ashowinfo'
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
    console.log('new abuffer');
    AgregateBuffer.call(this,Math.floor(duration*rate)*channels*4);
}


util.inherits(Player,events.EventEmitter)
function Player(options){
    events.EventEmitter.call(this);
    options = options || {};

    this.frameCount = options.frameCount||25;
    this.frames = [];
    this.freeBuffers = [];
    this.ffmpegPath = options.ffmpegPath||ffmpegPath;
    this.autoDownScale = options.autoDownScale||options.autoDownScale!==false;
    this.autoDownScaleTimeout = options.autoDownScaleTimeout||20000;

    this.audioBuffers = [];

    this.selector = options.selector;

    this.videoPort = options.videoPort||35898;
   // this.videoDest = 'tcp://127.0.0.1:'+this.videoPort;
    var pSfx = Date.now()+'';
    this.videoDest = '\\\\.\\pipe\\video'+pSfx;
    this.audioPort = options.audioPort||35899;
    //this.audioDest = 'tcp://127.0.0.1:'+this.audioPort;
    this.audioDest = '\\\\.\\pipe\\audio'+pSfx;
    this._startServers();
    this.frameCount = 0;

    this.aSampleCount = 0;
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
  //  this.videoSrv.listen(this.videoPort);
    this.videoSrv.listen(this.videoDest);
  //  this.audioSrv.listen(this.audioPort);
    this.audioSrv.listen(this.audioDest);
}

Player.prototype.openSrc = function(fileName,skip,vsize){
    var args = skip?['-ss',skip]:[];
    args =  args.concat(['-y','-i',fileName,'-threads','0'],videoArgs,'-vf',vsize?('[in]showinfo, scale=-1:'+vsize+'[out]'):'showinfo',this.videoDest,audioArgs,this.audioDest);
    this.currentSrc = fileName;
    this.proc = child_process.spawn(this.ffmpegPath,args);
    this.proc.stdout.on('data',function(data){
      console.log('stdout',data.toString());
    });
    this.proc.stderr.on('data',this._stderr.bind(this));
    this.proc.on('exit',function(){
        console.log('proc exit');
        console.log(this.output);
    }.bind(this));
}


function parseDuration(str){
    if(str=='N/A') return 0;
    var t = /([0-9]+):([0-9]+):([0-9]+.[0-9]+)/.exec(str);
    if(t){
        return parseInt(t[1],10)*60*60+parseInt(t[2],10)*60+parseFloat(t[3]);
    }
}

Player.prototype._stderr = function(data){
    var dataStr = data.toString(),info, ainfo;
   // console.log(dataStr);
    if(!this.metaReceived){
        if(!this.output) this.output = '';
        this.output += dataStr;
     var
        size = /Video: rawvideo.+ (\d+)x(\d+)/.exec(this.output),
        tbr = /Video: .+, ([0-9.]+) tbr,/.exec(this.output),
        tbn = /Video: .+, ([0-9.k]+) tbn,/.exec(this.output),
        fps =  /Video: .+, ([0-9.]+) fps,/.exec(this.output)||tbr,
        duration = /Duration: ([0-9\.:]+|N\/A),/.exec(this.output);


     if(size && !fps){
       if(!this._fpsMiss) this._fpsMiss=1;
       if(this._fpsMiss++ == 5){
           console.log('fps ?')
           fps = [0,25];
           tbn = [0,'notbn']
       }
     }

        // Duration: 01:47:01.68

     if(size && fps && duration && tbn) {
        this.width = parseInt(size[1],10);
        this.height = parseInt(size[2],10);

        this.fps = parseFloat(fps[1]);
        this.tbn = parseInt(tbn[1].replace('k','000'),10);
        console.log(this.fps,this.tbn,this.width,this.height);
        this.duration = parseDuration(duration[1]);
        this.createRenderer();
        this.metaReceived = true;
        this.emit('canplay');
     }
    }
    if(this.metaReceived){
      var
          ibeg = /\[Parsed_showinfo_0/.exec(dataStr),
          abeg = /\[Parsed_ashowinfo_0/.exec(dataStr),
          rfps = /fps= ?([0-9]+)/.exec(dataStr);
      if(ibeg) this.output = dataStr;
      else this.output += dataStr;

      if(rfps) console.log('reported fps',rfps[1]);
      //console.log(dataStr);
      info = /\[Parsed_showinfo_0 .+n:([0-9]+) pts:([0-9]+) pts_time:([0-9.]+)/.exec(this.output);
      if(info){
            this.output = '';
          //  console.log('frame:',info[1],'pts',info[2],'pts_time',info[3]);
            this._currFrameNum = parseInt(info[1],10);
            this._currFramePts = (isNaN(this.tbn)||!this.tbn)?(parseFloat(info[3])*1000):(parseInt(info[2],10)*1000/this.tbn);// parseInt(info[2],10);
            return;
      }
      if(abeg)  this.output = dataStr;
      else this.output += dataStr;
      ainfo = /\[Parsed_ashowinfo_0 .+n:([0-9]+) pts:([0-9]+)/.exec(this.output);
      if(ainfo){
        //  console.log('aframe:',ainfo[1],'pts',ainfo[2]);
          this.currentAPTS = parseInt(ainfo[2]);
      }
        /*
        [Parsed_showinfo_0 @ 028535e0] n:107 pts:3350347 pts_time:3350.35 pos:2806475048 fmt:yuv420p sar:1/1 s:1280x536 i:P iskey:0 type:P checksum:5CC4B392 plane_checksum:[DE125585 6B2F31C

        [Parsed_ashowinfo_0 @ 0290c5a0] n:280 pts:1023137395 pts_time:21315.4 pos:-1 fmt:s16p channels:2 chlayout:stereo rate:48000 nb_samples:1152 checksum:DF545ABE plane_checksums: [ 01DA369B 4DB52423 ]
         */

    }
}

Player.prototype._videoData = function(data){
    var currPos = 0, self = this,
        maxBuffers = 1,
        intData = [];

    intData._len = 0;
    this._videoData = function(data){
        if(!data.length) return;
        if(!this._videoStream) return;

        intData.push(data);
        intData._len += data.length;
        if(intData.length==maxBuffers){
            data = Buffer.concat(intData,intData._len);
            intData = [];
            intData._len = 0;
        } else return;

        var
            buffer = this.currBuffer || (currPos=0,this.freeBuffers.shift()) || (this.metaReceived ? new window.Uint32Array(this.width*this.height):null),
            toWrite, i, o, s,e;

        if(!buffer) return currPos+=data.length>>2;
        if(!buffer.reuse) buffer.reuse = function(){
            self.freeBuffers.push(this);
        };


        currPos = currPos % buffer.length;
        i = toWrite = Math.min(data.length>>2,buffer.length-currPos);
       // s = process.hrtime();
       if(!memcpy.binding) while(i--){
          o=i<<2;
          buffer[currPos+i] = ((data[o]) |
              (data[o + 1] << 8) |
              (data[o + 2] << 16)) +
              (data[o + 3] * 0x1000000);
        }
       else {
           if(!buffer._uint8a) buffer._uint8a = new window.Uint8Array(buffer.buffer);
           memcpy(buffer._uint8a,currPos<<2,data,0,toWrite<<2);
       }
        //buffer.set(data.slice(0,toWrite),currPos); // very inefficient, needs fast way to convert Node Buffer to ArrayBuffer
       // e = process.hrtime(s);
       // console.log(e[0]+e[1]/1e9,toWrite);

        currPos += toWrite;
       // console.log(data.length,currPos,freeBuffers.length,buffer.length);

        if(currPos == buffer.length){
            this.currBuffer = null;
            buffer.frameNumber = this._currFrameNum;//this.frameCount++;
            buffer.framePts = this._currFramePts;
         //   console.log('frame ',this._currFramePts);
            this.emit('video',buffer);
            currPos = 0;
        } else this.currBuffer = buffer;

        if((toWrite)<data.length) {
            process.nextTick(this._videoData.bind(this,data.slice(toWrite<<2)));
        }
    };
    this._videoData.reset = function(){
        intData = [];
        intData._len = 0;
    }
    this._videoData(data);
};

Player.prototype._audioData = function(data){
    if(!this.metaReceived) return;
    if(!this._audioStream) return;
   // console.log('adata',this.aframeCount++);
    var abuf = this.currABuf || this.audioBuffers.shift() || new AudioBuffer(5/this.fps);
    if(!this.aSampleCount) this.aSampleCount = this.currentAPTS||0;
    abuf.append(data,function(ready,addData){
        if(ready){
            //console.log('ready',this.aSampleCount);
            abuf.pts = this.aSampleCount;
            this.emit('audio',abuf);
            this.aSampleCount += abuf.buffer.length>>2;
            this.currABuf = null;
            if(addData) this._audioData(addData);
        } else this.currABuf = abuf;
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

Player.prototype.seek = function(pos){
    pos = parseFloat(pos);
    if(!this.duration || isNaN(pos)) return;
    if(!this.proc) return;
    this.proc.kill();
    this._videoStream = null;
    this._audioStream = null;
    this.currABuf = null;
    this.currBuffer = null;
    this._videoData.reset();
    this.frameCount = 0;
    this.aSampleCount = 0;
    this.renderer.reset();
    this.openSrc(this.currentSrc,pos.toFixed(3),this.downScaled);
}

Player.prototype.downScale = function(pos){
    var nsize;

    this.proc.kill();
    if(this.renderer){
        this.renderer.stop();
        clearInterval(this.timeUpdaterId);
    }
    this._videoStream = null;
    this._audioStream = null;
    this.currABuf = null;
    this.currBuffer = null;
    this.frames = [];
    this.freeBuffers = [];
    this.frameCount = 0;
    this.aSampleCount = 0;
    this.metaReceived = false;
    if(this.height>720) nsize = 720;
    else if(this.height>480) nsize = 480;
    else if(this.height>240) nsize = 240;
    this.openSrc(this.currentSrc,pos.toFixed(3),nsize);
    this.downScaled = nsize;
}

exports.Player = Player;