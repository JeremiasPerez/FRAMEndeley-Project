  var SYNC_MODE;
  var MENDELEY_ENABLED;
  const BootstrapSlider = require("./bootstrap-slider.min");

  chrome.storage.sync.get(["MENDELEY_ENABLED"], function (options) {
    var mendeleyEnabled = options["MENDELEY_ENABLED"];

    if (mendeleyEnabled != null) {
      if (!mendeleyEnabled) {
        //mendeleyContainerBody.className = "disabled";
      }
      else {
        var mendeleyEnable = document.getElementById("mendeleyEnable");
        mendeleyEnable.className = mendeleyEnable.className.replace("disabled", "enabled");
        var mendeleyEnableCheckbox = document.getElementById("mendeleyEnableCheckbox");
        mendeleyEnableCheckbox.checked = true;
        //var projectMatching = document.getElementById("mendeleyProjectMatching");
        //projectMatching.style.display = "block";
      }
    }
  })

  document.getElementById('mendeleyEnableCheckbox').addEventListener('change', function () {
    var enabled = document.getElementById("mendeleyEnableCheckbox").checked;
    if (enabled) chrome.runtime.sendMessage({mes: "authorizeMendeley"});
    else {
      chrome.storage.sync.set({
        "MENDELEY_ENABLED": false
      }, function () {
        var div = document.getElementById("mendeleyEnable");
        div.className = div.className.replace("enabled", "disabled");
        //var projectMatching = document.getElementById("mendeleyProjectMatching");
        //projectMatching.style.display = "none";
        // SHOW MESSAGE
      });
    }
  });

  function showAuthorizationSuccessMessage (message, success) {
    var div = document.getElementById("authorizationSuccess");
    div.innerHTML = message;
    div.style.display = "block";
    setTimeout(function () {
      var div = document.getElementById("authorizationSuccess");
      div.style.display = "none";
    }, 5000);
  }

  chrome.runtime.onMessage.addListener(function (request, sender, sendResponse) {
    if (request.mesType == "accessToken" && request.mes == "done") {
      if (request.adapter == "mendeley") {
        var div = document.getElementById("mendeleyEnable");
        div.className = div.className.replace("disabled", "enabled");
        var aux = document.getElementById("mendeleyEnableCheckbox");
        aux.checked = true;
        if (request.interactionRequired != null && request.interactionRequired == true) showAuthorizationSuccessMessage("Authorization with Mendeley done successfully");
        chrome.storage.sync.set({
          "MENDELEY_ENABLED": true
        });
      }
    }
  })
