nw-f2cwa-play
=============

Ffmpeg to Canvas and Web Audio media playback for Node WebKit.

You will need ffmpeg to run this.
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
