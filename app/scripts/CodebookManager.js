
const Codebook = require('./model/Codebook')
const DefaultCodebook = require('./config/DefaultCodebook')
const libraryCodebookStorageKey = 'LibraryCodebook'
const MendeleyContentScriptClient = require('./MendeleyContentScriptClient')
const Code = require('./model/Code')

class CodebookManager {
  static getCodebookFromGroupDescription (groupId) {

  }
  static getGroupCodebook (groupId, folderId) {
    let that = this
    return new Promise((resolve, reject) => {
      MendeleyContentScriptClient.getGroupDescription(groupId).then((description) => {
        // empty description
        if (description == null || description == '') {
          // initialize group
          let codebook = Codebook.fromObject(DefaultCodebook)
          that.updateCodebook(groupId, null, codebook).then(() => resolve(codebook), (error) => reject('Error while trying to update codebook'))
        }
        else {
          try {
            let parsedDescription = JSON.parse(description)
            let codebook = Codebook.fromMinifiedObject(parsedDescription)
            if (codebook != null) { // exists with new format
              that.combineWithLocal(groupId,codebook).then((newCodebook) => {
                resolve(newCodebook)
              })
            }
            else {
              codebook = Codebook.fromMinifiedObjectOldVersion(parsedDescription)
              if (codebook != null) {  // exists with old format
                that.combineWithLocal(groupId,codebook).then((newCodebook) => {
                  that.updateCodebook(groupId, null, newCodebook).then(() => resolve(newCodebook), (error) => reject('Error while trying to update codebook'))
                })
              }
              else { // invalid format
                reject('Invalid group description')
              }
            }
          }
          catch (err) { // cannot parse to json
            reject('Invalid group description')
          }
        }
      })
    })
  }
  static getLibraryCodebook (folderId) {
    let that = this
    return new Promise((resolve, reject) => {
      chrome.storage.local.get([libraryCodebookStorageKey], function(options) {
        let libraryCodebook = []
        if(options.hasOwnProperty(libraryCodebookStorageKey)&&options[libraryCodebookStorageKey]!=null&&Array.isArray(options[libraryCodebookStorageKey])) { // property exists in local storage and is a valid array
          libraryCodebook = options[libraryCodebookStorageKey]
        }
        let folderCodebook = libraryCodebook.find((entry) => {
          return entry.folderId === folderId
        })
        if(folderCodebook==null){ // doesn't exist, create
          chrome.storage.sync.get(["COLOR_CODING","OUR_WORK_CODING"],(options) => { // check whether exists old general codebook
            if(options["COLOR_CODING"]!=null){
              // todo if exists, ask the user if he wants to keep it. If so, copy the old codebook
              // for now, always keep it
              let oldGeneralCodebook = options["COLOR_CODING"]
              let codebookColors = Object.keys(oldGeneralCodebook)
              let workCoding = {}
              if(options["OUR_WORK_CODING"]!=null&&options["OUR_WORK_CODING"][folderId]!=null) workCoding = options["OUR_WORK_CODING"][folderId]
              let codebook = Codebook.fromOldGeneral(oldGeneralCodebook,workCoding)

              libraryCodebook.push({
                "folderId":folderId,
                "codebook": codebook.toObject()
              })
              that.updateCodebook(null,folderId,codebook).then(() => resolve(codebook), (error) => reject('Error while trying to update codebook'))
            }
            else{ // if doesn't exist, create by default
              let defaultCodebook = Codebook.fromObject(DefaultCodebook)
              defaultCodebook.folderId = folderId
              libraryCodebook.push({
                "folderId": folderId,
                "codebook": defaultCodebook.toObject()
              })
              that.updateCodebook(null,folderId,defaultCodebook).then(() => resolve(defaultCodebook), (error) => reject('Error while trying to initialize codebook'))
            }
          })
        }
        else{ // folder codebook exists
          if(folderCodebook.codebook!=null&&Array.isArray(folderCodebook.codebook)){ // check whether it is valid
            resolve(Codebook.fromObject(folderCodebook.codebook))
          }
          else{
            reject("Invalid codebook format")
          }
        }
      })
    })
  }
  static getCodebook (folderId, groupId) {
    let that = this
    return new Promise((resolve,reject) => {
      if(folderId == null && groupId == null) reject('No folder nor group selected')
      else if(groupId != null) that.getGroupCodebook(groupId,folderId).then((codebook) => resolve(codebook),(error) => reject())
      else if(folderId != null) that.getLibraryCodebook(folderId).then((codebook) => resolve(codebook),(error) => reject())
    })
  }
  static updateCodebook (groupId, folderId, newCodebook) {
    let that = this
    return new Promise((resolve,reject) => {
      if(folderId == null && groupId == null) reject()
      else if(groupId != null){
        MendeleyContentScriptClient.setGroupDescription(groupId,JSON.stringify(newCodebook.toMinifiedObject())).then(() => {
            chrome.storage.local.get([libraryCodebookStorageKey],function(options){
              let libraryCodebook = []
              if(options.hasOwnProperty(libraryCodebookStorageKey)&&options[libraryCodebookStorageKey]!=null&&Array.isArray(options[libraryCodebookStorageKey])) { // property exists in local storage and is a valid array
                libraryCodebook = options[libraryCodebookStorageKey]
              }
              let groupCodebook = libraryCodebook.find((entry) => {
                return entry.groupId === groupId
              })
              if(groupCodebook == null){
                libraryCodebook.push({
                  groupId: groupId,
                  codebook: newCodebook.toObject()
                })
              }
              else{
                groupCodebook.codebook = newCodebook.toObject()
              }
              let data = {}
              data[libraryCodebookStorageKey] = libraryCodebook
              chrome.storage.local.set(data,() => {
                resolve()
              })
            })
          //resolve()
        },
        (error) => {
          reject(error)
        })
      }
      else if(folderId != null){
        chrome.storage.local.get([libraryCodebookStorageKey],function(options){
          let libraryCodebook = []
          if(options.hasOwnProperty(libraryCodebookStorageKey)&&options[libraryCodebookStorageKey]!=null&&Array.isArray(options[libraryCodebookStorageKey])) { // property exists in local storage and is a valid array
            libraryCodebook = options[libraryCodebookStorageKey]
          }
          let folderCodebook = libraryCodebook.find((entry) => {
            return entry.folderId === folderId
          })
          if(folderCodebook == null){
            libraryCodebook.push({
              folderId: folderId,
              codebook: newCodebook.toObject()
            })
          }
          else{
            folderCodebook.codebook = newCodebook.toObject()
          }
          let data = {}
          data[libraryCodebookStorageKey] = libraryCodebook
          chrome.storage.local.set(data,() => {
            resolve()
          })
        })
      }
    })
  }
  static combineWithLocal (groupId, codebook) {
    return new Promise((resolve,reject) => {
      chrome.storage.local.get([libraryCodebookStorageKey], function (options) {
        let libraryCodebook = []
        if (options.hasOwnProperty(libraryCodebookStorageKey) && options[libraryCodebookStorageKey] != null && Array.isArray(options[libraryCodebookStorageKey])) { // property exists in local storage and is a valid array
          libraryCodebook = options[libraryCodebookStorageKey]
        }
        let groupCodebookObject = libraryCodebook.find((entry) => {
          return entry.groupId === groupId
        })
        if(groupCodebookObject == null){
          resolve(codebook)
        }
        else{
          let groupCodebook = Codebook.fromObject(groupCodebookObject.codebook)
          groupCodebook.themes.forEach((theme) => {
            if(theme.name == null || theme.name === '') return
            let codebookTheme = codebook.getThemeByName(theme.name)
            if(codebookTheme == null) return
            if(theme.description != null && theme.description !== '') codebookTheme.description = theme.description
            theme.codes.forEach((code) => {
              let newCode = new Code(code.name,code.description,code.operational)
              codebookTheme.insertCode(newCode)
            })
          })
          resolve(codebook)
        }
      })
    })
  }
}

module.exports = CodebookManager
