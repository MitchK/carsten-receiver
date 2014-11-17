var http          = require('http');
var url           = require('url');
var app           = require('app');
var path          = require('path');
var BrowserWindow = require('browser-window');
var os            = require('os');

// some configs
var config = {};
config.carstenUrl = process.env.CARSTEN_URL || 'http://localhost:3000';
config.carstenProxy = process.env.HTTP_PROXY;
config.channel = process.env.CHANNEL || '#global';
config.receiverName = process.env.RECEIVER_NAME || os.hostname();

// which plugins, which path
config.plugins = [{name:'control'}, {name:'index'}, {name:'system'}, {name:'url'}];
if(process.platform === 'win32') {
  config.pluginPath = './plugins';
} else {
  config.pluginPath = '../../../../../app/plugins';
}

var consolePlugins = '';

// load plugins
config.plugins.forEach(function(plugin) {
    plugin.app = require(config.pluginPath + '/' + plugin.name + '/' + plugin.name);
    consolePlugins += '\nPlugin loaded: ' +  plugin.name;
});

console.log('\n\n********* CONFIGURATION --- START **********\n' +
'\nCARSTEN_URL: ' + config.carstenUrl +
'\nHTTP_PROXY: ' + (config.carstenProxy ? config.carstenProxy : 'no proxy') +
'\nCHANNEL: ' + config.channel +
'\nRECEIVER_NAME: ' + config.receiverName +
'\n' + consolePlugins +
'\n\n********** CONFIGURATION --- END ***********\n\n');

require('crash-reporter').start();
var mainWindow = null;

app.on('window-all-closed', function() {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('ready', function() {
  var currentUrl;
  var newUrl;
  var options = {};
  var mainWindow = new BrowserWindow({width: 800, height: 600 /*fullscreen: true, "skip-taskbar": true*/ });
  //mainWindow.openDevTools(); .maximize(); .capturePage(); .reload();

  mainWindow.on('closed', function() {
    mainWindow = null;
  });

  function getRequestOptions(path, method, param) {
    param = param || '';
    if(config.carstenProxy === undefined)
    {
      options =
      {
        hostname: url.parse(config.carstenUrl).hostname,
        port: url.parse(config.carstenUrl).port,
        path: path + '/' + param,
        method: method,
        headers: { }
      };
    }
    else
    {
      options = {
        hostname: url.parse(config.carstenProxy).hostname,
        port: url.parse(config.carstenProxy).port,
        path: config.carstenUrl + path + '/' + param,
        method: method,
        headers: {
          Host: url.parse(config.carstenUrl).hostname
        }
      };
    }

    return options;
  }

  function handleUserInput(input) {
    var matched = false;
    config.plugins.forEach(function(plugin) {
      plugin.app.expressions.forEach(function(expression) {
        if(!matched) {
          console.log(expression.expression);
          var match = input.match(expression.expression);
          if(match) {
            expression.fn({
              window: mainWindow,
              path: path,
              url: input,
              match: match
            });
            matched = true;
          }
        }
      });
    });
  }

  function register() {

    var data = {
      channel: config.channel,
      hostname: config.receiverName
    };

    var options = getRequestOptions('/rest/init', 'POST');

    data = JSON.stringify(data);

    options.headers['Content-Type'] = 'application/json';
    options.headers['Content-Length'] = data.length;

    console.log(options);
    console.log(data);

    var req = http.request(options, function(res) {
      res.setEncoding('utf8');
      res.on("data", function(chunk) {
        console.log(chunk);
        chunk = JSON.parse( chunk );
        if(chunk.status) {
          console.log("REGISTRATION SUCCESSFULLY");
          requestCarst();
          requestCommand();
        } else {
          console.log("REGISTRATION ERROR: " + chunk.message);
        }
      });
    });
    req.write(data);
    req.end();
  }

  register();

  function requestCarst() {
    var options = getRequestOptions('/rest/carst', 'GET', config.receiverName);
    var req = http.request(options, function(res) {
      var data = '';
      res.on('data', function(chunk) { data += chunk; });
      res.on('end', function(){
        handleUserInput(JSON.parse( data ).url);
        console.log('NEW REQUEST', data);
        requestCarst();
      });
    });
    req.end();
    req.on('error', function (e) {
      if(e.code === 'ECONNRESET') {
        console.log('ECONNRESET --- RECONNECTING');
        requestCarst();
      } else {
        console.error(e);
      }
    });
  }

  function requestCommand() {
    var options = getRequestOptions('/rest/command', 'GET', config.receiverName);
    var req = http.request(options, function(res) {
      var data = '';
      res.on('data', function(chunk) { data += chunk; });
      res.on('end', function(){
        var command = JSON.parse( data ).command;
          handleUserInput(command);
        requestCommand();
      });
    });
    req.end();
    req.on('error', function (e) {
      if(e.code === 'ECONNRESET') {
        console.log('ECONNRESET --- RECONNECTING');
        requestCommand();
      } else {
        console.error(e);
      }
    });
  }
});