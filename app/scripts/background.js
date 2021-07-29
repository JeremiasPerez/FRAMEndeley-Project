
const OAuth2 = require("./oauth2");
const MendeleyBackgroundClient = require('./MendeleyBackgroundClient')

let MendeleyManager = new MendeleyBackgroundClient()
MendeleyManager.init()

function makeRequest (opts) {
  return new Promise(function (resolve, reject) {
    var xhr = new XMLHttpRequest();
    xhr.withCredentials = false;
    xhr.onload = function () {
      if ((this.status >= 200 && this.status < 300)||(this.status == 400)) {
        resolve(xhr);
      } else {
        reject({
          status: this.status,
          statusText: xhr.statusText
        });
      }
    };
    xhr.onerror = function () {
      reject({
        status: this.status,
        statusText: xhr.statusText
      });
    };
    var params = opts.params;
    // We'll need to stringify if we've been given an object
    // If we have a string, this is skipped.
    if (params && typeof params === 'object') {
      params = Object.keys(params).map(function (key) {
        return encodeURIComponent(key) + '=' + encodeURIComponent(params[key]);
      }).join('&');
    }

    if(opts.method == "POST"){
      // TO DO: REMOVE
      xhr.open(opts.method, opts.url);
      if (opts.headers) {
        Object.keys(opts.headers).forEach(function (key) {
          xhr.setRequestHeader(key, opts.headers[key]);
        });
      }
      xhr.send(params);
    }
    else if(opts.method == "GET"){
      if(params!=null&&params.length>0) xhr.open(opts.method, opts.url+"?"+params);
      else xhr.open(opts.method, opts.url);
      if (opts.headers) {
        Object.keys(opts.headers).forEach(function (key) {
          xhr.setRequestHeader(key, opts.headers[key]);
        });
      }
      xhr.send();
    }
    else if(opts.method == "PUT"){
      xhr.open(opts.method, opts.url);
      if (opts.headers) {
        Object.keys(opts.headers).forEach(function (key) {
          xhr.setRequestHeader(key, opts.headers[key]);
        });
      }
      xhr.send(params);
    }
    else if(opts.method == "DELETE"){
      xhr.open(opts.method, opts.url);
      if (opts.headers) {
        Object.keys(opts.headers).forEach(function (key) {
          xhr.setRequestHeader(key, opts.headers[key]);
        });
      }
      xhr.send(null);
    }
    else if(opts.method == "PATCH"){
      xhr.open(opts.method, opts.url);
      if (opts.headers) {
        Object.keys(opts.headers).forEach(function (key) {
          xhr.setRequestHeader(key, opts.headers[key]);
        });
      }
      xhr.send(params);
    }
  });
}

function makeRequestBis (opts) {
  return new Promise(function (resolve, reject) {
    var xhr = new XMLHttpRequest();
    xhr.onload = function () {
      if ((this.status >= 200 && this.status < 300)||(this.status == 400)) {
        resolve(xhr);
      } else {
        reject({
          status: this.status,
          statusText: xhr.statusText
        });
      }
    };
    xhr.onerror = function () {
      reject({
        status: this.status,
        statusText: xhr.statusText
      });
    };
    var params = opts.params;
    // We'll need to stringify if we've been given an object
    // If we have a string, this is skipped.
    if (params && typeof params === 'object') {
      params = Object.keys(params).map(function (key) {
        return encodeURIComponent(key) + '=' + encodeURIComponent(params[key]);
      }).join('&');
    }

    if(opts.method == "POST"){
      xhr.open(opts.method, opts.url);
      if (opts.headers) {
        Object.keys(opts.headers).forEach(function (key) {
          xhr.setRequestHeader(key, opts.headers[key]);
        });
      }
      xhr.send(params);
    }
    else if(opts.method == "PATCH"){
      xhr.open(opts.method, opts.url);
      if (opts.headers) {
        Object.keys(opts.headers).forEach(function (key) {
          xhr.setRequestHeader(key, opts.headers[key]);
        });
      }
      xhr.send(params);
    }
    else if(opts.method == "GET"){
      if(params!=null&&params.length>0) xhr.open(opts.method, opts.url+"?"+params);
      else xhr.open(opts.method, opts.url);
      if (opts.headers) {
        Object.keys(opts.headers).forEach(function (key) {
          xhr.setRequestHeader(key, opts.headers[key]);
        });
      }
      xhr.send();
    }
    else if(opts.method == "PUT"){
      xhr.open(opts.method, opts.url);
      if (opts.headers) {
        Object.keys(opts.headers).forEach(function (key) {
          xhr.setRequestHeader(key, opts.headers[key]);
        });
      }
      xhr.send(params);
    }
    else if(opts.method == "DELETE"){
      xhr.open(opts.method, opts.url);
      if (opts.headers) {
        Object.keys(opts.headers).forEach(function (key) {
          xhr.setRequestHeader(key, opts.headers[key]);
        });
      }
      xhr.send(null);
    }
  });
}

chrome.runtime.onMessage.addListener(function(message,sender,sendResponse){
  if(message.mes=="parsePdfFile"){
    let xhttp = new XMLHttpRequest()
    xhttp.onreadystatechange = function() {
      if (this.readyState == 4 && this.status == 200) {
        let uInt8Array = new Uint8Array(this.response)
        var i = uInt8Array.length;
        var binaryString = new Array(i);
        while (i--)
        {
          binaryString[i] = String.fromCharCode(uInt8Array[i]);
        }
        var data = binaryString.join('');
        var base64 = window.btoa(data);
        let d = {
          data: base64
        }
        sendResponse(d)
      }
    };
    xhttp.open("GET","https://api.mendeley.com/files/"+message.fileId+"?access_token="+message.accessToken, true);
    xhttp.responseType = "arraybuffer"
    xhttp.send();
    return true
  }
  if(message.mes=="processInBackground"){
    makeRequestBis(message.params).then(function(response){
      sendResponse({"response":response.response,"responseText":response.responseText})
    })
    return true
  }
  if(message.mes=="openCanvas"){
    chrome.tabs.create({url: "https://www.mendeley.com/reference-manager/reader/"+message.documentId+"/"+message.fileId+"#openCanvas"})
  }
  if(message.mes=="openTab"){
    chrome.tabs.create({ url: message.tabURL });
  }
  if(message.mes=="mendeleyImage"){
    chrome.tabs.create({ url: message.imageURL });
  }
  else if(message.mes=="getMendeleyAccessToken"){
    var mendeleyAuth = new OAuth2("mendeley", {
      client_id: "6700",
      client_secret: "vsoz7AGPYsfUsdkA",
      api_scope: "all"
    });
    mendeleyAuth.authorize(function(){
      var authToken = mendeleyAuth.getAccessToken();
      chrome.tabs.sendMessage(sender.tab.id,{mesType: "accessToken", adapter: "mendeley", accessToken: authToken});
    },function(){
      chrome.storage.sync.set({
        "MENDELEY_ENABLED":false
      },function(){
        mendeleyAuth.clear();
        chrome.tabs.sendMessage(sender.tab.id,{mesType: "accessTokenLost", adapter: "mendeley"});
      })
    });
  }
  else if(message.mes=="isAuthorizedMendeley"){
    var mendeleyAuth = new OAuth2("mendeley", {
      client_id: "6700",
      client_secret: "vsoz7AGPYsfUsdkA",
      api_scope: "all"
    });
    var accessToken = mendeleyAuth.hasAccessToken();
    if(accessToken==null||!accessToken){
      chrome.tabs.sendMessage(sender.tab.id,{mesType: "refreshAccessToken", adapter: "mendeley"});
    }
    else chrome.tabs.sendMessage(sender.tab.id,{mesType: "isAuthorized", adapter: "mendeley", accessToken: accessToken});
  }
  else if(message.mes=="authorizeMendeley"){
    var mendeleyAuth = new OAuth2("mendeley", {
      client_id: "6700",
      client_secret: "vsoz7AGPYsfUsdkA",
      api_scope: "all"
    });
    if(mendeleyAuth.hasAccessToken()) chrome.tabs.sendMessage(sender.tab.id,{mesType: "accessToken", adapter: "mendeley", mes: "done", interactionRequired: false});
    else mendeleyAuth.authorize(function(){
      var authToken = mendeleyAuth.getAccessToken();
      chrome.tabs.sendMessage(sender.tab.id,{mesType: "accessToken", adapter: "mendeley", mes: "done", interactionRequired: true});
    });
  }
  else if(message.mes=="reloadBrowserAction"){
    setBrowserAction();
  }
});

chrome.browserAction.onClicked.addListener(function(){
  var newURL = chrome.extension.getURL("pages/options.html");
  chrome.tabs.create({ url: newURL });
});

chrome.webNavigation.onHistoryStateUpdated.addListener((o) => {
  chrome.tabs.sendMessage(o.tabId, {scope: 'mendeleyURLChange', newURL: o.url})
}, {url: [{hostSuffix: 'mendeley.com'}]})
