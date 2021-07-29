
const Scrap = require('./Scrap')
const Swal = require('sweetalert2')
const MendeleyContentScriptClient = require('./MendeleyContentScriptClient')
const Alerts = require('./Alerts')
const CodebookManager = require('./CodebookManager')
const axios = require('axios')
const Utils = require('./utils/Utils')

const $ = require('jquery')
require('jquery-migrate')
// require("jquery-ui")
const ContextMenu = require('jquery-contextmenu')
require('jquery.ui.position')
const FileSaver = require('file-saver')
const Code = require('./model/Code')
const ExportManager = require('./ExportManager')
const SankeyManager = require('./SankeyManager')

require('jquery-ui-sortable-npm')

class LibraryModeManager {
  constructor (groupId, folderId) {
    this._groupId = groupId
    this._folderId = folderId
    this._procrastinationEnabled = false
    this._listenersToRemove = []
    this._annotationsByDocument = null
    this._documentList = null
    this._localColorCoding = null
    this._groupColorCoding = null
    this._ourWorkCoding = null
    this._codebook = null
    this._hasGroupAdminPermission = null
    this._permissionToModifyGroupDescription = ['owner', 'admin']
    this._sankeyManager = null
    this._onLoadBarObserver = null
  }
  init () {
    let that = this
    this.checkProcrastinationEnabled()
    this.onLoadBar().then(() => { that.insertThemeTableButton() })
    $.contextMenu({
      selector: '#themeTable .contentRow, #themeTable #headerRow th:nth-child(1)',
      callback: function (key, options) {
        if (key === 'latex') {
          // latex
          let table = ExportManager.tableToLatex()
          let blob = new Blob([table], {type: 'application/x-latex;charset=utf-8'})
          let docTitle = 'Related work table'
          FileSaver.saveAs(blob, docTitle + '.tex')
          // bibtex
          ExportManager.folderDocumentsToBibtex(that._folderId, that._groupId).then((bibtex) => {
            let blob2 = new Blob([bibtex], {type: 'application/application/x-bibtex;charset=utf-8'})
            let docTitle2 = 'Bibliography'
            FileSaver.saveAs(blob2, docTitle2 + '.bib')
          })
        } else if (key === 'csv') {
          let table = ExportManager.tableToCSV()
          let blob = new Blob([table], {type: 'text/csv; charset=utf-8'})
          let docTitle = 'Related work table'
          FileSaver.saveAs(blob, docTitle + '.csv', true)
        } else if (key === 'sankey') {
          that._sankeyManager.showAlluvial()
        }
      },
      items: {
        'latex': {name: 'Export as LaTeX'},
        'csv': {name: 'Export as CSV'},
        'sankey': {name: 'Show alluvial diagram'}
      }
    })
    $.contextMenu({
      selector: '#themeTable #headerRow th:nth-child(n+2)',
      build: function ($trigger, e) {
        let codebook = that.getColorCoding()
        let themes = {}
        let currentTheme = $trigger[0].textContent
        let currentColor = codebook.getThemeByName(currentTheme).color
        let hasPermissionToModifyCodebook = false
        if (that._groupId != null && that._hasGroupAdminPermission === false) hasPermissionToModifyCodebook = true
        codebook.themes.forEach((theme) => {
          if (theme.name === currentTheme) return
          themes['merge' + theme.color] = {
            name: theme.name
          }
        })
        return {
          callback: function (key, options) {
            if (key === 'insert') {
              that.insertTheme(options)
            } else if (key === 'remove') {
              that.removeTheme(options)
            } else if (key === 'rename') {
              that.renameTheme(options)
            } else if (key.indexOf('merge') != -1) {
              that.mergeThemes(currentColor, key.replace('merge', ''))
            } else if (key.indexOf('codebook') != -1) {
              that.openCodebookTable(options)
            }
          },
          items: {
            'codebook': {name: 'Codebook'},
            'rename': {name: 'Rename', disabled: hasPermissionToModifyCodebook},
            'remove': {name: 'Remove', disabled: hasPermissionToModifyCodebook},
            'insert': {name: 'Split', disabled: hasPermissionToModifyCodebook},
            'merge': {name: 'Merge with',
              items: themes,
              disabled: hasPermissionToModifyCodebook
            }
          }
        }
      }
    })
    that.listenForBackgroundPDFParseProcess()
    this._sankeyManager = new SankeyManager()
  }
  parseOurWorkCodingFromDescription (description) {
    try {
      let d = JSON.parse(description)
      let e = {}
      for (let key in d) {
        if (d[key].c != null) e[key] = d[key].c
      }
      return e
    } catch (error) {
      return null
    }
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
    for (let key in this._groupColorCoding) {
      c[key] = {'n': this._groupColorCoding[key]}
      if (coding[key] != null && coding[key] !== '') c[key]['c'] = coding[key]
    }
    return JSON.stringify(c)
  }
  updateFilterQueryUrl () {
    let that = this
    let queryButtonLink = document.querySelector('#relatedWorkTable #runQueryLink')
    if (queryButtonLink == null) return
    let queryStr = ''
    let codeFilteringCellsEl = document.querySelectorAll('#filterRow td:nth-child(n+2)')
    let codeFilteringCells = Array.from(codeFilteringCellsEl)
    that._codebook.themes.forEach((t) => {
        let codeFilteringCell = codeFilteringCells.find((c) => {
          if (c.style.backgroundColor == null) return
          return Utils.backgroundColorToHex(c.style.backgroundColor) == t.color
        })
        if (codeFilteringCell == null) return
        let selectedCode = codeFilteringCell.querySelector('.filterDropdown')
        if (selectedCode == null) return
        if (selectedCode.value == 'noFilter' || selectedCode.value == 'hideColumn') return
        let entry = selectedCode.value
        let codebookCode = t.codes.find((code) => {return code.name === selectedCode.value})
        if (codebookCode != null && codebookCode.synonyms != null){
          codebookCode.synonyms.forEach((syn) => {
            entry += '"+OR+"'+syn
          })
        }
        if (queryStr !== '') queryStr += '+AND+'
        queryStr += `TITLE-ABS-KEY("${entry}")`
    })
    if (queryStr == '') {
      queryButtonLink.removeAttribute('href')
      return
    }
    let destinationURL = `https://www.scopus.com/results/results.uri?src=s&sot=b&s=${queryStr} AND SUBJAREA ("COMP")`
    queryButtonLink.setAttribute('href', destinationURL)
  }
  updateFilterQueryUrlGoogle () {
    let that = this
    let queryButtonLink = document.querySelector('#relatedWorkTable #runQueryLinkGoogle')
    if (queryButtonLink == null) return
    let queryStr = ''
    let codeFilteringCellsEl = document.querySelectorAll('#filterRow td:nth-child(n+2)')
    let codeFilteringCells = Array.from(codeFilteringCellsEl)
    that._codebook.themes.forEach((t) => {
      let codeFilteringCell = codeFilteringCells.find((c) => {
        if (c.style.backgroundColor == null) return
        return Utils.backgroundColorToHex(c.style.backgroundColor) == t.color
      })
      if (codeFilteringCell == null) return
      let selectedCode = codeFilteringCell.querySelector('.filterDropdown')
      if (selectedCode == null) return
      if (selectedCode.value == 'noFilter' || selectedCode.value == 'hideColumn') return
      let entry = selectedCode.value
      let codebookCode = t.codes.find((code) => {return code.name === selectedCode.value})
      if (codebookCode != null && codebookCode.synonyms != null){
        codebookCode.synonyms.forEach((syn) => {
          entry += '" OR "'+syn
        })
      }
      if (queryStr !== '') queryStr += ' AND '
      queryStr += `("${entry}")`
    })
    if (queryStr == '') {
      queryButtonLink.removeAttribute('href')
      return
    }
    let destinationURL = `https://www.google.com/search?q=${queryStr}`
    queryButtonLink.setAttribute('href', destinationURL)
  }
  getCitedByUrl (title) {
    let url = `https://www.scopus.com/results/results.uri?src=s&sot=b&s=REF("${title}")`
    return url
  }

  // code table
  generateCodeTable (color) {
    let that = this
    // let tableColorCoding = that.groupMode ? that.groupColorCoding : that.localColorCoding
    let codebook = that._codebook
    let colorEntry = codebook.getThemeByColor(color)
    if (colorEntry == null) return
    let codeTablePageURL = chrome.extension.getURL('pages/codeTable.html')

    let autocompleteInputEvent = (ev) => {
      let targetInput = ev.target
      // get codes to autocomplete
      let theme = that.getColorCoding().getThemeByColor(color)
      let themeCodes = theme.codes
      let codesToAutocomplete = themeCodes.map((c) => { return {name: c.name, description: c.description, operational: c.operational} })
      let codeInput = document.querySelectorAll('#codeTable .quoteCode input')
      codeInput.forEach((el) => {
        // if(el.isSameNode(targetInput)) return
        if (el.value == null || el.value === '') return
        if (codesToAutocomplete.find((code) => { return code.name === el.value }) == null) {
          codesToAutocomplete.push({name: el.value})
        }
      })
      // get matching codes
      let valueToFind = ev.target.value
      let valueToFindRegEx = new RegExp(valueToFind, 'gi')
      let codesMatching = codesToAutocomplete.filter((code) => { return code.name.toLowerCase().includes(valueToFind.toLowerCase()) })
      // remove autocomplete container
      let autocompleteContainer = document.querySelector('#FRAMEndeleyCodeAutocompleteContainer')
      if (autocompleteContainer != null) autocompleteContainer.parentNode.removeChild(autocompleteContainer)
      if (codesMatching.length == 0) return
      // create autocomplete element
      autocompleteContainer = document.createElement('div')
      autocompleteContainer.id = 'FRAMEndeleyCodeAutocompleteContainer'
      let templateElement = document.querySelector('#codeTableAutocompleteElement')
      codesMatching.forEach((code) => {
        let codeEntry = templateElement.content.cloneNode(true)
        codeEntry.addEventListener('click', (e) => {
          e.preventDefault()
          e.stopPropagation()
        })
        codeEntry.querySelector('.FRAMEndeleyCodeAutocompleteElementTooltip').addEventListener('click', (e) => {
          e.preventDefault()
          e.stopPropagation()
        })
        codeEntry.querySelector('.FRAMEndeleyCodeAutocompleteElementLabel').innerText = code.name
        if (code.description != null && code.description != '') {
          codeEntry.querySelector('.FRAMEndeleyCodeAutocompleteDescription').innerText = code.description
        }
        if (code.operational != null && code.operational != '') {
          codeEntry.querySelector('.FRAMEndeleyCodeAutocompleteOperational').innerText = code.operational
        }
        codeEntry.querySelector('.FRAMEndeleyCodeAutocompleteElementLabel').addEventListener('click', (e) => {
          targetInput.focus()
          targetInput.value = e.target.textContent
          let autocompleteCont = document.querySelector('#FRAMEndeleyCodeAutocompleteContainer')
          autocompleteCont.parentNode.removeChild(autocompleteCont)
          e.stopPropagation()
          e.preventDefault()
          let changeEvent = new Event('change', {'bubbles': true, 'cancelable': true})
          targetInput.dispatchEvent(changeEvent)
        })
        codeEntry.querySelector('.FRAMEndeleyCodeAutocompleteDescription').addEventListener('change', (e) => {
          let codebookTheme = that.getColorCoding().getThemeByColor(color)
          let codes = codebookTheme.codes
          let codeToModify = codes.find((c) => { return c.name == code.name })
          if (codeToModify == null) {
            let newCode = new Code(code.name, e.target.value)
            codebookTheme.insertCode(newCode)
          } else {
            codeToModify.description = e.target.value
          }
          CodebookManager.updateCodebook(that._groupId, that._folderId, that.getColorCoding()).then(() => {

          },
            (error) => { Alerts.showErrorWindow('Error when updating codebook') })
        })
        codeEntry.querySelector('.FRAMEndeleyCodeAutocompleteOperational').addEventListener('change', (e) => {
          let codebookTheme = that.getColorCoding().getThemeByColor(color)
          let codes = codebookTheme.codes
          let codeToModify = codes.find((c) => { return c.name === code.name })
          if (codeToModify == null) {
            let newCode = new Code(code.name, null, e.target.value)
            codebookTheme.insertCode(newCode)
          } else {
            codeToModify.operational = e.target.value
          }
          CodebookManager.updateCodebook(that._groupId, that._folderId, that.getColorCoding()).then(() => {

          },
            (error) => { Alerts.showErrorWindow('Error when updating codebook') })
        })
        codeEntry.querySelector('.FRAMEndeleyCodeAutocompleteElementLabel').addEventListener('mouseover', (e) => {
          let codeEntryElement = e.target.parentNode
          let activeElement = document.querySelector('.FRAMEndeleyCodeAutocompleteElement.FRAMEndeleyAutocompleteItemActive')
          if (activeElement != null) activeElement.classList.remove('FRAMEndeleyAutocompleteItemActive')
          codeEntryElement.classList.add('FRAMEndeleyAutocompleteItemActive')
        })
        codeEntry.querySelector('.FRAMEndeleyCodeAutocompleteElementLabel').parentNode.addEventListener('mouseout', (e) => {
          /* let hoveredElement = document.querySelector(":hover")
          if(hoveredElement == null){

          }
          let codeEntryElement = e.target
          let tooltip = codeEntryElement.parentNode.querySelector('.FRAMEndeleyCodeAutocompleteElementTooltip')
          if(tooltip == null){

          }
          if(hoveredElement.sameElement())
          if(hoveredElement)
          if(codeEntryElement.classList.contains('FRAMEndeleyCodeAutocompleteElementLabel')) codeEntryElement = codeEntryElement.parentNode
          let tooltip = codeEntryElement.querySelector(".FRAMEndeleyCodeAutocompleteElementTooltip")
          if(tooltip.classList.contains('FRAMEndeleyTooltipVisible')) tooltip.classList.remove('FRAMEndeleyTooltipVisible') */
        })
        autocompleteContainer.appendChild(codeEntry)
      })
      targetInput.after(autocompleteContainer)
    }

    let autocompleteInput = (inputElement) => {
      inputElement.addEventListener('input', autocompleteInputEvent)
      inputElement.addEventListener('focus', autocompleteInputEvent)
      inputElement.addEventListener('click', (e) => {
        e.stopPropagation()
      })
      inputElement.addEventListener('keydown', (e) => {
        let input = e.target
        let autocompleteOptions = input.parentNode.querySelectorAll('.FRAMEndeleyCodeAutocompleteElement')
        if (autocompleteOptions.length === 0) return
        let optionsArray = Array.from(autocompleteOptions)
        let activeOption = input.parentNode.querySelector('.FRAMEndeleyCodeAutocompleteElement.FRAMEndeleyAutocompleteItemActive')
        let activeOptionPos = null
        if (activeOption != null) {
          activeOptionPos = optionsArray.findIndex((item) => { return item.isSameNode(activeOption) })
        }
        if (e.keyCode == 40) { // down
          if (activeOptionPos == null) autocompleteOptions[0].classList.add('FRAMEndeleyAutocompleteItemActive')
          else if (autocompleteOptions.length === 1) return
          else if (activeOptionPos === autocompleteOptions.length - 1) {
            activeOption.classList.remove('FRAMEndeleyAutocompleteItemActive')
            autocompleteOptions[0].classList.add('FRAMEndeleyAutocompleteItemActive')
          } else {
            activeOption.classList.remove('FRAMEndeleyAutocompleteItemActive')
            autocompleteOptions[activeOptionPos + 1].classList.add('FRAMEndeleyAutocompleteItemActive')
          }
          e.preventDefault()
          e.stopPropagation()
        } else if (e.keyCode === 38) { // up
          if (activeOptionPos == null) autocompleteOptions[0].classList.add('FRAMEndeleyAutocompleteItemActive')
          else if (autocompleteOptions.length === 1) return
          else if (activeOptionPos === 0) {
            activeOption.classList.remove('FRAMEndeleyAutocompleteItemActive')
            autocompleteOptions[autocompleteOptions.length - 1].classList.add('FRAMEndeleyAutocompleteItemActive')
          } else {
            activeOption.classList.remove('FRAMEndeleyAutocompleteItemActive')
            autocompleteOptions[activeOptionPos - 1].classList.add('FRAMEndeleyAutocompleteItemActive')
          }
          e.preventDefault()
          e.stopPropagation()
        } else if (e.keyCode === 13) { // enter
          inputElement.value = activeOption.querySelector('.FRAMEndeleyCodeAutocompleteElementLabel').textContent
          inputElement.dispatchEvent(new Event('change', {'bubbles': true, 'cancelable': true}))
          let autocomplete = document.querySelector('#FRAMEndeleyCodeAutocompleteContainer')
          autocomplete.parentNode.removeChild(autocomplete)
          e.preventDefault()
          e.stopPropagation()
        }
      })
    }

    // chrome.storage.local.get(["RW_ANNOTATIONS"], function(options){
    // let rwAnnotations = options["RW_ANNOTATIONS"] == null ? {} : options["RW_ANNOTATIONS"]
    axios.get(codeTablePageURL).then((resp) => {
      document.querySelector('#themeTable').style.display = 'none'
      // document.body.lastChild.insertAdjacentHTML('beforebegin',resp.data)
      document.querySelector('#themeTable').insertAdjacentHTML('beforebegin', resp.data)

      document.querySelector('#codeTableCloseButton').addEventListener('click', function () {
        document.querySelector('#codeTableParent').parentNode.removeChild(document.querySelector('#codeTableParent'))
        document.querySelector('#themeTable').parentNode.removeChild(document.querySelector('#themeTable'))
      })
      document.querySelector('#codeTableOverlay').addEventListener('click', function (e) {
        document.querySelector('#codeTableParent').parentNode.removeChild(document.querySelector('#codeTableParent'))
        document.querySelector('#themeTable').parentNode.removeChild(document.querySelector('#themeTable'))
        e.stopPropagation()
      })
      document.querySelector('#codeTableContainer').addEventListener('click', function (e) {
        let autocomplete = document.querySelector('#FRAMEndeleyCodeAutocompleteContainer')
        if (autocomplete != null) autocomplete.parentNode.removeChild(autocomplete)
        e.stopPropagation()
      })
      document.addEventListener('keydown', function (e) {
        if (e.keyCode == 27 && document.querySelector('#codeTableParent') != null) document.querySelector('#codeTableParent').parentNode.removeChild(document.querySelector('#codeTableParent'))
        if (e.keyCode == 27 && document.querySelector('#themeTable') != null) document.querySelector('#themeTable').parentNode.removeChild(document.querySelector('#themeTable'))
      })

      let codeTableHeader = document.querySelector('#coteTableTheme')
      codeTableHeader.querySelector('#backToThemeTableButton').src = chrome.extension.getURL('images/arrowLeft.svg')
      codeTableHeader.querySelector('#backToThemeTableButton').addEventListener('click', function () {
        document.querySelector('#themeTable').style.display = 'initial'
        document.querySelector('#codeTableParent').parentNode.removeChild(document.querySelector('#codeTableParent'))
        that.reloadFilterDropdown()
        that.manageDuplicateCodesInThemeTableCells()
      })
      codeTableHeader.appendChild(document.createTextNode(colorEntry.name))
      codeTableHeader.style.backgroundColor = Utils.hexToRGBA(color)
      document.querySelector('#codeTableHeaderRow').style.backgroundColor = Utils.hexToRGBA(color)

      let codeTableRowTemplate = document.querySelector('#codeTableRowTemplate')
      let codeTableQuoteTemplate = document.querySelector('#codeTableQuoteTemplate')

      let myWorkRowInput = document.querySelector('#codeTable .ourWorkRow input')
      if (that._groupId != null && that._hasGroupAdminPermission == false) myWorkRowInput.disabled = 'disabled'
      autocompleteInput(myWorkRowInput) // todo change datalist for own autocomplete
      if (colorEntry.ownWorkCode != null) myWorkRowInput.value = colorEntry.ownWorkCode
      myWorkRowInput.addEventListener('change', function (e) {
        let input = e.target
        let value = e.target.value
        document.querySelector('#quoteCodeDatalist').innerHTML = ''
        let codes = document.querySelectorAll('.quoteCode input, .ourWorkRow input')
        for (let j = 0; j < codes.length; j++) {
          if (codes[j].value == null || codes[j].value == '') continue
          if (document.querySelector('#quoteCodeDatalist option[value="' + codes[j].value + '"]') != null) continue
          let datalistOption = document.createElement('option')
          datalistOption.setAttribute('value', codes[j].value)
          document.querySelector('#quoteCodeDatalist').appendChild(datalistOption)
        }
        let cb = () => {
          if (input.value == '') {
            document.querySelector('#relatedWorkTable .ourWorkRow td[style*="background-color: ' + Utils.hexToRGBA(color) + '"]').innerText = ''
          } else {
            document.querySelector('#relatedWorkTable .ourWorkRow td[style*="background-color: ' + Utils.hexToRGBA(color) + '"]').innerText = input.value
          }
        }
        let newCodebook = that.getColorCoding()
        let theme = newCodebook.getThemeByColor(color)
        theme.ownWorkCode = input.value
        CodebookManager.updateCodebook(that._groupId, that._folderId, newCodebook).then(() => {
          cb()
        }, (error) => {
          Alerts.showErrorWindow('Error while trying to update the codebook. '+error)
        })
      })

      // filter also affects to code table todo test new feature
      let filteredDocuments = document.querySelectorAll('#themeTable .contentRow.filterActive .workTitle')
      let filteredDocumentsArray = Array.from(filteredDocuments)
      let filteredDocumentIds = filteredDocumentsArray.map((el) => { return el.getAttribute('documentid') })

      for (let i = 0; i < that._annotationsByDocument.length; i++) {
        let doc = that._documentList.find((el) => { return el.id == that._annotationsByDocument[i].documentId })
        if (doc.id != null && filteredDocumentIds.includes(doc.id)) continue // filter also affects to code table todo test new feature
        let tr = codeTableRowTemplate.content.cloneNode(true)
        let themeAnnotations = that._annotationsByDocument[i].annotations.filter((el) => { return el.color == color })
        let rowCount = themeAnnotations.length == 0 ? 1 : themeAnnotations.length
        tr.querySelector('td').setAttribute('rowspan', rowCount)
        tr.querySelector('.workTitle').innerText = doc.title
        tr.querySelector('.workTitle').setAttribute('documentId', doc.id)
        tr.querySelector('.workTitle').addEventListener('click', (ev) => {
          let docId = ev.target.getAttribute('documentId')
          if (docId == null) return
          MendeleyContentScriptClient.getFileId(docId).then((fileId) => {
            chrome.runtime.sendMessage({mes: 'openCanvas', documentId: docId, fileId: fileId})
          }, (error) => showErrorWindow('Error while retrieving file.'))
        })
        if (themeAnnotations.length > 0) {
          let firstQuote = codeTableQuoteTemplate.content.cloneNode(true)
          firstQuote.querySelector('.codeTableAnnotation').innerText = themeAnnotations[0].text
          firstQuote.querySelector('.codeTableAnnotation').id = themeAnnotations[0].id
          if (themeAnnotations[0].note != null && themeAnnotations[0].note != '') {
            firstQuote.querySelector('.quoteCode input').setAttribute('value', themeAnnotations[0].note)
            let datalistOption = document.createElement('option')
            datalistOption.setAttribute('value', themeAnnotations[0].note)
            document.querySelector('#quoteCodeDatalist').appendChild(datalistOption)
          }
          autocompleteInput(firstQuote.querySelector('.quoteCode input')) // todo change datalist for own autocomplete
          firstQuote.querySelector('.quoteCode input').setAttribute('documentId', doc.id)
          // let quoteInfo = rwAnnotations[themeAnnotations[0].id]
          // if(quoteInfo!=null&&quoteInfo.code!=null&&quoteInfo.code!='') firstQuote.querySelector(".quoteCode input").setAttribute("value",quoteInfo.code)
          tr.querySelector('tr').appendChild(firstQuote)
        } else {
          tr.querySelector('tr').appendChild(document.createElement('td'))
          tr.querySelector('tr').appendChild(document.createElement('td'))
        }
        // document.querySelector("#codeTable tbody").appendChild(tr)
        for (let j = 1; j < themeAnnotations.length; j++) {
          let newRow = document.createElement('tr')
          let quoteRow = codeTableQuoteTemplate.content.cloneNode(true)
          quoteRow.querySelector('.codeTableAnnotation').innerText = themeAnnotations[j].text
          quoteRow.querySelector('.codeTableAnnotation').id = themeAnnotations[j].id
          // let quoteInfo = rwAnnotations[themeAnnotations[j].id]
          // if(quoteInfo!=null&&quoteInfo.code!=null&&quoteInfo.code!='') quoteRow.querySelector(".quoteCode input").setAttribute("value",quoteInfo.code)
          // if(quoteInfo!=null&&quoteInfo.code!=null&&quoteInfo.code!=''&&document.querySelector('#quoteCodeDatalist option[value="'+quoteInfo.code+'"]')==null){
          //  let datalistOption = document.createElement("option")
          //  datalistOption.setAttribute("value",quoteInfo.code)
          //  document.querySelector("#quoteCodeDatalist").appendChild(datalistOption)
          // }
          quoteRow.querySelector('.quoteCode input').setAttribute('documentId', doc.id)
          autocompleteInput(quoteRow.querySelector('.quoteCode input'))  // todo change datalist for own autocomplete
          // todo
          if (themeAnnotations[j].note != null && themeAnnotations[j].note != '') quoteRow.querySelector('.quoteCode input').setAttribute('value', themeAnnotations[j].note)
          if (themeAnnotations[j].note != null && themeAnnotations[j].note != '' && document.querySelector('#quoteCodeDatalist option[value="' + themeAnnotations[j].note + '"]') == null) {
            let datalistOption = document.createElement('option')
            datalistOption.setAttribute('value', themeAnnotations[j].note)
            document.querySelector('#quoteCodeDatalist').appendChild(datalistOption)
          }
          newRow.appendChild(quoteRow)
          // document.querySelector("#codeTable tbody").appendChild(newRow)
          tr.querySelector('tbody').appendChild(newRow)
        }
        document.querySelector('#codeTable').appendChild(tr) // todo check moved here
      }

      let codeInput = document.querySelectorAll('.quoteCode input')
      for (let i = 0; i < codeInput.length; i++) {
        codeInput[i].addEventListener('change', function (e) {
          let input = e.target
          let annotationId = input.parentNode.parentNode.querySelector('.codeTableAnnotation').id
          document.querySelector('#quoteCodeDatalist').innerHTML = ''
          let codes = document.querySelectorAll('.quoteCode input, .ourWorkRow input')
          for (let j = 0; j < codes.length; j++) {
            if (codes[j].value == null || codes[j].value == '') continue
            if (document.querySelector('#quoteCodeDatalist option[value="' + codes[j].value + '"]') != null) continue
            let datalistOption = document.createElement('option')
            datalistOption.setAttribute('value', codes[j].value)
            document.querySelector('#quoteCodeDatalist').appendChild(datalistOption)
          }
          MendeleyContentScriptClient.updateAnnotationNote(annotationId, input.value).then(function () {
            let documentId = input.getAttribute('documentId')
            let doc = that._annotationsByDocument.find((el) => { return el.documentId == documentId })
            let annotation = doc.annotations.find((el) => { return el.id == annotationId })
            annotation.note = input.value
            if (input.value == '') {
              $('#relatedWorkTable #' + annotationId).text($('#relatedWorkTable #' + annotationId).attr('annotationText'))
              $('#relatedWorkTable #' + annotationId).removeAttr('annotationCode')
            } else {
              $('#relatedWorkTable #' + annotationId).text(input.value)
              $('#relatedWorkTable #' + annotationId).attr('annotationCode', input.value)
            }
          })
          /*
          chrome.storage.local.get(["RW_ANNOTATIONS"],function(opt){
            let rwAnn = opt["RW_ANNOTATIONS"] == null ? {} : opt["RW_ANNOTATIONS"]
            if(rwAnn[annotationId]==null) rwAnn[annotationId] = {code:input.value}
            else rwAnn[annotationId]["code"] = input.value
            chrome.storage.local.set({"RW_ANNOTATIONS":rwAnn},function(){
              if(input.value==''){
                $("#relatedWorkTable #"+annotationId).text($("#relatedWorkTable #"+annotationId).attr("annotationText"))
                $("#relatedWorkTable #"+annotationId).removeAttr("annotationCode")
              }
              else{
                $("#relatedWorkTable #"+annotationId).text(input.value)
                $("#relatedWorkTable #"+annotationId).attr("annotationCode",input.value)
              }
            })
          })
          */
        })
      }
    })
    // })
  }

  // theme table
  createThemeTable () {
    let that = this
    let folderId = that._folderId
    let groupId = that._groupId
    Swal.fire({
      title: 'Loading',
      html: '<span id="FRAMEndeleyLoadingMessageBody">Getting folder documents...</span>',
      onBeforeOpen: () => {
        Swal.showLoading()
        let cb = (showPermissionsMessage) => {
          MendeleyContentScriptClient.getFolderDocuments(folderId, groupId).then((documentIdList) => {
            MendeleyContentScriptClient.getDocuments(groupId).then((dl) => {
              that._documentList = dl
              MendeleyContentScriptClient.docFunc(documentIdList).then((abd) => {
                that._annotationsByDocument = abd
                that.generateThemeTable()
                Swal.hideLoading()
                Swal.close()
                if (showPermissionsMessage != null && showPermissionsMessage === true) Alerts.showWarningWindow('You have no admin permissions in the group. Hence, you cannot modify themes neither codify your own work. If you plan to do so ask for admin permissions to the owner of the group.')
              })
            })
          })
        }

        CodebookManager.getCodebook(folderId, groupId).then((codebook) => {
          that._codebook = codebook
          if (groupId != null) {
            MendeleyContentScriptClient.getGroupInfo(groupId).then((groupInfo) => {
              if (groupInfo == null) {
                Alerts.showErrorWindow('Error while trying to retrieve group information')
                return
              }
              if (that._permissionToModifyGroupDescription.includes(groupInfo.role)) {
                that._hasGroupAdminPermission = true
                cb()
              } else {
                that._hasGroupAdminPermission = false
                cb(true)
              }
              // todo check whether the group is invite-only
            })
          } else {
            cb()
          }
        }, (error) => {
          Alerts.showErrorWindow(error)
        })
      }
    })
  }
  generateThemeTable () {
    let that = this

    let codebook = that._codebook
    let themeTablePageURL = chrome.extension.getURL('pages/themeTable.html')
    axios.get(themeTablePageURL).then((response) => {
      document.body.lastChild.insertAdjacentHTML('beforebegin', response.data)

      document.querySelector('#tableCloseButton').addEventListener('click', () => {
        document.querySelector('#themeTable').parentNode.removeChild(document.querySelector('#themeTable'))
      })
      document.querySelector('#relatedWorkOverlay').addEventListener('click', () => {
        document.querySelector('#themeTable').parentNode.removeChild(document.querySelector('#themeTable'))
      })
      document.querySelector('#relatedWorkContainer').addEventListener('click', (e) => {
        e.stopPropagation()
      })
      // todo destroy listener
      document.addEventListener('keydown', function (e) {
        if (e.keyCode === 27 && document.querySelector('#themeTable') != null) document.querySelector('#themeTable').parentNode.removeChild(document.querySelector('#themeTable'))
      })

      // filter button
      let filterButton = document.querySelector('#filterToggleIcon')
      filterButton.setAttribute('src', chrome.extension.getURL('images/expand.png'))
      filterButton.addEventListener('click', (ev) => {
        document.querySelector('#filterRow').classList.toggle('displayedRow')
        if (ev.target.style.transform == null || ev.target.style.transform === '') ev.target.style.transform = 'rotate(180deg)'
        else ev.target.style.transform = ''
      })

      // run query button Scopus
      let runQueryButton = document.querySelector('#runQueryIcon')
      runQueryButton.setAttribute('src', chrome.extension.getURL('images/scopusIcon.png'))
      runQueryButton.addEventListener('click', (e) => {
        if (e.target.href == null || e.target.href === '') return
      })

      // run query button Google
      let runQueryButtonGoogle = document.querySelector('#runQueryIconGoogle')
      runQueryButtonGoogle.setAttribute('src', chrome.extension.getURL('images/googleIcon.png'))
      runQueryButtonGoogle.addEventListener('click', (e) => {
        if (e.target.href == null || e.target.href === '') return
      })

      let headerRow = document.querySelector('#relatedWorkTable #headerRow')
      let colCount = codebook.themes.length + 1
      let colWidth = 100.0 / colCount
      document.querySelector('#relatedWorkTable #headerRow th').style.width = colWidth + '%'

      codebook.themes.forEach((theme) => {
        if (theme['name'] === '') return
        let th = document.createElement('th')
        th.className = 'tableTheme'
        th.appendChild(document.createTextNode(theme['name']))
        th.style.backgroundColor = Utils.hexToRGBA(theme['color'])
        th.style.width = 100.0 / colCount + '%'
        th.addEventListener('click', () => {
          that.generateCodeTable(theme['color'])
        })
        headerRow.appendChild(th)
      })

      let filterRow = document.querySelector('#relatedWorkTable #filterRow')
      codebook.themes.forEach((theme) => {
        let td = document.createElement('td')
        td.style.backgroundColor = Utils.hexToRGBA(theme['color'])
        td.style.width = colWidth + '%'
        let dropdown = document.createElement('select')
        dropdown.className = 'filterDropdown'

        dropdown.addEventListener('change', (el) => {
          that.updateFilterQueryUrl()
          that.updateFilterQueryUrlGoogle()
          let selectElement = el.target
          let valueToFilter = selectElement.value
          let cell = selectElement.parentNode
          let cellNum = cell.cellIndex
          let colCells = document.querySelectorAll('.contentRow td:nth-child(' + parseInt(cellNum + 1) + ')')
          let colCellsArray = Array.from(colCells)
          colCellsArray.forEach((c) => {
            if (c.classList.contains('filterActive')) {
              c.classList.remove('filterActive')
            }
            if (valueToFilter !== 'noFilter' && valueToFilter !== 'hideColumn') {
              let foundAnnotations = c.querySelectorAll('.relatedWorkAnnotation[annotationcode]')
              let foundAnnotationsArray = Array.from(foundAnnotations)
              let codes = foundAnnotationsArray.map((ann) => { return ann.getAttribute('annotationcode') })
              if (codes.indexOf(valueToFilter) === -1) c.classList.add('filterActive')
            }
          })
          let rows = document.querySelectorAll('.contentRow')
          let rowsArray = Array.from(rows)
          rowsArray.forEach((r) => {
            if (r.querySelector('.filterActive') != null && !r.classList.contains('filterActive')) r.classList.add('filterActive')
            else if (r.querySelector('.filterActive') == null && r.classList.contains('filterActive')) r.classList.remove('filterActive')
          })
        })
        td.appendChild(dropdown)
        filterRow.appendChild(td)
      })

      let myWorkRow = document.querySelector('#relatedWorkTable .ourWorkRow')
      codebook.themes.forEach((theme) => {
        let td = document.createElement('td')
        td.style.backgroundColor = Utils.hexToRGBA(theme['color'])
        if (theme['ownWorkCode'] != null) td.innerText = theme['ownWorkCode']
        myWorkRow.appendChild(td)
      })

      let rowTemplate = document.querySelector('#themeTableRowTemplate')
      let themeTable = document.querySelector('#relatedWorkTable')
      for (let i = 0; i < that._annotationsByDocument.length; i++) {
        let newRow = rowTemplate.content.cloneNode(true)
        let doc = that._documentList.find((el) => { return el.id === that._annotationsByDocument[i].documentId })
        newRow.querySelector('.workTitle').appendChild(document.createTextNode(doc.title))
        newRow.querySelector('.workTitle').setAttribute('documentId', doc.id)
        newRow.querySelector('.workTitle').addEventListener('click', function () {
          MendeleyContentScriptClient.getFileId(doc.id).then(function (fileId) {
            chrome.runtime.sendMessage({mes: 'openCanvas', documentId: doc.id, fileId: fileId})
          })
        })
        newRow.querySelector('.citedByLink').setAttribute('href', that.getCitedByUrl(doc.title))
        newRow.querySelector('.citedByLink').addEventListener('click', function () {
        })
        if (doc['citation_key'] != null) {
          newRow.querySelector('.workTitle').setAttribute('citationKey', doc['citation_key'])
        } else {
          let citationKey = ''
          if (doc['authors'] != null && doc['authors'].length > 0) {
            let firstAuthor = doc['authors'][0]['last_name'].trim().replace(/\s/g, '')
            if (firstAuthor == null || firstAuthor == '') break
            citationKey += Utils.capitalizeFirst(firstAuthor)
          }
          if (doc['year'] != null) {
            citationKey += doc['year']
          }
          let titleSplit = doc['title'].split(' ')
          citationKey += Utils.capitalizeFirst(titleSplit[0].replace(/[\?]/g, ''))
          if (titleSplit.length > 1) citationKey += Utils.capitalizeFirst(titleSplit[titleSplit.length - 1].replace(/\?/g, ''))
          newRow.querySelector('.workTitle').setAttribute('citationKey', citationKey)
        }
        /*
        else if (doc['authors'] != null && doc['authors'].length > 0 && doc['year'] != null) {
          newRow.querySelector('.workTitle').setAttribute('citationKey', doc['authors'][0]['last_name'].trim().replace(/\s/g, '') + doc['year'])
        } else {
          newRow.querySelector('.workTitle').setAttribute('citationKey', doc['title'].split(' ')[0])
        }

         */

        codebook.themes.forEach((theme) => {
          let td = document.createElement('td')
          td.addEventListener('dragover', function (ev) {
            let destinationCell = ev.currentTarget
            let draggingAnnotation = document.querySelector('.dragging')
            if (draggingAnnotation == null) return
            let draggingAnnotationCell = draggingAnnotation.parentNode
            let [cR, cG, cB, cA] = destinationCell.style.backgroundColor.replace('rgba(', '').replace(')', '').split(',')
            let childBackgroundHex = Utils.getHexColor(parseInt(cR), parseInt(cG), parseInt(cB))
            let [pR, pG, pB, pA] = draggingAnnotationCell.style.backgroundColor.replace('rgba(', '').replace(')', '').split(',')
            let parentBackgroundHex = Utils.getHexColor(parseInt(pR), parseInt(pG), parseInt(pB))
            let cellRow = ev.currentTarget.parentNode
            if (cellRow.querySelector('.dragging') != null) {
              ev.preventDefault()
              ev.stopPropagation()
            }
          })
          td.addEventListener('drop', function (ev) {
            ev.preventDefault()
            let destinationCell = ev.target.classList.contains('relatedWorkAnnotation') ? ev.target.parentNode : ev.target
            let data = ev.dataTransfer.getData('text')
            let draggedQuote = document.getElementById(data)
            // if(ev.target.contains(draggedQuote)) return
            if (destinationCell.contains(draggedQuote)) return

            let draggedAnnotationCode = draggedQuote.getAttribute('annotationCode')
            if (draggedAnnotationCode != null) {
              let colNum = Array.prototype.indexOf.call(draggedQuote.parentNode.parentNode.children, draggedQuote.parentNode)
              let c = colNum + 1
              // let destinationColumn = Array.prototype.indexOf.call(ev.target.parentNode.children,ev.target)
              let destinationColumn = Array.prototype.indexOf.call(destinationCell.parentNode.children, destinationCell)
              let annotationsToMove = document.querySelectorAll('#relatedWorkTable tr.contentRow td:nth-child(' + c + ') .relatedWorkAnnotation[annotationCode="' + draggedAnnotationCode + '"]')
              for (let j = 0; j < annotationsToMove.length; j++) {
                let rowNum = Array.prototype.indexOf.call(annotationsToMove[j].parentNode.parentNode.parentNode.querySelectorAll('.contentRow'), annotationsToMove[j].parentNode.parentNode)
                let destinationCell = document.querySelector('#relatedWorkTable').getElementsByClassName('contentRow')[rowNum].getElementsByTagName('td')[destinationColumn]
                destinationCell.appendChild(annotationsToMove[j])
                MendeleyContentScriptClient.updateAnnotationColor(annotationsToMove[j].getAttribute('annotationid'), theme.color)

                // todo test
                let docId = annotationsToMove[j].parentNode.parentNode.querySelector('.workTitle').getAttribute('documentId')
                let doc = that._annotationsByDocument.find((el) => { return el.documentId == docId })
                let ann = doc.annotations.find((el) => { return el.id == annotationsToMove[j].getAttribute('annotationid') })
                ann.color = theme.color
              }
            } else {
              // ev.target.appendChild(draggedQuote)
              destinationCell.appendChild(draggedQuote)
              MendeleyContentScriptClient.updateAnnotationColor(data, theme.color)

              // todo test
              // let docId = ev.target.parentNode.querySelector(".workTitle").getAttribute("documentId")
              let docId = destinationCell.parentNode.querySelector('.workTitle').getAttribute('documentId')
              let doc = that._annotationsByDocument.find((el) => { return el.documentId === docId })
              let ann = doc.annotations.find((el) => { return el.id === draggedQuote.getAttribute('annotationid') })
              ann.color = theme.color
            }
            draggedQuote.className = draggedQuote.className.replace('dragging', '')
            that.reloadFilterDropdown()
          })
          td.style.backgroundColor = Utils.hexToRGBA(theme.color)
          let colorAnnotations = that._annotationsByDocument[i].annotations.filter((el) => { return el.color === theme.color })
          for (let j = 0; j < colorAnnotations.length; j++) {
            let annotation = document.createElement('div')
            annotation.className = 'relatedWorkAnnotation'
            annotation.setAttribute('draggable', true)
            annotation.addEventListener('dragstart', function (ev) {
              ev.target.className += ' dragging'
              ev.dataTransfer.setData('text', ev.target.id)
            })
            annotation.addEventListener('dragend', function (ev) {
              ev.target.className = ev.target.className.replace('dragging', '')
            })
            // propagate drop and dragover to parent td element
            annotation.addEventListener('drop', function (ev) {
              ev.preventDefault()
            })
            annotation.addEventListener('dragover', function (ev) {
              let cellRow = ev.target.parentNode.parentNode
              if (cellRow.querySelector('.dragging') != null) {
                ev.preventDefault()
              }
            })
            annotation.setAttribute('id', colorAnnotations[j].id)
            annotation.setAttribute('annotationId', colorAnnotations[j].id)
            /* if(!that.groupMode&&rwAnnotations[colorAnnotations[j].id]!=null&&rwAnnotations[colorAnnotations[j].id].code!=null&&rwAnnotations[colorAnnotations[j].id].code!=""){
              annotation.innerText = rwAnnotations[colorAnnotations[j].id].code
              annotation.setAttribute("annotationCode",rwAnnotations[colorAnnotations[j].id].code)
            } */
            if (colorAnnotations[j].note != null && colorAnnotations[j].note !== '') {
              annotation.innerText = colorAnnotations[j].note
              annotation.setAttribute('annotationCode', colorAnnotations[j].note)
            } else {
              annotation.innerText = '"' + colorAnnotations[j].text + '"'
            }
            annotation.setAttribute('annotationText', '"' + colorAnnotations[j].text + '"')
            annotation.setAttribute('title', '"' + colorAnnotations[j].text + '"')
            td.appendChild(annotation)
          }
          newRow.querySelector('tr').appendChild(td)
        })
        themeTable.appendChild(newRow)
      }
      that.reloadFilterDropdown()

      // table dragger
      if (that._groupId == null || that._hasGroupAdminPermission === true) that.makeThemeTableColumnsDraggable()

      // check procrastination
      if (that.checkProcrastinationEnabled) {
        let procrastination = that.checkProcrastination()
        if (procrastination.result != null && procrastination.result === true) that.showProcrastinationMessage(procrastination.reason)
      }

      // hide duplicate codes
      that.manageDuplicateCodesInThemeTableCells()
    })
  }

  // procrastination
  checkProcrastination () {
    const minDocuments = 10
    const minDocumentWithoutAnnotations = 2
    const annotationsWithRepeatedCode = 5
    if (this._annotationsByDocument.length < minDocuments) return {result: false}
    let documentsWithoutAnnotations = this._annotationsByDocument.filter((entry) => { return entry.annotations.length === 0 })
    if (documentsWithoutAnnotations.length >= minDocumentWithoutAnnotations) return {result: true, reason: `You have ${minDocuments} or more documents and your last ${minDocumentWithoutAnnotations} have no annotations.`}
    let allAnnotations = []
    this._annotationsByDocument.forEach((entry) => { allAnnotations = allAnnotations.concat(entry.annotations) })
    let lastAnnotations = []
    allAnnotations.forEach((annotation) => {
      if (annotation.created == null) return
      if (lastAnnotations.length < annotationsWithRepeatedCode) lastAnnotations.push(annotation)
      else {
        let annotationDate = new Date(annotation.created)
        let minDate, minDateIndex
        lastAnnotations.forEach((entry, index) => {
          if (minDate == null) {
            minDate = new Date(entry.created)
            minDateIndex = index
            return
          }
          let entryDate = new Date(entry.created)
          if (entryDate < minDate) {
            minDate = entryDate
            minDateIndex = index
          }
        })
        if (minDateIndex != null && minDate < annotationDate) lastAnnotations.splice(minDateIndex, 1, annotation)
      }
    })
    let annotationsWithCode = lastAnnotations.find((annotation) => { return annotation.note != null && annotation.note !== '' })
    if (annotationsWithCode == null) return {result: true, reason: `You have ${minDocuments} or more documents and at least your last ${annotationsWithRepeatedCode} annotations have no code.`}
    let lastAnnotationIds = lastAnnotations.map((annotation) => { return annotation.id })
    let annotationsWithNewCode = lastAnnotations.find((annotation) => {
      if (annotation.note == null || annotation.note === '') return false
      let oldAnnotationWithSameCode = allAnnotations.find((entry) => {
        if (entry.note == null) return false
        if (entry.note != annotation.note) return false
        return lastAnnotationIds.indexOf(entry.id) === -1
        // return entry.note != null && entry.note == annotation.note && lastAnnotationIds.indexOf(entry.id) == -1
      })
      if (oldAnnotationWithSameCode == null) return true
      return false
    })
    if (annotationsWithNewCode == null) return {result: true, reason: `You have ${minDocuments} or more documents and at least your last ${annotationsWithRepeatedCode} annotations' code had been used previously.`}
    return {result: false}
  }
  showProcrastinationMessage (reason) {
    let that = this
    Swal.fire({
      type: 'warning',
      title: 'Saturation alert',
      html: reason,
      showCancelButton: true,
      showConfirmButton: true,
      confirmButtonText: "Don't show again",
      cancelButtonText: 'Close',
      cancelButtonColor: '#3085d6',
      confirmButtonColor: '#aaa'
    }).then((result) => {
      if (result.value) {
        chrome.storage.sync.set({'CHECK_PROCRASTINATION_ENABLED': false}, () => {
          that.checkProcrastinationEnabled = false
        })
      }
    })
  }
  checkProcrastinationEnabled () {
    let that = this
    chrome.storage.sync.get(['CHECK_PROCRASTINATION_ENABLED'], (options) => {
      that._procrastinationEnabled = options['CHECK_PROCRASTINATION_ENABLED'] != null ? options['CHECK_PROCRASTINATION_ENABLED'] : true
    })
  }

  reloadFilterDropdown () {
    let filterRowCells = document.querySelectorAll('#relatedWorkTable #filterRow td')
    let changeEvent = new Event('change')
    for (let i = 1; i < filterRowCells.length; i++) {
      let dropdown = filterRowCells[i].querySelector('.filterDropdown')
      if (dropdown == null) continue
      let selectedValue = dropdown.value
      if (selectedValue == null || selectedValue === 'noFilter') dropdown.innerHTML = '<option value="noFilter" selected="selected">*</option>'
      else dropdown.innerHTML = '<option value="noFilter">*</option>'
      let documentAnnotations = document.querySelectorAll('.contentRow td:nth-child(' + parseInt(i + 1) + ') .relatedWorkAnnotation[annotationcode]')
      let annotationElements = Array.from(documentAnnotations)
      // let uniqueCodes = annotationElements.map((el) => {return el.getAttribute("annotationcode")}).concat([document.querySelector(".ourWorkRow td:nth-child("+parseInt(i+1)+")").textContent]).filter((el) => {return el!=null&&el!==''}).filter((v, i, a) => a.indexOf(v) === i)
      let uniqueCodes = new Array(document.querySelector('.ourWorkRow td:nth-child(' + parseInt(i + 1) + ')').textContent).concat(annotationElements.map((el) => { return el.getAttribute('annotationcode') })).filter((el) => { return el != null && el !== '' }).filter((v, i, a) => a.indexOf(v) === i)
      uniqueCodes.forEach((el) => {
        let option = document.createElement('option')
        option.value = el
        if (el === selectedValue) option.setAttribute('selected', 'selected')
        option.innerText = el
        dropdown.appendChild(option)
      })

      // new option: - (remove column from alluvial diagram)
      let option = document.createElement('option')
      option.value = 'hideColumn'
      option.innerHTML = '-'
      if (selectedValue === 'hideColumn') {
        option.setAttribute('selected', 'selected')
      }
      dropdown.appendChild(option)

      dropdown.dispatchEvent(changeEvent)
    }
  }
  reloadColumnWidth () {
    let allTh = document.querySelectorAll('#relatedWorkTable th')
    let columnWidth = 100.0 / allTh.length
    for (let j = 0; j < allTh.length; j++) {
      allTh[j].style.width = columnWidth + '%'
    }
    let filterCells = document.querySelectorAll('#relatedWorkTable #filterRow td')
    for (let i = 0; i < filterCells.length; i++) {
      filterCells[i].style.width = columnWidth + '%'
    }
  }
  insertTheme (options) {
    let th = options['$trigger'][0]
    let that = this
    let codebook = that._codebook
    let freeColor = codebook.getFreeColor()
    if (freeColor == null) {
      Swal.fire({
        title: 'There are no more colors available.',
        type: 'warning'
      })
    } else {
      let themeTitle = codebook.getNewThemeName()
      if (themeTitle == null) {
        Alerts.showErrorWindow('Error retrieving free theme name')
        return
      }
      let firstRow = th.parentNode
      let colNum = Array.prototype.indexOf.call(firstRow.children, th)
      codebook.insertThemeAtPos(themeTitle, freeColor, colNum)
      // codebook.splice(colNum,0,{"color":freeColor,"code":themeTitle})
      let cb = () => {
        let themeTable = document.querySelector('#themeTable #relatedWorkTable')
        let newTheme = document.createElement('th')
        newTheme.className = 'tableTheme'
        newTheme.style.backgroundColor = Utils.hexToRGBA(freeColor)
        newTheme.innerText = themeTitle
        newTheme.addEventListener('click', function () {
          that.generateCodeTable(freeColor)
        })
        firstRow.insertBefore(newTheme, th.nextSibling)
        /* let allTh = document.querySelectorAll("#relatedWorkTable th")
        for(let j=0;j<allTh.length;j++){
          allTh[j].style.width = 100.0 / allTh.length + "%"
        } */
        let ourWorkRow = document.querySelector('#relatedWorkTable .ourWorkRow')
        let newTd = document.createElement('td')
        newTd.style.backgroundColor = Utils.hexToRGBA(freeColor)
        if (colNum === ourWorkRow.childNodes.length - 1) {
          ourWorkRow.appendChild(newTd)
        } else {
          let ins = ourWorkRow.children[colNum]
          ourWorkRow.insertBefore(newTd, ins.nextSibling)
        }
        // insert dropdown in filter row
        let filterRow = document.querySelector('#relatedWorkTable #filterRow')
        let cell = document.createElement('td')
        let dropdown = document.createElement('select')
        dropdown.className = 'filterDropdown'
        cell.appendChild(dropdown)
        cell.style.backgroundColor = Utils.hexToRGBA(freeColor)
        if (colNum === ourWorkRow.childNodes.length - 1) {
          filterRow.appendChild(cell)
        } else {
          let ins = filterRow.children[colNum]
          filterRow.insertBefore(cell, ins.nextSibling)
        }
        let tableRows = document.querySelectorAll('#relatedWorkTable .contentRow')
        for (let j = 0; j < tableRows.length; j++) {
          let newCell = document.createElement('td')
          newCell.addEventListener('dragover', function (ev) {
            let destinationCell = ev.target
            let draggingAnnotation = document.querySelector('.dragging')
            if (draggingAnnotation == null) return
            let draggingAnnotationCell = draggingAnnotation.parentNode
            let [cR, cG, cB, cA] = destinationCell.style.backgroundColor.replace('rgba(', '').replace(')', '').split(',')
            let childBackgroundHex = Utils.getHexColor(parseInt(cR), parseInt(cG), parseInt(cB))
            let [pR, pG, pB, pA] = draggingAnnotationCell.style.backgroundColor.replace('rgba(', '').replace(')', '').split(',')
            let parentBackgroundHex = Utils.getHexColor(parseInt(pR), parseInt(pG), parseInt(pB))
            let cellRow = ev.target.parentNode
            if (cellRow.querySelector('.dragging') != null) {
              ev.preventDefault()
            }
          })
          newCell.addEventListener('drop', function (ev) {
            ev.preventDefault()
            let data = ev.dataTransfer.getData('text')
            let draggedQuote = document.getElementById(data)
            if (ev.target.contains(draggedQuote)) return

            let draggedAnnotationCode = draggedQuote.getAttribute('annotationCode')
            if (draggedAnnotationCode != null) {
              let colNum = Array.prototype.indexOf.call(draggedQuote.parentNode.parentNode.children, draggedQuote.parentNode)
              let c = colNum + 1
              let destinationColumn = Array.prototype.indexOf.call(ev.target.parentNode.children, ev.target)
              let annotationsToMove = document.querySelectorAll('#relatedWorkTable tr.contentRow td:nth-child(' + c + ') .relatedWorkAnnotation[annotationCode="' + draggedAnnotationCode + '"]')
              for (let j = 0; j < annotationsToMove.length; j++) {
                let rowNum = Array.prototype.indexOf.call(annotationsToMove[j].parentNode.parentNode.parentNode.querySelectorAll('.contentRow'), annotationsToMove[j].parentNode.parentNode)
                let destinationCell = document.querySelector('#relatedWorkTable').getElementsByClassName('contentRow')[rowNum].getElementsByTagName('td')[destinationColumn]
                destinationCell.appendChild(annotationsToMove[j])
                MendeleyContentScriptClient.updateAnnotationColor(annotationsToMove[j].getAttribute('annotationid'), freeColor)

                // todo test
                let docId = annotationsToMove[j].parentNode.parentNode.querySelector('.workTitle').getAttribute('documentId')
                let doc = that._annotationsByDocument.find((el) => { return el.documentId === docId })
                let ann = doc.annotations.find((el) => { return el.id === annotationsToMove[j].getAttribute('annotationid') })
                ann.color = freeColor
              }
            } else {
              ev.target.appendChild(draggedQuote)
              MendeleyContentScriptClient.updateAnnotationColor(data, freeColor)

              // todo test
              let docId = ev.target.parentNode.querySelector('.workTitle').getAttribute('documentId')
              let doc = that._annotationsByDocument.find((el) => { return el.documentId === docId })
              let ann = doc.annotations.find((el) => { return el.id === draggedQuote.getAttribute('annotationid') })
              ann.color = freeColor
            }
            draggedQuote.className = draggedQuote.className.replace('dragging', '')
          })
          newCell.style.backgroundColor = Utils.hexToRGBA(freeColor)
          if (colNum == tableRows[j].childNodes.length - 1) {
            tableRows[j].appendChild(newCell)
          } else {
            let insertionPoint = tableRows[j].children[colNum]
            tableRows[j].insertBefore(newCell, insertionPoint.nextSibling)
          }
        }
        that.reloadFilterDropdown()
        that.reloadColumnWidth()
        that.makeThemeTableColumnDraggable(newTheme)
      }
      CodebookManager.updateCodebook(that._groupId, that._folderId, codebook).then(() => {
        cb()
      }, (error) => {
        Alerts.showErrorWindow(error)
      })
    }
  }
  removeTheme (options) {
    let that = this
    let th = options['$trigger'][0]
    let oldTheme = th.textContent
    let firstRow = th.parentNode
    let colNum = Array.prototype.indexOf.call(firstRow.children, th)
    let codebook = that._codebook
    let removeColumn = () => {
      codebook.removeTheme(oldTheme)
      /* let oldEntryPos = codebook.findIndex((entry) => {return entry["code"]==oldTheme})
      if(oldEntryPos==null||oldEntryPos==-1) return
      codebook.splice(oldEntryPos,1) */
      let cb = () => {
        let ourWorkRow = document.querySelector('#relatedWorkTable .ourWorkRow')
        ourWorkRow.removeChild(ourWorkRow.children[colNum])
        let filterRow = document.querySelector('#relatedWorkTable #filterRow')
        filterRow.removeChild(filterRow.children[colNum])
        th.parentNode.removeChild(th)
        let tableRows = document.querySelectorAll('#relatedWorkTable .contentRow')
        for (let j = 0; j < tableRows.length; j++) {
          tableRows[j].removeChild(tableRows[j].children[colNum])
        }
        that.reloadColumnWidth()
        that.reloadFilterDropdown()
      }
      CodebookManager.updateCodebook(that._groupId, that._folderId, codebook).then(() => {
        cb()
      }, (error) => {
        Alerts.showErrorWindow(error)
      })
    }
    Swal.fire({
      title: 'Are you sure?',
      text: "Note: theme annotations won't be removed. Instead, they will be yellow colored.",
      type: 'question',
      showCancelButton: true,
      cancelButtonText: 'No',
      confirmButtonText: 'Yes, remove it'
    }).then((result) => {
      let c = colNum + 1
      if (result.value) {
        /* let annotationsToRemove = document.querySelectorAll("#relatedWorkTable .contentRow td:nth-child("+c+") .relatedWorkAnnotation")
        for(let j=0;j<annotationsToRemove.length;j++){
          Mendeley.removeAnnotation(annotationsToRemove[j].getAttribute("annotationid"))
        } */
        let annotationsToChangeToYellow = document.querySelectorAll('#relatedWorkTable .contentRow td:nth-child(' + c + ') .relatedWorkAnnotation')
        for (let j = 0; j < annotationsToChangeToYellow.length; j++) {
          MendeleyContentScriptClient.updateAnnotationColor(annotationsToChangeToYellow[j].getAttribute('annotationid'), 'fff5ad')
        }
        removeColumn()
      } else if (result.dismiss) {

        // removeColumn()
      }
    })
  }
  renameTheme (options) {
    let that = this
    let th = options['$trigger'][0]
    let oldTheme = th.textContent
    let codebook = that._codebook
    let themeNames = codebook.themes.map((theme) => { return theme.name })
    let tableColorCoding = that.groupMode ? that._groupColorCoding : that._localColorCoding
    Swal.fire({
      title: 'Modify theme',
      input: 'text',
      showCancelButton: true,
      inputValidator: (value) => {
        if (!value) {
          return 'You need to write something!'
        } else if (themeNames.indexOf(value) !== -1) {
          return 'This theme name is already in use.'
        }
      }
    }).then((result) => {
      if (result.value) {
        // let oldColor = Object.keys(tableColorCoding).find((el) => {return tableColorCoding[el]==oldTheme})
        let oldEntry = codebook.getThemeByName(oldTheme)
        if (oldEntry != null) {
          // tableColorCoding[oldColor] = result.value
          oldEntry.name = result.value
          CodebookManager.updateCodebook(that._groupId, that._folderId, codebook).then(() => {
            th.innerText = result.value
          }, (error) => {
            Alerts.showErrorWindow(error)
          })
        }
      }
    })
  }
  mergeThemes (key, keyToMerge) {
    let that = this
    let newColor = Utils.hexToRGB(key)
    let pL = []
    let keyRgba = Utils.hexToRGBA(key)
    for (let i = 0; i < that._annotationsByDocument.length; i++) {
      let keyAnnotations = that._annotationsByDocument[i].annotations.filter((el) => { return el.color === keyToMerge })
      let documentCell = document.querySelector('.workTitle[documentid*="' + that._annotationsByDocument[i].documentId + '"]')
      if (documentCell == null) continue
      let destinationCell = documentCell.parentNode.parentNode.querySelector('td[style*="background-color: ' + keyRgba + '"]')
      if (destinationCell == null) continue
      // let destinationCell = document.querySelector('.workTitle[documentid*="'+that.annotationsByDocument[i].documentId+'"] ~ td[style*="background-color: '+keyRgba+'"]')
      for (let j = 0; j < keyAnnotations.length; j++) {
        pL.push(MendeleyContentScriptClient.updateAnnotationColor(keyAnnotations[j].id, key))
        keyAnnotations[j].color = key
        let annotationToMove = document.querySelector('.relatedWorkAnnotation[annotationid*="' + keyAnnotations[j].id + '"]')
        destinationCell.appendChild(annotationToMove)
      }
    }
    Promise.all(pL).then(function () {
      let colorToRemove = Utils.hexToRGBA(keyToMerge)
      let th = document.querySelector('#headerRow th[style*="background-color: ' + colorToRemove + '"]')
      let firstRow = th.parentNode
      let colNum = Array.prototype.indexOf.call(firstRow.children, th)
      let codebook = that._codebook
      // let tableColorCoding = that.groupMode ? that.groupColorCoding : that.localColorCoding
      let updateOurWorkCodeKey = false
      // delete tableColorCoding[keyToMerge]
      let themeToRemove = codebook.themes[colNum - 1]
      let themeToMerge = codebook.getThemeByColor(key)
      if (themeToMerge.ownWorkCode == null || themeToMerge.ownWorkCode === '') {
        if (themeToRemove.ownWorkCode != null && themeToRemove.ownWorkCode !== '') {
          themeToMerge.ownWorkCode = themeToRemove.ownWorkCode
          updateOurWorkCodeKey = true
        }
      }
      /* if(that.ourWorkCoding[key]==null||that.ourWorkCoding[key]==''){
        that.ourWorkCoding[key] = that.ourWorkCoding[keyToMerge]
      } */
      codebook.removeTheme(themeToRemove.name)
      // delete that.ourWorkCoding[keyToMerge]
      let cb = () => {
        let ourWorkRow = document.querySelector('#relatedWorkTable .ourWorkRow')
        if (updateOurWorkCodeKey) {
          let colorToUpdate = Utils.hexToRGBA(key)
          let td = document.querySelector('#relatedWorkTable .ourWorkRow td[style*="background-color: ' + colorToUpdate + '"]')
          let codebookEntry = that._codebook.getThemeByColor(key)
          if (codebookEntry != null && codebookEntry.ownWorkCode != null && codebookEntry.ownWorkCode !== '') td.innerText = codebookEntry.ownWorkCode
          // td.innerText = that.ourWorkCoding[key]
        }
        ourWorkRow.removeChild(ourWorkRow.children[colNum])
        let filterRow = document.querySelector('#relatedWorkTable #filterRow')
        filterRow.removeChild(filterRow.children[colNum])
        th.parentNode.removeChild(th)
        let tableRows = document.querySelectorAll('#relatedWorkTable .contentRow')
        for (let j = 0; j < tableRows.length; j++) {
          tableRows[j].removeChild(tableRows[j].children[colNum])
        }
        that.reloadFilterDropdown()
        that.reloadColumnWidth()
      }
      CodebookManager.updateCodebook(that._groupId, that._folderId, codebook).then(() => {
        cb()
      }, (error) => {
        Alerts.showErrorWindow(error)
      })
      /* if(that.groupMode){
        Mendeley.setGroupDescription(that.groupId,that.encodeColorCoding()).then(function(){
          cb()
        })
      }
      else{
        chrome.storage.sync.set({"COLOR_CODING":tableColorCoding},function(){
          chrome.storage.local.get(["OUR_WORK_CODING"],function(options) {
            let coding = options["OUR_WORK_CODING"] != null ? options["OUR_WORK_CODING"] : {};
            coding[that.folderId] = that.ourWorkCoding
            chrome.storage.local.set({"OUR_WORK_CODING":coding},function(){
              cb()
            })
          })
        })
      } */
    })
  }

  getColorCoding () {
    /* if(this.groupMode) return this.groupColorCoding
    else return this.localColorCoding */
    return this._codebook
  }
  makeThemeTableColumnsDraggable () {
    let that = this
    let headers = document.querySelectorAll('#relatedWorkTable #headerRow th:nth-child(n+2)')
    headers.forEach((a) => {
      that.makeThemeTableColumnDraggable(a)
    })
    document.body.addEventListener('dragend', (ev) => {
      if (ev.target == null || ev.target.className == null || !ev.target.classList.contains('tableTheme')) return
      let colCurrentPos = ev.target.cellIndex
      let currentTheme = ev.target.textContent
      let codebook = that._codebook
      let moved = codebook.moveThemeToPosition(currentTheme, colCurrentPos - 1)
      if (moved != null) {
        CodebookManager.updateCodebook(that._groupId, that._folderId, codebook).then(() => {
        }, (error) => {

        })
      }
    })
  }
  makeThemeTableColumnDraggable (headerCell) {
    let moveDraggingColumnToPosition = (pos) => {
      if (document.querySelector('#relatedWorkTable').getAttribute('colSwitching') != null && document.querySelector('#relatedWorkTable').getAttribute('colSwitching') === 'true') return
      document.querySelector('#relatedWorkTable').setAttribute('colSwitching', 'true')
      let currentPos = document.querySelector('#relatedWorkTable tr .draggingColumn').cellIndex
      let cellsToMove = document.querySelectorAll('#relatedWorkTable tr td:nth-child(' + parseInt(currentPos + 1) + '),th:nth-child(' + parseInt(currentPos + 1) + ')')
      cellsToMove.forEach((el) => {
        if (pos < currentPos) el.parentNode.insertBefore(el, el.parentNode.querySelector('th:nth-child(' + parseInt(pos + 1) + '),td:nth-child(' + parseInt(pos + 1) + ')'))
        else if (pos > currentPos) el.parentNode.insertBefore(el, el.parentNode.querySelector('th:nth-child(' + parseInt(pos + 1) + '),td:nth-child(' + parseInt(pos + 1) + ')').nextSibling)
      })
      document.querySelector('#relatedWorkTable').removeAttribute('colSwitching')
    }

    headerCell.setAttribute('draggable', true)
    headerCell.addEventListener('dragstart', function (e) {
      let target = e.target
      let columnWidth = window.getComputedStyle(target).width
      let colNum = target.cellIndex
      let crt = this.cloneNode(true)

      let table = document.createElement('table')
      table.id = 'draggingTable'
      table.style.width = columnWidth

      let r = document.createElement('tr')
      r.appendChild(crt)
      table.appendChild(r)

      let columnCells = document.querySelectorAll('#relatedWorkTable tr td:nth-child(' + parseInt(colNum + 1) + ')')

      columnCells.forEach((el) => {
        let elHeight = window.getComputedStyle(el).height
        let row = document.createElement('tr')
        let clone = el.cloneNode(true)
        clone.style.width = columnWidth
        clone.style.height = elHeight
        row.appendChild(clone)
        table.appendChild(row)
      })

      document.body.appendChild(table)
      e.dataTransfer.setDragImage(table, 0, 0)
      e.dataTransfer.setData('text/plain', colNum)

      document.querySelectorAll('#relatedWorkTable tr td:nth-child(' + parseInt(colNum + 1) + '),th:nth-child(' + parseInt(colNum + 1) + ')').forEach((el) => {
        el.classList.toggle('draggingColumn')
      })

      let dragoverFunc = (ev) => {
        let table = document.querySelector('#relatedWorkTable')
        if (table.getAttribute('colSwitching') != null && table.getAttribute('colSwitching') === true) return
        let th = document.querySelector('#relatedWorkTable tr .draggingColumn')
        let currentPosition = th.cellIndex

        let headerRowCells = Array.from(document.querySelectorAll('#relatedWorkTable th'))
        let headerRowCellsPosition = headerRowCells.map((cell) => {
          let pos = cell.getBoundingClientRect()
          return pos.left + pos.width / 2
        })
        if (currentPosition > 1) {
          if (headerRowCellsPosition[currentPosition - 1] > ev.clientX) {
            moveDraggingColumnToPosition(currentPosition - 1)
          }
        }
        if (currentPosition < headerRowCellsPosition.length - 1) {
          if (headerRowCellsPosition[currentPosition + 1] < ev.clientX) {
            moveDraggingColumnToPosition(currentPosition + 1)
          }
        }
      }
      document.body.addEventListener('dragover', dragoverFunc)

      let dragendFunc = (ev) => {
        document.body.removeEventListener('dragover', dragoverFunc)
        document.body.removeEventListener('dragend', dragendFunc)
        document.querySelectorAll('#relatedWorkTable .draggingColumn').forEach((el) => {
          el.classList.toggle('draggingColumn')
        })
        document.querySelector('#draggingTable').parentNode.removeChild(document.querySelector('#draggingTable'))
      }
      document.body.addEventListener('dragend', dragendFunc)
    })
  }
  openCodebookTable (options) {
    let that = this
    let th = options['$trigger'][0]
    let codebook = that._codebook
    let theme = codebook.getThemeByName(th.textContent)
    if (theme == null) return
    let codeTablePageURL = chrome.extension.getURL('pages/codebookTable.html')
    axios.get(codeTablePageURL).then((resp) => {
      document.querySelector('#themeTable').style.display = 'none'
      document.querySelector('#themeTable').insertAdjacentHTML('beforebegin', resp.data)

      document.querySelector('#FRAMEndeleyCodebookTableParent').addEventListener('click', function () {
        document.querySelector('#FRAMEndeleyCodebookTableParent').parentNode.removeChild(document.querySelector('#FRAMEndeleyCodebookTableParent'))
        if (document.querySelector('#codeTableParent') != null) document.querySelector('#codeTableParent').parentNode.removeChild(document.querySelector('#codeTableParent'))
        document.querySelector('#themeTable').parentNode.removeChild(document.querySelector('#themeTable'))
      })
      document.querySelector('#FRAMEndeleyCodebookTableOverlay').addEventListener('click', function (e) {
        document.querySelector('#FRAMEndeleyCodebookTableParent').parentNode.removeChild(document.querySelector('#FRAMEndeleyCodebookTableParent'))
        if (document.querySelector('#codeTableParent') != null) document.querySelector('#codeTableParent').parentNode.removeChild(document.querySelector('#codeTableParent'))
        document.querySelector('#themeTable').parentNode.removeChild(document.querySelector('#themeTable'))
        e.stopPropagation()
      })
      document.querySelector('#FRAMEndeleyCodebookTableContainer').addEventListener('click', function (e) {
        e.stopPropagation()
      })
      document.addEventListener('keydown', function (e) {
        if (e.keyCode === 27 && document.querySelector('#FRAMEndeleyCodebookTableParent') != null) document.querySelector('#FRAMEndeleyCodebookTableParent').parentNode.removeChild(document.querySelector('#FRAMEndeleyCodebookTableParent'))
        if (e.keyCode === 27 && document.querySelector('#codeTableParent') != null) document.querySelector('#codeTableParent').parentNode.removeChild(document.querySelector('#codeTableParent'))
        if (e.keyCode === 27 && document.querySelector('#themeTable') != null) document.querySelector('#themeTable').parentNode.removeChild(document.querySelector('#themeTable'))
      })

      let codebookTableHeader = document.querySelector('#FRAMEndeleyCodebookTableThemeCell')
      codebookTableHeader.querySelector('#FRAMEndeleyCodebookBackToThemeTableButton').src = chrome.extension.getURL('images/arrowLeft.svg')
      codebookTableHeader.querySelector('#FRAMEndeleyCodebookBackToThemeTableButton').addEventListener('click', function () {
        let codeTable = document.querySelector('#codeTableParent')
        if (codeTable != null) codeTable.style.display = 'initial'
        else {
          document.querySelector('#themeTable').style.display = 'initial'
        }
        document.querySelector('#FRAMEndeleyCodebookTableParent').parentNode.removeChild(document.querySelector('#FRAMEndeleyCodebookTableParent'))
      })
      let themeNameSpan = document.querySelector('#FRAMEndeleyCodebookTableThemeName')
      themeNameSpan.appendChild(document.createTextNode(theme.name))
      codebookTableHeader.style.backgroundColor = Utils.hexToRGBA(theme.color)
      document.querySelector('#FRAMEndeleyCodebookTableHeaderRow').style.backgroundColor = Utils.hexToRGBA(theme.color)
      document.querySelector('#FRAMEndeleyCodebookTableThemeDescriptionRow').style.backgroundColor = Utils.hexToRGBA(theme.color)
      if (theme.description != null) document.querySelector('#FRAMEndeleyCodebookTableThemeDescription').innerText = theme.description
      document.querySelector('#FRAMEndeleyCodebookTableThemeDescription').addEventListener('change', (e) => {
        let oldDescription = theme.description
        theme.description = e.target.value
        CodebookManager.updateCodebook(that._groupId, that._folderId, that._codebook).then(() => {}, (error) => {
          Alerts.showErrorWindow('There was an error while updating the codebook. Please try again.')
          if (oldDescription == null) document.querySelector('#FRAMEndeleyCodebookTableThemeDescription').innerText = ''
          else document.querySelector('#FRAMEndeleyCodebookTableThemeDescription').innerText = oldDescription
        })
      })

      let codebookTableRowTemplate = document.querySelector('#FRAMEndeleyCodebookTableRowTemplate')
      let codeSynonymTemplate = document.querySelector('#FRAMEndeleyCodeSynonymTemplate')
      let codebookTable = document.querySelector('#FRAMEndeleycodebookTable')
      theme.codes.forEach((code) => {
        let tr = codebookTableRowTemplate.content.cloneNode(true)
        tr.querySelector('.FRAMEndeleyCodebookCode').innerText = code.name
        if (code.description != null) tr.querySelector('.FRAMEndeleyCodebookDescription textarea').innerText = code.description
        if (code.operational != null) tr.querySelector('.FRAMEndeleyCodebookOperational textarea').innerText = code.operational
        if (code.synonyms != null && Array.isArray(code.synonyms)) {
          code.synonyms.forEach((s) => {
            let syn = codeSynonymTemplate.content.cloneNode(true)
            syn.querySelector('.codeSynonymLabel').innerText = s
            syn.querySelector('.removeSynonymButton').addEventListener('click',(e) => {
              let synToDelete = e.target.parentNode.querySelector('.codeSynonymLabel')
              if (synToDelete == null) return
              let synonymToDelete = synToDelete.innerText
              if (synonymToDelete == null || synonymToDelete === '') return
              let arrayElementToDelete = code.synonyms.findIndex((s) => {return s == synonymToDelete})
              code.synonyms.splice(arrayElementToDelete, 1)
              CodebookManager.updateCodebook(that._groupId, that._folderId, that._codebook).then(() => {
                let etr = e.target.parentNode
                etr.parentNode.removeChild(etr)
              }, (error) => {
                Alerts.showErrorWindow('There was an error while updating the codebook. Please try again.')
              })
            })
            tr.querySelector('.codeSynonymContainer').appendChild(syn)
          })
        }
        tr.querySelector('.FRAMEndeleyCodebookDescription textarea').addEventListener('change', (e) => {
          let oldDescription = code.description
          code.description = e.target.value
          CodebookManager.updateCodebook(that._groupId, that._folderId, that._codebook).then(() => {}, (error) => {
            Alerts.showErrorWindow('There was an error while updating the codebook. Please try again.')
            if (oldDescription == null) e.target.innerText = ''
            else e.target.innerText = oldDescription
          })
        })
        tr.querySelector('.FRAMEndeleyCodebookOperational textarea').addEventListener('change', (e) => {
          let oldOperational = code.operational
          code.operational = e.target.value
          CodebookManager.updateCodebook(that._groupId, that._folderId, that._codebook).then(() => {}, (error) => {
            Alerts.showErrorWindow('There was an error while updating the codebook. Please try again.')
            if (oldOperational == null) e.target.innerText = ''
            else e.target.innerText = oldOperational
          })
        })
        tr.querySelector('.FRAMEndeleyCodeSynonyms textarea').addEventListener('input', (e) => {
          let textValue = e.target.value
          let commaSplit = textValue.split(',')
          if (commaSplit.length > 1) {
            let syn = codeSynonymTemplate.content.cloneNode(true)
            syn.querySelector('.codeSynonymLabel').innerText = commaSplit[0]
            syn.querySelector('.removeSynonymButton').addEventListener('click', (e) => {
              let synToDelete = e.target.parentNode.querySelector('.codeSynonymLabel')
              if (synToDelete == null) return
              let synonymToDelete = synToDelete.innerText
              if (synonymToDelete == null || synonymToDelete === '') return
              let arrayElementToDelete = code.synonyms.findIndex((s) => {return s == synonymToDelete})
              code.synonyms.splice(arrayElementToDelete, 1)
              CodebookManager.updateCodebook(that._groupId, that._folderId, that._codebook).then(() => {
                let etr = e.target.parentNode
                etr.parentNode.removeChild(etr)
              }, (error) => {
                Alerts.showErrorWindow('There was an error while updating the codebook. Please try again.')
              })
            })
            e.target.parentNode.parentNode.querySelector('.codeSynonymContainer').appendChild(syn)
            e.target.value = commaSplit[1].trim()

            code.synonyms.push(commaSplit[0].trim())
            CodebookManager.updateCodebook(that._groupId, that._folderId, that._codebook).then(() => {}, (error) => {
              Alerts.showErrorWindow('There was an error while updating the codebook. Please try again.')
              syn.parentNode.removeChild(syn)
            })
          }

        })
        codebookTable.appendChild(tr)
      })
      // let usedCodeElements = document.querySelectorAll('#relatedWorkTable .contentRow td[style*="background-color: '+Utils.hexToRGBA(theme.color)+'"] .relatedWorkAnnotation[annotationcode]')
      let usedCodeElements = document.querySelectorAll('#relatedWorkTable .contentRow td[style*="background-color: ' + Utils.hexToRGBA(theme.color) + '"] .relatedWorkAnnotation[annotationcode]')
      let usedCodes = Array.from(usedCodeElements).map((el) => { return el.getAttribute('annotationcode') })
      if (theme.ownWorkCode != null && theme.ownWorkCode !== '') usedCodes.push(theme.ownWorkCode)
      usedCodes = usedCodes.filter((value, index, self) => { return self.indexOf(value) === index })
      let themeCodes = theme.codes.map((code) => { return code.name })
      usedCodes.forEach((code) => {
        if (themeCodes.indexOf(code) !== -1) return
        let tr = codebookTableRowTemplate.content.cloneNode(true)
        tr.querySelector('.FRAMEndeleyCodebookCode').innerText = code
        tr.querySelector('.FRAMEndeleyCodebookDescription textarea').addEventListener('change', (e) => {
          let c = theme.getCodeByName(code)
          if (c == null) {
            let newCode = new Code(code, e.target.value, null)
            theme.insertCode(newCode)
          } else c.description = e.target.value
          CodebookManager.updateCodebook(that._groupId, that._folderId, that._codebook).then(() => {}, (error) => {
            Alerts.showErrorWindow('There was an error while updating the codebook. Please try again.')
            e.target.innerText = ''
          })
        })
        tr.querySelector('.FRAMEndeleyCodebookOperational textarea').addEventListener('change', (e) => {
          let c = theme.getCodeByName(code)
          if (c == null) {
            let newCode = new Code(code, null, e.target.value)
            theme.insertCode(newCode)
          } else c.operational = e.target.value
          CodebookManager.updateCodebook(that._groupId, that._folderId, that._codebook).then(() => {}, (error) => {
            Alerts.showErrorWindow('There was an error while updating the codebook. Please try again.')
            e.target.innerText = ''
          })
        })
        tr.querySelector('.FRAMEndeleyCodeSynonyms textarea').addEventListener('input', (e) => {
          let c = theme.getCodeByName(code)
          if (c == null){
            c = new Code(code, null, [])
            theme.insertCode(c)
          }
          let textValue = e.target.value
          let commaSplit = textValue.split(',')
          if (commaSplit.length > 1) {
            let syn = codeSynonymTemplate.content.cloneNode(true)
            syn.querySelector('.codeSynonymLabel').innerText = commaSplit[0]
            syn.querySelector('.removeSynonymButton').addEventListener('click', (e) => {
              let synToDelete = e.target.parentNode.querySelector('.codeSynonymLabel')
              if (synToDelete == null) return
              let synonymToDelete = synToDelete.innerText
              if (synonymToDelete == null || synonymToDelete === '') return
              let arrayElementToDelete = c.synonyms.findIndex((s) => {return s == synonymToDelete})
              c.synonyms.splice(arrayElementToDelete, 1)
              CodebookManager.updateCodebook(that._groupId, that._folderId, that._codebook).then(() => {
                let etr = e.target.parentNode
                etr.parentNode.removeChild(etr)
              }, (error) => {
                Alerts.showErrorWindow('There was an error while updating the codebook. Please try again.')
              })
            })
            e.target.parentNode.parentNode.querySelector('.codeSynonymContainer').appendChild(syn)
            e.target.value = commaSplit[1].trim()

            c.synonyms.push(commaSplit[0].trim())
            CodebookManager.updateCodebook(that._groupId, that._folderId, that._codebook).then(() => {}, (error) => {
              Alerts.showErrorWindow('There was an error while updating the codebook. Please try again.')
              syn.parentNode.removeChild(syn)
            })
          }

        })
        codebookTable.appendChild(tr)
      })
    })
  }
  updateLoadingMessageText (documentId) {
    if (this._documentList == null || this._documentList.length == 0) return
    let doc = this._documentList.find((docu) => { return docu.id === documentId })
    if (doc == null) return
    if (!Swal.isVisible()) return
    let loadingMessage = document.querySelector('#FRAMEndeleyLoadingMessageBody')
    if (loadingMessage != null) loadingMessage.innerText = `Extracting annotations from ${doc.title}...`
  }
  manageDuplicateCodesInThemeTableCells () {
    let hiddenAnnotations = document.querySelectorAll('#relatedWorkTable .relatedWorkAnnotation.duplicatedCode')
    hiddenAnnotations.forEach((el) => { el.classList.remove('duplicatedCode') })
    let annotations = document.querySelectorAll('#relatedWorkTable .relatedWorkAnnotation')
    let annotationsArray = Array.from(annotations)
    let codedAnnotations = annotationsArray.filter((el) => { return el.getAttribute('annotationcode') != null && el.getAttribute('annotationcode') !== '' })
    let annotationsToHide = codedAnnotations.filter((el) => {
      let cellElement = el.parentNode
      let firstAnnotationWithCode = cellElement.querySelector(`.relatedWorkAnnotation[annotationcode="${el.getAttribute('annotationcode')}"]`)
      if (firstAnnotationWithCode == null || el.isSameNode(firstAnnotationWithCode)) return false
      return true
    })
    annotationsToHide.forEach((el) => { el.classList.add('duplicatedCode') })
  }
  setLocalColorCoding (coding) {
    this._localColorCoding = coding
  }

  listenForBackgroundPDFParseProcess () {
    let that = this
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      if (request.scope == null) return
      if (request.scope !== 'FRAMEndeleyLoading') return
      if (request.documentId != null) that.updateLoadingMessageText(request.documentId)
    })
  }
  destroy () {
    this.removeThemeTableButton()
    this._onLoadBarObserver.disconnect()
    $.contextMenu('destroy', '#themeTable .contentRow, #themeTable #headerRow th:nth-child(1)')
    $.contextMenu('destroy', '#themeTable #headerRow th:nth-child(n+2)')
  }
  removeThemeTableButton () {
    var dsL = document.getElementById('FRAMEndeley_themeTableButtonContainer')
    if (dsL != null) dsL.parentNode.removeChild(dsL)
  }
  insertThemeTableButton () {
    let that = this
    // var toolbar = document.getElementById('selection-toolbar')


    let insertionPoint = document.querySelector('div[class^=BreadcrumbContainer] nav[class^=Breadcrumb]')
    /*if (insertionPoint == null) {
      setTimeout(() => {
        that.insertThemeTableButton()
      }, 500)
      return
    }*/
    var li = document.createElement('span')
    li.id = 'FRAMEndeley_themeTableButtonContainer'
    var img = document.createElement('img')
    img.id = 'FRAMEndeley_themeTableButton'
    // img.src = chrome.extension.getURL("images/overviewLibrary.png");
    img.src = chrome.extension.getURL('images/logo.png')
    var a = document.createElement('div')
    a.id = 'themeTableButton'
    a.appendChild(img)
    a.addEventListener('click', () => {
      that.createThemeTable()
      // Framendeley.createThemeTable(folderId,groupId);
    })
    var span = document.createElement('span')
    span.id = 'FRAMEndeley_themeTableButtonSpan'
    span.innerText = 'FRAMEndeley'
    a.appendChild(span)
    li.appendChild(a)
    insertionPoint.after(li)
  }
  onLoadBar () {
    let that = this
    return new Promise((resolve, reject) => {
      let obs = new MutationObserver((mutations) => {
        let insertionPoint = document.querySelector('div[class^=BreadcrumbContainer] nav[class^=Breadcrumb]')
        if (insertionPoint != null) {
          obs.disconnect()
          resolve()
        }
      })
      let cfg = {childList: true, subtree: true}
      obs.observe(document.body, cfg)
      that._onLoadBarObserver = obs
    })
  }
}

module.exports = LibraryModeManager
