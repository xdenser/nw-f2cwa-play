/**
 * Created with JetBrains WebStorm.
 * User: Den
 * Date: 18.05.14
 * Time: 14:43
 * To change this template use File | Settings | File Templates.
 */


var origPlay = play;
window.HTMLMediaElement.prototype.play = function(){
    console.log('play called');
    origPlay.call(this);
}