
const Alerts = require('./Alerts')

class Scrap {
  static onLoad () {
    return new Promise((resolve, reject) => {
      let obs = new MutationObserver((mutations) => {
        let logo = document.querySelector('svg[class^=IconMendeley]')
        if (logo != null) {
          obs.disconnect()
          resolve()
        }
      })
      let cfg = {childList: true}
      obs.observe(document.body, cfg)
    })
  }
  static insertFramendeleyLogo () {
    let logo = document.querySelector('svg[class^=IconMendeley]')
    let framendeleyLogo = document.createElement('img')
    framendeleyLogo.id = 'framendeleyLogo'
    let framendeleyLogoURL = chrome.extension.getURL('images/logo.png')
    framendeleyLogo.title = 'FRAMEndeley'
    framendeleyLogo.href = '#'
    framendeleyLogo.src = framendeleyLogoURL
    framendeleyLogo.addEventListener('click', () => {
      Alerts.showHelpDialog()
    })
    logo.after(framendeleyLogo)
  }
}

module.exports = Scrap
