/**
 * Created with JetBrains WebStorm.
 * User: Den
 * Date: 05.07.14
 * Time: 20:58
 * To change this template use File | Settings | File Templates.
 */
var
 os = require('os'),
 memcpy,
 versions = process.versions,
 path = require('path'),
 bundledBindingPath = path.join('..','vendor','memcpy',os.platform(),versions['node-webkit'],'memcpy.node');

try {
  memcpy = require(bundledBindingPath).memcpy;
  memcpy.binding = memcpy;
}
catch(e)
{
  memcpy = {
    binding:null,
    path: bundledBindingPath
  };
}

module.exports = memcpy;
