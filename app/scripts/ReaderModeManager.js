
const axios = require('axios')
const PDFJS = require('pdfjs-dist')
PDFJS.GlobalWorkerOptions.workerSrc = chrome.extension.getURL('libs/pdf.worker.js')
const Swal = require('sweetalert2')
const $ = require('jquery')
const JQueryPosition = require('jquery.ui.position')
const ContextMenu = require('jquery-contextmenu')
const MendeleyContentScriptClient = require('./MendeleyContentScriptClient')
const Utils = require('./utils/Utils')
const Theme = require('./model/Theme')
const CodebookManager = require('./CodebookManager')
const Alerts = require('./Alerts')

const mendeleyColorMap = {
  green: 'dcffb0',
  blue: 'bae2ff',
  purple: 'd3c2ff',
  pink: 'ffc4fb',
  red: 'ffb5b6',
  grey: 'dbdbdb',
  orange: 'ffdeb4',
  yellow: 'fff5ad'
}

class ReaderModeManager {
  constructor (documentId, fileId) {
    this._documentId = documentId
    this._fileId = fileId
    this._pdfFile = null
    this._currentFolderId = null
    this._groupId = null
    this._groupMode = false
    this._ourWorkCoding = null
    this._folderList = []
    this._hasGroupAdminPermission = null
    this._permissionToModifyGroupDescription = ['owner', 'admin']
    this._canvasColorCoding = null
    this._readingPurposeObserver = null
    this._readingPurposeObserver2 = null
    this._readingPurposeObserver3 = null
    this._onLoadObserver = null
    this._finishedLoading = false
  }
  setCurrentFolderId (folderId) {
    this._currentFolderId = folderId
  }
  getCurrentFolderId () {
    return this._currentFolderId
  }
  setFolderList (folders) {
    this._folderList = folders
  }
  getFolderList () {
    return this._folderList
  }
  setGroupId (gId) {
    this._groupId = gId
  }
  setGroupMode (mode) {
    this._groupMode = mode
  }
  getGroupMode () {
    return this._groupMode
  }
  getGroupId () {
    return this._groupId
  }
  getColorCoding () {
    return this._canvasColorCoding
  }
  setColorCoding (coding) {
    this._canvasColorCoding = coding
    let colorPicker = document.querySelector('button[class*=AnnotationColourPickerButton]')
    let color = colorPicker.textContent
    if (color == null) return
    let c = mendeleyColorMap[color]
    if (c == null) return
    if (this.getColorCoding().getThemeByColor(c) != null && this.getColorCoding().getThemeByColor(c).name != null) {
      let cpText = Array.from(colorPicker.childNodes).find((n) => {return n.nodeType === 3})
      if (cpText == null) return
      cpText.parentNode.replaceChild(document.createTextNode(this.getColorCoding().getThemeByColor(c).name),cpText)
    }
  }
  setOurWorkCoding (coding) {
    this._ourWorkCoding = coding
  }
  parseDescription (description) {
    try {
      let d = JSON.parse(description)
      let e = {}
      for (let key in d) {
        if (d[key].n != null) e[key] = d[key].n
      }
      return e
    } catch (error) {
      return null
    }
  }
  encodeColorCoding () {
    let c = {}
    let coding = this._ourWorkCoding != null ? this._ourWorkCoding : {}
    for (let key in this._canvasColorCoding) {
      c[key] = {'n': this._canvasColorCoding[key]}
      if (coding[key] != null && coding[key] !== '') c[key]['c'] = coding[key]
    }
    return JSON.stringify(c)
  }
  onLoad () {
    let that = this
    return new Promise((resolve, reject) => {
      let obs = new MutationObserver((mutations) => {
        let colorPicker = document.querySelector('div[class^=AnnotationColourPicker]')
        if (colorPicker != null) {
          obs.disconnect()
          resolve()
        }
      })
      let cfg = {childList: true, subtree: true}
      obs.observe(document.body, cfg)
      that._onLoadObserver = obs
    })
  }
  insertFramendeleyCanvasButton () {
    // insert canvas button
    // todo
    //that.insertReadingPurposes()
    let that = this
    let zoomInButton = document.querySelector('div[class^=AnnotationColourPicker]')
    let img = document.createElement('img')
    img.id = 'CreateCanvasButton'
    // img.src = chrome.extension.getURL("images/overviewDocument.png");
    img.src = chrome.extension.getURL('images/logo.png')
    var a = document.createElement('a')
    a.id = 'FRAMEndeleyCanvasButton'
    let label = document.createElement('span')
    label.innerText = 'FRAMEndeley'
    a.appendChild(img)
    a.appendChild(label)
    a.href = '#'
    a.addEventListener('click', function () {
      if (!that._finishedLoading){
        Alerts.showWarningWindow('Wait a few seconds. Framendeley is still loading.')
      }
      else {
        that.openCanvas()
      }
    })
    zoomInButton.after(a)
  }
  init () {
    let that = this
    let cb = () => {
      that.loadPdf(that._fileId).then(function () {
        that._finishedLoading = true
        if (that.getOpenCanvas()) {
          that.openCanvas()
        }
      }, (error) => {
        Alerts.showErrorWindow('Error while loading pdf file.')
      })
    }
    that.onLoad().then(() => {
      that.insertFramendeleyCanvasButton()
      MendeleyContentScriptClient.getDocumentGroup(that._documentId).then((groupId) => {
        if (groupId == null || groupId === false) {
          MendeleyContentScriptClient.getDocumentFolders(that._documentId).then((folders) => {
            if (folders.length === 0) return
            that.setFolderList(folders)
            that.setCurrentFolderId(folders[0].folderId)
            if (that.getGroupId() == null) that.insertFolderSelector()
            CodebookManager.getCodebook(folders[0].folderId).then((codebook) => {
              that.setColorCoding(codebook)
              that.insertReadingPurposes()
              cb()
            }, (error) => {
              Alerts.showErrorWindow('Error while loading codebook.')
            })
          }, (error) => {
            Alerts.showErrorWindow('Error while loading document folders.')
          })
        } else {
          that.setGroupId(groupId)
          that.setGroupMode(true)
          MendeleyContentScriptClient.getGroupInfo(groupId).then((groupInfo) => {
            if (groupInfo == null) {
              Alerts.showErrorWindow('Error while trying to retrieve group information')
              return
            }
            if (that._permissionToModifyGroupDescription.includes(groupInfo.role)) {
              that._hasGroupAdminPermission = true
            } else {
              that._hasGroupAdminPermission = false
            }
            CodebookManager.getCodebook(null, groupId).then((codebook) => {
              that.setColorCoding(codebook)
              that.insertReadingPurposes()
              cb()
            }, (error) => {
              Alerts.showErrorWindow(error)
            })
          }, (error) => {
            Alerts.showErrorWindow(error)
          })
        }
      })
    })
  }
  parsePdfFile (annotations) {
    let that = this
    return new Promise(function (resolve, reject) {
      if (annotations.length === 0) {
        resolve([])
        return
      }
      let pdf = that._pdfFile
      let annotationsCopy = JSON.parse(JSON.stringify(annotations))
      let annotationFragments = [].concat.apply([], annotationsCopy.map((el) => { return el.positions }))

      let groupBy = (xs, key) => {
        return xs.reduce((rv, x) => {
          (rv[x[key]] = rv[x[key]] || []).push(x)
          return rv
        }, {})
      }

      let annotationFragmentsByPage = groupBy(annotationFragments, 'page')

      let pL = []
      for (let key in annotationFragmentsByPage) {
        pL.push(MendeleyContentScriptClient.getPageAnnotationFragments(pdf, key, annotationFragmentsByPage[key]))
      }

      Promise.all(pL).then(function (extractedFragments) {
        let fragments = [].concat.apply([], extractedFragments)
        let annotationList = []
        for (let i = 0; i < annotationsCopy.length; i++) {
          let annotationObj = {color: Utils.getHexColor(annotationsCopy[i].color.r, annotationsCopy[i].color.g, annotationsCopy[i].color.b), text: '', id: annotationsCopy[i].id, documentId: annotationsCopy[i].document_id, page: annotationsCopy[i].positions[0].page, positions: annotationsCopy[i].positions}
          for (let j = 0; j < annotationsCopy[i].positions.length; j++) {
            if (annotationsCopy[i].positions.findIndex((el) => { return JSON.stringify(el) === JSON.stringify(annotationsCopy[i].positions[j]) }) != j) continue
            let fragment = fragments.find((el) => {
              return el.page === annotationsCopy[i].positions[j].page && el['top_left'].x === annotationsCopy[i].positions[j]['top_left'].x && el['top_left'].y === annotationsCopy[i].positions[j]['top_left'].y && el['bottom_right'].x === annotationsCopy[i].positions[j]['bottom_right'].x && el['bottom_right'].y === annotationsCopy[i].positions[j]['bottom_right'].y
            })
            if (fragment != null && fragment['extractedText'] != null && fragment['extractedText'] != '') {
              if (annotationObj.text !== '') annotationObj.text += ' '
              annotationObj.text += fragment['extractedText']
            }
          }
          if (annotationsCopy[i].text != null && annotationsCopy[i].text !== '') annotationObj['note'] = annotationsCopy[i].text
          annotationList.push(annotationObj)
        }
        resolve(annotationList)
        // TODO
      })
    })
  }
  loadPdf () {
    let that = this
    return new Promise((resolve, reject) => {
      MendeleyContentScriptClient.getPDFFileContent(that._fileId).then((response) => {
        let pdfData = atob(response.data)
        PDFJS.getDocument({data: pdfData}).then((pdf) => {
          that._pdfFile = pdf
          resolve()
        }).catch((error) => {
          console.log('error loadpdf')
          reject()
        })
      })
    })
  }
  displayAnnotation (annotation) {
    let swalContent = ''
    // if(annotation.code != null && annotation.code != '') swalContent += `<h2 class="highlightCode" style="text-align:left;margin-bottom:10px;font-size: 200% !important;">Code: ${annotation.code}</h2>`
    if (annotation.text != null && annotation.text != '') swalContent += '<!--<h2 class="highlightTitle" style="text-align:left;margin-bottom:10px;">Highlight:</h2>--><div class="highlightText" style="text-align:justify;font-style:italic">"' + annotation.text.replace(/</g, '&lt;').replace(/>/g, '&gt;') + '"</div>'
    Swal.fire({
      html: swalContent,
      confirmButtonText: 'View in context',
      customClass: 'annotationAlert'
    }).then((result) => {
      if (result.value) {
        let scriptElement = document.createElement('script')
        let scrollY = parseFloat(Math.max.apply(null, annotation.positions.map((e) => { return e['top_left'].y })) + 50)
        let scriptCont = 'PDFView.pdfViewer.scrollPageIntoView(' + annotation.page + ", [null, {name: 'XYZ'}, 0, " + scrollY + '])'
        scriptElement.innerText = scriptCont
        document.body.appendChild(scriptElement)
        document.querySelector('#reviewCanvas').parentNode.removeChild(document.querySelector('#reviewCanvas'))
      }
    })
  }
  loadDatalists () {
    let that = this
    let cb = (documentIdList) => {
      MendeleyContentScriptClient.getRawAnnotationsFromDocumentList(documentIdList).then((annotations) => {
        annotations.forEach((annotation) => {
          if (annotation.note == null || annotation.note === '') return
          if (annotation.color == null) return
          let color = Utils.getHexColor(annotation.color.r, annotation.color.g, annotation.color.b)
          let datalist = document.querySelector('#datalist' + color)
          if (datalist == null) return
          let datalistOptions = datalist.querySelectorAll('option')
          let optionValues = Array.from(datalistOptions).map((el) => { return el.value })
          if (!optionValues.includes(annotation.note)) {
            let option = document.createElement('option')
            option.value = annotation.note
            datalist.appendChild(option)
          }
        })
      })
    }
    if (that._currentFolderId == null) {
      MendeleyContentScriptClient.getGroupDocuments(that._groupId).then((documentIdList) => {
        cb(documentIdList)
      })
    } else {
      MendeleyContentScriptClient.getFolderDocuments(that._currentFolderId, that._groupId).then((documentIdList) => {
        cb(documentIdList)
      })
    }
  }
  openCanvas () {
    let that = this
    Swal.fire({
      title: 'Loading',
      html: 'Extracting annotations from the article...',
      onBeforeOpen: () => {
        Swal.showLoading()
        let mendeleyDocumentId = that._documentId
        // var mendeleyFileId = Scrap.getFileId();
        MendeleyContentScriptClient.getDocumentAnnotations(mendeleyDocumentId).then(function (annotations) {
          chrome.storage.local.get(['RW_ANNOTATIONS'], function (options) {
            let rwAnnotations = options['RW_ANNOTATIONS'] == null ? {} : options['RW_ANNOTATIONS']
            let annotationsToExtract = annotations
            let cachedAnnotations = []
            for (let i = annotationsToExtract.length - 1; i >= 0; i--) {
              if (rwAnnotations[annotations[i].id] != null && rwAnnotations[annotations[i].id].text != null && rwAnnotations[annotations[i].id].text != '') {
                let annotation = {
                  text: rwAnnotations[annotations[i].id].text,
                  id: annotations[i].id,
                  color: Utils.getHexColor(annotations[i].color.r, annotations[i].color.g, annotations[i].color.b),
                  documentId: mendeleyDocumentId,
                  page: annotations[i].positions[0].page,
                  positions: annotations[i].positions
                }
                if (annotations[i].text != null) {
                  annotation['code'] = annotations[i].text
                }
                cachedAnnotations.push(annotation)
                annotationsToExtract.splice(i, 1)
              }
            }
            if (annotationsToExtract.length > 0) {
              that.parsePdfFile(annotations).then(function (annotationList) {
                Swal.hideLoading()
                that.generateCanvas(cachedAnnotations.concat(annotationList))

                // update cache
                chrome.storage.local.get(['RW_ANNOTATIONS'], function (opt) {
                  let rwAnn = opt['RW_ANNOTATIONS'] == null ? {} : opt['RW_ANNOTATIONS']
                  for (let i = 0; i < annotationList.length; i++) {
                    if (rwAnn[annotationList[i].id] == null) {
                      rwAnn[annotationList[i].id] = {
                        text: annotationList[i].text
                      }
                    } else if (rwAnn[annotationList[i].id].text == null) {
                      rwAnn[annotationList[i].id].text = annotationList[i].text
                    } else {
                      // console.log(annotationList[i],"already exists in cache")
                    }
                  }
                  chrome.storage.local.set({'RW_ANNOTATIONS': rwAnn}, () => {
                    // console.log("cached done")
                  })
                })
                Swal.close()
              })
            } else {
              Swal.hideLoading()
              that.generateCanvas(cachedAnnotations)
              Swal.close()
            }
          })
        })
      }
    })
  }
  generateCanvas (annotationList) {
    let that = this
    let groupedAnnotations = {}
    /* for(let key in that.canvasColorCoding){
      let colorAnnotations = annotationList.filter((e) => {return e.color===key});
      groupedAnnotations[that.canvasColorCoding[key]] = colorAnnotations;
    } */
    let codebook = that._canvasColorCoding
    codebook.themes.forEach((theme) => {
      let colorAnnotations = annotationList.filter((e) => { return e.color === theme.color })
      // groupedAnnotations[that.canvasColorCoding[theme.color]] = colorAnnotations;
      groupedAnnotations[theme.name] = colorAnnotations
    })
    let canvasPageURL = chrome.extension.getURL('pages/canvas.html')
    axios.get(canvasPageURL).then((response) => {
      document.body.lastChild.insertAdjacentHTML('beforebegin', response.data)
      // document.body.appendChild(response.data)

      let canvasContainer = document.querySelector('#canvasContainer')
      document.querySelector('#canvasOverlay').addEventListener('click', function () {
        document.querySelector('#reviewCanvas').parentNode.removeChild(document.querySelector('#reviewCanvas'))
      })
      document.querySelector('#canvasContainer').addEventListener('click', function (e) {
        e.stopPropagation()
      })
      document.addEventListener('keydown', function (e) {
        if (e.keyCode == 27 && document.querySelector('#reviewCanvas') != null) document.querySelector('#reviewCanvas').parentNode.removeChild(document.querySelector('#reviewCanvas'))
      })
      document.querySelector('#canvasCloseButton').addEventListener('click', function () {
        document.querySelector('#reviewCanvas').parentNode.removeChild(document.querySelector('#reviewCanvas'))
      })

      let canvasClusters = {}
      let criteriaList = []

      let clusterTemplate = document.querySelector('#propertyClusterTemplate')
      let columnTemplate = document.querySelector('#clusterColumnTemplate')
      let propertyTemplate = document.querySelector('#clusterPropertyTemplate')
      let annotationTemplate = document.querySelector('#annotationTemplate')
      // let clusterHeight = 100.0/Object.keys(canvasClusters).length

      let getColumnAnnotationCount = (properties) => {
        let i = 0
        for (let j = 0; j < properties.length; j++) {
          i += groupedAnnotations[properties[j]].length
        }
        return i
      }
      let getTotalAnnotationCount = () => {
        let i = 0
        for (let key in groupedAnnotations) {
          i += groupedAnnotations[key].length
        }
        return i
      }
      let getColumnWidth = (properties) => {
        let colNum = Math.ceil(Object.keys(groupedAnnotations).length / 2.0)
        return 15.0 + (100 - colNum * 15.0) * getColumnAnnotationCount(properties) / getTotalAnnotationCount()
        /* let colNum = canvasClusters[group].length===2 ? 2 : Math.ceil(canvasClusters[group].length/2)
        if(getGroupAnnotationCount(group)===0) return 100.0/Math.ceil(canvasClusters[group].length/2)
        return 15.0+getColumnAnnotationCount(properties)*(100.0-15*colNum)/getGroupAnnotationCount(group) */
      }
      let getPropertyHeight = (property, properties) => {
        if (properties.length === 1) return 100
        if (getColumnAnnotationCount(properties) === 0 && properties.length === 2) return 50
        return 15.0 + groupedAnnotations[property].length * (100.0 - 15 * 2) / getColumnAnnotationCount(properties)
      }

      let clusterElement = clusterTemplate.content.cloneNode(true)
      clusterElement.querySelector('.propertyCluster').style.height = '100%'
      let clusterContainer = clusterElement.querySelector('.clusterContainer')
      let currentColumn = null
      let i = 0
      for (let key in groupedAnnotations) {
        if (i % 2 === 0 || Object.keys(groupedAnnotations).length === 2) {
          currentColumn = columnTemplate.content.cloneNode(true)
          if (Object.keys(groupedAnnotations).length === 1) currentColumn.querySelector('.clusterColumn').style.width = '100%'
          else if (getTotalAnnotationCount() === 0) currentColumn.querySelector('.clusterColumn').style.width = 100.0 / Math.ceil(Object.keys(groupedAnnotations).length / 2.0) + '%'
          /* else if(canvasClusters[key].length==2) currentColumn.querySelector('.clusterColumn').style.width = "50%"
          else currentColumn.querySelector('.clusterColumn').style.width = parseFloat(100.0/Math.ceil(canvasClusters[key].length/2)).toString()+'%' */
          else {
            let columnWidth
            if (Object.keys(groupedAnnotations).length === 2) columnWidth = getColumnWidth([key])
            else if (i < Object.keys(groupedAnnotations).length - 1) columnWidth = getColumnWidth([key, Object.keys(groupedAnnotations)[i + 1]])
            else columnWidth = getColumnWidth([key])
            currentColumn.querySelector('.clusterColumn').style.width = columnWidth + '%'
          }
        }
        let clusterProperty = propertyTemplate.content.cloneNode(true)
        // clusterProperty.querySelector(".clusterProperty").style.backgroundColor = "#"+Object.keys(that.canvasColorCoding)[Object.values(that.canvasColorCoding).indexOf(key)]
        clusterProperty.querySelector('.clusterProperty').style.backgroundColor = '#' + that._canvasColorCoding.getThemeByName(key).color
        clusterProperty.querySelector('.propertyLabel').innerText = key
        // clusterProperty.querySelector(".propertyLabel").innerText = canvasClusters[key][i]
        /* if(canvasClusters[key].length==1||canvasClusters[key].length==2||(canvasClusters[key].length%2==1&&i==canvasClusters[key].length-1)) clusterProperty.querySelector(".clusterProperty").style.height = "100%"
        else clusterProperty.querySelector(".clusterProperty").style.height = "50%"; */
        let propertyHeight = 100
        if (Object.keys(groupedAnnotations).length == 2) propertyHeight = 100
        else if (i % 2 === 0 && i < Object.keys(groupedAnnotations).length - 1) propertyHeight = getPropertyHeight(key, [key, Object.keys(groupedAnnotations)[i + 1]])
        else if (i % 2 === 1) propertyHeight = getPropertyHeight(key, [key, Object.keys(groupedAnnotations)[i - 1]])
        clusterProperty.querySelector('.clusterProperty').style.height = propertyHeight + '%'
        clusterProperty.querySelector('.clusterProperty').style.width = '100%'
        clusterProperty.querySelector('.themeDatalist').id = 'datalist' + that._canvasColorCoding.getThemeByName(key).color

        let criterionAnnotations = groupedAnnotations[key]
        // let criterionAnnotations = review.annotations.filter((e) => {return e.criterion === canvasClusters[key][i]})
        if (criterionAnnotations.length === 0) clusterProperty.querySelector('.propertyAnnotations').style.display = 'none'
        else {
          clusterProperty.querySelector('.propertyAnnotations').style.display = 'grid'
          clusterProperty.querySelector('.propertyAnnotations').style.gridGap = '1% 1%'
          let colNum = Math.ceil(Math.sqrt(criterionAnnotations.length))
          let rowNum = Math.ceil(criterionAnnotations.length / colNum)
          let colPct = (100.0 / colNum) - 1.0
          let rowPct = (100.0 / rowNum) - 1.0
          clusterProperty.querySelector('.propertyAnnotations').style.gridTemplateColumns = 'repeat(auto-fit, minmax(' + colPct + '%, 1fr))'
          // clusterProperty.querySelector('.propertyAnnotations').style.gridTemplateRows = "repeat(auto-fit, minmax("+rowPct+"%, 1fr))"
          clusterProperty.querySelector('.propertyAnnotations').style.gridTemplateRows = 'repeat(auto-fit, minmax(' + rowPct + '%, 0.5fr))'
        }
        // let annotationWidth = 100.0/criterionAnnotations.length

        for (let j = 0; j < criterionAnnotations.length; j++) {
          let annotationElement = annotationTemplate.content.cloneNode(true)
          // annotationElement.querySelector('.canvasAnnotation').style.width = annotationWidth+'%'
          if (criterionAnnotations[j].text != null) annotationElement.querySelector('.canvasAnnotation .annotationQuote').innerText = '"' + criterionAnnotations[j].text + '"'
          if (criterionAnnotations[j].color != null) annotationElement.querySelector('.canvasAnnotation').style.backgroundColor += '#' + criterionAnnotations[j].color
          if (criterionAnnotations[j].code != null) annotationElement.querySelector('.canvasAnnotation .codeSelection').value = criterionAnnotations[j].code
          annotationElement.querySelector('.canvasAnnotation .codeSelection').addEventListener('change', function (e) {
            MendeleyContentScriptClient.updateAnnotationNote(criterionAnnotations[j].id, e.target.value)
            let datalist = document.querySelector('#datalist' + criterionAnnotations[j].color)
            if (datalist == null) return
            let datalistOptions = datalist.querySelectorAll('option')
            let optionValues = Array.from(datalistOptions).map((element) => { return element.value })
            if (!optionValues.includes(e.target.value)) {
              let option = document.createElement('option')
              option.value = e.target.value
              datalist.appendChild(option)
            }
          })
          annotationElement.querySelector('.canvasAnnotation .codeSelection').setAttribute('list', 'datalist' + criterionAnnotations[j].color)
          annotationElement.querySelector('.canvasAnnotation .annotationQuote').addEventListener('click', function () {
            that.displayAnnotation(criterionAnnotations[j])
          })
          clusterProperty.querySelector('.propertyAnnotations').appendChild(annotationElement)
        }
        currentColumn.querySelector('.clusterColumn').appendChild(clusterProperty)
        if (i % 2 === 1 || i === Object.keys(groupedAnnotations).length - 1 || Object.keys(groupedAnnotations).length === 2) clusterContainer.appendChild(currentColumn)
        i++
      }
      canvasContainer.appendChild(clusterElement)

      // to move
      let oldHeight, oldWidth
      let oldCalculatedHeight, oldCalculatedWidth, oldCalculatedX, oldCalculatedY
      $('.propertyLabel').click(function (e) {
        let el = e.target
        let isExpanded = el.parentNode.className.indexOf('expanded') !== -1
        let isExpanding = el.parentNode.classList.contains('FRAMEndeleyCanvasExpanding')
        if (isExpanding) return
        else el.parentNode.classList.add('FRAMEndeleyCanvasExpanding')
        if (!isExpanded) {
          oldHeight = el.parentNode.style.height
          oldWidth = el.parentNode.style.width
          oldCalculatedHeight = el.parentNode.getBoundingClientRect().height
          oldCalculatedWidth = el.parentNode.getBoundingClientRect().width
          oldCalculatedX = el.parentNode.getBoundingClientRect().left
          oldCalculatedY = el.parentNode.getBoundingClientRect().top

          let clonedEl = el.parentNode.cloneNode(true)
          clonedEl.id = 'clonedExpand'
          el.parentNode.style.width = el.parentNode.getBoundingClientRect().width + 'px'
          el.parentNode.style.height = el.parentNode.getBoundingClientRect().height + 'px'
          el.parentNode.style.top = el.parentNode.getBoundingClientRect().top + 'px'
          el.parentNode.style.left = el.parentNode.getBoundingClientRect().left + 'px'
          el.parentNode.style.position = 'fixed'

          el.parentNode.parentNode.insertBefore(clonedEl, el.parentNode.nextSibling)
          el.parentNode.style.zIndex = 200005

          $(el.parentNode).animate({
            height: document.getElementById('canvasContainer').getBoundingClientRect().height + 'px',
            width: document.getElementById('canvasContainer').getBoundingClientRect().width + 'px',
            top: document.getElementById('canvasContainer').getBoundingClientRect().top + 'px',
            left: document.getElementById('canvasContainer').getBoundingClientRect().left + 'px'
          }, 500, function () {
            el.parentNode.className += ' expanded'
            el.parentNode.classList.remove('FRAMEndeleyCanvasExpanding')
          })
        } else {
          $(el.parentNode).animate({
            height: oldCalculatedHeight,
            width: oldCalculatedWidth,
            left: oldCalculatedX,
            top: oldCalculatedY
          }, 500, function () {
            el.parentNode.classList.remove('FRAMEndeleyCanvasExpanding')
            el.parentNode.className = el.parentNode.className.replace('expanded', '')
            el.parentNode.style.width = oldWidth
            el.parentNode.style.height = oldHeight
            let clonedExpand = document.getElementById('clonedExpand')
            if (clonedExpand != null) clonedExpand.parentNode.removeChild(clonedExpand)
            el.parentNode.style.position = 'relative'
            el.parentNode.style.top = ''
            el.parentNode.style.left = ''
            el.parentNode.style.zIndex = ''
            oldCalculatedHeight = null
            oldCalculatedWidth = null
            oldCalculatedX = null
            oldCalculatedY = null
            oldHeight = null
            oldWidth = null
          })
        }
      })
      that.loadDatalists()
    })
  }
  insertFolderSelector () {
    let that = this
    let folders = that.getFolderList()
    if (folders.length < 2) return
    var canvasButton = document.getElementById('FRAMEndeleyCanvasButton')
    let select = document.createElement('select')
    select.id = 'FRAMEndeleyFolderSelection'
    folders.forEach((folder) => {
      let option = document.createElement('option')
      option.innerText = folder.name
      option.value = folder.folderId
      select.appendChild(option)
    })
    select.addEventListener('change', (e) => {
      let selected = e.target.value
      if (selected != that.getCurrentFolderId()) {
        CodebookManager.getCodebook(selected, null).then((codebook) => {
          that.setColorCoding(codebook)
          that.setCurrentFolderId(selected)
          that.insertReadingPurposes()
        }, (error) => {
          Alerts.showErrorWindow('Error while trying to change codebook')
        })
      }
    })
    canvasButton.after(select)
  }
  insertReadingPurposes () {
    let that = this
    let modifyPurpose = (color, text) => {
      Swal.fire({
        title: 'Modify theme',
        input: 'text',
        inputValue: text,
        showCancelButton: true,
        inputValidator: (value) => {
          return !value && 'You need to write something!'
        }
      }).then((result) => {
        if (result.value && result.value !== text) {
          let coding = that.getColorCoding()
          let theme = coding.getThemeByName(text)
          if (theme == null) {
            theme = new Theme(result.value, color)
            coding.insertTheme(theme)
          } else {
            theme.name = result.value
          }
          CodebookManager.updateCodebook(that.getGroupId(), that.getCurrentFolderId(), coding).then(() => {

          }, (error) => {
            Alerts.showErrorWindow('Error while updating codebook.')
          })
        }
      })
    }

    let obs1 = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        let cpButton = document.querySelector('button[class*=AnnotationColourPickerButton]')
        if (cpButton == null) return
        if (mutation.attributeName === 'aria-pressed' && mutation.oldValue === 'false' && cpButton.getAttribute('aria-pressed') === 'true'){
          let colorPickerElem = document.querySelectorAll('div[class^=AnnotationColourPicker] button[class^=AnnotationColourPickerItem]')
          colorPickerElem.forEach((cp) => {
            let span = cp.querySelector('span[class^=AnnotationColourPickerItem]')
            if (span == null) return
            let color = cp.getAttribute('aria-label')
            if (color == null) return
            let c = mendeleyColorMap[color]
            if (c == null) return
            if (color != null && that.getColorCoding().getThemeByColor(c) != null) {
              span.textContent = that.getColorCoding().getThemeByColor(c).name
            }
            else {
              span.textContent = ''
            }
          })
        }
      })
    })
    let cfg1 = {attributes: true,   attributeOldValue: true}
    let colorPickerButton = document.querySelector('button[class*=AnnotationColourPickerButton]')
    if (colorPickerButton != null){
      obs1.observe(colorPickerButton,cfg1)
      that._readingPurposeObserver2 = obs1
    }

    let obs2 = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.attributeName !== 'aria-selected') return
        let selectedItem = document.querySelector('div[class*=DropdownElements] button[class*=AnnotationColourPickerItem][aria-selected=true] span[class*=AnnotationColourPickerItem]')
        if (selectedItem == null) return
        let colorPickerButton = document.querySelector('button[class*=AnnotationColourPickerButton]')
        if (colorPickerButton == null) return
        let cpText = Array.from(colorPickerButton.childNodes).find((n) => {return n.nodeType === 3})
        if (cpText == null) return
        if (selectedItem.textContent !== colorPickerButton.textContent){
          cpText.parentNode.replaceChild(document.createTextNode(selectedItem.textContent),cpText)
          //colorPickerButton.textContent = selectedItem.textContent
        }
      })
    })
    let cfg2 = {attributes: true, subtree: true}
    let targetEl = document.querySelector('div[class*=AnnotationColourPicker] div[role=menu]')
    if (targetEl != null){
      obs2.observe(targetEl,cfg2)
      that._readingPurposeObserver3 = obs2
    }

    let obs = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        let colorPicker = document.querySelector('div[class*=ListAnnotationColours]')
        if (colorPicker != null) {
          if (colorPicker.classList.contains('initializedFramendeleyColorCoding')) return
          colorPicker.classList.add('initializedFramendeleyColorCoding')

          let colorPickerElem = document.querySelectorAll('div[class*=ListItem]')
          colorPickerElem.forEach((cp) => {
            let span = document.createElement('span')
            let color = cp.title
            if (color == null) return
            let c = mendeleyColorMap[color]
            if (c == null) return
            if (color != null && that.getColorCoding().getThemeByColor(c) != null) {
              span.textContent = that.getColorCoding().getThemeByColor(c).name
            }
            else {
              span.textContent = ''
            }
            cp.appendChild(span)
          })
        }
      })
    })
    let cfg = {childList: true, subtree: true}
    obs.observe(document.body, cfg)
    that._readingPurposeObserver = obs

    let contextMenuDisabled = that._hasGroupAdminPermission != null && that._hasGroupAdminPermission == false
    $.contextMenu({
      selector: 'div[class*=AnnotationColourPicker] div[class*=DropdownElements][role=menuitem] button',
      callback: function (key, options) {
        if (key === 'modify') {
          let el = options['$trigger'][0]
          if(el.getAttribute('aria-label') == null) return
          let c = el.getAttribute('aria-label')
          if(c == null) return
          let color = mendeleyColorMap[c]
          if(color == null) return
          let theme = that.getColorCoding().getThemeByColor(color)
          let themeOldName
          if (theme == null || theme.name == null) themeOldName = ''
          else themeOldName = theme.name
          modifyPurpose(color, themeOldName)
        }
      },
      items: {
        'modify': {name: 'Modify', disabled: contextMenuDisabled}
      }
    })

    $.contextMenu({
      selector: 'div[class*=ListAnnotationColours] div[class*=ListItem][role=menuitem]',
      callback: function (key, options) {
        if (key === 'modify') {
          let el = options['$trigger'][0]
          if(el.getAttribute('title') == null) return
          let c = el.getAttribute('title')
          if(c == null) return
          let color = mendeleyColorMap[c]
          if(color == null) return
          let theme = that.getColorCoding().getThemeByColor(color)
          let themeOldName
          if (theme == null || theme.name == null) themeOldName = ''
          else themeOldName = theme.name
          modifyPurpose(color, themeOldName)
        }
      },
      items: {
        'modify': {name: 'Modify', disabled: contextMenuDisabled}
      }
    })

  }
  getOpenCanvas (){
    var url = window.location.href;
    var regExp = /#openCanvas/g;
    return regExp.test(url)
  }
  destroy () {
    // destroy color picker context menu
    // destroy canvas button
    // destroy color picker options
    // destroy listeners / mutation observers
    if(this._readingPurposeObserver != null) this._readingPurposeObserver.disconnect()
    if(this._readingPurposeObserver2 != null) this._readingPurposeObserver2.disconnect()
    if(this._readingPurposeObserver3 != null) this._readingPurposeObserver3.disconnect()
    if(this._onLoadObserver != null) this._onLoadObserver.disconnect()
    $.contextMenu('destroy', 'div[class*=AnnotationColourPicker] div[class*=DropdownElements][role=menuitem] button')
    $.contextMenu('destroy', 'div[class*=ListAnnotationColours] div[class*=ListItem][role=menuitem]')
  }
}

module.exports = ReaderModeManager
