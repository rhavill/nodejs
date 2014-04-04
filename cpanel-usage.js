var http = require('http');
var events = require('events');
var jsdom = require("jsdom");
var fs = require('fs');
var config = require('./cpanel-usage-config');

var loginData = 'user='+config.username+'&pass='+config.password;

var loginOptions = {
  hostname: config.hostname,
  port: config.port,
  path: '/login',
  method: 'POST',
  headers: {
    'Content-Type': 'application/x-www-form-urlencoded',
    'Content-Length': loginData.length
  }  
};

var reportOptions = {
  hostname: config.hostname,
  port: config.port,
  path: '/frontend/x3/stats/resourceusagedetails.html?period=10m',
  method: 'GET'
};

var logoutOptions = {
  hostname: config.hostname,
  port: config.port,
  path: '/logout/?locale=en',
  method: 'GET'
};

var sessionCookie = null

var emitter = new events.EventEmitter
emitter.on('loggedIn', function(sessionId, cookie) {
  sessionCookie = cookie
  getReport(sessionId, cookie, reportOptions, emitter);
});
emitter.on('gotHtml', function(html) {
  parseReport(html, emitter);
});
emitter.on('gotReportData', function(data) {
  writeToFile(data, emitter);
});
emitter.on('fini',  function() {
  logout(sessionCookie, logoutOptions);
});
emitter.on('loggedOut',  function() {
  login(loginData, loginOptions, emitter);
});

function login(loginData, loginOptions, emitter) {
  console.log('about to login');
  var req = http.request(loginOptions);
  req.write(loginData);
  req.end();
  req.on('response', function(res) {
    sessionId = res.headers.location.split('/')[1];
    cookie = res.headers['set-cookie'][0];
    emitter.emit('loggedIn', sessionId, cookie);
  });
  req.on('error', function(e) {
    console.log('problem with login request: ' + e.message);
  });
}

function getReport(sessionId, cookie, reportOptions, emitter) {
  var oldPath = reportOptions.path
  reportOptions.path = '/' + sessionId + reportOptions.path;
  reportOptions.headers = {
    Cookie: cookie
  };
  var req = http.request(reportOptions);
  req.end();
  reportOptions.path = oldPath
  req.on('response', function(res) {
    var html = '';
    res.on('data', function(data) {
      var buf = new Buffer(data);
      html += buf.toString();
    });
    res.on('end', function(data) {
      emitter.emit('gotHtml', html);
    });
  });

  req.on('error', function(e) {
    console.log('problem with request while getting report: ' + e.message);
  });
}

function parseReport(html, emitter) {
  jsdom.env(
    html,
    ["http://code.jquery.com/jquery.js"],
    function (errors, window) {
      var data = [['from','to','cpu-avg','cpu-max','cpu-lim','vmem-avg','vmem-max','vmem-lim','pmem-avg','pmem-max','pmem-lim','ep-avg','ep-max','ep-lim','io-avg','io-max','io-lim','vMf','pMf','EPf','nPf']];
      window.$("#lve-table tbody tr").each(function (index, element) {
        var row = [];
        window.$(this).find('td').each(function (index) {
          row.push(window.$(this).text());
        });
        data.push(row);
      });
      emitter.emit('gotReportData', data);
    }
  );
}

function writeToFile(data, emitter) {
  fs.appendFile('/home/rhavill/Desktop/resources.csv', "\n", function(err) {
    if (err) throw err;
    var string = ''
    for (i = 0; i < data.length; i++) {
      string += data[i].join("\t")+"\n"
    }
    fs.appendFile('/home/rhavill/Desktop/resources.csv', string, function (err) {
        if (err) throw err;
        emitter.emit('fini');
    });
  });
}

function logout(cookie, options) {
  options.headers = {
    Cookie: cookie
  };
  var req = http.request(options);
  req.end();

  req.on('response', function(res) {
    console.log('fini')
    setTimeout(function() {
      emitter.emit('loggedOut');
    }, 30000);
  });
  
  req.on('error', function(e) {
    console.log('problem logging out: ' + e.message);
  });
}

login(loginData, loginOptions, emitter)