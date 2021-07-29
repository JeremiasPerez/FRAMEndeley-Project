
const Scrap = require('./Scrap')
const MendeleyContentScriptClient = require('./MendeleyContentScriptClient')
const Alerts = require('./Alerts')
const LibraryModeManager = require('./LibraryModeManager')
const ReaderModeManager = require('./ReaderModeManager')

class ContentScript {
  constructor () {
    this._mode = null
    this._currentFolderId = null
    this._currentGroupId = null
    this._currentDocumentId = null
    this._libraryManager = null
    this._readerManager = null
    this._currentURL = null
    this._mendeleyEnabled = false
  }
  checkAccessToken () {
    let that = this
    return new Promise((resolve, reject) => {
      chrome.storage.sync.get(['MENDELEY_ENABLED'], (options) => {
        that._mendeleyEnabled = options['MENDELEY_ENABLED'] != null ? options['MENDELEY_ENABLED'] : false
        if (!that._mendeleyEnabled) return
        MendeleyContentScriptClient.checkAccessToken().then((response) => {
            resolve()
          },
          (error) => {
            reject()
          }
        )
      })
    })
  }
  destroyCurrentModeManager () {
    if (this._libraryManager != null) {
      this._libraryManager.destroy()
      this._libraryManager = null
    }
    if (this._readerManager != null) {
      this._readerManager.destroy()
      this._readerManager = null
    }
  }
  framendeleyModeManager (newUrl) {
    let oldURL = this._currentURL
    let newUrl2 = newUrl.split('#')[0]
    if (newUrl2.charAt(newUrl2.length-1) == '/') newUrl2 = newUrl2.substring(0,newUrl2.length-1)
    if (oldURL == newUrl2) return

    this.destroyCurrentModeManager()

    let libraryFolderRegexp = /https?:\/\/(www\.)?mendeley\.com\/reference-manager\/library\/collections\/(.+)\/all-references\/?/
    let groupFolderRegexp = /https?:\/\/(www\.)?mendeley\.com\/reference-manager\/library\/groups\/private\/(.+)\/collections\/(.+)\/all-references\/?/
    let documentReaderRegexp = /https?:\/\/(www\.)?mendeley\.com\/reference-manager\/reader\/(.+)\/(.+)\/?/
    if (libraryFolderRegexp.test(newUrl)) {
      let m = newUrl.match(libraryFolderRegexp)
      if (m.length < 3) return
      let folderId = m[2]
      this._libraryManager = new LibraryModeManager(null,folderId)
      this._libraryManager.init()
    }
    else if (groupFolderRegexp.test(newUrl)) {
      let m = newUrl.match(groupFolderRegexp)
      if (m.length < 4) return
      let groupId = m[2]
      let folderId = m[3]
      this._libraryManager = new LibraryModeManager(groupId,folderId)
      this._libraryManager.init()
    }
    else if (documentReaderRegexp.test(newUrl)) {
      let m = newUrl.match(documentReaderRegexp)
      if (m.length < 4) return
      let documentId = m[2]
      let fileId = m[3]
      this._readerManager = new ReaderModeManager(documentId,fileId)
      this._readerManager.init()
      //this._libraryManager = new LibraryModelManager(null,folderId)
    }
    this._currentURL = newUrl
  }
  manageUrlChange () {
    let that = this
    let initialUrl = document.location.href.split('#')[0]
    if (initialUrl.charAt(initialUrl.length-1) == '/') initialUrl = initialUrl.substring(0,initialUrl.length-1)
    that.framendeleyModeManager(initialUrl)
    chrome.runtime.onMessage.addListener((message) => {
      if (message == null) return
      if (message.scope !== 'mendeleyURLChange') return
      that.framendeleyModeManager(message.newURL)
      //that._currentURL = message.newURL
    })
  }
  init () {
    this.checkAccessToken().then(() => {
      Scrap.onLoad().then(() => {
        Scrap.insertFramendeleyLogo()
        this.manageUrlChange()
      })
    }, () => {
      Alerts.showErrorWindow()
    })
  }
}

let contentScript = new ContentScript()
contentScript.init()
