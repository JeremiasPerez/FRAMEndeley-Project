const $ = require('jquery')
const Highcharts = require('highcharts')
require('highcharts/modules/sankey')(Highcharts)
require('jquery-ui-sortable-npm')

class SankeyManager {
  constructor () {
    this.tableInfo = null
    this.displayFilters = null
    this.filteredTableInfo = null
    this.themeOrder = null
  }
  processTableBis () {
    let data = [] // format "from", "to", "weight"
    let relatedWorkTable = document.querySelector('#relatedWorkTable')

    let contentRowsEl = relatedWorkTable.querySelectorAll('.contentRow')
    let contentRows = Array.from(contentRowsEl)
    let codesByRow = contentRows.map((row) => {
      let rowCellsEl = row.querySelectorAll('td:not(.workTitleCell)')
      let rowCells = Array.from(rowCellsEl)
      return rowCells.map((cell) => {
        let cellCodesEl = cell.querySelectorAll('.relatedWorkAnnotation')
        let cellCodes = Array.from(cellCodesEl).filter((ann) => { return ann.getAttribute('annotationcode') != null && ann.getAttribute('annotationcode') !== '' })
        return [...new Set(Array.from(cellCodes).map((codeEl) => { return codeEl.getAttribute('annotationcode') }))]
      })
    })

    codesByRow.forEach((rowCodes) => {
      let lastCodedColumn = null
      for (let i = 0; i < rowCodes.length; i++) {
        if (rowCodes[i].length === 0) continue
        if (lastCodedColumn != null) {
          for (let j = 0; j < rowCodes[lastCodedColumn].length; j++) {
            for (let k = 0; k < rowCodes[i].length; k++) {
              let hit = data.find((d) => { return d[0] === rowCodes[lastCodedColumn][j] && d[1] === rowCodes[i][k] })
              if (hit != null) hit[2] = hit[2] + 1
              else data.push([rowCodes[lastCodedColumn][j], rowCodes[i][k], 1])
            }
          }
        }
        lastCodedColumn = i
      }
    })
    return data
  }
  processTableBisBis (columns) {
    let data = [] // format "from", "to", "weight"
    let relatedWorkTable = document.querySelector('#relatedWorkTable')

    let nodes = []
    columns.forEach((col, ind) => {
      let node = {
        id: col,
        columnHeader: true,
        column: ind,
        offset: -30,
        dataLabels: {
          className: 'columnHeader',
          style: {
            color: 'black'
          }
        }
      }
      if (ind === 0) node.dataLabels['x'] = 10
      nodes.push(node)
    })

    let contentRowsEl = relatedWorkTable.querySelectorAll('.contentRow')
    let contentRows = Array.from(contentRowsEl)
    let codesByRow = contentRows.map((row) => {
      let rowCellsEl = row.querySelectorAll('td:not(.workTitleCell)')
      let rowCells = Array.from(rowCellsEl)
      return rowCells.map((cell) => {
        let cellCodesEl = cell.querySelectorAll('.relatedWorkAnnotation')
        let cellCodes = Array.from(cellCodesEl).filter((ann) => { return ann.getAttribute('annotationcode') != null && ann.getAttribute('annotationcode') !== '' })
        return [...new Set(Array.from(cellCodes).map((codeEl) => { return codeEl.getAttribute('annotationcode') }))]
      })
    })

    codesByRow.forEach((rowCodes) => {
      let lastCodedColumn = null
      for (let i = 0; i < rowCodes.length; i++) {
        if (rowCodes[i].length === 0) continue
        if (lastCodedColumn != null) {
          for (let j = 0; j < rowCodes[lastCodedColumn].length; j++) {
            for (let k = 0; k < rowCodes[i].length; k++) {
              let hit = data.find((d) => { return d[0] === rowCodes[lastCodedColumn][j] && d[1] === rowCodes[i][k] })
              if (hit != null) hit[2] = hit[2] + 1
              else data.push([rowCodes[lastCodedColumn][j], rowCodes[i][k], 1])
            }
          }
        }
        lastCodedColumn = i
      }
    })
    return data
  }
  parseTable () {
    let that = this
    that.tableInfo = {themes: [], works: []}

    // let data = [] // format "from", "to", "weight"
    let relatedWorkTable = document.querySelector('#relatedWorkTable')
    let themeCells = relatedWorkTable.querySelectorAll('#headerRow .tableTheme')
    themeCells.forEach((cell) => {
      that.tableInfo.themes.push(cell.textContent)
    })

    let contentRowsEl = relatedWorkTable.querySelectorAll('.contentRow')
    let contentRows = Array.from(contentRowsEl)
    contentRows.forEach((contentRow) => {
      let r = {}
      let titleCell = contentRow.querySelector('.workTitleCell .workTitle')
      r['title'] = titleCell.textContent
      let codingCells = contentRow.querySelectorAll('td:not(.workTitleCell)')
      codingCells.forEach((cell, ind) => {
        let cellCodesEl = cell.querySelectorAll('.relatedWorkAnnotation')
        let cellCodes = Array.from(cellCodesEl).filter((ann) => { return ann.getAttribute('annotationcode') != null && ann.getAttribute('annotationcode') !== '' })
        let uniqueCodes = [...new Set(Array.from(cellCodes).map((codeEl) => { return codeEl.getAttribute('annotationcode') }))]
        let cellTheme = Object.values(that.tableInfo.themes)[ind]
        r[cellTheme] = uniqueCodes
      })
      that.tableInfo.works.push(r)
    })
    // console.log(that.tableInfo)

    /* let codesByRow = contentRows.map((row) => {
      let rowCellsEl = row.querySelectorAll('td:not(.workTitleCell)')
      let rowCells = Array.from(rowCellsEl)
      return rowCells.map((cell) => {
        let cellCodesEl = cell.querySelectorAll('.relatedWorkAnnotation')
        let cellCodes = Array.from(cellCodesEl).filter((ann) => {return ann.getAttribute('annotationcode') != null && ann.getAttribute('annotationcode') != ''})
        return [...new Set(Array.from(cellCodes).map((codeEl) => {return codeEl.getAttribute('annotationcode')}))]
      })
    })

    codesByRow.forEach((rowCodes) => {
      let lastCodedColumn = null
      for(let i=0;i<rowCodes.length;i++){
        if(rowCodes[i].length == 0) continue
        if(lastCodedColumn != null){
          for(let j=0;j<rowCodes[lastCodedColumn].length;j++){
            for(let k=0;k<rowCodes[i].length;k++){
              let hit = data.find((d) => {return d[0] == rowCodes[lastCodedColumn][j] && d[1] == rowCodes[i][k]})
              if(hit != null) hit[2] = hit[2] + 1
              else data.push([rowCodes[lastCodedColumn][j],rowCodes[i][k],1])
            }
          }
        }
        lastCodedColumn = i
      }
    })
    return data */
  }
  getDisplayFilters () {
    // gets theme and code filters
    let that = this
    that.displayFilters = {}
    let filterDropdowns = document.querySelectorAll('#filterRow select')
    filterDropdowns.forEach((dropdown, ind) => {
      let theme = Object.values(that.tableInfo.themes)[ind]
      let val = dropdown.options[dropdown.selectedIndex].value
      // let obj = {}
      // obj[theme] = val
      // that.displayFilters.push(obj)
      that.displayFilters[theme] = val
    })
  }
  processTableData () {
    let that = this
    let nodes = []
    let data = []

    that.themeOrder.forEach((theme, ind) => {
      let node = {
        id: theme + 'Theme',
        name: theme,
        columnHeader: true,
        column: ind,
        offset: -30,
        dataLabels: {
          className: 'columnHeader',
          style: {
            color: 'black'
          }
        }
      }
      if (ind === 0) node.dataLabels['x'] = 10
      nodes.push(node)

      data.push({from: theme + 'Theme', to: '', weight: null, className: 'flowToHide'})

      that.filteredTableInfo.works.forEach((work) => {
        work[theme].forEach((themeCode) => {
          let codeInNodes = nodes.find((n) => { return n.id === theme + '-' + themeCode })
          if (codeInNodes == null) {
            let codeNode = {
              id: theme + '-' + themeCode,
              name: themeCode,
              column: ind,
              worksWithCode: [work.title]
            }
            nodes.push(codeNode)
          } else {
            codeInNodes.worksWithCode.push(work.title)
          }
        })

        if (ind > 0) {
          let previousCodedTheme = null
          for (let i = ind - 1; i >= 0; i--) {
            let previousTheme = Object.values(that.themeOrder)[i]
            if (work[previousTheme].length > 0) {
              previousCodedTheme = previousTheme
              break
            }
          }
          if (previousCodedTheme != null) {
            work[previousCodedTheme].forEach((fromCode) => {
              work[theme].forEach((themeCode) => {
                let foundData = data.find((d) => { return d.from === previousCodedTheme + '-' + fromCode && d.to === theme + '-' + themeCode })
                if (foundData == null) {
                  let newData = {
                    from: previousCodedTheme + '-' + fromCode,
                    to: theme + '-' + themeCode,
                    weight: 1,
                    works: [work.title]
                  }
                  data.push(newData)
                } else {
                  foundData.weight = foundData.weight + 1
                  foundData.works.push(work.title)
                }
              })
            })
          }
        }
      })
    })

    return {
      nodes: nodes,
      data: data
    }
  }
  filterTableInfo () {
    let that = this
    this.filteredTableInfo = this.tableInfo

    // remove themes with filter value == 'hideColumn'
    for (let i = that.themeOrder.length - 1; i >= 0; i--) {
      let theme = that.themeOrder[i]
      if (that.displayFilters[theme] === 'hideColumn') {
        that.themeOrder.splice(i, 1)
        // delete that.filteredTableInfo[theme]
        that.filteredTableInfo.themes.splice(i, 1)
        that.filteredTableInfo.works.forEach((work) => {
          delete work[theme]
        })
      } else if (that.displayFilters[theme] !== 'noFilter') { // there is a code to filter by, then remove works without that code
        let codeToFind = that.displayFilters[theme]
        for (let j = that.filteredTableInfo.works.length - 1; j >= 0; j--) {
          let work = that.filteredTableInfo.works[j]
          if (work[theme].indexOf(codeToFind) === -1) { // the work doesn't have the code, then remove
            that.filteredTableInfo.works.splice(j, 1)
          }
        }
      }
    }
    // remove empty themes (without any coded work)
    for (let i = that.themeOrder.length - 1; i >= 0; i--) {
      let theme = that.themeOrder[i]
      let worksWithCodedTheme = that.filteredTableInfo.works.map((w) => { return w[theme].length }).reduce((a, b) => a + b, 0)
      if (worksWithCodedTheme === 0) {
        that.themeOrder.splice(i, 1)
        // delete that.filteredTableInfo[theme]
        that.filteredTableInfo.themes.splice(i, 1)
        that.filteredTableInfo.works.forEach((work) => {
          delete work[theme]
        })
      }
    }
  }
  displaySankey (sankeyData) {
    let that = this
    Highcharts.chart('sankeyContainer', {
      title: {
        text: ' ',
        margin: 80
      },
      series: [{
        keys: ['from', 'to', 'weight'],
        data: sankeyData.data,
        nodes: sankeyData.nodes,
        type: 'sankey',
        name: 'FRAMEndeley',
        tooltip: {
          nodeFormatter: function () {
            let t = `Works with code <b>${this.name}</b>: ${this.worksWithCode.length}`
            this.worksWithCode.forEach((w) => {
              t += `<br/>- ${w}`
            })
            return t
          },
          pointFormatter: function () {
            let t = `${this.fromNode.name} → ${this.toNode.name}: ${this.works.length}`
            this.works.forEach((w) => {
              t += `<br/>- ${w}`
            })
            return t
          }
        }
      }],
      chart: {
        events: {
          load: function () {
            // let titleElement = document.querySelector('.highcharts-title')
            // let titlePos = titleElement.getBoundingClientRect()
            // let colHeaderPosY = titlePos.y+80
            let list = document.createElement('ul')
            // list.style.top = colHeaderPosY+'px'
            list.style.top = '11%'
            list.id = 'themeColumnList'
            let themeCount = that.filteredTableInfo.themes.length
            let colWidth = 100.0 / themeCount
            // that.filteredTableInfo.themes.forEach((theme,ind) => {
            that.themeOrder.forEach((theme, ind) => {
              let li = document.createElement('li')
              li.classList.add('draggableColumnAlluvial')
              li.classList.add('items' + that.themeOrder.length)
              // li.style.width = colWidth+'%'
              li.innerHTML = theme
              list.appendChild(li)
            })
            let sankeyDialog = document.getElementById('sankeyParent')
            sankeyDialog.appendChild(list)

            /* let a = document.querySelectorAll('.columnHeader text tspan:nth-child(2)')
            let cols = Array.from(a)
            let colsDef = cols.map((el) => {
              let t = el.textContent
              let p = el.getBoundingClientRect()
              return {
                label: t,
                x: p.left,
                y: p.top
              }
            })
            let colY = colsDef.map(e => e.y)
            let colX = colsDef.map(e => e.x)
            //let minY = Math.min.apply(Math,colY)-25
            let minX = Math.min.apply(Math,colX)
            let stepX = colsDef[2].x - colsDef[1].x
            let list = document.createElement('ul')
            let titleElement = document.querySelector('.highcharts-title')
            let titlePos = titleElement.getBoundingClientRect()
            //list.style.top = minY+'px'
            let colHeaderPosY = titlePos.y+50
            list.style.top = colHeaderPosY+'px'
            list.style.left = minX+'px'
            list.id = 'themeColumnList'
            colsDef.forEach(function(c,i){
              let li = document.createElement('li')
              li.innerHTML = c.label
              li.style.width = stepX+'px'
              li.style.maxWidth = stepX+'px'
              if(i==colsDef.length-2) li.style.width=stepX-10+'px'
              list.appendChild(li)
            })
            let sankeyDialog = document.getElementById('sankeyDialogDiv')
            sankeyDialog.appendChild(list) */
            $('#themeColumnList').sortable({
              /* helper: "original",
              forceHelperSize: true, */
              forcePlaceHolderSize: true,
              /* tolerance: 'pointer', */
              containment: 'parent',
              axis: 'x',
              cursorAt: {
                left: 40
              },
              scroll: false,
              update: function () {
                let columns = Array.from(document.querySelectorAll('#themeColumnList li'))
                that.themeOrder = columns.map((col) => { return col.textContent })
                let sankeyContainer = document.getElementById('sankeyContainer')
                sankeyContainer.innerHTML = ''
                let columnList = document.querySelector('#themeColumnList')
                columnList.parentNode.removeChild(columnList)
                let sd = that.processTableData()
                that.displaySankey(sd)
              }
            })
          }
        }
      }
    })

    /* Swal.fire({
      html: '<div id="alluvialContainer">',
      width: '95%',
      onBeforeOpen: function(el){
        el.classList.add('alluvialDialogContainer')
        Highcharts.chart('alluvialContainer', {
          title: {
            text: 'FRAMEndeley',
            margin: 60
          },
          series: [{
            keys: ['from', 'to', 'weight'],
            data: sankeyData.data,
            nodes: sankeyData.nodes,
            type: 'sankey',
            name: 'FRAMEndeley'
          }],
          chart: {
            events: {
              load: function(){
                let a = document.querySelectorAll('.columnHeader text tspan:nth-child(2)')
                let cols = Array.from(a)
                let colsDef = cols.map((el) => {
                  let t = el.textContent
                  let p = el.getBoundingClientRect()
                  return {
                    label: t,
                    x: p.left,
                    y: p.top
                  }
                })
                console.log(colsDef)
                let colY = colsDef.map(e => e.y)
                let colX = colsDef.map(e => e.x)
                //let minY = Math.min.apply(Math,colY)-25
                let minX = Math.min.apply(Math,colX)
                let stepX = colsDef[2].x - colsDef[1].x
                let list = document.createElement('ul')
                let titleElement = document.querySelector('.highcharts-title')
                let titlePos = titleElement.getBoundingClientRect()
                //list.style.top = minY+'px'
                let colHeaderPosY = titlePos.y+50
                list.style.top = colHeaderPosY+'px'
                list.style.left = minX+'px'
                list.id = 'themeColumnList'
                colsDef.forEach(function(c,i){
                  let li = document.createElement('li')
                  li.innerHTML = c.label
                  li.style.width = stepX+'px'
                  li.style.maxWidth = stepX+'px'
                  if(i==colsDef.length-2) li.style.width=stepX-10+'px'
                  list.appendChild(li)
                })
                document.body.appendChild(list)
                $('#themeColumnList').sortable({
                  update: function(){
                    alert('reload sankey')
                  }
                })
              }
            }
          }
        })
      }
    }) */
  }
  showAlluvial () {
    let that = this
    that.parseTable()
    that.getDisplayFilters()

    that.themeOrder = []
    // initial order -> table order
    that.tableInfo.themes.forEach((theme) => {
      /* let themeFilter = that.displayFilters[theme]
      if(themeFilter != 'noDisplay') */
      that.themeOrder.push(theme)
    })
    that.filterTableInfo()

    let sankeyData = that.processTableData()

    let themeTable = document.getElementById('themeTable')
    themeTable.style.display = 'none'

    let sankeyParent = document.createElement('div')
    sankeyParent.id = 'sankeyParent'
    let dialogDiv = document.createElement('div')
    dialogDiv.id = 'sankeyDialogDiv'
    let sankeyContainer = document.createElement('div')
    sankeyContainer.id = 'sankeyContainer'
    let sankeyOverlay = document.createElement('div')
    sankeyOverlay.id = 'sankeyOverlay'
    sankeyOverlay.addEventListener('click', function (e) {
      let themeTable = document.getElementById('themeTable')
      themeTable.parentNode.removeChild(themeTable)
      let sankeyParent = document.getElementById('sankeyParent')
      sankeyParent.parentNode.removeChild(sankeyParent)
    })

    let backToThemeTableButton = document.createElement('img')
    backToThemeTableButton.id = 'sankeyBackToThemeTableButton'
    backToThemeTableButton.src = chrome.extension.getURL('images/arrowLeft.svg')
    backToThemeTableButton.addEventListener('click', function (e) {
      let sankeyParent = document.getElementById('sankeyParent')
      sankeyParent.parentNode.removeChild(sankeyParent)
      let themeTable = document.getElementById('themeTable')
      themeTable.style.display = 'initial'
    })

    let sankeyCloseButton = document.createElement('div')
    sankeyCloseButton.id = 'sankeyCloseButton'
    sankeyCloseButton.appendChild(document.createElement('span'))
    sankeyCloseButton.appendChild(document.createElement('span'))
    sankeyCloseButton.appendChild(document.createElement('span'))
    sankeyCloseButton.addEventListener('click', function (e) {
      let themeTable = document.getElementById('themeTable')
      themeTable.parentNode.removeChild(themeTable)
      let sankeyParent = document.getElementById('sankeyParent')
      sankeyParent.parentNode.removeChild(sankeyParent)
    })

    sankeyParent.appendChild(sankeyOverlay)
    dialogDiv.appendChild(backToThemeTableButton)
    dialogDiv.appendChild(sankeyContainer)
    sankeyParent.appendChild(dialogDiv)
    sankeyParent.appendChild(sankeyCloseButton)
    document.body.appendChild(sankeyParent)

    that.displaySankey(sankeyData)

    // that.displaySankey()

    // let tableData = this.processTable()
    /* console.log(tableData)
    console.log(JSON.stringify(tableData))
    Swal.fire({
      html: '<div id="alluvialContainer">',
      width: '95%',
      onBeforeOpen: function(el){
        el.classList.add('alluvialDialogContainer')
        Highcharts.chart('alluvialContainer', {
          title: {
            text: 'Sankey'
          },
          series: [{
            keys: ['from', 'to', 'weight'],
            data: tableData,
            type: 'sankey',
            name: 'Sankey demo'
          }]
        })
      }
    }) */
  }
}

module.exports = SankeyManager
