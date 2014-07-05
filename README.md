nw-f2cwa-play
=============

Ffmpeg to Canvas and Web Audio media playback for Node WebKit.


You will need ffmpeg to run this.

Install with 
 `npm install nw-f2cwa-play`

then go to `node_modules/memcpy`
 and build memcpy module for your Node-Webkit version with nw-gyp
 see [Node Webkit WiKi article](https://github.com/rogerwang/node-webkit/wiki/Build-native-modules-with-nw-gyp).
 
 Binary memcpy gives great performance boost alowing to play 1080p@60Hz movies.
 Have not tried 4K.
 As for time of writing this text memcpy was compiling successfully only for NW version <=0.8.X .
 nw-f2cwa-play will use pure JS less performant fallback if binary memcpy not available.

 
Under Windows place ffmpeg.exe into `vendor` directory or
on any platform pass ffmpeg path to player as option.

```
var
  Player = require('nw-f2cwa-play').Player,
  player;

player = new Player({
  selector:'#cnv', // selector for canvas to render video
  ffmpegPath: 'ffmpeg' // in case ffmpeg is available on standard path
});

player.openSrc('udp://@239.0.1.2:1234'); // pass stream url (rtp, udp, http ... anything supported by ffmpeg) or file path

// auto start playback
player.on('canplay',function(){
          player.play();
})

player.on('time',function(time){
  // time is current stream time in seconds
});

```


Seeking for streams allowing seeking (mostly files) is also supported:

1. Use `player.openSrc(url,startPos);` to start playback from needed pos. startPos expressed in seconds.
2. Use `player.seek(seekPos);` seekPos is also expressed in seconds.


See sample App.

This is experiment as for now. May produce unexpected results.
Only files/streams with audio are supported, audio is also downsampled to mono for simpler processing.
