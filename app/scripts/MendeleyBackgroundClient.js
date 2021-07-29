
const Utils = require('./utils/Utils')
const MendeleyCredentials = require('./config/MendeleyCredentials')
const OAuth2 = require("./oauth2");

const $ = require('jquery')

class MendeleyBackgroundClient {
  constructor(){
    this.mendeleyAuth = new OAuth2('mendeley',{
      client_id: MendeleyCredentials.client_id,
      client_secret: MendeleyCredentials.client_secret,
      api_scope: MendeleyCredentials.api_scope
    })
  }
  init () {
    let that = this
    chrome.runtime.onMessage.addListener((message,sender,sendResponse) => {
      if(message.scope === 'mendeleyClient') {
        if(message.message === 'processInBackground'){
          if(message.method === 'getFolderName'){
            that.getFolderName(message.args.folderId).then((rsp) => sendResponse({response:rsp}),(error) => sendResponse({error:error}))
          }
          else if(message.method === 'getFolderDocuments'){
            that.getFolderDocuments(message.args.folderId,message.args.groupId).then((rsp) => sendResponse({response:rsp}),(error) => sendResponse({error:error}))
          }
          else if(message.method === 'getGroupDocuments'){
            that.getGroupDocuments(message.args.groupId).then((rsp) => sendResponse({response:rsp}),(error) => sendResponse({error:error}))
          }
          else if(message.method === 'getDocumentAnnotations'){
            chrome.tabs.sendMessage(sender.tab.id,{scope:'FRAMEndeleyLoading',documentId:message.args.documentId})
            that.getDocumentAnnotations(message.args.documentId,message.args.marker).then((rsp) => sendResponse({response:rsp}),(error) => sendResponse({error:error}))
          }
          else if(message.method === 'getDocumentFile'){
            that.getDocumentFile(message.args.documentId).then((rsp) => sendResponse({response:rsp}),(error) => sendResponse({error:error}))
          }
          else if(message.method === 'getDocuments'){
            that.getDocuments(message.args.groupId,message.args.marker).then((rsp) => sendResponse({response:rsp}),(error) => sendResponse({error:error}))
          }
          else if(message.method === 'updateAnnotationColor'){
            that.updateAnnotationColor(message.args.annotationId,message.args.newColor).then((rsp) => sendResponse({response:rsp}),(error) => sendResponse({error:error}))
          }
          else if(message.method === 'updateAnnotationNote'){
            that.updateAnnotationNote(message.args.annotationId,message.args.newNote).then((rsp) => sendResponse({response:rsp}),(error) => sendResponse({error:error}))
          }
          else if(message.method === 'removeAnnotation'){
            that.removeAnnotation(message.args.annotationId).then((rsp) => sendResponse({response:rsp}),(error) => sendResponse({error:error}))
          }
          else if(message.method === 'getGroupDescription'){
            that.getGroupDescription(message.args.groupId).then((rsp) => sendResponse({response:rsp}),(error) => sendResponse({error:error}))
          }
          else if(message.method === 'setGroupDescription'){
            that.setGroupDescription(message.args.groupId,message.args.description).then((rsp) => sendResponse({response:rsp}),(error) => {sendResponse({error:error})})
          }
          else if(message.method === 'getFileId'){
            that.getFileId(message.args.documentId).then((rsp) => sendResponse({response:rsp}),(error) => sendResponse({error:error}))
          }
          else if(message.method === 'getPDFFileContent'){
            that.getPDFFileContent(message.args.fileId).then((rsp) => {sendResponse({response:rsp})},(error) => sendResponse({error:error}))
          }
          else if(message.method === 'checkAccessToken'){
            that.getAccessToken().then((accessToken) => sendResponse({response:true}), (error) => sendResponse({error:error}))
          }
          else if(message.method === 'getDocumentGroup'){
            that.getDocumentGroup(message.args.documentId).then((rsp) => sendResponse({response:rsp}), (error) => sendResponse({error:error}))
          }
          else if(message.method === 'getDocumentFolders'){
            that.getDocumentFolders(message.args.documentId).then((rsp) => sendResponse({response:rsp}), (error) => sendResponse({error:error}))
          }
          else if(message.method === 'getGroupInfo'){
            that.getGroupInfo(message.args.groupId).then((rsp) => sendResponse({response:rsp}), (error) => sendResponse({error:error}))
          }
          else if(message.method === 'getFolderDocumentsBibtex'){
            that.getFolderDocumentsBibtex(message.args.folderId,message.args.groupId).then((rsp) => sendResponse({response:rsp}),(error) => sendResponse({error:error}))
          }
          return true
        }
      }
    })
  }
  getAccessToken () {
    let that = this
    return new Promise((resolve,reject) => {
      that.mendeleyAuth.authorize(() => {
        let token = that.mendeleyAuth.getAccessToken()
        resolve(token)
      }, () => {
        chrome.storage.sync.set({
          "MENDELEY_ENABLED":false
        },() => {
          that.mendeleyAuth.clear()
          reject('Access token lost')
        })
      });
    })
  }
  getFolderName (folderId){
    let that = this
    return new Promise((resolve, reject) => {
      that.getAccessToken().then((accessToken) => {
        var opts = {
          method: "GET",
          url: "https://api.mendeley.com/folders/"+folderId,
          headers: {
            'Authorization': "Bearer "+accessToken
          }
        }
        Utils.makeRequest(opts).then((response) => {
          var rsp = JSON.parse(response.responseText)
          if(rsp.name!=null) resolve(rsp.name)
          else reject('Folder not found')
        }, (error) => reject(error))
      },(error) => reject(error))
    })
  }
  getFolderDocuments (folderId,groupId){
    let that = this
    return new Promise((resolve, reject) => {
      that.getAccessToken().then((accessToken) => {
        var opts = {
          method: "GET",
          url: "https://api.mendeley.com/folders/" + folderId + "/documents",
          headers: {
            'Authorization': "Bearer " + accessToken
          },
          params: {limit: 100}
        }
        if(groupId!=null) opts.params["group_id"] = groupId
        // todo - pagination
        Utils.makeRequest(opts).then((response) => {
          var ret = JSON.parse(response.responseText)
          resolve(ret.map((el) => {return el.id}))
        }, (error) => reject(error))
      },(error) => reject(error))
    })
  }
  getGroupDocuments (groupId){
    let that = this
    return new Promise((resolve, reject) => {
      that.getAccessToken().then((accessToken) => {
        var opts = {
          method: "GET",
          url: "https://api.mendeley.com/documents",
          headers: {
            'Authorization': "Bearer " + accessToken
          },
          params: {}
        }
        if(groupId!=null) opts.params["group_id"] = groupId
        // todo - pagination
        Utils.makeRequest(opts).then((response) => {
          var ret = JSON.parse(response.responseText)
          resolve(ret.map((el) => {return el.id}))
        }, (error) => reject(error))
      },(error) => reject(error))
    })
  }
  getDocumentAnnotations (documentId,marker){
    var that = this
    return new Promise(function (resolve, reject){
      that.getAccessToken().then((accessToken) => {
        var limit = 200;
        var opts = {
          method: "GET",
          url: "https://api.mendeley.com/annotations",
          headers: {
            'Authorization': "Bearer "+accessToken
          },
          params: {
            'document_id': documentId,
            limit: limit
          }
        }
        if(marker!=null) opts.params["marker"] = marker;
        Utils.makeRequest(opts).then((resp) => {
          var annotations = JSON.parse(resp.responseText);
          let annotationsFiltered = annotations.filter((ann) => {
            // filter sticky notes
            if(ann.type==null||ann.type!=='highlight') return false
            // filter annotations without text (top left == bottom right)
            if(ann.positions==null||ann.positions.length===0) return false
            if(ann.positions[0]["top_left"]==null||ann.positions[0]["top_left"].x==null||ann.positions[0]["top_left"].y==null) return false
            if(ann.positions[0]["bottom_right"]==null||ann.positions[0]["bottom_right"].x==null||ann.positions[0]["bottom_right"].y==null) return false
            if(ann.positions[0]["top_left"].x===ann.positions[0]["bottom_right"].x&&ann.positions[0]["top_left"].y===ann.positions[0]["bottom_right"].y) return false
            // filter yellow annotations - old yellow annotations have no color
            if(ann.color!=null&&ann.color.r!=null&&ann.color.g!=null&&ann.color.b!=null){
              if(ann.color.r===255&&ann.color.g===245&&ann.color.b===173) return false
            }
            return true
          })
          annotationsFiltered.forEach((ann) => {
            // todo manage better
            // change blue collor from (54, 121, 224) to (186, 226, 255)
            if (ann.color != null && ann.color.r === 54 && ann.color.g === 121 && ann.color.b === 224){
              ann.color.r = 186
              ann.color.g = 226
              ann.color.b = 255
            }
            // Mendeley's new web interface changes the value of y axis.
            // Top-left's y is bigger than bottom-right's y, while the contrary happens in the desktop version
            ann.positions.forEach((pos) => {
              if (pos['top_left'].y > pos['bottom_right'].y) {
                let tlY = pos['top_left'].y
                pos['top_left'].y = pos['bottom_right'].y
                pos['bottom_right'].y = tlY
              }
            })
          })

          if(annotations.length==limit){
            var newMarker = annotations[limit-1].id;
            that.getDocumentAnnotations(documentId,newMarker).then(function (nextPageAnnotations){
              var annotationList = annotationsFiltered.concat(nextPageAnnotations);
              resolve(annotationList);
            })
          }
          else{
            resolve(annotationsFiltered);
          }
        },(error) => reject(error));
      },(error) => reject(error))
    })
  }
  getDocumentFile (documentId) {
    var that = this;
    return new Promise(function (resolve, reject) {
      that.getAccessToken().then((accessToken) => {
        var opts = {
          method: "GET",
          url: "https://api.mendeley.com/files/",
          headers: {
            'Authorization': "Bearer " + accessToken
          },
          params: {
            "document_id": documentId
          }
        }
        Utils.makeRequest(opts).then((response) => {
          var ret = JSON.parse(response.responseText)
          resolve(ret[0].id)
        }, (error) => reject(error))
      }, (error) => reject(error))
    })
  }
  getDocuments (groupId,marker){
    let that = this;
    let limit = 500
    return new Promise(function(resolve,reject){
      that.getAccessToken().then((accessToken) => {
        var opts = {
          method: "GET",
          url: "https://api.mendeley.com/documents/",
          headers: {
            'Authorization': "Bearer " + accessToken
          },
          params: {
            limit: limit,
            view: "bib"
          }
        }
        if (marker != null) opts.params["marker"] = marker;
        if (groupId != null) opts.params["group_id"] = groupId;
        Utils.makeRequest(opts).then((response) => {
          var documents = JSON.parse(response.responseText);
          if (documents.length == limit) {
            var newMarker = documents[limit - 1].id;
            that.getDocuments(groupId, newMarker).then(function (nextPageDocuments) {
              var dl = documents.concat(nextPageDocuments);
              resolve(dl);
            })
          }
          else {
            resolve(documents);
          }
        }, (error) => reject(error));
      },(error) => reject(error))
    })
  }
  updateAnnotationColor (annotationId,newColor){
    var that = this;
    return new Promise(function (resolve, reject){
      that.getAccessToken().then((accessToken) => {
        let color = Utils.hexToRGB(newColor)
        let c = {
          "r": color.r,
          "g": color.g,
          "b": color.b
        }
        let toSend = {"color": c}
        $.ajax("https://api.mendeley.com/annotations/" + annotationId, {
          method: "PATCH",
          contentType: 'application/vnd.mendeley-annotation.1+json',
          data: JSON.stringify(toSend),
          headers: {
            'Authorization': "Bearer " + accessToken
          },
          complete: function (xhr, status) {
            resolve(true)
          }
        })
      },(error) => reject(error))
    })
  }
  updateAnnotationNote (annotationId,newNote){
    var that = this;
    return new Promise(function (resolve, reject){
      that.getAccessToken().then((accessToken) => {
        let toSend = {"text": newNote}
        $.ajax("https://api.mendeley.com/annotations/" + annotationId, {
          method: "PATCH",
          contentType: 'application/vnd.mendeley-annotation.1+json',
          data: JSON.stringify(toSend),
          headers: {
            'Authorization': "Bearer " + accessToken
          },
          complete: function (xhr, status) {
            resolve(true)
          }
        })
      },(error) => reject(error))
    })
  }
  removeAnnotation (annotationId){
    var that = this
    return new Promise(function (resolve,reject){
      that.getAccessToken().then((accessToken) => {
        $.ajax("https://api.mendeley.com/annotations/" + annotationId, {
          method: "DELETE",
          headers: {
            'Authorization': "Bearer " + accessToken
          },
          complete: function (xhr, status) {
            resolve(true)
          }
        })
      }, (error) => reject(error))
    })
  }
  getGroupDescription (groupId){
    var that = this;
    return new Promise((resolve, reject) => {
      that.getAccessToken().then((accessToken) => {
        var opts = {
          method: "GET",
          url: "https://api.mendeley.com/groups/v2/" + groupId,
          headers: {
            'Authorization': "Bearer " + accessToken
          }
        }
        Utils.makeRequest(opts).then(function (response) {
          var rsp = JSON.parse(response.responseText);
          if (rsp.description != null) resolve(rsp.description);
          //else if (rsp.name != null && rsp.description == null) resolve(null);
          else if (rsp.name != null && rsp.description == null) resolve('');
          else reject('Group not found')
        });
      },(error) => reject(error))
    })
  }
  setGroupDescription (groupId,description){
    var that = this;
    return new Promise(function (resolve, reject){
      that.getAccessToken().then((accessToken) => {
        let toSend = {"description": description}
        $.ajax("https://api.mendeley.com/groups/v2/" + groupId, {
          method: "PATCH",
          contentType: 'application/vnd.mendeley-group+json',
          data: JSON.stringify(toSend),
          headers: {
            'Authorization': "Bearer " + accessToken
          },
          complete: function (xhr, status) {
            if(xhr.status == 200){
              resolve(true)
            }
            else{
              let errorText = 'Error trying to update group description. '
              if(xhr.responseJSON != null && xhr.responseJSON.errors != null && xhr.responseJSON.errors.length > 0){
                errorText += xhr.responseJSON.errors[0]
              }
              reject(errorText)
            }
          }
        })
      }, (error) => reject(error))
    })
  }
  getFileId (documentId){
    var that = this;
    return new Promise(function (resolve, reject){
      that.getAccessToken().then((accessToken) => {
        var opts = {
          method: "GET",
          url: "https://api.mendeley.com/files/",
          params: {
            "document_id": documentId
          },
          headers: {
            'Authorization': "Bearer " + accessToken
          }
        }
        Utils.makeRequest(opts).then(function (response) {
          var rsp = JSON.parse(response.responseText);
          if (rsp.length > 0) resolve(rsp[0].id);
          else reject('Document not found');
        });
      }, (error) => reject(error))
    })
  }
  getPDFFileContent (fileId){
    let that = this
    return new Promise((resolve,reject) => {
      that.getAccessToken().then((accessToken) => {
        let xhttp = new XMLHttpRequest()
        xhttp.onreadystatechange = function () {
          if (this.readyState == 4 && this.status == 200) {
            let uInt8Array = new Uint8Array(this.response)
            var i = uInt8Array.length;
            var binaryString = new Array(i);
            while (i--) {
              binaryString[i] = String.fromCharCode(uInt8Array[i]);
            }
            var data = binaryString.join('');
            var base64 = window.btoa(data);
            let d = {
              data: base64
            }
            resolve(d)
          }
        };
        xhttp.open("GET", "https://api.mendeley.com/files/" + fileId + "?access_token=" + accessToken, true);
        xhttp.responseType = "arraybuffer"
        xhttp.send();
        return true
      }, (error) => reject(error))
    })
  }
  getDocumentGroup (documentId){
    var that = this;
    return new Promise(function (resolve, reject){
      that.getAccessToken().then((accessToken) => {
        var opts = {
          method: "GET",
          url: "https://api.mendeley.com/documents/"+documentId,
          headers: {
            'Authorization': "Bearer "+accessToken
          }
        }
        Utils.makeRequest(opts).then(function (resp){
          var doc = JSON.parse(resp.responseText)
          if(doc.group_id != null) resolve(doc.group_id)
          else resolve(false)
        })
      }, (error) => reject(error))
    })
  }
  getAllFolders (marker){
    let that = this;
    let limit = 500
    return new Promise(function(resolve,reject){
      that.getAccessToken().then((accessToken) => {
        var opts = {
          method: "GET",
          url: "https://api.mendeley.com/folders/",
          headers: {
            'Authorization': "Bearer " + accessToken
          },
          params: {
            limit: limit
          }
        }
        if (marker != null) opts.params["marker"] = marker;
        Utils.makeRequest(opts).then((response) => {
          var folders = JSON.parse(response.responseText);
          if (folders.length == limit) {
            var newMarker = folders[limit - 1].id;
            that.getAllFolders(newMarker).then(function (nextPageFolders) {
              var dl = folders.concat(nextPageFolders);
              resolve(dl);
            })
          }
          else {
            resolve(folders);
          }
        }, (error) => reject(error));
      },(error) => reject(error))
    })
  }
  getDocument (documentId){
    var that = this;
    return new Promise(function (resolve, reject){

      that.getAccessToken().then((accessToken) => {
        var opts = {
          method: "GET",
          url: "https://api.mendeley.com/documents/"+documentId+'?view=all',
          headers: {
            'Authorization': "Bearer "+accessToken
          }
        }
        Utils.makeRequest(opts).then(function (resp){
          var doc = JSON.parse(resp.responseText)
          if(doc != null) resolve(doc)
          else resolve(false)
        })
      }, (error) => reject(error))
    })
  }
  getDocumentFolders (documentId){
    var that = this;
    return new Promise(function (resolve, reject){
      //resolve([{folderId:"660894dc-6e6c-4286-8ff1-66e36e8f866a",name:"tarari"}, {folderId:"8e50582f-c552-4070-8c93-d8894c27881d",name:"lalala"}])
      that.getAllFolders().then((folders) => {
        that.getDocument(documentId).then((doc) => {
          if (doc == null) reject('Document not found')
          if (doc.folder_uuids == null || doc.folder_uuids.length == 0) resolve([])
          let foldersWithdocument = folders.filter((f) => {return doc.folder_uuids.indexOf(f.id) != -1})
          resolve(foldersWithdocument.map((folder) => {return {"folderId":folder.id,"name":folder.name}}))
        }, (error) => reject(error))
      }, (error) => reject(error))
      /*let pL = []
      folders.forEach((folder) => {
        let p = new Promise((res,rej) => {
          that.getFolderDocuments(folder.id).then((documentIdList) => {
            res({folder:folder.id,folderName:folder.name,documents:documentIdList})
          }, (err) => rej(err))
        })
        pL.push(p)
      })
      Promise.all(pL).then((results) => {
        let foldersWithDocument = results.filter((f) => {return f.documents.indexOf(documentId) != -1})
        resolve(foldersWithDocument.map((f) => {return {"folderId":f.folder,"name":f.folderName}}))
      })
    }, (error) => reject(error))*/
    })
  }
  getGroupInfo (groupId){
    let that = this;
    return new Promise(function(resolve,reject){
      that.getAccessToken().then((accessToken) => {
        var opts = {
          method: "GET",
          url: `https://api.mendeley.com/groups/v2/${groupId}`,
          headers: {
            'Authorization': `Bearer ${accessToken}`
          }
        }
        Utils.makeRequest(opts).then((response) => {
          var groupInfo = JSON.parse(response.responseText);
          resolve(groupInfo)
        }, (error) => reject(error));
      },(error) => reject(error))
    })
  }
  getFolderDocumentsBibtex (folderId, groupId){
    let that = this
    return new Promise((resolve, reject) => {
      that.getAccessToken().then((accessToken) => {
        var opts = {
          method: "GET",
          url: "https://api.mendeley.com/documents",
          headers: {
            'Authorization': "Bearer " + accessToken,
            'Accept': 'application/x-bibtex'
          },
          params: {
            limit: 100,
            view: 'bib',
            folderId: folderId
          }
        }
        if(groupId!=null) opts.params["group_id"] = groupId
        // todo - pagination
        Utils.makeRequest(opts).then((response) => {
          var ret = response.responseText
          resolve(ret)
        }, (error) => reject(error))
      },(error) => reject(error))
    })
  }
}

module.exports = MendeleyBackgroundClient
