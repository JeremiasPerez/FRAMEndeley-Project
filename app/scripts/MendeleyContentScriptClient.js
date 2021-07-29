
const PDFJS = require("pdfjs-dist")
PDFJS.GlobalWorkerOptions.workerSrc = chrome.extension.getURL("libs/pdf.worker.js")

const Utils = require('./utils/Utils')

class MendeleyContentScriptClient {
  static processInBackground (method, args){
    return new Promise((resolve,reject) => {
      chrome.runtime.sendMessage({scope:"mendeleyClient",message:"processInBackground",method:method,args:args},(response) => {
        // todo check response
        if(response.response != null) resolve(response.response)
        else if(response.error != null) reject(response.error)
      })
    })
  }
  static getFolderName (folderId){
    return this.processInBackground('getFolderName',{folderId:folderId})
  }
  static getFolderDocuments (folderId,groupId){
    return this.processInBackground('getFolderDocuments',{folderId:folderId,groupId:groupId})
  }
  static getDocumentAnnotations (documentId,marker){
    return this.processInBackground('getDocumentAnnotations',{documentId:documentId,marker:marker})
  }
  static getDocumentFile (documentId){
    return this.processInBackground('getDocumentFile',{documentId:documentId})
  }
  static getDocuments (groupId,marker){
    return this.processInBackground('getDocuments',{groupId:groupId,marker:marker})
  }
  static updateAnnotationColor (annotationId,newColor){
    return this.processInBackground('updateAnnotationColor',{annotationId:annotationId,newColor:newColor})
  }
  static updateAnnotationNote (annotationId,newNote){
    return this.processInBackground('updateAnnotationNote',{annotationId:annotationId,newNote:newNote})
  }
  static removeAnnotation (annotationId){
    return this.processInBackground('removeAnnotation',{annotationId:annotationId})
  }
  static getGroupDescription (groupId){
    return this.processInBackground('getGroupDescription',{groupId:groupId})
  }
  static setGroupDescription (groupId,description){
    return this.processInBackground('setGroupDescription',{groupId:groupId,description:description})
  }
  static getFileId (documentId){
    return this.processInBackground('getFileId',{documentId:documentId})
  }
  static getGroupDocuments (groupId){
    return this.processInBackground('getGroupDocuments',{groupId:groupId})
  }
  static getOCRText (page,position){
    const scale = 8;
    return new Promise(function(resolve,reject){
      let bry = position.bottom_right.y
      let brx = position.bottom_right.x
      let tly = position.top_left.y
      let tlx = position.top_left.x
      var viewport = page.getViewport(1);
      var canvas = document.createElement('canvas');
      var context = canvas.getContext('2d');

      var marginX = viewport.viewBox[0];
      var marginY = viewport.viewBox[1];

      bry -= marginY;
      brx -= marginX;
      tly -= marginY;
      tlx -= marginX;

      canvas.height = scale*((bry - tly)+4);
      canvas.width = scale*((brx - tlx)+4);
      var transformX = scale*(-tlx + 2);
      var transformY = scale*(-1*(viewport.height - bry) + 2);
      var renderContext = {
        canvasContext: context,
        viewport: viewport,
        transform: [scale,0,0,scale,transformX,transformY]
      };
      page.render(renderContext).then(function(r) {
        var annotationText = OCRAD(canvas);
        resolve(annotationText)
      })
    })
  }
  static filterOverlappingChunks (pageTextChunks,position){
    let isInside = function(point,topLeft,bottomRight){
      if(point.x<topLeft.x) return false
      if(point.x>bottomRight.x) return false
      if(point.y>topLeft.y) return false
      if(point.y<bottomRight.y) return false
      return true
    }
    let bottomRightY = position["top_left"].y - (position["bottom_right"].y - position["top_left"].y)
    return pageTextChunks.items.filter((el) => {
      let elBottomRightY = el.transform[5]-el.transform[0]
      if(isInside({x:position["top_left"].x,y:position["top_left"].y},{x:el.transform[4],y:el.transform[5]},{x:el.transform[4]+el.width,y:elBottomRightY/*position["bottom_right"].y*/})) return true
      if(isInside({x:position["top_left"].x,y:bottomRightY},{x:el.transform[4],y:el.transform[5]},{x:el.transform[4]+el.width,y:elBottomRightY/*position["bottom_right"].y*/})) return true
      if(isInside({x:position["bottom_right"].x,y:position["top_left"].y},{x:el.transform[4],y:el.transform[5]},{x:el.transform[4]+el.width,y:elBottomRightY/*position["bottom_right"].y*/})) return true
      if(isInside({x:position["bottom_right"].x,y:bottomRightY},{x:el.transform[4],y:el.transform[5]},{x:el.transform[4]+el.width,y:elBottomRightY/*position["bottom_right"].y*/})) return true

      if(isInside({x:el.transform[4],y:el.transform[5]},{x:position["top_left"].x,y:position["top_left"].y},{x:position["bottom_right"].x,y:bottomRightY})) return true
      if(isInside({x:el.transform[4]+el.width,y:el.transform[5]},{x:position["top_left"].x,y:position["top_left"].y},{x:position["bottom_right"].x,y:bottomRightY})) return true
      if(isInside({x:el.transform[4],y:elBottomRightY},{x:position["top_left"].x,y:position["top_left"].y},{x:position["bottom_right"].x,y:bottomRightY})) return true
      if(isInside({x:el.transform[4]+el.width,y:elBottomRightY},{x:position["top_left"].x,y:position["top_left"].y},{x:position["bottom_right"].x,y:bottomRightY})) return true

      return false // todo fix
    })
  }
  static mergeSubsequentChunks (chunks){
    const xMargin = 4
    const yMargin = 1
    let merged = []
    let textChunks = JSON.parse(JSON.stringify(chunks))
    for(let i=0;i<textChunks.length;i++){
      let t = merged.find((el) => {
        let xDiff = el.transform[4] - (textChunks[i].transform[4]+textChunks[i].width)
        let yDiff = el.transform[5] - textChunks[i].transform[5]
        if(xDiff>=-1*xMargin&&xDiff<=xMargin&&yDiff<=yMargin&&yDiff>=-1*yMargin) return true
        return false
      })
      if (t!=null){
        t.width = t.transform[4]+t.width - textChunks[i].transform[4]
        t.transform[4] = textChunks[i].transform[4]
        t.transform[5] = Math.min(t.transform[5],textChunks[i].transform[5])
        t.height = Math.max(t.height,textChunks[i].height)
        t.str = textChunks[i].str + ' ' + t.str
        continue
      }
      let t2 = merged.find((el) => {
        let xDiff = textChunks[i].transform[4] - (el.transform[4]+el.width)
        let yDiff = textChunks[i].transform[5] - el.transform[5]
        if(xDiff>=-1*xMargin&&xDiff<=xMargin&&yDiff<=yMargin&&yDiff>=-1*yMargin) return true
        return false
      })
      if (t2!=null){
        t2.width = textChunks[i].transform[4]+textChunks[i].width - t2.transform[4]
        t2.transform[5] = Math.min(t2.transform[5],textChunks[i].transform[5])
        t2.height = Math.max(t2.height,textChunks[i].height)
        t2.str = t2.str + ' ' + textChunks[i].str
        continue
      }
      merged.push(textChunks[i])
    }
    return merged
  }
  static getRowChunk (pageTextChunks,position){
    let overlappingChunks = this.filterOverlappingChunks(pageTextChunks,position)
    let mergedChunks = this.mergeSubsequentChunks(overlappingChunks)
    let maxChunk = null
    let maxOverlap = 0
    let overlap

    // todo take x axis overlap into consideration
    for(let i=0;i<mergedChunks.length;i++) {
      //if(mergedChunks[i].transform[4]<=position["top_left"].x&&mergedChunks[i].transform[5]<=position["top_left"].y){
      //  overlap = mergedChunks[i].transfor
      //}
      overlap = Math.min(mergedChunks[i].transform[5],position["top_left"].y) - Math.max(mergedChunks[i].transform[5]-mergedChunks[i].transform[0],position["top_left"].y-(position["bottom_right"].y-position["top_left"].y))
      if(overlap>maxOverlap){
        maxOverlap = overlap
        maxChunk = mergedChunks[i]
      }
    }
    return maxChunk
  }
  static getRowText (pageTextChunks,position){
    let rowChunk = this.getRowChunk(pageTextChunks,position)
    if(rowChunk==null||rowChunk.str==null) return null
    return rowChunk.str
  }
  static getEstimateText (pageTextChunks,position){
    let rowChunk = this.getRowChunk(pageTextChunks,position)
    if(rowChunk==null||rowChunk.str==null) return ''
    let startP = (position["top_left"].x - rowChunk.transform[4]) / rowChunk.width
    let endP = (position["bottom_right"].x - rowChunk.transform[4]) / rowChunk.width
    let startX = startP < 0 ? 0 : Math.floor(rowChunk.str.length * startP)
    let endX = endP > 1 ? rowChunk.str.length : Math.ceil(rowChunk.str.length * endP)
    return rowChunk.str.substring(startX,endX)
    // todo
  }
  static getBestApproximateMatch (referenceText,approximateText){
    let bestMatch = ''
    let bestSimilarity = 0
    if(referenceText==null||referenceText=='') return approximateText
    for(let i=0;i<referenceText.length;i++){
      for(let j=i+1;j<=referenceText.length;j++){
        let sim = Utils.similarity(referenceText.substring(i,j),approximateText)
        if(sim>bestSimilarity){
          bestSimilarity = sim
          bestMatch = referenceText.substring(i,j)
        }
      }
    }
    return bestMatch
  }
  static cleanTextWordsWithReference (textToClean,referenceText){
    let that = this
    let splitText = textToClean.split(" ")
    let cleanText = splitText.map((el) => {return that.getBestApproximateMatch(referenceText,el)})
    return cleanText.join(' ')
  }
  static cleanOCRText (text){
    let t = text
    if(t.indexOf('\n')!=-1){
      let lines = t.split('\n')
      let bestPct = 1
      let lowestLine = ''
      let pct
      for(let i=0;i<lines.length;i++){
        if(lines[i]==''||lines[i]==' ') continue
        //let nonWordCharsCount = lines[i].replace(/[\w\s]+/g,"").length
        let nonWordCharsCount = lines[i].replace(/[a-zA-Z0-9\s]+/g,"").length
        if(nonWordCharsCount==0) return lines[i]
        pct = nonWordCharsCount / lines[i].length
        if(pct<bestPct){
          bestPct = pct
          lowestLine = lines[i]
        }
      }
      return lowestLine
    }
    return t
  }
  static getFragmentText (page,pageTextChunks,position){
    const similarityThreshold = 0.7
    const blankRatioThreshold = 0.05 // average word length => 4.5 letters / 1 space each 6 characters (changed to half)
    const nonWordCharPctThreshold = 0.1
    let that = this
    return new Promise(function(resolve,reject){
      let positionCopy = JSON.parse(JSON.stringify(position))
      let extractedText = ''
      let estimatedText = that.getEstimateText(pageTextChunks,position)
      let rowText = that.getRowText(pageTextChunks,position)
      that.getOCRText(page,position).then(function(dirtyOcrText){
        let ocrText = that.cleanOCRText(dirtyOcrText)
        let ocrWithoutBlanks = ocrText.replace(/\s/g,"")
        if((estimatedText==null||estimatedText=='')&&(ocrText!=null&&ocrText!='')){
          extractedText = ocrText
        }
        else if((ocrText==null||ocrText=='')&&(estimatedText!=null&&estimatedText!='')){
          extractedText = estimatedText
        }
        else{
          let strSim = Utils.similarity(estimatedText,ocrWithoutBlanks)
          if(strSim==1){
            // TEXT GIVEN BY PDFJS SOMETIMES HAS NO BLANKS
            extractedText = ocrText
          }
          else if(strSim>similarityThreshold){
            let blankCount = estimatedText.split('').filter((el) => {return el == ' '}).length
            let blankCountOcr = ocrText.split('').filter((el) => {return el == ' '}).length
            if(blankCount/estimatedText.length<blankRatioThreshold&&blankCountOcr>blankCount){
              extractedText = that.cleanTextWordsWithReference(ocrText,rowText)
            }
            else{
              extractedText = that.getBestApproximateMatch(estimatedText,ocrText)
            }
          }
          else{
            //let ocrNonWordCharsCount = ocrText.replace(/[\w\s]+/g,"").length
            //let ocrNonWordCharsCount = ocrText.replace(/[a-zA-Z0-9\s]+/g,"").length
            //if(ocrNonWordCharsCount == 0 || ocrNonWordCharsCount/ocrText.length<nonWordCharPctThreshold){
            //  extractedText = ocrText
            //}
            //else extractedText = estimatedText
            extractedText = estimatedText
          }
        }
        positionCopy["extractedText"] = extractedText.replace(/\s+/g," ")
        resolve(positionCopy)
      })
    })
  }
  static getPageAnnotationFragments (pdf,pageNum,annotationFragments){
    let that = this
    return new Promise(function(resolve,reject){
      pdf.getPage(parseInt(pageNum)).then(function(page){
        page.getTextContent().then(function(pageTextChunks){
          let pL = []
          for(let j=0;j<annotationFragments.length;j++){
            pL.push(that.getFragmentText(page,pageTextChunks,annotationFragments[j]))
          }
          Promise.all(pL).then(function(extractedPageFragments){
            resolve(extractedPageFragments)
            // TODO
          })
        })
      })
    })
  }
  static getPDFFileContent (fileId){
    return this.processInBackground('getPDFFileContent',{fileId:fileId})
  }
  static parsePdfFile (fileId,annotations){
    var that = this;
    return new Promise(function (resolve, reject) {
      if (annotations.length == 0) {
        resolve([])
        return
      }
      if(annotations.length>0){
        that.processInBackground("getPDFFileContent",{fileId:fileId}).then((response) => {
          let pdfData = atob(response.data)
          PDFJS.getDocument({data:pdfData}).then(function(pdf){
            let annotationsCopy = JSON.parse(JSON.stringify(annotations))
            let annotationFragments = [].concat.apply([],annotationsCopy.map((el) => {return el.positions}))

            var groupBy = function(xs, key) {
              return xs.reduce(function(rv, x) {
                (rv[x[key]] = rv[x[key]] || []).push(x);
                return rv;
              }, {});
            }

            let annotationFragmentsByPage = groupBy(annotationFragments,"page")

            let pL = []
            for(let key in annotationFragmentsByPage){
              pL.push(that.getPageAnnotationFragments(pdf,key,annotationFragmentsByPage[key]))
            }

            Promise.all(pL).then(function(extractedFragments){
              let fragments = [].concat.apply([],extractedFragments)
              let annotationList = []
              for(let i=0;i<annotationsCopy.length;i++){
                let annotationObj = {color: Utils.getHexColor(annotationsCopy[i].color.r,annotationsCopy[i].color.g,annotationsCopy[i].color.b),text:'',id:annotationsCopy[i].id,documentId:annotationsCopy[i].document_id,page:annotationsCopy[i].positions[0].page,positions:annotationsCopy[i].positions}
                for(let j=0;j<annotationsCopy[i].positions.length;j++){
                  if(annotationsCopy[i].positions.findIndex((el) => {return JSON.stringify(el) == JSON.stringify(annotationsCopy[i].positions[j])}) != j) continue
                  let fragment = fragments.find((el) => {
                    return el.page==annotationsCopy[i].positions[j].page && el["top_left"].x == annotationsCopy[i].positions[j]["top_left"].x && el["top_left"].y == annotationsCopy[i].positions[j]["top_left"].y && el["bottom_right"].x == annotationsCopy[i].positions[j]["bottom_right"].x && el["bottom_right"].y == annotationsCopy[i].positions[j]["bottom_right"].y
                  })
                  if(fragment!=null&&fragment["extractedText"]!=null&&fragment["extractedText"]!=''){
                    if(annotationObj.text!='') annotationObj.text += ' '
                    annotationObj.text += fragment["extractedText"]
                  }
                }
                if(annotationsCopy[i].text!=null&&annotationsCopy[i].text!='') annotationObj["note"] = annotationsCopy[i].text
                annotationList.push(annotationObj)
              }
              pdf.destroy()
              resolve(annotationList)
            })
          })
        })
      }
    })
  }
  static checkAccessToken (){
    return this.processInBackground('checkAccessToken',{})
  }
  static getDocAnnotations (documentId){
    let that = this
    return new Promise(function(resolve,reject){
      that.getDocumentAnnotations(documentId).then(function(annotations){
        if(annotations.length==0) resolve([]);
        else{
          chrome.storage.local.get(["RW_ANNOTATIONS"],function(options){
            let annotationsToExtract = annotations
            let cachedAnnotations = []
            let rwAnnotations = options["RW_ANNOTATIONS"] == null ? {} : options["RW_ANNOTATIONS"]
            for(let i=annotationsToExtract.length-1;i>=0;i--){
              if(rwAnnotations[annotations[i].id]!=null&&rwAnnotations[annotations[i].id].text!=null&&rwAnnotations[annotations[i].id].text!=''){
                let annotation = {
                  text: rwAnnotations[annotations[i].id].text,
                  id: annotations[i].id,
                  created: annotations[i].created,
                  last_modified: annotations[i].last_modified,
                  color: Utils.getHexColor(annotations[i].color.r,annotations[i].color.g,annotations[i].color.b),
                  documentId: documentId
                }
                // todo manage better
                if (annotation.color === '3679e0') annotation.color = 'bae2ff'

                if(annotations[i].text!=null) annotation["note"] = annotations[i].text
                cachedAnnotations.push(annotation)
                annotationsToExtract.splice(i,1)
              }
            }
            that.getDocumentFile(documentId).then(function(fileId){
              that.parsePdfFile(fileId,annotationsToExtract).then(function(documentAnnotations){
                resolve(cachedAnnotations.concat(documentAnnotations))
                chrome.storage.local.get(["RW_ANNOTATIONS"],function(opt){
                  let rwAnn = opt["RW_ANNOTATIONS"] == null ? {} : opt["RW_ANNOTATIONS"]
                  for(let i=0;i<documentAnnotations.length;i++){
                    if(rwAnn[documentAnnotations[i].id]==null){
                      rwAnn[documentAnnotations[i].id] = {
                        text: documentAnnotations[i].text
                      }
                    }
                    else if(rwAnn[documentAnnotations[i].id].text==null){
                      rwAnn[documentAnnotations[i].id].text = documentAnnotations[i].text
                    }
                  }
                  chrome.storage.local.set({"RW_ANNOTATIONS":rwAnn},function(){
                  })
                })
              })
            })
          })
        }
      })
    })
  }
  static async docFunc (documentIdList) {
    let pL = []
    for(let i=0;i<documentIdList.length;i++){
      let annot = await this.getDocAnnotations(documentIdList[i])
      pL.push({documentId:documentIdList[i],annotations:annot})
    }
    return new Promise(function(resolve,reject){
      resolve(pL)
    })
  }
  static async getRawAnnotationsFromDocumentList (documentIdList){
    let that = this
      //let pL = []
      let annotations = []
      //documentIdList.forEach((documentId) => {
        //let annot = await this.getDocumentAnnotations(documentId)
      for(let i=0;i<documentIdList.length;i++){
        let annot = await this.getDocumentAnnotations(documentIdList[i])
      //pL.push(that.getDocumentAnnotations(documentId))
        //pL.push(annot)
        annotations.push(annot)
      //})
      }
      return new Promise(function(resolve,reject){
      //Promise.all(pL).then((annotations) => {
        let annotationList = annotations.flat().filter((el) => {return el != null})
        let annotationsToReturn = annotationList.map((annotation) => {
          return {
            color: annotation.color,
            note: annotation.text
          }
        })
        resolve(annotationsToReturn)
      //})
    })
  }
  static getDocumentGroup (documentId) {
    return this.processInBackground('getDocumentGroup',{documentId:documentId})
  }
  static getDocumentFolders (documentId) {
    return this.processInBackground('getDocumentFolders',{documentId:documentId})
  }
  static getGroupInfo (groupId) {
    return this.processInBackground('getGroupInfo',{groupId:groupId})
  }
  static getFolderDocumentsBibtex (folderId, groupId) {
    return this.processInBackground('getFolderDocumentsBibtex',{folderId:folderId, groupId:groupId})
  }
}

module.exports = MendeleyContentScriptClient
