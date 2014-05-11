nw-f2cwa-play
=============

Ffmpeg to Canvas and Web Audio media playback for Node WebKit.

You will need ffmpeg to run this.
Under Windows place ffmpeg.exe into `vendor` directory or
on any platform pass ffmpeg path to player as option.

```
var player = new Player({
  selector:'#cnv', // selector for canvas to render video
  ffmpegPath: 'ffmpeg' // in case ffmpeg is available on standard path
});

player.playFile('udp://@239.0.1.2:1234');
```

See sample App.

This is experiment as for now. May produce unexpected results.
There are problems playing avi files for example (some codecs produce BGRA frames, with zero alpha channel,
 so you'll see no video on canvas).
Try mkv first.
